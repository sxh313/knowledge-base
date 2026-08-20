import type { ChatMessage } from './client';
import { chatCompletion } from './client';
import { getSettings } from '../db/queries';
import { MODEL_MAP, TASK_MODELS, PROVIDER_FALLBACK_MODELS, providerNeedsApiKey, type TaskType, type ProviderName } from './providers';

export interface RouteResult {
  content: string;
  model: string;
  provider: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export async function routeAI(
  task: TaskType,
  messages: ChatMessage[],
  onToken?: (token: string) => void,
): Promise<RouteResult> {
  const settings = await getSettings();
  const modelIds = TASK_MODELS[task];
  let lastError: string | null = null;

  // 记录已尝试过的 (provider, model)，避免 fallback 阶段重复调用
  const tried = new Set<string>();

  const tryModel = async (provider: ProviderName, model: string): Promise<RouteResult | null> => {
    const key = `${provider}/${model}`;
    if (tried.has(key)) return null;
    tried.add(key);

    const prov = settings.aiProviders[provider];
    if (!prov?.enabled || (providerNeedsApiKey(provider) && !prov.apiKey)) {
      lastError = `[${provider}] 未配置`;
      return null;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const result = await chatCompletion(
        { name: provider, baseUrl: prov.baseUrl, apiKey: prov.apiKey, enabled: true },
        model,
        messages,
        { stream: !!onToken, onToken, signal: controller.signal },
      );
      clearTimeout(timeout);
      return { content: result.content, model, provider, usage: result.usage };
    } catch (err) {
      lastError = `${provider}/${model}: ${(err as Error).message}`;
      console.warn(`AI failover: ${lastError}`);
      return null;
    }
  };

  // 1) 主模型序列（用户可配置的模型，如 deepseek-v4-flash）
  for (const modelId of modelIds) {
    const entry = MODEL_MAP[modelId];
    if (!entry) continue;
    const res = await tryModel(entry.provider, entry.model);
    if (res) return res;
  }

  // 2) 通用兜底：主序列全部失败/未配置时，遍历所有已配置的 provider 用其默认模型再试
  //    这样即使默认模型指向的 provider 未配置（如胜算云），也能自动用硅基/DeepSeek 官方等。
  //    顺序遵循用户自定义的 providerOrder（缺省时按内置顺序）。
  const providerOrder: ProviderName[] =
    settings.providerOrder ?? ['shengsuanyun', 'relay', 'siliconflow', 'zhipu', 'deepseek', 'local'];
  for (const provider of providerOrder) {
    const fallbackModelId = PROVIDER_FALLBACK_MODELS[provider];
    const entry = fallbackModelId ? MODEL_MAP[fallbackModelId] : undefined;
    const model = provider === 'local'
      ? (settings.availableModels?.local?.[0] ?? settings.selectedModels?.find((id) => id.startsWith('local/'))?.slice(6) ?? 'llama3.2').replace(/^local\//, '')
      : entry?.model;
    if (!model) continue;
    const res = await tryModel(provider, model);
    if (res) return res;
  }

  throw new Error(`All AI endpoints failed. Last error: ${lastError}`);
}

export function getSystemPrompt(task: TaskType): string {
  const prompts: Record<TaskType, string> = {
    summarize: 'You are a learning assistant. Summarize the key points of the following notes in concise Chinese, listing key knowledge items.',
    explain: 'You are a patient tutor. Explain the following concepts in simple terms with practical examples.',
    generateCards: 'You are a flashcard creation expert. Convert the following content into Anki-style flashcards. Return as JSON array.',
    codeReview: 'You are a senior code reviewer. Review the code for bugs, performance issues, and security risks.',
    codeExplain: 'You are a programming tutor. Explain how the following code works line by line.',
    tagSuggest: 'You are a knowledge management assistant. Recommend 3-5 tags for the following notes. Return as JSON string array.',
    qa: 'You are a QA assistant based on study notes. Answer questions based on the notes provided.',
    sentiment: 'Analyze the sentiment of the following journal entry. Return as JSON with score (0-1) and analysis.',
    imageAnalysis: 'Analyze the content of this image and extract key information for learning purposes.',
  };
  return prompts[task] || prompts.explain;
}
