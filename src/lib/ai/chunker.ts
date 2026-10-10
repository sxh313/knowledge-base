// RAG 分块器：复用 documents.ts 的标题分块策略，并提供按范围取分块的辅助。
import type { DocumentChunk } from '../db/schema';
import { getPersonalChunks } from './personalIndex';
export { buildDocumentChunks } from '../indexing/documents';

/** 取指定文档集合的全部已建好的分块（按文档内 ordinal 排序） */
export async function getChunksForJournalIds(ids: string[]): Promise<DocumentChunk[]> {
  if (ids.length === 0) return [];
  return getPersonalChunks(ids);
}
