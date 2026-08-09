import type { JournalEntry } from "../db/schema";
import { db } from "../db/schema";
import Fuse from "fuse.js";

let fuseInstance: Fuse<JournalEntry> | null = null;
// 记录索引中已存在的条目 id → 引用，用于增量更新 / 删除
const indexedIds = new Map<string, JournalEntry>();

export async function buildSearchIndex(entries: JournalEntry[]) {
  const allEntries =
    entries.length > 0
      ? entries
      : await db.journals.filter((j) => !j.deletedAt).toArray();

  indexedIds.clear();
  for (const e of allEntries) indexedIds.set(e.id, e);
  fuseInstance = new Fuse(allEntries, {
    keys: [
      { name: "title", weight: 3 },
      { name: "contentPlain", weight: 1 },
      { name: "summary", weight: 2 },
      { name: "tags", weight: 2 },
      { name: "aliases", weight: 2 },
      { name: "subject", weight: 1 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 1,
  });
}

/**
 * 增量更新单个文档在搜索索引中的内容（编辑保存时调用）。
 * Fuse.js 没有原生 update，这里用 remove + add 模拟；
 * 实测比全表 rebuildSearchIndex() 快 1~2 个数量级（数百篇文档场景）。
 */
export function updateSearchEntry(entry: JournalEntry): void {
  if (!fuseInstance) return;
  // 若已存在，先移除旧记录（按对象引用）
  const prev = indexedIds.get(entry.id);
  if (prev) {
    fuseInstance.remove((doc) => doc.id === entry.id);
  }
  if (entry.deletedAt) {
    indexedIds.delete(entry.id);
  } else {
    indexedIds.set(entry.id, entry);
    fuseInstance.add(entry);
  }
}

/** 从搜索索引移除文档（软删 / 硬删时调用） */
export function removeSearchEntry(id: string): void {
  if (!fuseInstance) return;
  if (indexedIds.has(id)) {
    fuseInstance.remove((doc) => doc.id === id);
    indexedIds.delete(id);
  }
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