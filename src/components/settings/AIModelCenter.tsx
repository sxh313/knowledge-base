import { useMemo, useState } from 'react';
import type { AIModelBindings, AIModelProfile, AppSettings } from '../../lib/db/schema';
import { chatCompletion } from '../../lib/ai/client';
import { DEFAULT_MODEL_BINDINGS, getRetrievalSettings } from '../../lib/ai/modelProfiles';
import { testEmbeddingProfile } from '../../lib/ai/embeddings';
import { describeConnectionError } from '../../lib/ai/connectionError';

interface Props {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => Promise<void>;
}

const ROLE_FIELDS: { key: keyof AIModelBindings; label: string; kind: AIModelProfile['kind']; description: string }[] = [
  { key: 'answerModelId', label: '知识库回答 / 普通 AI', kind: 'chat', description: '严格问答、总结和通用 AI 任务' },
  { key: 'embeddingModelId', label: '向量召回（可选）', kind: 'embedding', description: '可选；生成问题和 Markdown 分块向量，启用后与关键词双路召回' },
  { key: 'rerankerModelId', label: '检索重排', kind: 'chat', description: '对召回的前 30 个候选进行相关性排序' },
  { key: 'queryRewriteModelId', label: '查询改写（可选）', kind: 'chat', description: '默认关闭，避免额外网络请求' },
  { key: 'reviewTutorModelId', label: '复习辅导', kind: 'chat', description: 'zero2Agent 复习对话和追问' },
  { key: 'evaluatorModelId', label: '复习评分', kind: 'chat', description: '评价答案并提取证据' },
  { key: 'plannerModelId', label: '复习计划', kind: 'chat', description: '未来扩展的计划生成角色' },
];

function newProfile(): AIModelProfile {
  const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
  return { id, name: '自定义模型', kind: 'chat', baseUrl: 'http://127.0.0.1:4900/v1', modelId: '', apiKey: '', enabled: true };
}

export default function AIModelCenter({ settings, onUpdate }: Props) {
  const [testState, setTestState] = useState<Record<string, string>>({});
  const profiles = settings.modelProfiles ?? [];
  const bindings = { ...DEFAULT_MODEL_BINDINGS, ...(settings.modelBindings ?? {}) };
  const retrieval = getRetrievalSettings(settings);
  const chatProfiles = useMemo(() => profiles.filter((profile) => profile.kind === 'chat'), [profiles]);
  const embeddingProfiles = useMemo(() => profiles.filter((profile) => profile.kind === 'embedding'), [profiles]);

  const saveProfiles = (next: AIModelProfile[]) => onUpdate({ modelProfiles: next });
  const updateProfile = (id: string, patch: Partial<AIModelProfile>) => {
    void saveProfiles(profiles.map((profile) => profile.id === id ? { ...profile, ...patch } : profile));
  };
  const updateBinding = (key: keyof AIModelBindings, value: string) => {
    void onUpdate({ modelBindings: { ...bindings, [key]: value || undefined } as AIModelBindings });
  };
  const testProfile = async (profile: AIModelProfile) => {
    setTestState((current) => ({ ...current, [profile.id]: '测试中...' }));
    try {
      if (profile.kind === 'embedding') {
        const result = await testEmbeddingProfile(profile);
        setTestState((current) => ({ ...current, [profile.id]: `✅ 可用，${result.dimension} 维（${result.model}）` }));
      } else {
        const result = await chatCompletion(
          { name: profile.id, baseUrl: profile.baseUrl, apiKey: profile.apiKey, enabled: profile.enabled },
          profile.modelId,
          [{ role: 'user', content: '只回复：连接成功' }],
          { temperature: 0, maxTokens: 16 },
        );
        setTestState((current) => ({ ...current, [profile.id]: `✅ 可用：${result.content.trim().slice(0, 30)}` }));
      }
    } catch (error) {
      setTestState((current) => ({ ...current, [profile.id]: `❌ ${describeConnectionError(error, profile.baseUrl)}` }));
    }
  };

  return (
    <section id="model-center" className="model-center-section scroll-mt-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">🧩 模型中心与角色绑定</h2>
        <p className="mt-1 text-xs text-gray-400">每个本地端点只配置一次，再绑定到回答、召回、重排和复习角色。Embedding 是可选增强，不配置也能正常使用关键词检索。API Key 只保存在当前设备。</p>
      </div>

      <div className="space-y-3">
        {profiles.map((profile) => (
          <div key={profile.id} className="card space-y-3">
            <div className="model-profile-header flex flex-wrap items-center gap-2">
              <input className="input-field min-w-[10rem] flex-1 text-sm" value={profile.name} onChange={(event) => updateProfile(profile.id, { name: event.target.value })} />
              <select className="input-field w-32 text-sm" value={profile.kind} onChange={(event) => updateProfile(profile.id, { kind: event.target.value as AIModelProfile['kind'] })}>
                <option value="chat">Chat 对话</option>
                <option value="embedding">Embedding 向量</option>
              </select>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                <input type="checkbox" checked={profile.enabled} onChange={(event) => updateProfile(profile.id, { enabled: event.target.checked })} />启用
              </label>
              <button className="btn-secondary text-xs" onClick={() => void testProfile(profile)}>测试连接</button>
              <button className="btn-ghost text-xs text-red-500" onClick={() => void saveProfiles(profiles.filter((item) => item.id !== profile.id))}>删除</button>
            </div>
            <div className="model-profile-fields grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs text-gray-400">Base URL<input className="input-field mt-1 text-xs font-mono" value={profile.baseUrl} onChange={(event) => updateProfile(profile.id, { baseUrl: event.target.value })} placeholder="http://127.0.0.1:4900/v1" /></label>
              <label className="text-xs text-gray-400">Model ID<input className="input-field mt-1 text-xs font-mono" value={profile.modelId} onChange={(event) => updateProfile(profile.id, { modelId: event.target.value })} placeholder={profile.kind === 'embedding' ? 'BAAI/bge-small-zh-v1.5' : 'dsv4'} /></label>
              <label className="text-xs text-gray-400">API Key（可选）<input type="password" className="input-field mt-1 text-xs font-mono" value={profile.apiKey} onChange={(event) => updateProfile(profile.id, { apiKey: event.target.value })} placeholder="本地服务可留空" /></label>
              {profile.kind === 'embedding' && <label className="text-xs text-gray-400">向量维度<input type="number" className="input-field mt-1 text-xs font-mono" value={profile.dimension ?? ''} onChange={(event) => updateProfile(profile.id, { dimension: event.target.value ? Number(event.target.value) : undefined })} placeholder="512" /></label>}
            </div>
            {testState[profile.id] && <p className="text-xs text-gray-500">{testState[profile.id]}</p>}
          </div>
        ))}
        <button className="btn-secondary text-sm" onClick={() => void saveProfiles([...profiles, newProfile()])}>＋ 添加模型配置</button>
      </div>

      <div className="card space-y-3">
        <div>
          <h3 className="font-medium">角色绑定</h3>
          <p className="mt-1 text-xs text-gray-400">dsv4 可以绑定回答、重排、复习和评分；Embedding 模型只绑定向量召回。</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLE_FIELDS.map((role) => {
            const options = role.kind === 'embedding' ? embeddingProfiles : chatProfiles;
            const value = bindings[role.key] ?? '';
            return (
              <label key={role.key} className="text-xs text-gray-400">
                {role.label}<span className="ml-1 text-[var(--color-text-tertiary)]">· {role.description}</span>
                <select className="input-field mt-1 text-xs" value={value} onChange={(event) => updateBinding(role.key, event.target.value)}>
                  <option value="">不绑定（使用旧配置/自动降级）</option>
                  {options.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.modelId}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      </div>

      <div className="card space-y-3">
        <div>
          <h3 className="font-medium">检索策略</h3>
          <p className="mt-1 text-xs text-gray-400">关键词检索始终可用。只有开启向量召回、绑定并启用 Embedding 模型且存在向量索引时，才会执行关键词 + 向量双路召回；任一条件不满足就只走关键词。dsv4 重排失败不会阻塞回答。</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={retrieval.vectorEnabled} onChange={(event) => void onUpdate({ retrieval: { ...retrieval, vectorEnabled: event.target.checked } })} />启用向量召回</label>
          <label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={retrieval.rerankEnabled} onChange={(event) => void onUpdate({ retrieval: { ...retrieval, rerankEnabled: event.target.checked } })} />启用 dsv4 重排</label>
          <label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={retrieval.queryRewriteEnabled} onChange={(event) => void onUpdate({ retrieval: { ...retrieval, queryRewriteEnabled: event.target.checked } })} />启用查询改写</label>
          <label className="text-xs text-gray-400">候选数量<input type="number" min={8} max={50} className="input-field mt-1 text-xs" value={retrieval.candidateTopK} onChange={(event) => void onUpdate({ retrieval: { ...retrieval, candidateTopK: Math.max(8, Math.min(50, Number(event.target.value) || 30)) } })} /></label>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-xs text-gray-400">关键词权重<input type="number" min={0} max={1} step={0.05} className="input-field mt-1 text-xs" value={retrieval.lexicalWeight} onChange={(event) => void onUpdate({ retrieval: { ...retrieval, lexicalWeight: Math.max(0, Math.min(1, Number(event.target.value) || 0)) } })} /></label>
          <label className="text-xs text-gray-400">向量权重<input type="number" min={0} max={1} step={0.05} className="input-field mt-1 text-xs" value={retrieval.vectorWeight} onChange={(event) => void onUpdate({ retrieval: { ...retrieval, vectorWeight: Math.max(0, Math.min(1, Number(event.target.value) || 0)) } })} /></label>
          <label className="text-xs text-gray-400">重排超时（毫秒）<input type="number" min={1000} max={60000} step={1000} className="input-field mt-1 text-xs" value={retrieval.rerankTimeoutMs} onChange={(event) => void onUpdate({ retrieval: { ...retrieval, rerankTimeoutMs: Math.max(1000, Math.min(60000, Number(event.target.value) || 10000)) } })} /></label>
        </div>
      </div>
    </section>
  );
}
