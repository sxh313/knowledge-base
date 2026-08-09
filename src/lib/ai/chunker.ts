// RAG 分块器：复用 documents.ts 的标题分块策略，并提供按范围取分块的辅助。
import { db } from '../db/schema';
import type { DocumentChunk } from '../db/schema';
export { buildDocumentChunks } from '../indexing/documents';

/** 取指定文档集合的全部已建好的分块（按文档内 ordinal 排序） */
export async function getChunksForJournalIds(ids: string[]): Promise<DocumentChunk[]> {
  if (ids.length === 0) return [];
  const chunks = await db.documentChunks.where('journalId').anyOf(ids).toArray();
  // 按 journalId 分组、组内按 ordinal 升序，保证同一文档的块连续
  chunks.sort((a, b) => (a.journalId === b.journalId ? a.ordinal - b.ordinal : a.journalId < b.journalId ? -1 : 1));
  return chunks;
}
