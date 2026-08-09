// 词法检索：在知识库分块(documentChunks)与文档元数据中检索与问题最相关的片段。
// 评分：查询词在 chunk 正文/标题/章节命中次数加权；中文用 2-gram，英文按词。
// 结果：返回 top-K 分块（每篇文档最多 2 块以增加多样性），供 RAG 注入 system prompt。

import { db } from '../db/schema';
import type { JournalEntry } from '../db/schema';
import { getChunksForJournalIds } from './chunker';

export type KnowledgeScope =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'subject'; subject: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'doc'; journalId: string };

export interface RetrievedChunk {
  journalId: string;
  title: string;
  heading?: string;
  content: string;
  score: number;
}

/** 从查询文本提取检索词：英文词(≥2) + 中文 2-gram */
export function extractTerms(text: string): string[] {
  const terms = new Set<string>();
  const lower = (text || '').toLowerCase();
  const latin = lower.match(/[a-z0-9]+/g) ?? [];
  latin.forEach((t) => {
    if (t.length >= 2) terms.add(t);
  });
  const cjkRuns = (text || '').match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length === 1) terms.add(run);
    for (let i = 0; i < run.length - 1; i++) terms.add(run.slice(i, i + 2));
  }
  return [...terms];
}

function scoreText(haystack: string, terms: string[]): number {
  if (!haystack || terms.length === 0) return 0;
  const lower = haystack.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (!t) continue;
    let idx = lower.indexOf(t);
    let guard = 0;
    while (idx >= 0 && guard < 100) {
      score += 1;
      idx = lower.indexOf(t, idx + t.length);
      guard++;
    }
  }
  return score;
}

/** 依据知识范围筛选候选文档（未软删） */
export async function getCandidateJournals(scope: KnowledgeScope): Promise<JournalEntry[]> {
  const all = await db.journals.filter((j) => !j.deletedAt).toArray();
  switch (scope.kind) {
    case 'none':
      return [];
    case 'all':
      return all;
    case 'subject':
      return all.filter((j) => j.subject === scope.subject);
    case 'tag':
      return all.filter((j) => (j.tags ?? []).includes(scope.tag));
    case 'doc':
      return all.filter((j) => j.id === scope.journalId);
  }
}

/**
 * 检索与问题最相关的分块。
 * - 对范围内的 documentChunks 做词法评分（正文 + 章节标题 + 文档标题加权）。
 * - 每篇文档最多保留 2 个分块以增加来源多样性。
 * - 若分块命中不足，补充元数据(标题/别名/标签/摘要)命中的文档首段。
 */
export async function retrieve(question: string, scope: KnowledgeScope, topK = 8): Promise<RetrievedChunk[]> {
  if (scope.kind === 'none' || !question.trim()) return [];
  const terms = extractTerms(question);
  if (terms.length === 0) return [];

  const journals = await getCandidateJournals(scope);
  if (journals.length === 0) return [];
  const journalById = new Map(journals.map((j) => [j.id, j]));
  const ids = journals.map((j) => j.id);

  const chunks = await getChunksForJournalIds(ids);

  // 评分每个分块
  const scored = chunks
    .map((c) => {
      const contentScore = scoreText(c.contentPlain, terms);
      const headingScore = scoreText(c.heading ?? '', terms) * 2;
      const titleScore = scoreText(c.title, terms) * 3;
      return {
        journalId: c.journalId,
        title: c.title,
        heading: c.heading,
        content: c.content,
        score: contentScore + headingScore + titleScore,
      };
    })
    .filter((c) => c.score > 0);

  // 每篇文档最多 2 块
  const perDocCount = new Map<string, number>();
  const selected: RetrievedChunk[] = [];
  for (const c of scored.sort((a, b) => b.score - a.score)) {
    const cnt = perDocCount.get(c.journalId) ?? 0;
    if (cnt >= 2) continue;
    perDocCount.set(c.journalId, cnt + 1);
    selected.push(c);
    if (selected.length >= topK) break;
  }

  // 补充：元数据命中但无分块入选的文档 → 取其首段摘要
  if (selected.length < topK) {
    const covered = new Set(selected.map((s) => s.journalId));
    const metaScored = journals
      .map((j) => {
        const meta =
          scoreText(j.title, terms) * 3 +
          scoreText((j.aliases ?? []).join(' '), terms) * 2 +
          scoreText((j.tags ?? []).join(' '), terms) * 2 +
          scoreText(j.summary ?? '', terms) * 2;
        return { j, meta };
      })
      .filter(({ j, meta }) => meta > 0 && !covered.has(j.id))
      .sort((a, b) => b.meta - a.meta);
    for (const { j, meta } of metaScored) {
      if (selected.length >= topK) break;
      selected.push({
        journalId: j.id,
        title: j.title,
        heading: undefined,
        content: (j.summary || j.contentPlain || '').slice(0, 500),
        score: meta,
      });
      covered.add(j.id);
    }
  }

  // 去掉 journalById 中已不存在的（防御）
  return selected.filter((s) => journalById.has(s.journalId)).slice(0, topK);
}

/** 把检索到的分块格式化为注入 system prompt 的知识库上下文 */
export function formatContextForPrompt(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => {
      const head = `[${i + 1}] 《${c.title}》${c.heading ? '#' + c.heading : ''}`;
      return `${head}\n${c.content}`;
    })
    .join('\n\n---\n\n');
}

/** RAG 系统提示词：约束只能依据知识库内容回答 */
export function buildRAGSystemPrompt(contextBlock: string, hasSources: boolean): string {
  if (!hasSources) {
    return [
      '你是基于用户个人知识库的回答助手。本次未在知识库中检索到与问题相关的内容。',
      '请直接回复"知识库中没有相关记录。"，不要编造或引用外部信息。',
    ].join('\n');
  }
  return [
    '你是基于用户个人知识库的回答助手。请严格依据下方提供的知识库片段回答用户问题。',
    '规则：',
    '1. 只能依据提供的知识库片段回答；若片段不足以回答，请回复"知识库中没有相关记录"。',
    '2. 引用来源时使用固定格式 [文档标题#章节]（章节可选）。',
    '3. 不要编造知识库中不存在的信息；可在片段基础上做必要的归纳与通俗解释。',
    '',
    '知识库片段：',
    contextBlock,
  ].join('\n');
}
