// ──── Unified AI Client ────
// OpenAI-compatible chat completions for all 4 providers
// Supports both streaming and non-streaming

import type { AIProviderConfig } from './providers';
import { resolveAIBaseUrl } from './localProxy';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** assistant 消息附带的工具调用请求（原生 function calling） */
  tool_calls?: ToolCall[];
  /** tool 角色消息对应的调用 id */
  tool_call_id?: string;
  /** tool 角色消息的工具名 */
  name?: string;
}

/** OpenAI 兼容的函数调用工具定义（透传给 provider） */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** 模型返回的工具调用载荷 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onToken?: (token: string) => void;
  onReasoning?: (token: string) => void;
  /** Qwen/vLLM 兼容：简单问答可关闭长思考，避免 reasoning 用完全部输出额度。 */
  enableThinking?: boolean;
  signal?: AbortSignal;
  /** 原生函数调用工具定义；传入时自动关闭流式（部分 provider 不支持流式 tool_calls） */
  tools?: ToolDefinition[];
}

export interface ChatResult {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 模型发起的工具调用（原生 function calling；未发起时为 undefined） */
  toolCalls?: ToolCall[];
}

async function handleStream(
  response: Response,
  onToken?: (token: string) => void,
  onReasoning?: (token: string) => void,
): Promise<string> {
  if (!response.body) throw new Error('Response body is empty');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trimStart();
        if (payload === '[DONE]') return fullText;

        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          const reasoning = json.choices?.[0]?.delta?.reasoning_content ?? json.choices?.[0]?.delta?.reasoning;
          if (reasoning) onReasoning?.(reasoning);
          if (delta) {
            fullText += delta;
            onToken?.(delta);
          }
        } catch {
          // skip incomplete JSON chunks
        }
      }
    }
  } finally {
    // 确保 reader 被释放，避免连接资源泄漏（[DONE]、异常或提前 return 均会触发）
    reader.cancel().catch(() => {});
  }
  // 部分服务在连接关闭前不会发送 [DONE]，仍需处理最后一个无换行的 SSE 帧。
  const tail = buffer.trim();
  if (tail.startsWith('data:')) {
    const payload = tail.slice(5).trimStart();
    if (payload !== '[DONE]') {
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        const reasoning = json.choices?.[0]?.delta?.reasoning_content ?? json.choices?.[0]?.delta?.reasoning;
        if (reasoning) onReasoning?.(reasoning);
        if (delta) { fullText += delta; onToken?.(delta); }
      } catch { /* 忽略不完整尾帧 */ }
    }
  }
  return fullText;
}

export async function chatCompletion(
  provider: AIProviderConfig,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const { temperature = 0.7, maxTokens, stream = false, onToken, onReasoning, enableThinking, signal, tools } = options;
  // 工具调用不使用流式：流式 tool_calls 增量拼接各 provider 行为不一致
  const useStream = stream && !tools;

  const baseUrl = resolveAIBaseUrl(provider.baseUrl);
  const url = `${baseUrl}/chat/completions`;

  const body: Record<string, unknown> = { model, messages, temperature, stream: useStream };
  if (enableThinking !== undefined) body.chat_template_kwargs = { enable_thinking: enableThinking };
  if (maxTokens) body.max_tokens = maxTokens;
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey.trim()) headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    throw new Error(`[${provider.name}] HTTP ${response.status}: ${errorText.slice(0, 200)}`);
  }

  if (useStream && response.body) {
    const content = await handleStream(response, onToken, onReasoning);
    return { content, model, usage: undefined };
  }

  const json = await response.json();
  const message = json.choices?.[0]?.message;
  const content = message?.content ?? '';
  const usage = json.usage
    ? {
        promptTokens: json.usage.prompt_tokens ?? 0,
        completionTokens: json.usage.completion_tokens ?? 0,
        totalTokens: json.usage.total_tokens ?? 0,
      }
    : undefined;
  // 解析原生工具调用（OpenAI 兼容格式）
  const rawToolCalls = message?.tool_calls;
  const toolCalls: ToolCall[] | undefined = Array.isArray(rawToolCalls) && rawToolCalls.length
    ? rawToolCalls.map((tc: {
        id?: string;
        function?: { name?: string; arguments?: string };
      }) => ({
        id: tc.id ?? '',
        type: 'function' as const,
        function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '{}' },
      }))
    : undefined;

  return { content, model, usage, toolCalls };
}
