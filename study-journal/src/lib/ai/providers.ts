// ──── AI Provider Configurations ────
// All four providers are OpenAI-compatible, so we use a unified interface.

export interface AIProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

export type ProviderName = 'relay' | 'siliconflow' | 'zhipu' | 'deepseek';

export const DEFAULT_BASE_URLS: Record<ProviderName, string> = {
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

export const MODEL_MAP: Record<string, ModelEntry> = {
  'claude-sonnet':    { provider: 'relay', model: 'claude-3.5-sonnet' },
  'claude-haiku':     { provider: 'relay', model: 'claude-3.5-haiku' },
  'gpt-4o':           { provider: 'relay', model: 'gpt-4o' },
  'deepseek-chat':    { provider: 'relay', model: 'deepseek-chat' },
  'qwen-max':         { provider: 'siliconflow', model: 'Qwen/Qwen2.5-72B-Instruct' },
  'yi-large':         { provider: 'siliconflow', model: '01-ai/Yi-1.5-34B-Chat' },
  'deepseek-v2':      { provider: 'siliconflow', model: 'deepseek-ai/DeepSeek-V2.5' },
  'glm-4':            { provider: 'zhipu', model: 'glm-4' },
  'glm-4v':           { provider: 'zhipu', model: 'glm-4v' },
  'deepseek-official':{ provider: 'deepseek', model: 'deepseek-chat' },
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

export const TASK_MODEL_MAP: Record<TaskType, string[]> = {
  summarize:     ['claude-sonnet', 'qwen-max'],
  explain:       ['claude-sonnet', 'glm-4'],
  generateCards: ['claude-sonnet', 'deepseek-chat'],
  codeReview:    ['deepseek-official', 'deepseek-v2'],
  codeExplain:   ['deepseek-official', 'deepseek-v2'],
  tagSuggest:    ['deepseek-chat', 'yi-large'],
  qa:            ['claude-sonnet', 'qwen-max'],
  sentiment:     ['deepseek-chat'],
  imageAnalysis: ['glm-4v'],
};

// Alias for router.ts
export const TASK_MODELS = TASK_MODEL_MAP;