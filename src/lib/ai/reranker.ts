import { getSettings } from '../db/queries';
import { chatCompletion } from './client';
import { getChatProfile } from './modelProfiles';
import type { RetrievedChunk } from './retrieval';

interface RerankRow {
  chunkId?: unknown;
  score?: unknown;
}

function parseRows(content: string): RerankRow[] {
  const candidates = [content.trim(), content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) return parsed as RerankRow[];
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)) {
        return (parsed as { items: RerankRow[] }).items;
      }
    } catch {
      // 模型可能在 JSON 外包了一行说明；下一步尝试截取最外层数组。
      const start = candidate.indexOf('[');
      const end = candidate.lastIndexOf(']');
      if (start >= 0 && end > start) {
        try {
          const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
          if (Array.isArray(parsed)) return parsed as RerankRow[];
        } catch {
          // 继续走失败降级。
        }
      }
    }
  }
  return [];
}

function clampScore(value: unknown): number {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
}

/**
 * 使用 chat 模型对少量候选进行重排。模型只能选择候选中的 chunkId，
 * 因此不会新增来源，也不会绕过原有引用白名单。
 */
export async function rerankChunks(question: string, chunks: RetrievedChunk[], limit: number): Promise<RetrievedChunk[]> {
  if (chunks.length <= 1 || limit <= 0) return chunks.slice(0, limit);
  const settings = await getSettings();
  const binding = settings.modelBindings?.rerankerModelId;
  const profile = getChatProfile(settings, binding);
  if (!settings.retrieval?.rerankEnabled || !profile) return chunks.slice(0, limit);

  const candidateBlock = chunks.map((chunk, index) => [
    `候选 ${index + 1}`,
    `chunkId=${chunk.chunkId}`,
    `标题=${chunk.title}`,
    `章节=${chunk.headingPath?.join(' > ') || chunk.heading || ''}`,
    `内容=${chunk.content.slice(0, 1400)}`,
  ].join('\n')).join('\n\n---\n\n');
  const messages = [
    {
      role: 'system' as const,
      content: '你是知识库检索重排器。只能从候选列表中选择 chunkId，不能创造新 ID。只输出 JSON 数组：[{"chunkId":"候选ID","score":0到1}]，按相关性从高到低排序。',
    },
    {
      role: 'user' as const,
      content: `用户问题：${question}\n\n候选列表：\n${candidateBlock}`,
    },
  ];
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), settings.retrieval?.rerankTimeoutMs ?? 10000);
  try {
    const result = await chatCompletion(
      { name: profile.id, baseUrl: profile.baseUrl, apiKey: profile.apiKey, enabled: profile.enabled },
      profile.modelId,
      messages,
      { temperature: 0, maxTokens: Math.max(200, limit * 40), signal: controller.signal },
    );
    const allow = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
    const rows = parseRows(result.content);
    const ranked: RetrievedChunk[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (typeof row.chunkId !== 'string' || seen.has(row.chunkId)) continue;
      const chunk = allow.get(row.chunkId);
      if (!chunk) continue;
      seen.add(row.chunkId);
      ranked.push({ ...chunk, score: clampScore(row.score), confidence: clampScore(row.score) });
      if (ranked.length >= limit) break;
    }
    if (ranked.length === 0) return chunks.slice(0, limit);
    // 模型遗漏的候选按原始检索分数补在末尾，避免一次不完整 JSON 丢失所有证据。
    for (const chunk of chunks) {
      if (ranked.length >= limit) break;
      if (!seen.has(chunk.chunkId)) ranked.push(chunk);
    }
    return ranked;
  } catch (error) {
    console.warn('RAG rerank skipped:', (error as Error).message);
    return chunks.slice(0, limit);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

