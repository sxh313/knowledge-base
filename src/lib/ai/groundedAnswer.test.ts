import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answerGroundedQuestion } from './groundedAnswer';
import { routeAI } from './router';

vi.mock('./router', () => ({ routeAI: vi.fn() }));

const chunks = [
  {
    source: 'zero2agent' as const,
    sourceId: 'zero2agent:learn-agent-interview/a.md',
    knowledgeDocId: 'zero2agent:learn-agent-interview/a.md',
    chunkId: 'zero2agent:learn-agent-interview/a.md:10',
    title: '架构选型',
    heading: 'ReAct 与 Plan-and-Execute',
    headingPath: ['架构选型', 'ReAct 与 Plan-and-Execute'],
    content: 'ReAct 根据工具反馈循环决策。',
    score: 3,
    path: 'learn-agent-interview/a.md',
  },
];

describe('grounded answer', () => {
  beforeEach(() => vi.clearAllMocks());
  it('只接受检索结果白名单中的引用', async () => {
    vi.mocked(routeAI).mockResolvedValueOnce({ content: JSON.stringify({ answer: '原文总结', citationChunkIds: ['fake'] }), model: 'test', provider: 'test' });
    const result = await answerGroundedQuestion('怎么选？', chunks);
    expect(result.grounded).toBe(false);
    expect(result.citations).toEqual(chunks);
    expect(result.answer).toContain('根据课程原文');
  });

  it('有效 JSON 和引用才进入模型总结路径', async () => {
    vi.mocked(routeAI).mockResolvedValueOnce({ content: JSON.stringify({ answer: '原文总结', citationChunkIds: [chunks[0].chunkId] }), model: 'test', provider: 'test' });
    const result = await answerGroundedQuestion('怎么选？', chunks);
    expect(result.grounded).toBe(true);
    expect(result.answer).toBe('原文总结');
    expect(result.citations[0].chunkId).toBe(chunks[0].chunkId);
  });

  it('没有召回资料时拒绝补充模型常识', async () => {
    const result = await answerGroundedQuestion('未知问题', []);
    expect(result.insufficient).toBe(true);
    expect(result.answer).toContain('没有足够内容');
    expect(routeAI).not.toHaveBeenCalled();
  });
});
