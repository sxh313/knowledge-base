// ──── Unified AI Client ────
// OpenAI-compatible chat completions for all 4 providers
// Supports both streaming and non-streaming

import type { AIProviderConfig } from './providers';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

async function handleStream(
  response: Response,
  onToken?: (token: string) => void,
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
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') return fullText;

        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
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
  return fullText;
}

export async function chatCompletion(
  provider: AIProviderConfig,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const { temperature = 0.7, maxTokens, stream = false, onToken, signal } = options;

  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;

  const body: Record<string, unknown> = { model, messages, temperature, stream };
  if (maxTokens) body.max_tokens = maxTokens;

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

  if (stream && response.body) {
    const content = await handleStream(response, onToken);
    return { content, model, usage: undefined };
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content ?? '';
  const usage = json.usage
    ? {
        promptTokens: json.usage.prompt_tokens ?? 0,
        completionTokens: json.usage.completion_tokens ?? 0,
        totalTokens: json.usage.total_tokens ?? 0,
      }
    : undefined;

  return { content, model, usage };
}
