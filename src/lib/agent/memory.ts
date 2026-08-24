import { db } from '../db/schema';
import type { MemoryItem } from '../db/schema';

const MAX_MEMORY_CONTENT = 600;
const MAX_MEMORY_RESULTS = 5;

export function memoryKeywords(text: string): string[] {
  return Array.from(new Set(
    text.toLowerCase()
      .replace(/[^\p{L}\p{N}_]+/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 2)
      .slice(0, 30),
  ));
}

/** 写入显式、可追溯的记忆；调用方必须提供来源消息 id。 */
export async function saveMemory(input: Omit<MemoryItem, 'id' | 'keywords' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<MemoryItem> {
  const content = input.content.trim().slice(0, MAX_MEMORY_CONTENT);
  if (!content) throw new Error('记忆内容不能为空');
  const now = Date.now();
  const memory: MemoryItem = {
    ...input,
    id: crypto.randomUUID(),
    content,
    keywords: memoryKeywords(content),
    sourceMessageIds: Array.from(new Set(input.sourceMessageIds)).slice(0, 20),
    confidence: Math.max(0, Math.min(1, input.confidence)),
    createdAt: now,
    updatedAt: now,
  };
  await db.memoryItems.add(memory);
  return memory;
}

/** 本地关键词检索；不调用模型、不上传内容，供后续可选的向量检索替换。 */
export async function searchMemories(query: string, sessionId?: string, limit = MAX_MEMORY_RESULTS): Promise<MemoryItem[]> {
  const terms = memoryKeywords(query);
  if (terms.length === 0) return [];
  const all = await db.memoryItems.filter((item) => !item.deletedAt && (item.scope === 'global' || item.sessionId === sessionId)).toArray();
  return all
    .map((item) => ({ item, score: terms.reduce((total, term) => total + (item.keywords.includes(term) ? 3 : item.content.toLowerCase().includes(term) ? 1 : 0), 0) + item.confidence }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt)
    .slice(0, Math.max(1, Math.min(limit, MAX_MEMORY_RESULTS)))
    .map(({ item }) => item);
}

export async function listMemories(sessionId?: string): Promise<MemoryItem[]> {
  return db.memoryItems.filter((item) => !item.deletedAt && (item.scope === 'global' || item.sessionId === sessionId)).sortBy('updatedAt').then((items) => items.reverse());
}

export async function deleteMemory(id: string): Promise<void> {
  await db.memoryItems.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
}

