import { describe, expect, it } from 'vitest';
import { explainWebSearchDecision } from './webRetrieval';
import type { RetrievedChunk } from './retrieval';

const hit: RetrievedChunk = { source: 'personal', sourceId: 'j1', chunkId: 'j1:0', title: 'RAG', content: '内容', score: 1, confidence: 0.8 };

describe('联网搜索决策说明', () => {
  it('自动模式在知识库已有高置信命中时说明跳过原因', () => {
    expect(explainWebSearchDecision('Agentic RAG 是什么', [hit], { enabled: true, mode: 'auto' })).toEqual({
      shouldSearch: false,
      reason: '知识库已有命中且问题不要求最新信息',
    });
  });

  it('自动模式对时效问题联网，手动模式不会伪装成自动联网', () => {
    expect(explainWebSearchDecision('最新 RAG 框架版本', [hit], { enabled: true, mode: 'auto' }).shouldSearch).toBe(true);
    expect(explainWebSearchDecision('RAG 是什么', [], { enabled: true, mode: 'manual' })).toEqual({
      shouldSearch: false,
      reason: '当前模式仅在手动选择“本次联网”时搜索',
    });
  });
});
