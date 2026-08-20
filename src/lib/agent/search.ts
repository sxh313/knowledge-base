import { db } from '../db/schema';
import type { AgentSearchHit } from './tools';

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
  const journals = await db.journals.filter((journal) => !journal.deletedAt).toArray();
  return journals.flatMap((journal) => {
    let score = 0;
    if (journal.title.toLowerCase().includes(normalized)) score += 3;
    if ((journal.tags ?? []).some((tag) => tag.toLowerCase().includes(normalized))) score += 2;
    if ((journal.content || '').toLowerCase().includes(normalized)) score += 1;
    return score === 0 ? [] : [{ journalId: journal.id, title: journal.title, subject: journal.subject || '', heading: firstHeading(journal.content), snippet: makeSnippet(journal.content, normalized), score }];
  }).sort((left, right) => right.score - left.score).slice(0, 10);
}
