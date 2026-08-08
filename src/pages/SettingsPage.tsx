import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import type { ProviderName } from '../lib/ai/providers';
import { DEFAULT_BASE_URLS } from '../lib/ai/providers';
import type { AISettings } from '../lib/db/schema';
import { fetchAvailableModels } from '../lib/db/queries';
import type { SyncConfig } from '../lib/db/schema';
import { useSyncStore } from '../stores/syncStore';
import { exportKeys, importKeys, type KeyBundle } from '../lib/utils/keyVault';
import { RefreshCw, Check, ChevronDown, CheckCircle2, Square, Plus, X, Search } from 'lucide-react';

const PROVIDER_INFO: { key: ProviderName; label: string; desc: string; icon: string }[] = [
  { key: 'shengsuanyun', label: '胜算云', desc: '推荐主力 — beta-router 统一入口', icon: '☁️' },
  { key: 'relay', label: '中转站', desc: '自定义中转服务', icon: '🔄' },
  { key: 'siliconflow', label: '硅基流动', desc: 'SiliconFlow 丰富模型', icon: '🔬' },
  { key: 'zhipu', label: '智谱 GLM', desc: '中文理解 & 图片分析', icon: '🧠' },
  { key: 'deepseek', label: 'DeepSeek', desc: '代码专用', icon: '💻' },
];

export default function SettingsPage() {
  const { settings, load, updateAI, update } = useSettingsStore();
  const [localProviders, setLocalProviders] = useState<AISettings | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [refreshMsg, setRefreshMsg] = useState<Record<string, string>>({});
  const [manualModel, setManualModel] = useState<Record<string, string>>({});
  const { doSync, status: syncStatus } = useSyncStore();
  const [syncTesting, setSyncTesting] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [exportPwd, setExportPwd] = useState('');
  const [exportOut, setExportOut] = useState('');
  const [importText, setImportText] = useState('');
  const [importPwd, setImportPwd] = useState('');
  const [vaultMsg, setVaultMsg] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (settings && !localProviders) {
      setLocalProviders(JSON.parse(JSON.stringify(settings.aiProviders)));
    }
  }, [settings, localProviders]);

  useEffect(() => {
    if (!localProviders) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { updateAI(localProviders); }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [localProviders]);

  if (!settings || !localProviders) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-500">加载中...</p></div>;
  }

  const updateField = (key: ProviderName, field: 'baseUrl' | 'apiKey' | 'enabled', value: string | boolean) => {
    setLocalProviders(prev => prev ? { ...prev, [key]: { ...prev[key], [field]: value } } : null);
  };

  const handleRefreshModels = async (key: ProviderName) => {
    const prov = localProviders[key];
    if (!prov?.apiKey) {
      setRefreshMsg(prev => ({ ...prev, [key]: '请先填写 API Key' }));
      return;
    }
    setRefreshing(prev => ({ ...prev, [key]: true }));
    setRefreshMsg(prev => ({ ...prev, [key]: '' }));
    try {
      const baseUrl = prov.baseUrl || DEFAULT_BASE_URLS[key];
      const models = await fetchAvailableModels(key, baseUrl, prov.apiKey);
      setRefreshMsg(prev => ({ ...prev, [key]: `发现 ${models.length} 个模型` }));
      await load();
    } catch (err) {
      setRefreshMsg(prev => ({ ...prev, [key]: `${(err as Error).message}` }));
    } finally {
      setRefreshing(prev => ({ ...prev, [key]: false }));
    }
  };

  const toggleModel = (model: string) => {
    const current = settings.selectedModels ?? [];
    const next = current.includes(model)
      ? current.filter(m => m !== model)
      : [...current, model];
    update({ selectedModels: next });
  };

  // 手动添加模型（无需刷新，直接输入）
  const addManualModel = (key: ProviderName) => {
    const name = manualModel[key]?.trim();
    if (!name) return;
    const current = settings.selectedModels ?? [];
    if (!current.includes(name)) {
      update({ selectedModels: [...current, name] });
    }
    setManualModel(prev => ({ ...prev, [key]: '' }));
  };
  const removeModel = (model: string) => {
    const current = settings.selectedModels ?? [];
    update({ selectedModels: current.filter(m => m !== model) });
  };

  const updateSync = (patch: Partial<SyncConfig>) => {
    const cur = settings?.sync ?? { enabled: false, owner: '', repo: '', branch: 'main', path: 'data.json', token: '', autoSync: true };
    update({ sync: { ...cur, ...patch } });
  };

  const handleTestConn = async () => {
    if (!settings?.sync) return;
    setSyncTesting(true);
    const m = await useSyncStore.getState().testConn(settings.sync);
    setSyncMsg(m);
    setSyncTesting(false);
  };

  // 密钥迁移：用主密码加密 API Key（可安全放云端），另一设备用主密码解密恢复
  const handleExportKeys = async () => {
    setVaultMsg(null);
    if (!exportPwd) { setVaultMsg('请输入主密码'); return; }
    if (exportPwd.length < 6) { setVaultMsg('主密码至少 6 位'); return; }
    try {
      const bundle: Record<string, unknown> = {};
      for (const { key } of PROVIDER_INFO) bundle[key] = settings.aiProviders[key];
      const cipher = await exportKeys({ providers: bundle as KeyBundle['providers'] }, exportPwd);
      setExportOut(cipher);
      setVaultMsg('✅ 已加密生成，可安全复制到任意位置（含 GitHub 公开仓库）');
    } catch (e) { setVaultMsg('加密失败：' + (e as Error).message); }
  };

  const handleImportKeys = async () => {
    setVaultMsg(null);
    if (!importText.trim() || !importPwd) { setVaultMsg('请粘贴密文并输入主密码'); return; }
    try {
      const bundle = await importKeys(importText.trim(), importPwd);
      const merged = { ...settings.aiProviders };
      let count = 0;
      const names: string[] = [];
      for (const [k, v] of Object.entries(bundle.providers)) {
        const name = k as ProviderName;
        if (merged[name] && v.apiKey) {
          merged[name] = { ...merged[name], ...v };
          count++;
          names.push(name);
        }
      }
      if (count === 0) {
        setVaultMsg('⚠️ 密文解密成功，但里面没有有效的 API Key（导出时应用里可能没填 Key）');
        return;
      }
      await updateAI(merged);
      setLocalProviders(JSON.parse(JSON.stringify(merged)));
      setVaultMsg(`✅ 导入成功：${count} 个 Key 已写入（${names.join(' / ')}），可在上方「AI 服务配置」展开查看`);
      setImportText(''); setImportPwd('');
    } catch {
      setVaultMsg('❌ 解密失败：主密码错误或密文损坏');
    }
  };

  const dropdownModels: string[] = (() => {
    const models = new Set<string>(['deepseek-v4-flash']);
    (settings.selectedModels ?? []).forEach(m => models.add(m));
    return Array.from(models).sort();
  })();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-sm text-gray-500 mt-1">API Key 加密存于本地浏览器，本项目无服务器中转；调用 AI 时直连你选择的服务商</p>
      </header>

      {/* AI 服务配置 */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">🤖 AI 服务配置</h2>
        <p className="text-xs text-gray-400">填写 API Key 后点击「刷新模型」获取可用模型列表，勾选你想使用的模型</p>

        {PROVIDER_INFO.map(({ key, label, desc, icon }) => {
          const prov = localProviders[key];
          const models = settings.availableModels?.[key] ?? [];
          const isRefreshing = refreshing[key];
          const msg = refreshMsg[key];
          // 按手动输入框内容对模型勾选列表进行实时筛选
          const filterText = (manualModel[key] ?? '').trim().toLowerCase();
          const filteredModels = filterText
            ? models.filter(m => m.toLowerCase().includes(filterText))
            : models;

          return (
            <div key={key} className="card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{icon}</span>
                  <div>
                    <h3 className="font-medium">{label}</h3>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={prov.enabled}
                    onChange={(e) => updateField(key, 'enabled', e.target.checked)}
                    className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {prov.enabled && (
                <div className="space-y-2 pl-10">
                  <div>
                    <label className="text-xs text-gray-400">API 地址</label>
                    <input className="input-field mt-1 text-xs font-mono"
                      value={prov.baseUrl || DEFAULT_BASE_URLS[key]}
                      onChange={(e) => updateField(key, 'baseUrl', e.target.value)}
                      placeholder={DEFAULT_BASE_URLS[key]} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">API Key</label>
                    <input type="password" className="input-field mt-1 text-xs font-mono"
                      value={prov.apiKey}
                      onChange={(e) => updateField(key, 'apiKey', e.target.value)}
                      placeholder="sk-..." />
                  </div>

                  {/* 刷新模型按钮 */}
                  <div className="flex items-center gap-2 mt-2">
                    <button className="btn-secondary text-xs"
                      onClick={() => handleRefreshModels(key)}
                      disabled={isRefreshing || !prov.apiKey}>
                      {isRefreshing
                        ? <><RefreshCw className="w-3 h-3 animate-spin" /> 刷新中...</>
                        : <><RefreshCw className="w-3 h-3" /> 🔄 刷新模型</>}
                    </button>
                    {models.length > 0 && (
                      <span className="text-xs text-gray-400">共 {models.length} 个模型</span>
                    )}
                  </div>
                  {msg && (
                    <p className={`text-xs ${msg.startsWith('发现') ? 'text-green-500' : 'text-red-500'}`}>{msg}</p>
                  )}

                  {/* 该 provider 已勾选的模型 */}
                  {(() => {
                    const selected = (settings.selectedModels ?? []);
                    const providerModels = models.filter(m => selected.includes(m));
                    return providerModels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {providerModels.map(m => (
                          <span key={m} className="tag-brand text-xs flex items-center gap-1">
                            {m}
                            <button onClick={() => removeModel(m)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}

                  {/* 模型列表：搜索筛选 + 手动添加合一（输入框置于列表顶部，输入即筛下方列表） */}
                  <div className="mt-3 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                    {/* 搜索栏 —— 加大尺寸，更易点击与阅读 */}
                    <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-4 py-3">
                      <Search className="h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)]" />
                      <input
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-tertiary)]"
                        placeholder={models.length > 0 ? '搜索模型，或输入新名称后回车添加' : '输入模型名后回车添加（尚未刷新列表）'}
                        value={manualModel[key] ?? ''}
                        onChange={(e) => setManualModel(prev => ({ ...prev, [key]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualModel(key); } }}
                      />
                      {filterText && models.length > 0 && (
                        <span className="shrink-0 rounded-md bg-[var(--color-surface)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--color-text-tertiary)]">
                          {filteredModels.length}/{models.length}
                        </span>
                      )}
                      <button className="btn-secondary shrink-0 px-3 py-1.5 text-xs" onClick={() => addManualModel(key)} title="将输入内容添加为已选模型">
                        <Plus className="h-3.5 w-3.5" /> 添加
                      </button>
                    </div>

                    {models.length > 0 ? (
                      <div className="max-h-64 divide-y divide-[var(--color-border)] overflow-y-auto">
                        {filteredModels.map(m => {
                          const checked = (settings.selectedModels ?? []).includes(m);
                          return (
                            <div key={m} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-surface-2)]/50"
                              onClick={() => toggleModel(m)}>
                              {checked
                                ? <CheckCircle2 className="h-[18px] w-[18px] flex-shrink-0 text-brand-500" />
                                : <Square className="h-[18px] w-[18px] flex-shrink-0 text-[var(--color-border-strong)]" />}
                              <span className="font-mono text-sm">{m}</span>
                            </div>
                          );
                        })}
                        {filterText && filteredModels.length === 0 && (
                          <div className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)]/50"
                            onClick={() => addManualModel(key)}>
                            <Plus className="h-[18px] w-[18px] flex-shrink-0 text-brand-500" />
                            <span>未找到「<span className="font-mono text-[var(--color-primary)]">{filterText}</span>」，点击添加</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="px-4 py-4 text-sm text-[var(--color-text-tertiary)]">
                        尚未刷新模型列表，可直接在上方输入模型名后回车添加。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* 模型偏好 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">🎯 模型偏好</h2>
        <p className="text-xs text-gray-400">
          从上方勾选的模型中选择，默认：deepseek-v4-flash
          {(settings.selectedModels ?? []).length === 0 && '（尚未勾选模型，使用默认）'}
        </p>

        {/* 已选模型概览 */}
        {(settings.selectedModels ?? []).length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500">
                已选模型（{(settings.selectedModels ?? []).length} 个）
              </span>
              <button className="text-[10px] text-gray-400 hover:text-red-500" onClick={() => update({ selectedModels: [] })}>
                清空全部
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(settings.selectedModels ?? []).map(m => (
                <span key={m} className="tag-brand text-xs flex items-center gap-1">
                  <span className="font-mono">{m}</span>
                  <button onClick={() => removeModel(m)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { key: 'highQuality' as const, label: '高质量任务（总结/问答）' },
            { key: 'codeTask' as const, label: '代码任务' },
            { key: 'fastTask' as const, label: '快速任务（标签/情绪）' },
          ]).map(({ key, label }) => (
            <div key={key} className="card">
              <label className="text-xs text-gray-400">{label}</label>
              <div className="relative mt-1">
                <select
                  className="input-field appearance-none pr-8 cursor-pointer"
                  value={settings.preferredModels[key]}
                  onChange={(e) => update({ preferredModels: { ...settings.preferredModels, [key]: e.target.value } })}
                >
                  {!dropdownModels.includes(settings.preferredModels[key]) && (
                    <option value={settings.preferredModels[key]}>{settings.preferredModels[key]}（当前）</option>
                  )}
                  {dropdownModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 云同步 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">☁️ 云同步（GitHub）</h2>
        <p className="text-xs text-gray-400">数据推送到你的 GitHub 私有仓库，跨设备同步、免费、带版本历史</p>
        <div className="card space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium">启用云同步</span>
            <input type="checkbox" checked={settings.sync?.enabled ?? false}
              onChange={e => updateSync({ enabled: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--color-border)]" />
          </label>
          {settings.sync?.enabled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">GitHub 用户名</label>
                  <input className="input-field mt-1 text-sm font-mono" value={settings.sync.owner}
                    onChange={e => updateSync({ owner: e.target.value })} placeholder="sxh313" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">仓库名</label>
                  <input className="input-field mt-1 text-sm font-mono" value={settings.sync.repo}
                    onChange={e => updateSync({ repo: e.target.value })} placeholder="knowledge-base" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">分支</label>
                  <input className="input-field mt-1 text-sm font-mono" value={settings.sync.branch}
                    onChange={e => updateSync({ branch: e.target.value })} placeholder="main" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">文件路径</label>
                  <input className="input-field mt-1 text-sm font-mono" value={settings.sync.path}
                    onChange={e => updateSync({ path: e.target.value })} placeholder="data.json" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">Personal Access Token（需 repo 权限）</label>
                <input type="password" className="input-field mt-1 text-sm font-mono" value={settings.sync.token}
                  onChange={e => updateSync({ token: e.target.value })} placeholder="ghp_..." />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.sync.autoSync}
                  onChange={e => updateSync({ autoSync: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--color-border)]" />
                <span className="text-sm">编辑停顿 10 秒后自动同步</span>
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <button className="btn-secondary text-sm" onClick={handleTestConn} disabled={syncTesting}>
                  {syncTesting ? '测试中...' : '测试连接'}
                </button>
                <button className="btn-primary text-sm" onClick={() => doSync()} disabled={syncStatus === 'syncing'}>
                  {syncStatus === 'syncing' ? '同步中...' : '立即同步'}
                </button>
                {settings.sync.lastSyncAt && (
                  <span className="text-xs text-gray-400">
                    上次同步：{new Date(settings.sync.lastSyncAt).toLocaleString('zh-CN')}
                  </span>
                )}
              </div>
              {syncMsg && <p className="text-xs text-gray-500">{syncMsg}</p>}
              {syncStatus === 'error' && <p className="text-xs text-red-500">同步失败，请检查配置与网络</p>}
              <details className="text-xs text-gray-400">
                <summary className="cursor-pointer">如何获取 Token 与配置？</summary>
                <div className="mt-1 leading-relaxed space-y-1">
                  <p>1. 先在 GitHub 创建一个<b>私有仓库</b>（如 <code className="font-mono">knowledge-base</code>）</p>
                  <p>2. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)</p>
                  <p>3. 勾选 <code className="font-mono">repo</code> 权限，生成 Token 并粘贴到上方</p>
                  <p className="text-[var(--color-text-tertiary)]">Token 仅存储于本地浏览器，不经过任何服务器。</p>
                </div>
              </details>
            </>
          )}
        </div>
      </section>

      {/* 密钥迁移（跨设备，基于主密码加密） */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">🔐 密钥迁移（跨设备）</h2>
        <p className="text-xs text-gray-400">
          用主密码加密 API Key 生成密文，可安全放任意位置（含 GitHub 公开仓库）；另一台设备用同一主密码解密恢复。<br/>
          <span className="text-[var(--color-text-tertiary)]">基于 PBKDF2(310k) + AES-256，无主密码不可破解。</span>
        </p>
        <div className="card space-y-4">
          {/* 导出 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500">导出（加密生成密文）</label>
            <input type="password" className="input-field text-sm" placeholder="设置主密码（至少 6 位）"
              value={exportPwd} onChange={e => setExportPwd(e.target.value)} />
            <button className="btn-primary text-sm" onClick={handleExportKeys}>生成加密密文</button>
            {exportOut && (
              <>
                <textarea className="input-field text-xs font-mono mt-1" rows={4} readOnly value={exportOut}
                  title="点击全选后复制"
                  onClick={e => (e.target as HTMLTextAreaElement).select()} />
                <button type="button" className="btn-ghost text-xs self-start"
                  onClick={() => { setImportText(exportOut); setVaultMsg('已填入下方导入框，输入主密码后点「解密并导入」即可测试'); }}>
                  ⬇ 填入下方导入框（测试用）
                </button>
              </>
            )}
          </div>
          <div className="divider" />
          {/* 导入 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500">导入（解密恢复 Key）</label>
            <textarea className="input-field text-xs font-mono" rows={3}
              placeholder="粘贴 KBVAULT1:... 开头的密文"
              value={importText} onChange={e => setImportText(e.target.value)} />
            <input type="password" className="input-field text-sm" placeholder="主密码"
              value={importPwd} onChange={e => setImportPwd(e.target.value)} />
            <button className="btn-secondary text-sm" onClick={handleImportKeys}>解密并导入</button>
          </div>
          {vaultMsg && <p className="text-xs text-gray-500">{vaultMsg}</p>}
        </div>
      </section>

      {/* 连接测试 */}
      <section className="card">
        <h2 className="text-lg font-semibold mb-3">🔌 连接测试</h2>
        <p className="text-xs text-gray-400 mb-3">测试各 API 服务是否可用</p>
        <ConnectionTest />
      </section>

      {/* 数据管理 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">💾 数据管理</h2>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => import('../lib/services/export').then(m => m.exportAllData())}>
            📤 导出数据
          </button>
          <button className="btn-secondary" onClick={() => document.getElementById('import-file')?.click()}>
            📥 导入数据
          </button>
          <input id="import-file" type="file" accept=".json" className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) import('../lib/services/export').then(m => m.importData(file));
            }} />
        </div>
      </section>

      <div className="text-xs text-gray-400 text-center pb-8">
        API Key 加密存于本地浏览器；笔记数据默认本地，仅在启用云同步时推送到你自己的 GitHub 仓库
      </div>
    </div>
  );
}

function ConnectionTest() {
  const [results, setResults] = useState<{ name: string; status: 'waiting' | 'testing' | 'ok' | 'fail'; msg: string }[]>(
    PROVIDER_INFO.map(p => ({ name: p.label, status: 'waiting' as const, msg: '' }))
  );

  const testAll = async () => {
    const newResults = [...results];
    for (let i = 0; i < PROVIDER_INFO.length; i++) {
      const { key } = PROVIDER_INFO[i];
      newResults[i] = { ...newResults[i], status: 'testing', msg: '测试中...' };
      setResults([...newResults]);

      const settings = useSettingsStore.getState().settings;
      const prov = settings?.aiProviders[key];
      if (!prov?.enabled || !prov.apiKey) {
        newResults[i] = { ...newResults[i], status: 'waiting', msg: '未配置' };
        setResults([...newResults]);
        continue;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`${prov.baseUrl.replace(/\/+$/, '')}/models`, {
          headers: { Authorization: `Bearer ${prov.apiKey}` },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          const count = data.data?.length ?? 0;
          newResults[i] = { ...newResults[i], status: 'ok', msg: `✅ 可用（${count} 个模型）` };
        } else {
          newResults[i] = { ...newResults[i], status: 'fail', msg: `❌ ${res.status} ${res.statusText}` };
        }
      } catch (e) {
        newResults[i] = { ...newResults[i], status: 'fail', msg: `❌ ${(e as Error).message}` };
      }
      setResults([...newResults]);
    }
  };

  return (
    <div className="space-y-2">
      <button className="btn-primary text-sm" onClick={testAll}>🔄 全部测试</button>
      {results.map((r, i) => (
        <div key={i} className={`flex items-center gap-2 text-sm ${r.status === 'testing' ? 'text-yellow-500' : r.status === 'ok' ? 'text-green-600' : r.status === 'fail' ? 'text-red-500' : 'text-gray-400'}`}>
          <span className="w-20">{PROVIDER_INFO[i].label}</span>
          <span>{r.status === 'testing' ? '⟳' : r.status === 'ok' ? <Check className="w-4 h-4 inline" /> : r.status === 'fail' ? '✗' : '—'}</span>
          <span className="text-xs">{r.msg}</span>
        </div>
      ))}
    </div>
  );
}