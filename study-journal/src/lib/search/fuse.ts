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
  return fuseInstance
    .search(query.trim(), { limit })
    .map((r) => ({ ...r.item, _score: r.score } as unknown as JournalEntry));
}

export async function rebuildSearchIndex() {
  fuseInstance = null;
  const entries = await db.journals.filter((j) => !j.deletedAt).toArray();
  await buildSearchIndex(entries);
}