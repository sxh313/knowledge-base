import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import type { ProviderName } from '../lib/ai/providers';
import { DEFAULT_BASE_URLS } from '../lib/ai/providers';
import type { AISettings } from '../lib/db/schema';

const PROVIDER_INFO: { key: ProviderName; label: string; desc: string; icon: string }[] = [
  { key: 'relay', label: '中转站', desc: '主力入口 — 你最常用的中转服务', icon: '🔄' },
  { key: 'siliconflow', label: '硅基流动', desc: '备选 — SiliconFlow 丰富模型', icon: '🔬' },
  { key: 'zhipu', label: '智谱 GLM', desc: '中文理解 & 图片分析 (GLM-4V)', icon: '🧠' },
  { key: 'deepseek', label: 'DeepSeek', desc: '代码专用 — 性价比最高', icon: '💻' },
];

export default function SettingsPage() {
  const { settings, load, updateAI } = useSettingsStore();
  // 本地表单状态 — 避免每次按键都写 IndexedDB
  const [localProviders, setLocalProviders] = useState<AISettings | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { load(); }, []);

  // 当 settings 从数据库加载完成后，同步到本地状态
  useEffect(() => {
    if (settings && !localProviders) {
      setLocalProviders(JSON.parse(JSON.stringify(settings.aiProviders)));
    }
  }, [settings, localProviders]);

  // 防抖保存：本地状态变化后 500ms 才写入 IndexedDB
  useEffect(() => {
    if (!localProviders) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateAI(localProviders);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [localProviders]);

  if (!settings || !localProviders) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-500">加载中...</p></div>;
  }

  // 更新单个 provider 的字段（本地状态）
  const updateField = (key: ProviderName, field: 'baseUrl' | 'apiKey' | 'enabled', value: string | boolean) => {
    setLocalProviders(prev => prev ? {
      ...prev,
      [key]: { ...prev[key], [field]: value },
    } : null);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-sm text-gray-500 mt-1">配置你的 AI API 入口 — 所有 Key 仅存储在本地设备</p>
      </header>

      {/* AI Providers */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">🤖 AI 模型配置</h2>
        <p className="text-xs text-gray-400">你有 4 个 API 入口，App 会根据任务自动选择最优的入口和模型</p>

        {PROVIDER_INFO.map(({ key, label, desc, icon }) => {
          const prov = localProviders[key];
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
                  <input
                    type="checkbox"
                    checked={prov.enabled}
                    onChange={(e) => updateField(key, 'enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {prov.enabled && (
                <div className="space-y-2 pl-10">
                  <div>
                    <label className="text-xs text-gray-400">API 地址</label>
                    <input
                      className="input-field mt-1 text-xs font-mono"
                      value={prov.baseUrl || DEFAULT_BASE_URLS[key]}
                      onChange={(e) => updateField(key, 'baseUrl', e.target.value)}
                      placeholder={DEFAULT_BASE_URLS[key]}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">API Key</label>
                    <input
                      type="password"
                      className="input-field mt-1 text-xs font-mono"
                      value={prov.apiKey}
                      onChange={(e) => updateField(key, 'apiKey', e.target.value)}
                      placeholder="sk-..."
                    />
                    <p className="text-[10px] text-gray-400 mt-1">🔒 Key 仅存储在本地 IndexedDB，不会上传到任何服务器</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Model Preferences */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">🎯 模型偏好</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card">
            <label className="text-xs text-gray-400">高质量任务（总结/问答）</label>
            <input className="input-field mt-1" value={settings.preferredModels.highQuality}
              onChange={(e) => useSettingsStore.getState().update({ preferredModels: { ...settings.preferredModels, highQuality: e.target.value } })} />
          </div>
          <div className="card">
            <label className="text-xs text-gray-400">代码任务</label>
            <input className="input-field mt-1" value={settings.preferredModels.codeTask}
              onChange={(e) => useSettingsStore.getState().update({ preferredModels: { ...settings.preferredModels, codeTask: e.target.value } })} />
          </div>
          <div className="card">
            <label className="text-xs text-gray-400">快速任务（标签/情绪）</label>
            <input className="input-field mt-1" value={settings.preferredModels.fastTask}
              onChange={(e) => useSettingsStore.getState().update({ preferredModels: { ...settings.preferredModels, fastTask: e.target.value } })} />
          </div>
        </div>
      </section>

      {/* API 连接测试 */}
      <section className="card">
        <h2 className="text-lg font-semibold mb-3">🔌 连接测试</h2>
        <p className="text-xs text-gray-400 mb-3">测试你的 API 配置是否可用</p>
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
        所有 API Key 和笔记数据仅存储在你的本地设备上
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
      const { key, label } = PROVIDER_INFO[i];
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
        const res = await fetch(`${prov.baseUrl.replace(/\/+$/, '')}/models`, {
          headers: { Authorization: `Bearer ${prov.apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = await res.json();
          const count = data.data?.length ?? 0;
          newResults[i] = { ...newResults[i], status: 'ok', msg: `✅ 可用 (${count} 个模型)` };
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
          <span>{r.status === 'testing' ? '⟳' : r.status === 'ok' ? '✓' : r.status === 'fail' ? '✗' : '—'}</span>
          <span className="text-xs">{r.msg}</span>
        </div>
      ))}
    </div>
  );
}
