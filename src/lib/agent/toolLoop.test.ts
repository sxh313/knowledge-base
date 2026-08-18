// ──── 多轮工具循环单元测试 ────
import { describe, it, expect } from 'vitest';
import {
  isReadOnlyPlan,
  hasReadOnlyOps,
  formatToolResults,
  buildToolResultPrompt,
  MAX_TOOL_ROUNDS,
} from './toolLoop';
import type { AgentPlan, AgentExecutionResult } from './tools';

function makePlan(types: string[]): AgentPlan {
  return {
    summary: 'test',
    ops: types.map((type) => ({ type } as any)),
  };
}

describe('isReadOnlyPlan', () => {
  it('空计划不是只读计划', () => {
    expect(isReadOnlyPlan(makePlan([]))).toBe(false);
  });
  it('全部为 read/search 时是只读计划', () => {
    expect(isReadOnlyPlan(makePlan(['read', 'search']))).toBe(true);
  });
  it('包含写操作时不是只读计划', () => {
    expect(isReadOnlyPlan(makePlan(['read', 'edit']))).toBe(false);
    expect(isReadOnlyPlan(makePlan(['create']))).toBe(false);
  });
});

describe('hasReadOnlyOps', () => {
  it('包含 read 时返回 true', () => {
    expect(hasReadOnlyOps(makePlan(['read', 'edit']))).toBe(true);
  });
  it('不包含只读操作时返回 false', () => {
    expect(hasReadOnlyOps(makePlan(['edit', 'create']))).toBe(false);
  });
});

describe('formatToolResults', () => {
  it('格式化 read 结果（含标题与 id）', () => {
    const preview: AgentExecutionResult = {
      hasError: false,
      results: [
        {
          op: { type: 'read', journalId: 'j1' } as any,
          ok: true,
          journalId: 'j1',
          title: '笔记A',
          content: '这是正文内容',
        },
      ],
    };
    const out = formatToolResults(preview);
    expect(out).toContain('笔记A');
    expect(out).toContain('j1');
    expect(out).toContain('这是正文内容');
  });

  it('格式化 search 结果（含来源引用）', () => {
    const preview: AgentExecutionResult = {
      hasError: false,
      results: [
        {
          op: { type: 'search', query: 'React' } as any,
          ok: true,
          searchResults: [
            {
              journalId: 'j2',
              title: 'React 笔记',
              subject: '前端',
              heading: 'Hooks',
              snippet: 'useState 是 React 的 Hook',
              score: 3,
            },
          ],
        },
      ],
    };
    const out = formatToolResults(preview);
    expect(out).toContain('React 笔记');
    expect(out).toContain('j2');
    expect(out).toContain('Hooks');
    expect(out).toContain('useState 是 React 的 Hook');
  });

  it('search 无命中时给出提示', () => {
    const preview: AgentExecutionResult = {
      hasError: false,
      results: [
        { op: { type: 'search', query: 'xyz' } as any, ok: true, searchResults: [] },
      ],
    };
    const out = formatToolResults(preview);
    expect(out).toContain('未找到匹配文档');
  });

  it('失败的工具结果包含错误信息', () => {
    const preview: AgentExecutionResult = {
      hasError: true,
      results: [
        { op: { type: 'read' } as any, ok: false, error: '未找到目标文档' },
      ],
    };
    const out = formatToolResults(preview);
    expect(out).toContain('失败');
    expect(out).toContain('未找到目标文档');
  });
});

describe('buildToolResultPrompt', () => {
  it('包含工具结果与下一步指令', () => {
    const prompt = buildToolResultPrompt('工具结果内容');
    expect(prompt).toContain('工具结果内容');
    expect(prompt).toContain('read/search');
    expect(prompt).toContain('{"summary":"...","ops":[...]}');
  });
});

describe('MAX_TOOL_ROUNDS', () => {
  it('限制为 5 轮', () => {
    expect(MAX_TOOL_ROUNDS).toBe(5);
  });
});
