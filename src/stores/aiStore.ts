import { create } from 'zustand';
import type { ChatMessage } from '../lib/ai/client';
import { routeAI } from '../lib/ai/router';
import { chatCompletion } from '../lib/ai/client';
import { getSettings } from '../lib/db/queries';
import { providerNeedsApiKey, type TaskType, type ProviderName } from '../lib/ai/providers';
import type { KnowledgeCard } from '../lib/db/schema';

/** 检查是否至少有一个 Provider 已配置 */
async function checkProvidersConfigured(): Promise<boolean> {
  const settings = await getSettings();
  const providers = settings.aiProviders;
  return (Object.keys(providers) as ProviderName[]).some(
    (key) => providers[key].enabled && (!providerNeedsApiKey(key) || providers[key].apiKey),
  );
}

/** 用户友好的错误消息 */
export function friendlyAIError(err: unknown): string {
  const msg = (err as Error).message || '';
  if (msg.includes('All AI endpoints failed')) {
    return '所有 AI 入口均不可用，请检查网络连接或 API 配置';
  }
  if (msg.includes('未配置') || msg.includes('HTTP 401')) {
    return 'API Key 无效或未配置，请前往「设置」检查';
  }
  if (msg.includes('HTTP 429')) {
    return 'AI 请求过于频繁，请稍后再试';
  }
  if (msg.includes('timeout') || msg.includes('AbortError')) {
    return 'AI 请求超时，请检查网络后重试';
  }
  return msg || 'AI 处理失败，请重试';
}

interface AIStore {
  /** 是否正在处理 AI 请求 */
  isProcessing: boolean;
  /** 流式输出内容（实时更新） */
  streamingContent: string;
  /** 错误信息 */
  error: string | null;
  /** AI 对话历史 */
  conversation: ChatMessage[];

  // ─── 对话管理 ───
  setConversation: (messages: ChatMessage[]) => void;
  addMessage: (msg: ChatMessage) => void;
  clearConversation: () => void;

  // ─── 高层 AI 操作（按架构分析文档设计） ───
  /** 智能总结（传入文档内容，返回总结文字） */
  summarize: (content: string, title?: string) => Promise<string>;
  /** 生成知识卡片（传入笔记内容，返回结构化卡片数组） */
  generateCards: (content: string, title?: string) => Promise<KnowledgeCard[]>;
  /** AI 对话（流式问答） */
  chat: (messages: ChatMessage[], onToken?: (token: string) => void) => Promise<string>;

  // ─── 底层 AI 操作（供高级用户直接调用模型） ───
  /** 按任务类型自动选择模型 + 故障转移 */
  callAI: (taskType: TaskType, messages: ChatMessage[], onToken?: (token: string) => void) => Promise<string>;
  /** 直接调用指定模型 */
  callDirect: (providerName: ProviderName, modelName: string, messages: ChatMessage[], onToken?: (token: string) => void) => Promise<string>;
}

export const useAIStore = create<AIStore>((set) => ({
  isProcessing: false,
  streamingContent: '',
  error: null,
  conversation: [],

  setConversation: (messages) => set({ conversation: messages }),
  addMessage: (msg) => set((s) => ({ conversation: [...s.conversation, msg] })),
  clearConversation: () => set({ conversation: [], streamingContent: '' }),

  // ─── 高层 API ───

  summarize: async (content, title) => {
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是一位学习助手。用简洁的中文总结以下学习笔记的核心要点，列出 3-5 个关键知识点。' },
      { role: 'user', content: title ? `## ${title}\n\n${content}` : content },
    ];
    set({ isProcessing: true, error: null, streamingContent: '' });
    try {
      const result = await routeAI('summarize', messages);
      set({ isProcessing: false, streamingContent: result.content });
      return result.content;
    } catch (e) {
      const msg = (e as Error).message;
      set({ isProcessing: false, error: msg });
      throw e;
    }
  },

  generateCards: async (content, title) => {
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是一位知识卡片制作专家。将以下笔记内容转换成 Anki 风格的知识卡片。每张卡片包含 front（概念/问题）和 back（答案/解释）。严格输出 JSON 数组格式：[{"front":"...","back":"..."}]。生成 3-8 张卡片。' },
      { role: 'user', content: title ? `## ${title}\n\n${content}` : content },
    ];
    set({ isProcessing: true, error: null, streamingContent: '' });
    try {
      const result = await routeAI('generateCards', messages);
      set({ isProcessing: false, streamingContent: result.content });
      const cards = parseCardJSON(result.content);
      return cards;
    } catch (e) {
      const msg = (e as Error).message;
      set({ isProcessing: false, error: msg });
      throw e;
    }
  },

  chat: async (messages, onToken) => {
    set({ isProcessing: true, error: null, streamingContent: '' });
    // 查找或创建 'qa' 任务类型的 AI 调用
    try {
      const result = await routeAI('qa', messages, onToken);
      const fullContent = result.content;
      set({ isProcessing: false, streamingContent: fullContent });
      return fullContent;
    } catch (e) {
      const msg = (e as Error).message;
      set({ isProcessing: false, error: msg });
      throw e;
    }
  },

  // ─── 底层 API（保持向后兼容） ───

  callAI: async (taskType, messages, onToken) => {
    set({ isProcessing: true, error: null, streamingContent: '' });
    try {
      // 前置检查：是否已配置任何 Provider
      const configured = await checkProvidersConfigured();
      if (!configured) {
        const friendlyMsg = '尚未配置 AI API Key，请前往「设置」配置后使用';
        set({ isProcessing: false, error: friendlyMsg });
        throw new Error(friendlyMsg);
      }

      const result = await routeAI(taskType, messages, onToken);
      const fullContent = result.content;
      set({ isProcessing: false, streamingContent: fullContent });
      return fullContent;
    } catch (e) {
      const msg = (e as Error).message;
      // 如果已经是友好消息就直接用，否则转换
      const friendly = msg.includes('尚未配置') ? msg : friendlyAIError(e);
      set({ isProcessing: false, error: friendly });
      throw new Error(friendly);
    }
  },

  callDirect: async (providerName, modelName, messages, onToken) => {
    const settings = await getSettings();
    const provider = settings.aiProviders[providerName];
    if (!provider?.enabled || (providerNeedsApiKey(providerName) && !provider.apiKey)) {
      const errMsg = `[${providerName}] 未配置或未启用`;
      set({ error: errMsg });
      throw new Error(errMsg);
    }

    try {
      set({ isProcessing: true, error: null, streamingContent: '' });
      const result = await chatCompletion(
        { name: providerName, baseUrl: provider.baseUrl, apiKey: provider.apiKey, enabled: true },
        modelName,
        messages,
        { stream: !!onToken, onToken },
      );
      set({ isProcessing: false, streamingContent: result.content });
      return result.content;
    } catch (e) {
      set({ isProcessing: false, error: (e as Error).message });
      throw e;
    }
  },
}));

/** 从 AI 返回的文本中解析知识卡片 JSON */
function parseCardJSON(text: string): KnowledgeCard[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { parsed = JSON.parse(match[1].trim()); }
      catch { return []; }
    } else {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  // 补全 FSRS 必需字段（AI 只返回 front/back）
  const now = Date.now();
  return (parsed as Partial<KnowledgeCard>[]).map((c) => ({
    id: crypto.randomUUID(),
    front: c.front ?? '',
    back: c.back ?? '',
    cardType: c.cardType ?? 'basic',
    tags: c.tags ?? [],
    journalId: c.journalId,
    stability: 1.0,
    difficulty: 5.0,
    lastReviewAt: undefined,
    nextReviewAt: now + 86400000,
    repetitions: 0,
    state: 'new' as const,
    createdAt: now,
    updatedAt: now,
  }));
}
