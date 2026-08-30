// ──── Agent 检索证据与重排序 ────
// 第一阶段召回 20 个候选片段，第二阶段在本地重排序（不增加模型调用），
// 只保留高分且相关的 5~8 个片段作为 Agent 行动的可追溯依据。

import type { RetrievedChunk } from '../ai/retrieval';
import { extractTerms } from '../ai/retrieval';

/** 检索证据片段：带文档定位与得分，供证据引用与注入上下文 */
export interface EvidenceChunk {
  journalId: string;
  chunkId?: string;
  title: string;
  heading?: string;
  content: string;
  score: number;
}

/** 注入 Agent 上下文的证据引用：只含命中段落、标题、文档 ID 和定位信息 */
export interface EvidenceRef {
  journalId: string;
  chunkId?: string;
  title: string;
  heading?: string;
  snippet: string;
  score: number;
}

/** 证据片段默认保留数量 */
export const DEFAULT_EVIDENCE_TOP_K = 6;
/** 候选片段过短直接淘汰（字符） */
export const MIN_EVIDENCE_LENGTH = 20;
/** 单个文档最多保留的片段数（保证证据多样性） */
export const MAX_CHUNKS_PER_DOC = 2;

/** 把检索结果转换为证据片段（仅个人文档；外部/网页来源不作为写入依据） */
export function toEvidenceChunks(chunks: RetrievedChunk[]): EvidenceChunk[] {
  return chunks
    .filter((c) => c.source === 'personal' && !!c.journalId)
    .map((c) => ({
      journalId: c.journalId as string,
      chunkId: c.chunkId,
      title: c.title,
      heading: c.heading,
      content: c.content,
      score: c.score,
    }));
}

/**
 * 本地证据重排序（不调用模型）：
 * - 标题精确命中、关键词命中、用户指定文档和较高原始分数均加分；
 * - 过短或低分片段淘汰；每个文档最多保留 2 个片段保证多样性。
 */
export function rerankEvidence(
  question: string,
  chunks: EvidenceChunk[],
  options: { topK?: number; preferredJournalIds?: string[] } = {},
): EvidenceChunk[] {
  const topK = options.topK ?? DEFAULT_EVIDENCE_TOP_K;
  if (!chunks.length) return [];
  const terms = extractTerms(question);
  const preferred = new Set(options.preferredJournalIds ?? []);
  const questionLower = (question || '').toLowerCase();

  const scored = chunks.map((chunk) => {
    const titleLower = chunk.title.trim().toLowerCase();
    let score = chunk.score;
    // 标题整体出现在问题中：最强信号
    if (titleLower.length >= 2 && questionLower.includes(titleLower)) score += 5;
    // 标题命中查询词
    const titleHits = terms.filter((t) => titleLower.includes(t)).length;
    score += titleHits * 3;
    // 内容关键词命中（封顶避免长文档刷分）
    const contentLower = chunk.content.toLowerCase();
    const contentHits = terms.filter((t) => contentLower.includes(t)).length;
    score += Math.min(contentHits, 8) * 0.5;
    // 用户明确指定的文档加分
    if (preferred.has(chunk.journalId)) score += 10;
    return { chunk, score };
  });

  // 淘汰：内容过短或完全无信号
  const filtered = scored.filter((x) =>
    x.chunk.content.trim().length >= MIN_EVIDENCE_LENGTH && x.score > 0,
  );
  filtered.sort((a, b) => b.score - a.score);

  // 每个文档最多保留 MAX_CHUNKS_PER_DOC 个片段
  const perDoc = new Map<string, number>();
  const selected: EvidenceChunk[] = [];
  for (const { chunk } of filtered) {
    const count = perDoc.get(chunk.journalId) ?? 0;
    if (count >= MAX_CHUNKS_PER_DOC) continue;
    perDoc.set(chunk.journalId, count + 1);
    selected.push(chunk);
    if (selected.length >= topK) break;
  }
  return selected;
}

/** 证据片段 → 注入上下文的引用（截断片段，避免整篇笔记进入 prompt） */
export function toEvidenceRef(chunk: EvidenceChunk, snippetLen = 240): EvidenceRef {
  return {
    journalId: chunk.journalId,
    chunkId: chunk.chunkId,
    title: chunk.title,
    heading: chunk.heading,
    snippet: chunk.content.slice(0, snippetLen),
    score: chunk.score,
  };
}

/** 批量转换 */
export function toEvidenceRefs(chunks: EvidenceChunk[]): EvidenceRef[] {
  return chunks.map((c) => toEvidenceRef(c));
}

/** 把证据引用格式化为可注入 prompt 的文本块 */
export function formatEvidenceRefs(refs: EvidenceRef[]): string {
  if (!refs.length) return '（本次未命中可靠笔记片段）';
  return refs
    .map(
      (r, i) =>
        `[证据${i + 1}] journalId=${r.journalId}${r.chunkId ? ` chunkId=${r.chunkId}` : ''}\n《${r.title}》${r.heading ? ` 章节「${r.heading}」` : ''}\n片段：${r.snippet.replace(/\s+/g, ' ')}`,
    )
    .join('\n\n');
}