import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RetrievedChunk } from '../ai/retrieval';
import { retrieve } from '../ai/retrieval';
import { retrieveZero2Review } from './retrieval';

vi.mock('../ai/retrieval', () => ({ retrieve: vi.fn() }));

const mockedRetrieve = vi.mocked(retrieve);

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    source: 'zero2agent',
    sourceId: 'zero2agent:learn-agent-interview/01/index.md',
    knowledgeDocId: 'zero2agent:learn-agent-interview/01/index.md',
    chunkId: 'chunk-1',
    title: 'Agent 面试',
    heading: 'RAG',
    content: 'RAG 是检索增强生成。',
    score: 4,
    confidence: 0.8,
    path: 'learn-agent-interview/01/index.md',
    ...overrides,
  };
}

describe('zero2 review retrieval boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects personal or web sources before producing candidates', async () => {
    mockedRetrieve.mockResolvedValueOnce([chunk({ source: 'personal' })]);
    await expect(retrieveZero2Review('RAG')).rejects.toThrow('非法知识源');
  });

  it('keeps at most two chunks per document and aggregates topic evidence', async () => {
    mockedRetrieve.mockResolvedValueOnce([
      chunk({ chunkId: 'chunk-1', score: 5 }),
      chunk({ chunkId: 'chunk-2', score: 4 }),
      chunk({ chunkId: 'chunk-3', score: 3 }),
      chunk({ chunkId: 'chunk-4', sourceId: 'zero2agent:learn-agent-interview/02/index.md', knowledgeDocId: 'zero2agent:learn-agent-interview/02/index.md', path: 'learn-agent-interview/02/index.md', score: 2 }),
    ]);
    const result = await retrieveZero2Review('RAG', 8);
    expect(result.chunks).toHaveLength(3);
    expect(result.candidates[0].score).toBe(9);
    expect(result.sufficient).toBe(true);
    expect(result.citations.every((citation) => citation.source === 'zero2agent')).toBe(true);
  });

  it('returns insufficient when the source list is empty', async () => {
    mockedRetrieve.mockResolvedValueOnce([]);
    const result = await retrieveZero2Review('不存在的问题');
    expect(result.sufficient).toBe(false);
    expect(result.topScore).toBe(0);
    expect(result.citations).toEqual([]);
  });
});

