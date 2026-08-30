import { db, type DocumentChunk } from '../db/schema';
import { getSettings } from '../db/queries';
import { embedTexts } from './embeddings';
import { getEmbeddingProfile, getRetrievalSettings } from './modelProfiles';

const EMBEDDING_BATCH_SIZE = 32;

export async function embeddingContentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function embeddingText(chunk: Pick<DocumentChunk, 'title' | 'heading' | 'contentPlain'>): string {
  return [chunk.title, chunk.heading, chunk.contentPlain].filter(Boolean).join('\n').slice(0, 8000);
}

/**
 * 为个人笔记分块增量补齐向量。正文 hash 与模型 id 均一致时直接复用；
 * 没有显式绑定 Embedding 模型时不发出任何网络请求。
 */
export async function syncPersonalChunkEmbeddings(journalIds?: string[]): Promise<number> {
  const settings = await getSettings();
  const retrieval = getRetrievalSettings(settings);
  const profile = getEmbeddingProfile(settings);
  if (!retrieval.vectorEnabled || !profile) return 0;
  const chunks = journalIds?.length
    ? await db.documentChunks.where('journalId').anyOf(journalIds).toArray()
    : await db.documentChunks.toArray();
  const stale: Array<{ chunk: DocumentChunk; hash: string; text: string }> = [];
  for (const chunk of chunks) {
    const text = embeddingText(chunk);
    const hash = await embeddingContentHash(text);
    if (chunk.embedding?.length && chunk.embeddingModelId === profile.id && chunk.embeddingContentHash === hash) continue;
    stale.push({ chunk, hash, text });
  }
  let updated = 0;
  for (let start = 0; start < stale.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = stale.slice(start, start + EMBEDDING_BATCH_SIZE);
    const response = await embedTexts(batch.map((item) => item.text), profile, { timeoutMs: 30000 });
    if (response.vectors.length !== batch.length) throw new Error('Embedding 返回数量与个人笔记分块数量不一致');
    const now = Date.now();
    await db.transaction('rw', db.documentChunks, async () => {
      for (let index = 0; index < batch.length; index++) {
        await db.documentChunks.update(batch[index].chunk.id, {
          embedding: response.vectors[index],
          embeddingModelId: profile.id,
          embeddingContentHash: batch[index].hash,
          embeddedAt: now,
        });
      }
    });
    updated += batch.length;
  }
  return updated;
}

