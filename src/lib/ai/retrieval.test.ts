import { describe, expect, it } from 'vitest';
import { extractTerms, rewriteQuery, buildRAGSystemPrompt, shouldRerank, formatContextForPrompt } from './retrieval';
import { estimateTokens } from './tokenBudget';

describe('RAG query rewrite', () => {
  it('去掉口语化外壳并保留原问题的检索意图', () => {
    const rewritten = rewriteQuery('请帮我解释一下检索增强生成是什么？');
    expect(rewritten).toContain('RAG');
    expect(rewritten).toContain('retrieval');
    expect(rewritten).not.toContain('请帮我');
  });

  it('本地模型查询补充常见实现关键词', () => {
    const terms = extractTerms(rewriteQuery('本地部署模型怎么接入'));
    expect(terms).toEqual(expect.arrayContaining(['local', 'model', 'ollama', 'vllm']));
  });

  it('空白输入不会生成空查询', () => {
    expect(rewriteQuery('  ')).toBe('');
  });

  it('严格模式在无来源时禁止伪造知识库内容，混合模式明确标记常识', () => {
    expect(buildRAGSystemPrompt('', false, 'strict')).toContain('不要编造信息');
    expect(buildRAGSystemPrompt('', false, 'hybrid')).toContain('常识或推断');
  });

  it('简单事实问题跳过额外的模型重排', () => {
    expect(shouldRerank('RAG 是什么', 8)).toBe(false);
    expect(shouldRerank('请比较传统 RAG 和 Agentic RAG 的检索决策、成本与适用场景', 8)).toBe(true);
  });

  it('最终 RAG 上下文遵守 token 上限', () => {
    const chunks = Array.from({ length: 20 }, (_, index) => ({
      source: 'personal' as const,
      sourceId: `j${index}`,
      chunkId: `c${index}`,
      title: `文档 ${index}`,
      content: '检索资料'.repeat(2000),
      score: 1,
    }));
    expect(estimateTokens(formatContextForPrompt(chunks))).toBeLessThanOrEqual(4500);
  });
});
