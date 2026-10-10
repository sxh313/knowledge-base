import { db } from '../db/schema';
import type { AgentSearchHit } from './tools';
import { retrieve } from '../ai/retrieval';

function makeSnippet(content: string, query: string): string {
  const index = content.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return content.slice(0, 120);
  const start = Math.max(0, index - 40);
  const end = Math.min(content.length, index + query.length + 80);
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`.replace(/\s+/g, ' ').trim();
}

function firstHeading(content: string): string | undefined {
  return content.match(/^#{1,6}\s+(.+)$/m)?.[1].trim();
}

export async function searchJournals(query: string): Promise<AgentSearchHit[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  try {
    // Agent 搜索与问答共用同一套关键词/向量召回，避免自然语言查询在两个入口得到不同结果。
    const chunks = await retrieve(query, { kind: 'personal' }, 20, undefined, {
      skipRerank: true,
      queryRewriteEnabled: false,
    });
    if (chunks.length > 0) {
      const grouped = new Map<string, { chunk: typeof chunks[number]; score: number }>();
      for (const chunk of chunks) {
        if (!chunk.journalId) continue;
        const existing = grouped.get(chunk.journalId);
        if (!existing || chunk.score > existing.score) grouped.set(chunk.journalId, { chunk, score: chunk.score });
      }
      const hits = await Promise.all([...grouped.values()].map(async ({ chunk, score }) => {
        const journal = await db.journals.get(chunk.journalId!);
        return {
          journalId: chunk.journalId!,
          title: chunk.title,
          subject: journal?.subject || '',
          heading: chunk.heading,
          snippet: makeSnippet(chunk.content, normalized),
          score,
        } satisfies AgentSearchHit;
      }));
      return hits.sort((left, right) => right.score - left.score).slice(0, 10);
    }
  } catch {
    // 兼容旧数据：尚未生成 documentChunks 时使用文档级兜底搜索。
  }

  const journals = await db.journals.filter((journal) => !journal.deletedAt).toArray();
  return journals.flatMap((journal) => {
    let score = 0;
    if (journal.title.toLowerCase().includes(normalized)) score += 3;
    if ((journal.tags ?? []).some((tag) => tag.toLowerCase().includes(normalized))) score += 2;
    if ((journal.content || '').toLowerCase().includes(normalized)) score += 1;
    return score === 0 ? [] : [{ journalId: journal.id, title: journal.title, subject: journal.subject || '', heading: firstHeading(journal.content), snippet: makeSnippet(journal.content, normalized), score }];
  }).sort((left, right) => right.score - left.score).slice(0, 10);
}
