import type { ChatMessage } from './client';
import { chatCompletion } from './client';
import { getSettings } from '../db/queries';
import { MODEL_MAP, TASK_MODELS, PROVIDER_FALLBACK_MODELS, providerNeedsApiKey, type ModelEntry, type TaskType, type ProviderName } from './providers';
import type { AIModelBindings, AIModelProfile } from '../db/schema';

export interface RouteResult {
  content: string;
  model: string;
  provider: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export type ModelBindingRole = keyof Pick<AIModelBindings, 'answerModelId' | 'reviewTutorModelId' | 'evaluatorModelId' | 'plannerModelId' | 'queryRewriteModelId'>;

function resolveModelEntry(modelId: string): ModelEntry | undefined {
  const mapped = MODEL_MAP[modelId];
  if (mapped) return mapped;
  // 设置页对本地模型使用 local/<id> 命名空间，避免与云端同名模型冲突。
  if (modelId.startsWith('local/') && modelId.length > 6) {
    return { provider: 'local', model: modelId.slice(6) };
  }
  return undefined;
}

export async function routeAI(
  task: TaskType,
  messages: ChatMessage[],
  onToken?: (token: string) => void,
  preferredModelId?: string,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const settings = await getSettings();
  // 将设置页选择的模型放在任务专属 fallback 链最前面，避免 UI 选择与实际调用脱节。
  const preferredKey = task === 'codeReview' || task === 'codeExplain'
    ? 'codeTask'
    : task === 'tagSuggest' || task === 'sentiment'
      ? 'fastTask'
      : 'highQuality';
  const bindingOverride = preferredModelId && settings.modelBindings && preferredModelId in settings.modelBindings
    ? settings.modelBindings[preferredModelId as keyof AIModelBindings]
    : preferredModelId ?? (task === 'qa' ? settings.modelBindings?.answerModelId : undefined);
  const preferred = bindingOverride ?? settings.preferredModels?.[preferredKey];
  const modelIds = Array.from(new Set([preferred, ...TASK_MODELS[task]].filter((id): id is string => !!id)));
  let lastError: string | null = null;
  // QA 输出过长会显著拉高总延迟；需要更长内容的任务仍可通过专用 prompt 控制。
  const maxTokens = task === 'qa' ? 768 : task === 'summarize' ? 768 : undefined;

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
      const controller = signal ? undefined : new AbortController();
      const timeout = controller ? setTimeout(() => controller.abort(), 60000) : undefined;
      const result = await chatCompletion(
        { name: provider, baseUrl: prov.baseUrl, apiKey: prov.apiKey, enabled: true },
        model,
        messages,
        { stream: !!onToken, onToken, maxTokens, signal: signal ?? controller?.signal },
      );
      if (timeout) clearTimeout(timeout);
      return { content: result.content, model, provider, usage: result.usage };
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = `${provider}/${model}: ${(err as Error).message}`;
      console.warn(`AI failover: ${lastError}`);
      return null;
    }
  };

  const tryProfile = async (profile: AIModelProfile): Promise<RouteResult | null> => {
    const key = `profile/${profile.id}`;
    if (tried.has(key)) return null;
    tried.add(key);
    try {
      const controller = signal ? undefined : new AbortController();
      const timeout = controller ? setTimeout(() => controller.abort(), 60000) : undefined;
      const result = await chatCompletion(
        { name: profile.id, baseUrl: profile.baseUrl, apiKey: profile.apiKey, enabled: profile.enabled },
        profile.modelId,
        messages,
        { stream: !!onToken, onToken, maxTokens, signal: signal ?? controller?.signal },
      );
      if (timeout) clearTimeout(timeout);
      return { content: result.content, model: profile.modelId, provider: profile.id, usage: result.usage };
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = `[${profile.id}/${profile.modelId}]: ${(err as Error).message}`;
      console.warn(`AI failover: ${lastError}`);
      return null;
    }
  };

  // 1) 主模型序列（用户可配置的模型，如 deepseek-v4-flash）
  for (const modelId of modelIds) {
    const profile = settings.modelProfiles?.find((item) => item.id === modelId && item.kind === 'chat' && item.enabled);
    if (profile) {
      const profileResult = await tryProfile(profile);
      if (profileResult) return profileResult;
      continue;
    }
    const entry = resolveModelEntry(modelId);
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
    const entry = fallbackModelId ? resolveModelEntry(fallbackModelId) : undefined;
    const model = provider === 'local'
      ? (settings.availableModels?.local?.[0] ?? settings.selectedModels?.find((id) => id.startsWith('local/'))?.slice(6) ?? entry?.model ?? 'dsv4').replace(/^local\//, '')
      : entry?.model;
    if (!model) continue;
    const res = await tryModel(provider, model);
    if (res) return res;
  }

  throw new Error(`All AI endpoints failed. Last error: ${lastError}`);
}

/** 使用设置页“角色绑定”的模型；找不到自定义配置时仍走原有 fallback。 */
export async function routeBoundAI(
  role: ModelBindingRole,
  task: TaskType,
  messages: ChatMessage[],
  onToken?: (token: string) => void,
): Promise<RouteResult> {
  const settings = await getSettings();
  return routeAI(task, messages, onToken, settings.modelBindings?.[role]);
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
