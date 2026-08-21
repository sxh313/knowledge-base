import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useSettingsStore } from '../stores/settingsStore';
import type { ProviderName } from '../lib/ai/providers';
import { DEFAULT_BASE_URLS, providerNeedsApiKey } from '../lib/ai/providers';
import type { AISettings } from '../lib/db/schema';
import { fetchAvailableModels } from '../lib/db/queries';
import type { SyncConfig } from '../lib/db/schema';
import { useSyncStore } from '../stores/syncStore';
import { useUpdateStore, manualCheck, applyUpdate } from '../stores/updateStore';
import { exportKeys, importKeys, type KeyBundle } from '../lib/utils/keyVault';
import SyncSettingsSection from '../components/settings/SyncSettingsSection';
import AIModelCenter from '../components/settings/AIModelCenter';
import DesktopUpdater from '../components/DesktopUpdater';
import { RefreshCw, Check, ChevronDown, CheckCircle2, Square, Plus, X, Search, Download, ExternalLink, ShieldCheck, ArrowUp, ArrowDown, GripVertical, Bot } from 'lucide-react';
import { useViewModeStore } from '../stores/viewModeStore';

const isAndroidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const isElectronApp = !!window.electronAPI?.isElectron;
const androidReleaseUrl = 'https://github.com/sxh313/knowledge-base/releases/latest';

const PROVIDER_INFO: { key: ProviderName; label: string; desc: string; icon: string }[] = [
  { key: 'shengsuanyun', label: '胜算云', desc: '推荐主力 — beta-router 统一入口', icon: '☁️' },
  { key: 'relay', label: '中转站', desc: '自定义中转服务', icon: '🔄' },
  { key: 'siliconflow', label: '硅基流动', desc: 'SiliconFlow 丰富模型', icon: '🔬' },
  { key: 'zhipu', label: '智谱 GLM', desc: '中文理解 & 图片分析', icon: '🧠' },
  { key: 'deepseek', label: 'DeepSeek', desc: '代码专用', icon: '💻' },
  { key: 'local', label: '本地模型', desc: 'Ollama / LM Studio / vLLM / LocalAI（OpenAI 兼容，需开启 CORS）', icon: '🖥️' },
];

export default function SettingsPage() {
  const { settings, load, updateAI, update } = useSettingsStore();
  const [localProviders, setLocalProviders] = useState<AISettings | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [refreshMsg, setRefreshMsg] = useState<Record<string, string>>({});
  const [manualModel, setManualModel] = useState<Record<string, string>>({});
  const { doSync, status: syncStatus, pullOnly, message: syncErrorMessage } = useSyncStore();
  const isMobile = useViewModeStore((s) => s.isMobile);
  const [openProvider, setOpenProvider] = useState<ProviderName | null>(null);
  const [syncTesting, setSyncTesting] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [mdBusy, setMdBusy] = useState(false);
  const [mdMsg, setMdMsg] = useState<string | null>(null);
  const [exportOut, setExportOut] = useState('');
  const [importText, setImportText] = useState('');
  const [vaultPwd, setVaultPwd] = useState('');
  const [vaultMsg, setVaultMsg] = useState<string | null>(null);
  // 应用更新状态
  const { needRefresh, checking, lastCheckAt, markChecked, setChecking } = useUpdateStore();
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  const handleCheckUpdate = async () => {
    setChecking(true); setCheckMsg(null);
    const ok = await manualCheck();
    markChecked();
    setChecking(false);
    setCheckMsg(ok ? '已检查，若有新版本将提示更新' : '检查失败，请稍后重试');
  };

  const openAndroidRelease = () => {
    window.open(androidReleaseUrl, '_blank', 'noopener,noreferrer');
  };

  const jumpToSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
    if (providerNeedsApiKey(key) && !prov?.apiKey) {
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

  const toggleModel = (model: string, provider?: ProviderName) => {
    const modelId = provider === 'local' && !model.startsWith('local/') ? `local/${model}` : model;
    const current = settings.selectedModels ?? [];
    const next = current.includes(modelId)
      ? current.filter(m => m !== modelId)
      : [...current, modelId];
    update({ selectedModels: next });
  };

  // 手动添加模型（无需刷新，直接输入）
  const addManualModel = (key: ProviderName) => {
    const rawName = manualModel[key]?.trim();
    const name = key === 'local' && rawName && !rawName.includes('/') ? `local/${rawName}` : rawName;
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

  // 来源顺序：上移/下移 provider 优先级
  const moveProvider = (key: ProviderName, dir: -1 | 1) => {
    const order = [...(settings.providerOrder ?? ['shengsuanyun', 'relay', 'siliconflow', 'zhipu', 'deepseek', 'local'])];
    const idx = order.indexOf(key);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target], order[idx]];
    update({ providerOrder: order });
  };

  const updateSync = (patch: Partial<SyncConfig>) => {
    const cur = settings?.sync ?? { enabled: false, owner: '', repo: '', branch: 'main', path: 'data.json', token: '', autoSync: true, syncZero2ReviewHistory: false };
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
    if (!vaultPwd) { setVaultMsg('请输入主密码'); return; }
    if (vaultPwd.length < 6) { setVaultMsg('主密码至少 6 位'); return; }
    try {
      const bundle: Record<string, unknown> = {};
      for (const { key } of PROVIDER_INFO) bundle[key] = settings.aiProviders[key];
      const cipher = await exportKeys({ providers: bundle as KeyBundle['providers'] }, vaultPwd);
      setExportOut(cipher);
      setVaultMsg('✅ 已加密生成，可安全复制到任意位置（含 GitHub 公开仓库）');
    } catch (e) { setVaultMsg('加密失败：' + (e as Error).message); }
  };

  const handleImportKeys = async () => {
    setVaultMsg(null);
    if (!importText.trim() || !vaultPwd) { setVaultMsg('请粘贴密文并输入主密码'); return; }
    try {
      const bundle = await importKeys(importText.trim(), vaultPwd);
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
      setVaultMsg(`✅ 导入成功：${count} 个 Key 已写入（${names.join(' / ')}），可在上方「API 服务配置」展开查看`);
      setImportText('');
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
    <div className="settings-layout w-full p-1 sm:p-3">
      <main className="min-w-0 space-y-5 sm:space-y-7">
      <header className="page-hero !items-start !flex-col !gap-0">
        <div className="page-kicker">Workspace preferences</div>
        <h1 className="text-2xl font-bold">设置</h1>
      </header>

      {/* API 服务配置 */}
      <section id="ai-services" className="scroll-mt-6 space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Bot className="h-5 w-5 text-[var(--color-primary)]" /> API 服务配置</h2>
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
          const isProviderOpen = !isMobile || openProvider === key;

          return (
            <div key={key} className="card space-y-3">
              <div className="flex items-center justify-between gap-3">
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
              {isMobile && prov.enabled && (
                <button
                  className="btn-secondary h-9 w-full text-sm"
                  onClick={() => setOpenProvider(isProviderOpen ? null : key)}
                  type="button"
                >
                  {isProviderOpen ? '收起配置' : '展开配置'}
                </button>
              )}

              {prov.enabled && isProviderOpen && (
                <div className="space-y-2 sm:pl-10">
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
                      placeholder={providerNeedsApiKey(key) ? 'sk-...' : '可留空（Ollama 等本地服务）'} />
                  </div>

                  {/* 刷新模型按钮 */}
                  <div className="flex items-center gap-2 mt-2">
                    <button className="btn-secondary text-xs"
                      onClick={() => handleRefreshModels(key)}
                      disabled={isRefreshing || (providerNeedsApiKey(key) && !prov.apiKey)}>
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
                    const providerModels = models.filter(m => selected.includes(key === 'local' ? `local/${m}` : m));
                    return providerModels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {providerModels.map(m => (
                          <span key={m} className="tag-brand text-xs flex items-center gap-1">
                            {m}
                            <button onClick={() => removeModel(key === 'local' ? `local/${m}` : m)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
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
                              onClick={() => toggleModel(m, key)}>
                              {(key === 'local' ? (settings.selectedModels ?? []).includes(`local/${m}`) : checked)
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

        {/* 来源顺序：自定义 AI provider 优先级 */}
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-sm">🔀 来源顺序</h3>
              <p className="text-xs text-gray-400">调整 AI 服务商的优先级，排在前面的优先使用（故障时自动切换下一个）</p>
            </div>
            <button
              className="text-[10px] text-gray-400 hover:text-red-500"
              onClick={() => update({ providerOrder: ['shengsuanyun', 'relay', 'siliconflow', 'zhipu', 'deepseek', 'local'] })}
            >
              恢复默认
            </button>
          </div>
          <div className="space-y-1">
            {(settings.providerOrder ?? ['shengsuanyun', 'relay', 'siliconflow', 'zhipu', 'deepseek', 'local']).map((key, i, arr) => {
              const info = PROVIDER_INFO.find(p => p.key === key);
              const prov = localProviders[key];
              const configured = prov?.enabled && (key === 'local' || prov?.apiKey);
              return (
                <div key={key}
                  className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                  <GripVertical className="h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)]" />
                  <span className="text-base">{info?.icon ?? '🔧'}</span>
                  <span className="flex-1 text-sm font-medium">{info?.label ?? key}</span>
                  {configured
                    ? <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-500">已配置</span>
                    : <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] text-gray-400">未配置</span>}
                  <span className="text-[10px] tabular-nums text-[var(--color-text-tertiary)]">#{i + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:hover:bg-transparent"
                      onClick={() => moveProvider(key, -1)}
                      disabled={i === 0}
                      title="上移"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:hover:bg-transparent"
                      onClick={() => moveProvider(key, 1)}
                      disabled={i === arr.length - 1}
                      title="下移"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <AIModelCenter settings={settings} onUpdate={update} />

      {/* 模型偏好 */}
      <section id="model-preferences" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold">🎯 模型偏好</h2>
        <p className="text-xs text-gray-400">
          从上方勾选的模型中选择，当前工作区默认：local/dsv4（DeepSeek-V4-Flash 本地部署）
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

      <SyncSettingsSection config={settings.sync!} status={syncStatus} errorMessage={syncErrorMessage} testing={syncTesting} testMessage={syncMsg} onUpdate={updateSync} onTest={handleTestConn} onPull={pullOnly} onSync={doSync} />

      {/* 密钥迁移（跨设备，基于主密码加密） */}
      <section id="key-migration" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold">🔐 密钥迁移（跨设备）</h2>
        <p className="text-xs text-gray-400">
          用主密码加密 API Key 生成密文，可安全放任意位置（含 GitHub 公开仓库）；另一台设备用同一主密码解密恢复。<br/>
          <span className="text-[var(--color-text-tertiary)]">基于 PBKDF2(310k) + AES-256，无主密码不可破解。</span>
        </p>
        <div className="card space-y-4">
          {/* 导出 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500">导出（加密生成密文）</label>
            <input type="password" className="input-field text-sm" placeholder="主密码（导出/导入共用，至少 6 位）"
              value={vaultPwd} onChange={e => setVaultPwd(e.target.value)} />
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
            <button className="btn-secondary text-sm" onClick={handleImportKeys}>解密并导入（使用上方主密码）</button>
          </div>
          {vaultMsg && <p className="text-xs text-gray-500">{vaultMsg}</p>}
        </div>
      </section>

      {/* 连接测试 */}
      <section id="connection-test" className="scroll-mt-6 card">
        <h2 className="text-lg font-semibold mb-3">🔌 连接测试</h2>
        <p className="text-xs text-gray-400 mb-3">测试各 API 服务是否可用</p>
        <ConnectionTest />
      </section>

      {/* 数据管理 */}
      <section id="data-management" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold">💾 数据管理</h2>
        <p className="text-xs text-gray-400">JSON 备份包含文档、附件、对话、分类、版本、学习目标、业务偏好和 Agent 历史；不包含 API Key、GitHub Token 与设备级界面设置。</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button className="btn-secondary" onClick={() => import('../lib/services/export').then(m => m.exportAllData())}>
            📤 导出数据
          </button>
          <button className="btn-secondary" onClick={() => document.getElementById('import-file')?.click()}>
            📥 导入数据
          </button>
          <button className="btn-secondary" onClick={() => import('../lib/services/export').then(m => m.exportJournalsAsMarkdownZip())} title="每篇文档导出为独立 .md（带 frontmatter），打包成 zip 下载">
            📁 导出为 Markdown(.zip)
          </button>
          <button
            className="btn-secondary"
            disabled={mdBusy}
            title="把每篇文档作为 .md 推送到 GitHub 仓库 docs/ 目录（专用文件夹）"
            onClick={async () => {
              const cfg = settings?.sync;
              if (!cfg?.enabled || !cfg.token) { setMdMsg('请先在「云同步」里配置并启用'); return; }
              setMdBusy(true); setMdMsg(null);
              try {
                const { pushJournalsAsMarkdown } = await import('../lib/sync/markdownSync');
                const r = await pushJournalsAsMarkdown(cfg);
                setMdMsg(`✅ 已推送 ${r.pushed} 篇文档到 GitHub docs/`);
              } catch (e) { setMdMsg(`❌ ${(e as Error).message}`); }
              finally { setMdBusy(false); }
            }}
          >
            {mdBusy ? '推送中...' : '☁️ 推送文档为 Markdown 到 GitHub'}
          </button>
          <input id="import-file" type="file" accept=".json" className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) import('../lib/services/export').then(m => m.importData(file));
            }} />
        </div>
        {mdMsg && <p className="text-xs text-gray-500">{mdMsg}</p>}
      </section>

      {/* 关于与更新 */}
      <section id="about-updates" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold">ℹ️ 关于与更新</h2>
        <div className="card space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">知屿 · 版本 {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">本地优先的 AI 知识管理工具</p>
            </div>
            {isAndroidApp ? (
              <button className="btn-primary inline-flex h-10 w-full items-center justify-center gap-2 px-4 text-sm sm:w-auto" onClick={openAndroidRelease}>
                <Download className="h-4 w-4 shrink-0" />
                下载最新版 APK
              </button>
            ) : isElectronApp ? null : needRefresh ? (
              <button className="btn-primary text-sm" onClick={() => applyUpdate()}>
                ✨ 发现新版本·立即更新
              </button>
            ) : (
              <button className="btn-secondary text-sm" onClick={handleCheckUpdate} disabled={checking}>
                {checking ? '检查中...' : '🔄 检查更新'}
              </button>
            )}
          </div>
          {isAndroidApp ? (
            <div className="overflow-hidden rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 dark:border-sky-900/70 dark:from-sky-950/40 dark:via-[var(--color-surface)] dark:to-emerald-950/30">
              <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2.5">
                  <div className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/80 px-3 text-sm font-medium text-sky-700 ring-1 ring-sky-200 dark:bg-white/5 dark:text-sky-300 dark:ring-sky-900">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    覆盖安装保留本地数据
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">Android 版通过 APK 安装包更新</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-tertiary)]">打开发布页后下载最新 APK，安装时选择覆盖安装即可。</p>
                  </div>
                </div>
                <button className="btn-secondary inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 px-4 text-sm sm:w-auto" onClick={openAndroidRelease}>
                  打开发布页
                  <ExternalLink className="h-4 w-4 shrink-0" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-sky-100 bg-white/45 p-2 text-center text-sm text-[var(--color-text-tertiary)] dark:border-sky-900/50 dark:bg-black/10">
                <span className="flex h-8 items-center justify-center rounded-md bg-white/70 px-2 dark:bg-white/5">下载 APK</span>
                <span className="flex h-8 items-center justify-center rounded-md bg-white/70 px-2 dark:bg-white/5">覆盖安装</span>
                <span className="flex h-8 items-center justify-center rounded-md bg-white/70 px-2 dark:bg-white/5">重新打开</span>
              </div>
            </div>
          ) : !isElectronApp && needRefresh ? (
            <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 p-3">
              <p className="text-sm text-indigo-700 dark:text-indigo-300">✨ 发现新版本，点击「立即更新」即可安装最新版本并刷新。</p>
              <button className="btn-primary text-xs mt-2" onClick={() => applyUpdate()}>立即更新</button>
            </div>
          ) : null}
          {checkMsg && !needRefresh && !isAndroidApp && !isElectronApp && <p className="text-xs text-gray-500">{checkMsg}</p>}
          {lastCheckAt && !isAndroidApp && !isElectronApp && (
            <p className="text-xs text-[var(--color-text-tertiary)]">上次检查：{new Date(lastCheckAt).toLocaleString('zh-CN')}</p>
          )}
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {isAndroidApp
              ? '提示：更新前先完成一次云同步，跨设备恢复会更稳。'
              : isElectronApp
                ? '点击下方“检查并自动更新”后，应用会自动下载、重启并完成安装。'
                : '提示：应用会在后台每小时自动检查更新，发现新版本时右下角会弹出提示。'}
          </p>
        </div>
        {/* 桌面端(Electron)自动更新:有更新时点按钮直接下载并重启安装 */}
        {!isAndroidApp && <DesktopUpdater />}
      </section>

      <div className="text-xs text-gray-400 text-center pb-8">
        API Key 由当前设备保存，安装包不内置共享密钥；笔记数据默认本地，仅在启用云同步时推送到你自己的 GitHub 仓库
      </div>
      </main>
      <aside className="sticky top-3 hidden lg:block">
        <nav aria-label="设置分区" className="card !p-2">
          <p className="mb-2 px-2 text-sm font-semibold text-[var(--color-text-tertiary)]">设置导航</p>
          {[
            ['ai-services', 'AI 服务'],
            ['model-center', '模型中心'],
            ['model-preferences', '模型偏好'],
            ['cloud-sync', '云同步'],
            ['key-migration', '密钥迁移'],
            ['connection-test', '连接测试'],
            ['data-management', '数据管理'],
            ['about-updates', '关于与更新'],
          ].map(([id, label]) => (
            <button key={id} type="button" onClick={() => jumpToSection(id)} className="block min-h-9 w-full rounded-md px-2 py-2 text-left text-sm leading-5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]">
              {label}
            </button>
          ))}
        </nav>
      </aside>
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
      if (!prov?.enabled || (providerNeedsApiKey(key) && !prov.apiKey)) {
        newResults[i] = { ...newResults[i], status: 'waiting', msg: '未配置' };
        setResults([...newResults]);
        continue;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const headers: Record<string, string> = {};
        if (prov.apiKey.trim()) headers.Authorization = `Bearer ${prov.apiKey.trim()}`;
        const res = await fetch(`${prov.baseUrl.replace(/\/+$/, '')}/models`, {
          headers,
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
