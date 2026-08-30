import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useSettingsStore } from '../stores/settingsStore';
import type { ProviderName } from '../lib/ai/providers';
import { DEFAULT_BASE_URLS, providerNeedsApiKey } from '../lib/ai/providers';
import type { AISettings, WebSearchSettings } from '../lib/db/schema';
import { fetchAvailableModels } from '../lib/db/queries';
import type { SyncConfig } from '../lib/db/schema';
import { useSyncStore } from '../stores/syncStore';
import { useUpdateStore, manualCheck, applyUpdate } from '../stores/updateStore';
import { exportKeys, importKeys, type KeyBundle } from '../lib/utils/keyVault';
import SyncSettingsSection from '../components/settings/SyncSettingsSection';
import AIModelCenter from '../components/settings/AIModelCenter';
import SettingsSelect from '../components/settings/SettingsSelect';
import DesktopUpdater from '../components/DesktopUpdater';
import { RefreshCw, Check, ChevronDown, CheckCircle2, Square, Plus, X, Search, Download, ExternalLink, ShieldCheck, ArrowUp, ArrowDown, GripVertical, Bot } from 'lucide-react';
import { describeConnectionError } from '../lib/ai/connectionError';
import { searchAndFetchWeb } from '../lib/ai/webSearch';
import { resolveAIBaseUrl } from '../lib/ai/localProxy';

const isAndroidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const isElectronApp = !!window.electronAPI?.isElectron;
const androidReleaseUrl = 'https://github.com/sxh313/knowledge-base/releases/latest';

const PROVIDER_INFO: { key: ProviderName; label: string; desc: string; icon: string }[] = [
  { key: 'shengsuanyun', label: '胜算云', desc: '推荐主力 — beta-router 统一入口', icon: '☁️' },
  { key: 'relay', label: '中转站', desc: '自定义中转服务', icon: '🔄' },
  { key: 'siliconflow', label: '硅基流动', desc: 'SiliconFlow 丰富模型', icon: '🔬' },
  { key: 'zhipu', label: '智谱 GLM', desc: '中文理解 & 图片分析', icon: '🧠' },
  { key: 'deepseek', label: 'DeepSeek', desc: '代码专用', icon: '💻' },
  { key: 'local', label: '本地模型', desc: 'Ollama / LM Studio / vLLM / LocalAI（OpenAI 兼容；开发环境可使用同源代理）', icon: '🖥️' },
];

const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettings = {
  enabled: false,
  provider: 'tavily',
  baseUrl: 'http://127.0.0.1:3210',
  apiKey: '',
  mode: 'manual',
  resultLimit: 5,
  fetchLimit: 3,
};

type ApiTestResult = { status: 'waiting' | 'testing' | 'ok' | 'warn' | 'fail'; msg: string };

function statusTextClass(status: ApiTestResult['status']): string {
  if (status === 'testing') return 'text-yellow-500';
  if (status === 'ok') return 'text-green-600';
  if (status === 'warn') return 'text-amber-600';
  if (status === 'fail') return 'text-red-500';
  return 'text-gray-400';
}

function StatusMark({ status }: { status: ApiTestResult['status'] }) {
  if (status === 'testing') return <RefreshCw className="h-4 w-4 animate-spin" />;
  if (status === 'ok') return <Check className="h-4 w-4" />;
  if (status === 'warn') return <ShieldCheck className="h-4 w-4" />;
  if (status === 'fail') return <span>✗</span>;
  return <span>—</span>;
}

export default function SettingsPage() {
  const { settings, load, updateAI, update } = useSettingsStore();
  const [localProviders, setLocalProviders] = useState<AISettings | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [refreshMsg, setRefreshMsg] = useState<Record<string, string>>({});
  const [apiTestResults, setApiTestResults] = useState<Record<string, ApiTestResult>>({});
  const [webSearchTest, setWebSearchTest] = useState<ApiTestResult>({ status: 'waiting', msg: '' });
  const [manualModel, setManualModel] = useState<Record<string, string>>({});
  const [localModelDraft, setLocalModelDraft] = useState({ name: '', modelId: '' });
  const [showLocalModelDraft, setShowLocalModelDraft] = useState(false);
  const { doSync, status: syncStatus, pullOnly, message: syncErrorMessage } = useSyncStore();
  const [openProvider, setOpenProvider] = useState<ProviderName | null>(null);
  const providerOpenInitialized = useRef(false);
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
  const [draggingProvider, setDraggingProvider] = useState<ProviderName | null>(null);
  const [advancedSettings, setAdvancedSettings] = useState(() => localStorage.getItem('settings-advanced') === '1');

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

  // 设置页只展开一个服务，避免多个供应商的地址、Key 和模型列表同时堆叠。
  useEffect(() => {
    if (providerOpenInitialized.current || !localProviders) return;
    providerOpenInitialized.current = true;
    const firstEnabled = PROVIDER_INFO.find(({ key }) => localProviders[key]?.enabled);
    if (firstEnabled) setOpenProvider(firstEnabled.key);
  }, [localProviders]);

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

  const webSearchSettings = { ...DEFAULT_WEB_SEARCH_SETTINGS, ...(settings.webSearch ?? {}) };
  const answerSettings = { retrievalTopK: 5 as const, detail: 'standard' as const, rewriteEnabled: false, ...(settings.aiAnswer ?? {}) };

  const updateWebSearch = (patch: Partial<WebSearchSettings>) => {
    void update({ webSearch: { ...webSearchSettings, ...patch } });
  };

  const handleTestProvider = async (key: ProviderName) => {
    const prov = localProviders[key];
    if (!prov?.enabled || (providerNeedsApiKey(key) && !prov.apiKey)) {
      setApiTestResults(prev => ({ ...prev, [key]: { status: 'waiting', msg: '未配置' } }));
      return;
    }
    setApiTestResults(prev => ({ ...prev, [key]: { status: 'testing', msg: '测试中...' } }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const headers: Record<string, string> = {};
      if (prov.apiKey.trim()) headers.Authorization = `Bearer ${prov.apiKey.trim()}`;
      const res = await fetch(`${resolveAIBaseUrl(prov.baseUrl || DEFAULT_BASE_URLS[key])}/models`, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      const count = Array.isArray(data.data) ? data.data.length : 0;
      setApiTestResults(prev => ({ ...prev, [key]: { status: 'ok', msg: `可用（${count} 个模型）` } }));
    } catch (error) {
      setApiTestResults(prev => ({ ...prev, [key]: { status: 'fail', msg: describeConnectionError(error, prov.baseUrl || DEFAULT_BASE_URLS[key]) } }));
    }
  };

  const handleTestAllProviders = async () => {
    for (const { key } of PROVIDER_INFO) await handleTestProvider(key);
  };

  const handleTestWebSearch = async () => {
    if (webSearchSettings.provider === 'tavily' && !webSearchSettings.apiKey?.trim()) {
      setWebSearchTest({ status: 'fail', msg: '请先填写 Tavily API Key' });
      return;
    }
    if (webSearchSettings.provider === 'open-websearch' && !webSearchSettings.baseUrl?.trim()) {
      setWebSearchTest({ status: 'fail', msg: '请先填写 open-webSearch 服务地址' });
      return;
    }
    setWebSearchTest({ status: 'testing', msg: '测试中...' });
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 使用有稳定摘要的测试词，避免 DuckDuckGo 对过于具体的测试词返回空结果。
          query: 'OpenAI',
          fetch: true,
          provider: webSearchSettings.provider,
          baseUrl: webSearchSettings.baseUrl,
          apiKey: webSearchSettings.apiKey,
          limit: 2,
          fetchLimit: 1,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      let pages = Array.isArray(data.pages) ? data.pages : [];
      if (pages.length === 0 && webSearchSettings.provider === 'duckduckgo') {
        pages = await searchAndFetchWeb('OpenAI', { provider: 'duckduckgo', limit: 2, fetchLimit: 1 });
      }
      const provider = pages.find((page: { provider?: string }) => page.provider)?.provider;
      if (provider === 'tavily') {
        setWebSearchTest({ status: 'ok', msg: `Tavily 可用，已抓取 ${pages.length} 个网页片段` });
      } else if (provider === 'open-websearch') {
        setWebSearchTest({ status: 'ok', msg: `open-webSearch 可用，已抓取 ${pages.length} 个网页片段` });
      } else if (webSearchSettings.provider === 'duckduckgo' && pages.length > 0) {
        setWebSearchTest({ status: 'ok', msg: `DuckDuckGo 摘要可用，已返回 ${pages.length} 条结果` });
      } else if (pages.length > 0) {
        setWebSearchTest({ status: 'warn', msg: '搜索代理可用，但当前使用 DuckDuckGo 摘要兜底' });
      } else {
        setWebSearchTest({ status: 'fail', msg: '没有返回网页内容，请检查联网搜索配置或网络' });
      }
    } catch (error) {
      setWebSearchTest({ status: 'fail', msg: error instanceof Error ? error.message : '联网搜索测试失败' });
    }
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
      // 开发环境中的局域网模型必须走 Vite 同源代理，否则浏览器只会得到模糊的 CORS/Failed to fetch。
      const models = await fetchAvailableModels(key, resolveAIBaseUrl(baseUrl), prov.apiKey);
      setRefreshMsg(prev => ({ ...prev, [key]: `发现 ${models.length} 个模型` }));
      await load();
    } catch (err) {
      setRefreshMsg(prev => ({ ...prev, [key]: describeConnectionError(err, prov.baseUrl || DEFAULT_BASE_URLS[key]) }));
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
    const available = settings.availableModels ?? {};
    const providerModels = available[key] ?? [];
    const nextAvailableModels = providerModels.includes(rawName)
      ? providerModels
      : [...providerModels, rawName];
    const nextSelectedModels = current.includes(name) ? current : [...current, name];
    update({
      availableModels: { ...available, [key]: nextAvailableModels },
      selectedModels: nextSelectedModels,
    });
    setManualModel(prev => ({ ...prev, [key]: '' }));
  };
  const addLocalModel = () => {
    const modelId = localModelDraft.modelId.trim();
    const label = localModelDraft.name.trim() || modelId;
    if (!modelId) return;
    const key = `local/${modelId}`;
    const current = settings.selectedModels ?? [];
    const available = settings.availableModels ?? {};
    const providerModels = available.local ?? [];
    void update({
      availableModels: { ...available, local: providerModels.includes(modelId) ? providerModels : [...providerModels, modelId] },
      selectedModels: current.includes(key) ? current : [...current, key],
      modelLabels: { ...(settings.modelLabels ?? {}), [key]: label },
    });
    setLocalModelDraft({ name: '', modelId: '' });
    setShowLocalModelDraft(false);
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

  const dropProvider = (targetKey: ProviderName) => {
    if (!draggingProvider || draggingProvider === targetKey) return;
    const order = [...(settings.providerOrder ?? ['shengsuanyun', 'relay', 'siliconflow', 'zhipu', 'deepseek', 'local'])];
    const from = order.indexOf(draggingProvider);
    const to = order.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, draggingProvider);
    update({ providerOrder: order });
    setDraggingProvider(null);
  };

  // 隐藏浏览器原生拖动副本，排序只由卡片在纵向列表中的位置决定。
  const startProviderDrag = (event: React.DragEvent<HTMLDivElement>, key: ProviderName) => {
    event.dataTransfer.effectAllowed = 'move';
    const transparentPreview = document.createElement('canvas');
    transparentPreview.width = 1;
    transparentPreview.height = 1;
    event.dataTransfer.setDragImage(transparentPreview, 0, 0);
    setDraggingProvider(key);
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
      if (settings.webSearch?.apiKey) bundle.webSearch = settings.webSearch;
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
      let webSearchPatch: WebSearchSettings | null = null;
      let count = 0;
      const names: string[] = [];
      for (const [k, v] of Object.entries(bundle.providers)) {
        if (k === 'webSearch' && v.apiKey) {
          webSearchPatch = { ...webSearchSettings, ...(v as Partial<WebSearchSettings>), apiKey: v.apiKey };
          count++;
          names.push('Tavily');
          continue;
        }
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
      if (webSearchPatch) await update({ webSearch: webSearchPatch });
      await updateAI(merged);
      setLocalProviders(JSON.parse(JSON.stringify(merged)));
      setVaultMsg(`✅ 导入成功：${count} 个 Key 已写入（${names.join(' / ')}），可在上方「API 服务配置」展开查看`);
      setImportText('');
    } catch {
      setVaultMsg('❌ 解密失败：主密码错误或密文损坏');
    }
  };

  const orderedProviders = (settings.providerOrder ?? ['shengsuanyun', 'relay', 'siliconflow', 'zhipu', 'deepseek', 'local'])
    .map((key) => PROVIDER_INFO.find((provider) => provider.key === key))
    .filter((provider): provider is typeof PROVIDER_INFO[number] => Boolean(provider));

  return (
    <div className="settings-layout w-full p-1 sm:p-3">
      <main className="min-w-0 space-y-5 sm:space-y-7">
      <header className="page-hero !items-start !flex-col !gap-0">
        <h1 className="text-2xl font-bold">设置</h1>
        <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <div><p className="text-sm font-medium">配置模式：{advancedSettings ? '高级' : '基础'}</p><p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">基础模式只保留最常用的模型与同步设置；需要模型路由、联网和重排时再打开高级设置。</p></div>
          <button className="btn-secondary text-xs" type="button" onClick={() => setAdvancedSettings((value) => { const next = !value; localStorage.setItem('settings-advanced', next ? '1' : '0'); return next; })}>{advancedSettings ? '切换为基础模式' : '打开高级设置'}</button>
        </div>
      </header>

      {/* API 服务配置 */}
      <section id="ai-services" className="scroll-mt-6 flex flex-col space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Bot className="h-5 w-5 text-[var(--color-primary)]" /> API 服务配置</h2>
        </div>
        <p className="text-xs text-gray-400">填写 API Key 后点击「刷新模型」获取可用模型列表，勾选你想使用的模型</p>
        <div className="order-1 flex items-center justify-between gap-3 px-1 pt-1">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">🔀 来源顺序</h2>
            <p className="mt-1 text-xs text-gray-400">列表顺序就是服务优先级，可拖动调整；点击“配置服务”展开详细设置。</p>
          </div>
          <button className="btn-ghost shrink-0 px-2 py-1 text-[11px]" onClick={() => void handleTestAllProviders()} type="button">测试全部模型</button>
        </div>
        {orderedProviders.map(({ key, label, desc }) => {
          const prov = localProviders[key];
          const models = settings.availableModels?.[key] ?? [];
          const isRefreshing = refreshing[key];
          const msg = refreshMsg[key];
          // 按手动输入框内容对模型勾选列表进行实时筛选
          const filterText = (manualModel[key] ?? '').trim().toLowerCase();
          const filteredModels = filterText
            ? models.filter(m => m.toLowerCase().includes(filterText))
            : models;
          const isProviderOpen = openProvider === key;

          return (
            <div key={key}
              onDragEnd={() => setDraggingProvider(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropProvider(key)}
              className={`card order-1 space-y-3 ${draggingProvider === key ? 'provider-order-row-dragging' : ''}`}>
              <div className="provider-card-header">
                <div
                  className="flex min-w-0 cursor-grab items-center gap-3"
                  draggable
                  onDragStart={(event) => startProviderDrag(event, key)}
                  title="拖动此处调整服务优先级"
                >
                  <div>
                    <h3 className="font-medium">{label}</h3>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                </div>
                <div className="provider-card-actions">
                  {(() => {
                    const result = apiTestResults[key] ?? { status: 'waiting' as const, msg: '未测试' };
                    return <span className={`flex min-w-0 items-center gap-1 text-[11px] ${statusTextClass(result.status)}`}><StatusMark status={result.status} /><span className="hidden max-w-24 truncate sm:inline">{result.msg}</span></span>;
                  })()}
                  {prov.enabled && (
                    <button className="btn-ghost h-8 whitespace-nowrap px-2.5 text-xs" onClick={() => setOpenProvider(isProviderOpen ? null : key)} type="button" aria-expanded={isProviderOpen}>
                      {isProviderOpen ? '收起配置' : '配置服务'}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isProviderOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" checked={prov.enabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        updateField(key, 'enabled', enabled);
                        if (enabled) setOpenProvider(key);
                        else if (openProvider === key) setOpenProvider(null);
                      }}
                      className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>

              {prov.enabled && isProviderOpen && (
                <div className="provider-config-panel space-y-2 sm:pl-10">
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
                    {key === 'local' && (
                      <button className="btn-ghost ml-auto text-xs" type="button" onClick={() => setShowLocalModelDraft((value) => !value)}>
                        <Plus className="h-3 w-3" /> 新建本地模型
                      </button>
                    )}
                  </div>
                  {key === 'local' && showLocalModelDraft && (
                    <div className="grid grid-cols-1 gap-2 rounded-lg bg-[var(--color-surface-2)]/55 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <label className="text-xs text-[var(--color-text-secondary)]">显示名称
                        <input className="input-field mt-1 text-xs" value={localModelDraft.name} onChange={(e) => setLocalModelDraft((draft) => ({ ...draft, name: e.target.value }))} placeholder="例如：我的 DeepSeek" />
                      </label>
                      <label className="text-xs text-[var(--color-text-secondary)]">模型 ID
                        <input className="input-field mt-1 text-xs font-mono" value={localModelDraft.modelId} onChange={(e) => setLocalModelDraft((draft) => ({ ...draft, modelId: e.target.value }))} placeholder="例如：llama3.2" />
                      </label>
                      <button className="btn-primary text-xs" type="button" onClick={addLocalModel} disabled={!localModelDraft.modelId.trim()}><Plus className="h-3 w-3" /> 添加</button>
                    </div>
                  )}
                  {msg && (
                    <p className={`text-xs ${msg.startsWith('发现') ? 'text-green-500' : 'text-red-500'}`}>{msg}</p>
                  )}

                  {/* 该 provider 已勾选的模型 */}
                  {(() => {
                    const selected = (settings.selectedModels ?? []);
                    const providerModels = models.filter(m => selected.includes(key === 'local' ? `local/${m}` : m));
                    return providerModels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {providerModels.map(m => {
                          const modelKey = key === 'local' ? `local/${m}` : m;
                          const displayName = key === 'local' ? (settings.modelLabels?.[modelKey] || m) : m;
                          return <span key={m} className="tag-brand text-xs flex items-center gap-1" title={key === 'local' && displayName !== m ? m : undefined}>
                            {displayName}
                            <button onClick={() => removeModel(modelKey)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                          </span>
                        })}
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

        {/* 来源顺序已合并到上方服务列表；每个服务卡片就是一个可拖动的优先级项。 */}
        <div className="hidden">
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
                  draggable
                  onDragStart={(event) => startProviderDrag(event, key)}
                  onDragEnd={() => setDraggingProvider(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropProvider(key)}
                  className={`provider-order-row flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 ${draggingProvider === key ? 'provider-order-row-dragging' : ''}`}>
                  <GripVertical className="provider-order-grip h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)]" aria-label="拖动排序" />
                  <span className="text-base">{info?.icon ?? '🔧'}</span>
                  <span className="flex-1 text-sm font-medium">{info?.label ?? key}</span>
                  {(() => {
                    const result = apiTestResults[key] ?? { status: 'waiting' as const, msg: '未测试' };
                    return (
                      <div className={`flex min-w-0 items-center gap-1.5 ${statusTextClass(result.status)}`}>
                        <StatusMark status={result.status} />
                        <span className="max-w-28 truncate text-[10px]">{result.msg}</span>
                      </div>
                    );
                  })()}
                  {configured
                    ? <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-500">已配置</span>
                    : <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] text-gray-400">未配置</span>}
                  <span className="text-[10px] tabular-nums text-[var(--color-text-tertiary)]">#{i + 1}</span>
                  <button className="btn-ghost shrink-0 px-2 py-1 text-xs" onClick={() => void handleTestProvider(key)} type="button">测试</button>
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

      {advancedSettings && <AIModelCenter settings={settings} onUpdate={update} />}

      {/* 普通 AI 回答 */}
      <section id="model-answer" className="scroll-mt-6 space-y-3">
        <div className="card space-y-3">
          <div>
            <h3 className="font-medium text-sm">💬 普通 AI 回答策略</h3>
            <p className="text-xs text-gray-400">控制普通聊天的上下文数量和回答长度。引用数量越少越快，越多越全面。</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs text-gray-400">回答引用数量
              <SettingsSelect className="mt-1" value={String(answerSettings.retrievalTopK)} ariaLabel="回答引用数量" onChange={(value) => void update({ aiAnswer: { ...answerSettings, retrievalTopK: Number(value) as 3 | 5 | 8 } })} options={[{ value: '3', label: '3（更快）' }, { value: '5', label: '5（推荐）' }, { value: '8', label: '8（更全面）' }]} />
            </label>
            <label className="text-xs text-gray-400">回答长度
              <SettingsSelect className="mt-1" value={answerSettings.detail} ariaLabel="回答长度" onChange={(value) => void update({ aiAnswer: { ...answerSettings, detail: value as 'concise' | 'standard' | 'detailed' } })} options={[{ value: 'concise', label: '简洁' }, { value: 'standard', label: '标准' }, { value: 'detailed', label: '详细' }]} />
            </label>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={Boolean(answerSettings.rewriteEnabled)} onChange={(event) => void update({ aiAnswer: { ...answerSettings, rewriteEnabled: event.target.checked } })} />
            <span>
              <span className="block text-sm text-[var(--color-text)]">生成后重写答案</span>
              <span className="mt-0.5 block text-xs text-gray-400">用同一模型进行保守润色，保留引用、代码和 Mermaid；会增加一次模型调用，默认关闭。</span>
            </span>
          </label>
        </div>
      </section>

      {/* 联网搜索 */}
      {advancedSettings && <>
      <section id="web-search" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold">🌐 联网搜索</h2>
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-sm">联网搜索服务</p>
              <p className="text-xs text-gray-400">知识库没有命中时，可使用 Tavily、open-webSearch 或 DuckDuckGo 补充网页内容。</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" checked={webSearchSettings.enabled} onChange={(event) => updateWebSearch({ enabled: event.target.checked })} className="sr-only peer" />
              <div className="w-9 h-5 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-indigo-600 peer-checked:after:translate-x-full"></div>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs text-gray-400">联网搜索服务
              <SettingsSelect className="mt-1" value={webSearchSettings.provider} ariaLabel="联网搜索服务" onChange={(value) => updateWebSearch({ provider: value as WebSearchSettings['provider'] })} options={[{ value: 'tavily', label: 'Tavily（推荐，不用本地部署）' }, { value: 'open-websearch', label: 'open-webSearch（本地/自托管）' }, { value: 'duckduckgo', label: 'DuckDuckGo 摘要兜底' }]} />
            </label>
            {webSearchSettings.provider === 'tavily' && <label className="text-xs text-gray-400">Tavily API Key<input type="password" className="input-field mt-1 text-xs font-mono" value={webSearchSettings.apiKey ?? ''} onChange={(event) => updateWebSearch({ apiKey: event.target.value })} placeholder="tvly-..." /></label>}
            {webSearchSettings.provider === 'open-websearch' && <label className="text-xs text-gray-400">open-webSearch 地址<input className="input-field mt-1 text-xs font-mono" value={webSearchSettings.baseUrl} onChange={(event) => updateWebSearch({ baseUrl: event.target.value })} placeholder="http://127.0.0.1:3210" /></label>}
            <label className="text-xs text-gray-400">聊天默认联网模式
              <SettingsSelect className="mt-1" value={webSearchSettings.mode} ariaLabel="聊天默认联网模式" onChange={(value) => updateWebSearch({ mode: value as WebSearchSettings['mode'] })} options={[{ value: 'off', label: '不联网' }, { value: 'manual', label: '仅手动联网' }, { value: 'auto', label: '知识库不足时联网' }, { value: 'always', label: '总是联网补充' }]} />
            </label>
            <label className="text-xs text-gray-400">搜索结果数<input type="number" min={1} max={10} className="input-field mt-1 text-xs" value={webSearchSettings.resultLimit} onChange={(event) => updateWebSearch({ resultLimit: Math.max(1, Math.min(10, Number(event.target.value) || 5)) })} /></label>
            <label className="text-xs text-gray-400">抓取网页数<input type="number" min={1} max={5} className="input-field mt-1 text-xs" value={webSearchSettings.fetchLimit} onChange={(event) => updateWebSearch({ fetchLimit: Math.max(1, Math.min(5, Number(event.target.value) || 3)) })} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs" onClick={() => void handleTestWebSearch()} disabled={webSearchTest.status === 'testing'}>{webSearchTest.status === 'testing' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}测试联网搜索</button>
            <span className={`text-xs ${statusTextClass(webSearchTest.status)}`}>{webSearchTest.msg || '未测试'}</span>
          </div>
          <p className="text-xs leading-5 text-[var(--color-text-tertiary)]">推荐启用「知识库不足时联网」，它会在本地知识库没有命中或问题包含“最新/今天/价格/版本/政策”等时效词时自动抓取网页正文。</p>
        </div>
      </section></>}

      <SyncSettingsSection config={settings.sync!} status={syncStatus} errorMessage={syncErrorMessage} testing={syncTesting} testMessage={syncMsg} onUpdate={updateSync} onTest={handleTestConn} onPull={pullOnly} onSync={doSync} />

      {/* 密钥迁移（跨设备，基于主密码加密） */}
      <section id="key-migration" className="scroll-mt-6 space-y-3">
        <details className="settings-disclosure card group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="text-lg font-semibold">🔐 安全与迁移</h2>
              <p className="mt-1 text-xs text-gray-400">用主密码加密和恢复 API Key，支持跨设备迁移。</p>
            </div>
            <ChevronDown className="h-4 w-4 text-[var(--color-text-tertiary)] transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
        <div className="space-y-4">
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
          </div>
        </details>
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
            ['ai-services', 'API 服务'],
            ['model-center', '模型与回答'],
            ['model-answer', '普通 AI 回答'],
            ['web-search', '联网搜索'],
            ['cloud-sync', '云同步'],
            ['key-migration', '安全与迁移'],
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
