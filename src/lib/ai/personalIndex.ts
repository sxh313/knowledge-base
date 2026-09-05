import { db, type DocumentChunk } from '../db/schema';

/**
 * 个人分块的进程内倒排索引。
 * IndexedDB 仍是事实来源；该索引只缓存派生数据，并在文档索引写入后增量更新。
 */
export interface PersonalChunkIndex {
  chunksById: Map<string, DocumentChunk>;
  postings: Map<string, Set<string>>;
  journalChunkIds: Map<string, Set<string>>;
}

let index: PersonalChunkIndex | null = null;
let building: Promise<PersonalChunkIndex> | null = null;

function extractIndexTerms(text: string): string[] {
  const terms = new Set<string>();
  const lower = (text || '').toLowerCase();
  for (const term of lower.match(/[a-z0-9]+/g) ?? []) {
    if (term.length >= 2) terms.add(term);
  }
  for (const run of text.match(/[\u3400-\u9fff]+/g) ?? []) {
    if (run.length === 1) terms.add(run);
    for (let i = 0; i < run.length - 1; i++) terms.add(run.slice(i, i + 2));
  }
  return [...terms];
}

function createIndex(chunks: DocumentChunk[]): PersonalChunkIndex {
  const next: PersonalChunkIndex = { chunksById: new Map(), postings: new Map(), journalChunkIds: new Map() };
  for (const chunk of chunks) addChunk(next, chunk);
  return next;
}

function addChunk(target: PersonalChunkIndex, chunk: DocumentChunk): void {
  target.chunksById.set(chunk.id, chunk);
  const ids = target.journalChunkIds.get(chunk.journalId) ?? new Set<string>();
  ids.add(chunk.id);
  target.journalChunkIds.set(chunk.journalId, ids);
  for (const term of extractIndexTerms(`${chunk.title}\n${chunk.heading ?? ''}\n${chunk.contentPlain}`)) {
    const posting = target.postings.get(term) ?? new Set<string>();
    posting.add(chunk.id);
    target.postings.set(term, posting);
  }
}

function removeChunk(target: PersonalChunkIndex, chunkId: string): void {
  const existing = target.chunksById.get(chunkId);
  if (!existing) return;
  target.chunksById.delete(chunkId);
  const journalIds = target.journalChunkIds.get(existing.journalId);
  journalIds?.delete(chunkId);
  if (journalIds?.size === 0) target.journalChunkIds.delete(existing.journalId);
  for (const term of extractIndexTerms(`${existing.title}\n${existing.heading ?? ''}\n${existing.contentPlain}`)) {
    const posting = target.postings.get(term);
    posting?.delete(chunkId);
    if (posting?.size === 0) target.postings.delete(term);
  }
}

async function buildIndex(): Promise<PersonalChunkIndex> {
  const chunks = await db.documentChunks.toArray();
  index = createIndex(chunks);
  return index;
}

export async function getPersonalChunkIndex(): Promise<PersonalChunkIndex> {
  if (index) return index;
  if (!building) building = buildIndex().finally(() => { building = null; });
  return building;
}

export async function getPersonalChunks(journalIds?: string[]): Promise<DocumentChunk[]> {
  const current = await getPersonalChunkIndex();
  const selected = journalIds?.length
    ? journalIds.flatMap((journalId) => [...(current.journalChunkIds.get(journalId) ?? [])]
      .map((id) => current.chunksById.get(id))
      .filter((chunk): chunk is DocumentChunk => !!chunk))
    : [...current.chunksById.values()];
  return selected.sort((a, b) => a.journalId === b.journalId ? a.ordinal - b.ordinal : a.journalId.localeCompare(b.journalId));
}

export async function findPersonalChunkIds(terms: string[], journalIds?: string[]): Promise<Set<string>> {
  const current = await getPersonalChunkIndex();
  const allowed = journalIds?.length
    ? new Set(journalIds.flatMap((journalId) => [...(current.journalChunkIds.get(journalId) ?? [])]))
    : null;
  const result = new Set<string>();
  for (const term of terms) {
    for (const id of current.postings.get(term.toLowerCase()) ?? []) {
      if (!allowed || allowed.has(id)) result.add(id);
    }
  }
  return result;
}

export function replacePersonalJournalChunks(journalId: string, chunks: DocumentChunk[]): void {
  if (!index) return;
  for (const id of [...(index.journalChunkIds.get(journalId) ?? [])]) removeChunk(index, id);
  for (const chunk of chunks) addChunk(index, chunk);
}

export function updatePersonalChunkEmbedding(chunkId: string, patch: Pick<DocumentChunk, 'embedding' | 'embeddingModelId' | 'embeddingContentHash' | 'embeddedAt'>): void {
  const existing = index?.chunksById.get(chunkId);
  if (existing) Object.assign(existing, patch);
}

export function invalidatePersonalChunkIndex(): void {
  index = null;
  building = null;
}
