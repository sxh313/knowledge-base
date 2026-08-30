import { useEffect, useMemo, useRef, useState } from 'react';
import type { AIModelBindings, AIModelProfile, AppSettings } from '../../lib/db/schema';
import { DEFAULT_MODEL_BINDINGS, getRetrievalSettings } from '../../lib/ai/modelProfiles';
import { Check, ChevronDown } from 'lucide-react';

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

const PROVIDER_LABELS: Record<string, string> = {
  shengsuanyun: '胜算云', relay: 'Relay', siliconflow: '硅基流动', zhipu: '智谱', deepseek: 'DeepSeek', local: '本地服务',
};

function serviceProfileId(provider: string, modelId: string): string {
  return `api:${provider}:${modelId}`;
}

function isEmbeddingModel(modelId: string): boolean {
  return /(embed|bge|e5-|gte-|text-embedding|向量)/i.test(modelId);
}

function RoleModelSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: AIModelProfile[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((profile) => profile.id === value);
  // 角色绑定只展示模型 ID；API、供应商和内部 profile ID 不属于用户需要做的选择。
  const label = selected ? selected.modelId : '未绑定';

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="role-model-select relative mt-2">
      <button
        type="button"
        className={`input-field role-binding-select flex w-full items-center justify-between gap-3 text-left text-xs ${open ? 'role-binding-select-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="role-binding-menu absolute left-0 right-0 z-30 mt-2 max-h-64 overflow-y-auto rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1.5 shadow-lg" role="listbox" aria-label="模型选项">
          <button type="button" role="option" aria-selected={!value} className={`role-binding-option ${!value ? 'role-binding-option-selected' : ''}`} onClick={() => choose('')}>
            <span>未绑定</span>
            {!value && <Check className="h-4 w-4 flex-shrink-0" />}
          </button>
          {options.map((profile) => {
            const optionLabel = profile.modelId;
            return (
              <button key={profile.id} type="button" role="option" aria-selected={profile.id === value} className={`role-binding-option ${profile.id === value ? 'role-binding-option-selected' : ''}`} onClick={() => choose(profile.id)}>
                <span className="min-w-0 truncate">{optionLabel}</span>
                {profile.id === value && <Check className="h-4 w-4 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AIModelCenter({ settings, onUpdate }: Props) {
  const profiles = settings.modelProfiles ?? [];
  const bindings = { ...DEFAULT_MODEL_BINDINGS, ...(settings.modelBindings ?? {}) };
  const retrieval = getRetrievalSettings(settings);
  // 只有 API 服务配置中明确勾选的模型才作为角色绑定候选项；首次绑定时自动物化为 modelProfile。
  const serviceProfiles = useMemo(() => {
    const result: AIModelProfile[] = [];
    const selectedModels = new Set(settings.selectedModels ?? []);
    for (const [provider, modelIds] of Object.entries(settings.availableModels ?? {})) {
      const providerConfig = settings.aiProviders[provider as keyof typeof settings.aiProviders];
      // 角色绑定只允许选择 API 服务配置中已启用的服务，避免旧的 local/dsv4 默认值混入候选项。
      if (!providerConfig?.enabled) continue;
      for (const modelId of modelIds ?? []) {
        const selectedId = provider === 'local' ? `local/${modelId}` : modelId;
        if (!selectedModels.has(selectedId)) continue;
        result.push({
          id: serviceProfileId(provider, modelId),
          name: `${PROVIDER_LABELS[provider] ?? provider} · ${modelId}`,
          kind: isEmbeddingModel(modelId) ? 'embedding' : 'chat',
          baseUrl: providerConfig.baseUrl,
          modelId,
          apiKey: providerConfig.apiKey,
          enabled: providerConfig.enabled,
        });
      }
    }
    return result;
  }, [settings.availableModels, settings.aiProviders, settings.selectedModels]);
  const rerankerProfile = serviceProfiles.find((profile) => profile.id === bindings.rerankerModelId && profile.kind === 'chat');
  const updateBinding = (key: keyof AIModelBindings, value: string) => {
    const selected = serviceProfiles.find((profile) => profile.id === value);
    const nextProfiles = selected && !profiles.some((profile) => profile.id === selected.id)
      ? [...profiles, selected]
      : profiles;
    void onUpdate({
      modelProfiles: nextProfiles,
      modelBindings: { ...bindings, [key]: value || undefined } as AIModelBindings,
    });
  };

  useEffect(() => {
    const validIds = new Set(serviceProfiles.map((profile) => profile.id));
    const nextBindings: Partial<AIModelBindings> = { ...bindings };
    let changed = false;
    for (const key of Object.keys(DEFAULT_MODEL_BINDINGS) as (keyof AIModelBindings)[]) {
      const current = nextBindings[key];
      if (current && !validIds.has(current)) {
        nextBindings[key] = undefined;
        changed = true;
      }
    }
    if (changed) void onUpdate({ modelBindings: nextBindings as AIModelBindings });
  }, [serviceProfiles, settings.modelBindings]);
  return (
    <section id="model-center" className="model-center-section scroll-mt-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">🧩 角色绑定</h2>
        <p className="mt-1 text-xs text-gray-400">模型只在上方「API 服务配置」中维护；这里直接选择已启用且已勾选的模型绑定到回答、召回、重排和复习角色，不再重复填写模型信息。Embedding 是可选增强，不配置也能正常使用关键词检索。</p>
      </div>

      <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
        隐私提示：调用回答、Embedding、重排或复习模型时，问题及命中的笔记片段会发送到你选择的服务地址。系统默认不配置模型、不发送数据；请先确认服务方的数据处理政策，再主动启用并绑定角色。
      </div>

      <div className="card role-binding-card space-y-4">
        <div className="role-binding-header">
          <div>
            <h3 className="font-medium">角色绑定</h3>
            <p className="mt-1 text-xs text-gray-400">候选模型只来自「API 服务配置」中已启用并勾选的模型。未勾选或未启用的服务不会出现在这里。</p>
          </div>
        </div>
        <div className="role-binding-grid grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {ROLE_FIELDS.map((role) => {
            const options = serviceProfiles.filter((profile) => profile.kind === role.kind);
            const storedValue = bindings[role.key] ?? '';
            const value = options.some((profile) => profile.id === storedValue) ? storedValue : '';
            return (
              <label key={role.key} className="role-binding-item text-xs">
                <span className="role-binding-label">{role.label}</span>
                <span className="role-binding-description">{role.description}</span>
                <RoleModelSelect value={value} options={options} onChange={(nextValue) => updateBinding(role.key, nextValue)} />
              </label>
            );
          })}
        </div>
      </div>

      <div className="card space-y-3">
        <div>
          <h3 className="font-medium">检索策略</h3>
          <p className="mt-1 text-xs text-gray-400">关键词检索始终可用。只有开启向量召回、绑定并启用 Embedding 模型且存在向量索引时，才会执行关键词 + 向量双路召回；任一条件不满足就只走关键词。模型重排失败不会阻塞回答。</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={retrieval.vectorEnabled} onChange={(event) => void onUpdate({ retrieval: { ...retrieval, vectorEnabled: event.target.checked } })} />启用向量召回</label>
          <label className={`flex items-center gap-2 text-xs ${rerankerProfile ? 'text-gray-500' : 'text-gray-400'}`}>
            <input type="checkbox" disabled={!rerankerProfile} checked={retrieval.rerankEnabled && Boolean(rerankerProfile)} onChange={(event) => void onUpdate({ retrieval: { ...retrieval, rerankEnabled: event.target.checked } })} />
            <span>启用模型重排</span>
            <span className="truncate text-[var(--color-text-tertiary)]">· {rerankerProfile?.modelId ?? '未绑定模型'}</span>
          </label>
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
