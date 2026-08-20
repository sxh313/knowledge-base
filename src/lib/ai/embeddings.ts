import type { AIModelProfile } from '../db/schema';
import { getSettings } from '../db/queries';
import { getEmbeddingProfile } from './modelProfiles';

export interface EmbeddingOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface EmbeddingResponse {
  model: string;
  vectors: number[][];
  dimension: number;
}

function normalise(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

function queryTextFor(profile: AIModelProfile, text: string): string {
  // BGE-small-zh-v1.5 官方建议只给查询添加检索指令，文档正文保持原文。
  return /bge-small-zh/i.test(profile.modelId)
    ? `为这个句子生成表示以用于检索相关文章：${text}`
    : text;
}

function mergeSignals(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    },
  };
}

export async function embedTexts(
  texts: string[],
  profile: AIModelProfile,
  options: EmbeddingOptions = {},
): Promise<EmbeddingResponse> {
  if (profile.kind !== 'embedding') throw new Error(`模型 ${profile.modelId} 不是 Embedding 模型`);
  if (!texts.length) return { model: profile.modelId, vectors: [], dimension: profile.dimension ?? 0 };

  const { signal, cleanup } = mergeSignals(options.signal, options.timeoutMs ?? 15000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (profile.apiKey.trim()) headers.Authorization = `Bearer ${profile.apiKey.trim()}`;
    const response = await fetch(`${profile.baseUrl.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: profile.modelId, input: texts }),
      signal,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => 'unknown error');
      throw new Error(`Embedding HTTP ${response.status}: ${message.slice(0, 200)}`);
    }
    const json = await response.json() as { data?: { embedding?: unknown; index?: number }[]; model?: string };
    const rows = (json.data ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const vectors = rows.map((row) => {
      if (!Array.isArray(row.embedding) || row.embedding.some((value) => typeof value !== 'number')) {
        throw new Error('Embedding 响应缺少有效向量');
      }
      return normalise(row.embedding as number[]);
    });
    if (vectors.length !== texts.length) throw new Error(`Embedding 返回数量异常：需要 ${texts.length}，得到 ${vectors.length}`);
    const dimension = vectors[0]?.length ?? profile.dimension ?? 0;
    if (profile.dimension && dimension !== profile.dimension) {
      throw new Error(`Embedding 维度不匹配：配置 ${profile.dimension}，实际 ${dimension}`);
    }
    return { model: json.model ?? profile.modelId, vectors, dimension };
  } finally {
    cleanup();
  }
}

export async function embedQuery(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
  const settings = await getSettings();
  const profile = getEmbeddingProfile(settings);
  if (!profile) throw new Error('未配置可用的 Embedding 模型');
  return (await embedTexts([queryTextFor(profile, text)], profile, options)).vectors[0] ?? [];
}

export async function testEmbeddingProfile(profile: AIModelProfile): Promise<{ dimension: number; model: string }> {
  const result = await embedTexts(['连接测试'], profile, { timeoutMs: 10000 });
  return { dimension: result.dimension, model: result.model };
}

