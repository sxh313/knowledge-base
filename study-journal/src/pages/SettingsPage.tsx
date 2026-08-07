import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import type { ProviderName } from '../lib/ai/providers';
import { DEFAULT_BASE_URLS } from '../lib/ai/providers';
import type { AISettings } from '../lib/db/schema';
import { fetchAvailableModels } from '../lib/db/queries';
import { RefreshCw, Check, ChevronDown, CheckCircle2, Square, Plus, X } from 'lucide-react';

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

  const dropdownModels: string[] = (() => {
    const models = new Set<string>(['deepseek-v4-flash']);
    (settings.selectedModels ?? []).forEach(m => models.add(m));
    return Array.from(models).sort();
  })();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-sm text-gray-500 mt-1">API Key 加密存储在浏览器 IndexedDB，不经过服务器</p>
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

                  {/* 模型勾选列表 */}
                  {models.length > 0 && (
                    <div className="mt-2 rounded-lg border border-[var(--color-border)] overflow-hidden">
                      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-xs font-medium text-gray-500">
                        勾选要使用的模型：
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-[var(--color-border)]">
                        {models.map(m => {
                          const checked = settings.selectedModels?.includes(m) ?? false;
                          return (
                            <label key={m} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer">
                              <button type="button" onClick={() => toggleModel(m)} className="flex-shrink-0">
                                {checked
                                  ? <CheckCircle2 className="w-4 h-4 text-brand-500" />
                                  : <Square className="w-4 h-4 text-gray-300" />}
                              </button>
                              <span className="text-xs font-mono">{m}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
        API Key 和笔记数据加密存储在你的浏览器中（IndexedDB），不会上传到任何服务器
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