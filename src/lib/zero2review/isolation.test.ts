import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '../ai/retrieval';
import { assertCitationAllowList, assertZero2Source, assertZero2Sources, classifyLocalIntent, rejectOutOfScope, shouldPersistMessage } from './isolation';

const zeroChunk: RetrievedChunk = {
  source: 'zero2agent',
  sourceId: 'zero2agent:learn-agent-basic/01-what-is-an-agent/index.md',
  knowledgeDocId: 'zero2agent:learn-agent-basic/01-what-is-an-agent/index.md',
  chunkId: 'chunk-1',
  title: '什么是 Agent',
  content: 'Agent 围绕目标调用工具完成任务。',
  score: 4,
  path: 'learn-agent-basic/01-what-is-an-agent/index.md',
};

describe('zero2 review isolation', () => {
  it('recognizes local review commands without model calls', () => {
    expect(classifyLocalIntent('今天复习什么')).toBe('review_command');
    expect(classifyLocalIntent('开始复习')).toBe('review_command');
    expect(classifyLocalIntent('你能做什么')).toBe('review_meta');
  });

  it('rejects personal document and unrelated requests', () => {
    expect(rejectOutOfScope('帮我修改简历')).toMatchObject({ kind: 'out_of_scope' });
    expect(rejectOutOfScope('删除我的所有笔记')).toMatchObject({ kind: 'out_of_scope' });
    expect(shouldPersistMessage({ kind: 'out_of_scope', topicIds: [], confidence: 1, reason: '' })).toBe(false);
  });

  it('accepts only zero2Agent sources', () => {
    expect(() => assertZero2Sources([zeroChunk])).not.toThrow();
    expect(() => assertZero2Source(zeroChunk)).not.toThrow();
    expect(() => assertZero2Sources([{ ...zeroChunk, source: 'personal' } as unknown as RetrievedChunk])).toThrow();
    expect(() => assertZero2Source({ ...zeroChunk, source: 'web' } as unknown as RetrievedChunk)).toThrow();
  });

  it('filters citations through the current retrieval allow list', () => {
    const allowed = assertCitationAllowList([
      { source: 'zero2agent', sourceId: 's', chunkId: 'chunk-1', title: 'ok', path: 'ok.md' },
      { source: 'zero2agent', sourceId: 's', chunkId: 'fake', title: 'fake', path: 'fake.md' },
      { source: 'personal', sourceId: 'p', chunkId: 'chunk-1', title: 'bad', path: 'bad.md' } as unknown as import('./types').Zero2SourceReference,
    ], new Set(['chunk-1']));
    expect(allowed).toHaveLength(1);
    expect(allowed[0].title).toBe('ok');
  });
});
