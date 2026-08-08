import type { JournalEntry } from "../db/schema";
import { db } from "../db/schema";
import Fuse from "fuse.js";

let fuseInstance: Fuse<JournalEntry> | null = null;

export async function buildSearchIndex(entries: JournalEntry[]) {
  const allEntries =
    entries.length > 0
      ? entries
      : await db.journals.filter((j) => !j.deletedAt).toArray();

  fuseInstance = new Fuse(allEntries, {
    keys: [
      { name: "title", weight: 3 },
      { name: "contentPlain", weight: 1 },
      { name: "summary", weight: 2 },
      { name: "tags", weight: 2 },
      { name: "subject", weight: 1 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 1,
  });
}

export function searchJournals(query: string, limit = 20): JournalEntry[] {
  if (!fuseInstance || !query.trim()) return [];
  // 仅返回原始条目；如需匹配分数请改用 searchJournalsWithScore
  return fuseInstance.search(query.trim(), { limit }).map((r) => r.item);
}

/** 带相似度分数的搜索（保留 Fuse 原始结构，类型安全，避免给 JournalEntry 注入非法字段） */
export function searchJournalsWithScore(
  query: string,
  limit = 20,
): { item: JournalEntry; score: number }[] {
  if (!fuseInstance || !query.trim()) return [];
  return fuseInstance
    .search(query.trim(), { limit })
    .map((r) => ({ item: r.item, score: r.score ?? 0 }));
}

export async function rebuildSearchIndex() {
  fuseInstance = null;
  const entries = await db.journals.filter((j) => !j.deletedAt).toArray();
  await buildSearchIndex(entries);
}