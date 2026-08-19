// ──── AI Provider Configurations ────
// All providers are OpenAI-compatible, so we use a unified interface.

export interface AIProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

export type ProviderName = 'shengsuanyun' | 'relay' | 'siliconflow' | 'zhipu' | 'deepseek';

export const DEFAULT_BASE_URLS: Record<ProviderName, string> = {
  shengsuanyun: 'https://beta-router.shengsuanyun.com/api/v1',
  relay: '',                    // user-configured
  siliconflow: 'https://api.siliconflow.cn/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  deepseek: 'https://api.deepseek.com/v1',
};

// Model definitions: which provider + model name to use
export interface ModelEntry {
  provider: ProviderName;
  model: string;
}

// ⚠️ 别名说明：deepseek-v4-flash / deepseek-v4 / deepseek-r1 等是「胜算云 beta-router」
// 的中转别名，仅在 shengsuanyun provider 下有效。若改用官方 DeepSeek 入口，请使用
// 'deepseek-official'（其真实模型名为 deepseek-chat），否则会收到 404。
export const MODEL_MAP: Record<string, ModelEntry> = {
  // 胜算云 — 默认主力（模型名为 beta-router 中转别名）
  'deepseek-v4-flash':  { provider: 'shengsuanyun', model: 'deepseek-v4-flash' },
  'deepseek-v4':        { provider: 'shengsuanyun', model: 'deepseek-v4' },
  'deepseek-r1':        { provider: 'shengsuanyun', model: 'deepseek-r1' },
  'claude-sonnet':      { provider: 'shengsuanyun', model: 'claude-sonnet' },
  'gpt-4o':             { provider: 'shengsuanyun', model: 'gpt-4o' },
  'gpt-4o-mini':        { provider: 'shengsuanyun', model: 'gpt-4o-mini' },
  'qwen-max':           { provider: 'shengsuanyun', model: 'qwen-max' },
  // 中转站（自定义 URL）
  'relay-claude':       { provider: 'relay', model: 'claude-3.5-sonnet' },
  'relay-deepseek':     { provider: 'relay', model: 'deepseek-chat' },
  // 硅基流动
  'siliconflow-qwen':   { provider: 'siliconflow', model: 'Qwen/Qwen2.5-72B-Instruct' },
  'siliconflow-yi':     { provider: 'siliconflow', model: '01-ai/Yi-1.5-34B-Chat' },
  'siliconflow-ds':     { provider: 'siliconflow', model: 'deepseek-ai/DeepSeek-V2.5' },
  // 智谱
  'glm-4':              { provider: 'zhipu', model: 'glm-4' },
  'glm-4v':             { provider: 'zhipu', model: 'glm-4v' },
  // DeepSeek 官方
  'deepseek-official':  { provider: 'deepseek', model: 'deepseek-chat' },
};

// 每个 provider 的默认 fallback 模型（当主模型序列全部失败/未配置时，按已配置 provider 依次兜底）
export const PROVIDER_FALLBACK_MODELS: Record<ProviderName, string> = {
  shengsuanyun: 'deepseek-v4-flash',
  relay: 'relay-deepseek',
  siliconflow: 'siliconflow-ds',
  zhipu: 'glm-4',
  deepseek: 'deepseek-official',
};

// Task type → ordered list of model IDs (first = primary, rest = fallback)
export type TaskType =
  | 'summarize'
  | 'explain'
  | 'generateCards'
  | 'codeReview'
  | 'codeExplain'
  | 'tagSuggest'
  | 'qa'
  | 'sentiment'
  | 'imageAnalysis';

// 全部默认 deepseek-v4-flash，备选 deepseek-v4
export const TASK_MODEL_MAP: Record<TaskType, string[]> = {
  summarize:     ['deepseek-v4-flash', 'deepseek-v4'],
  explain:       ['deepseek-v4-flash', 'deepseek-v4'],
  generateCards: ['deepseek-v4-flash', 'deepseek-v4'],
  codeReview:    ['deepseek-v4-flash', 'deepseek-v4'],
  codeExplain:   ['deepseek-v4-flash', 'deepseek-v4'],
  tagSuggest:    ['deepseek-v4-flash'],
  qa:            ['deepseek-v4-flash', 'deepseek-v4'],
  sentiment:     ['deepseek-v4-flash'],
  imageAnalysis: ['glm-4v'],
};

// Alias for router.ts
export const TASK_MODELS = TASK_MODEL_MAP;