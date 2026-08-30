import { describe, expect, it } from 'vitest';
import { classifyAgentIntent, INTENT_META, type AgentIntent } from './intent';

describe('classifyAgentIntent 意图分流', () => {
  it('空输入归为问答', () => {
    expect(classifyAgentIntent('')).toBe('chat');
    expect(classifyAgentIntent('   ')).toBe('chat');
  });

  it('执行类指令识别为 execute', () => {
    expect(classifyAgentIntent('确认执行')).toBe('execute');
    expect(classifyAgentIntent('按计划执行')).toBe('execute');
    expect(classifyAgentIntent('应用上面的修改')).toBe('execute');
  });

  it('疑问式表达不误判为 execute', () => {
    expect(classifyAgentIntent('怎么执行单元测试')).toBe('chat');
    expect(classifyAgentIntent('如何执行计划')).toBe('chat');
  });

  it('范围词 + 写入动作识别为 batch', () => {
    expect(classifyAgentIntent('给所有笔记加上标签「复习」')).toBe('batch');
    expect(classifyAgentIntent('批量修改全部文档的分类')).toBe('batch');
  });

  it('仅写入动作（无范围词）识别为 plan', () => {
    expect(classifyAgentIntent('帮我新建一篇关于 React 的笔记')).toBe('plan');
    expect(classifyAgentIntent('把这篇笔记重命名为「总结」')).toBe('plan');
  });

  it('草稿类识别为 draft', () => {
    expect(classifyAgentIntent('帮我写一份周报草稿')).toBe('draft');
    expect(classifyAgentIntent('写一篇关于深度学习的文章')).toBe('draft');
  });

  it('搜索类识别为 search', () => {
    expect(classifyAgentIntent('找一下关于傅里叶变换的笔记')).toBe('search');
    expect(classifyAgentIntent('搜索 React 性能优化')).toBe('search');
  });

  it('概念解释类识别为 chat', () => {
    expect(classifyAgentIntent('什么是傅里叶变换')).toBe('chat');
    expect(classifyAgentIntent('Transformer 和 RNN 的区别是什么')).toBe('chat');
  });

  it('优先级：execute 高于 batch 与 plan', () => {
    expect(classifyAgentIntent('执行批量整理')).toBe('execute');
  });

  it('优先级：plan 高于 draft（同时命中时按写入闭环处理）', () => {
    // 「保存」是写入关键词，「写一篇」是草稿关键词 → plan 优先
    expect(classifyAgentIntent('写一篇周报并保存到笔记')).toBe('plan');
  });

  it('INTENT_META 覆盖全部意图', () => {
    const intents: AgentIntent[] = ['chat', 'search', 'draft', 'plan', 'execute', 'batch'];
    for (const intent of intents) {
      expect(INTENT_META[intent].label).toBeTruthy();
      expect(INTENT_META[intent].hint).toBeTruthy();
    }
  });
});