import { describe, expect, it } from 'vitest';
import { AGENT_TOOL_DEFINITIONS, mapToolCallToOp, mapToolCallsToOps } from './toolDefinitions';
import type { ToolCall } from '../ai/client';

function call(name: string, args: unknown): ToolCall {
  return {
    id: `call_${name}`,
    type: 'function',
    function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
  };
}

describe('AGENT_TOOL_DEFINITIONS 工具定义', () => {
  it('定义均为 function 类型且名称唯一', () => {
    const names = AGENT_TOOL_DEFINITIONS.map((d) => d.function.name);
    expect(new Set(names).size).toBe(names.length);
    for (const d of AGENT_TOOL_DEFINITIONS) {
      expect(d.type).toBe('function');
      expect(d.function.description.length).toBeGreaterThan(0);
      expect(d.function.parameters.type).toBe('object');
    }
  });

  it('高风险删除工具在定义中并有说明', () => {
    const del = AGENT_TOOL_DEFINITIONS.find((d) => d.function.name === 'delete_document');
    expect(del).toBeTruthy();
    expect(del!.function.description).toContain('高风险');
  });
});

describe('mapToolCallToOp 工具调用映射', () => {
  it('合法调用映射为对应 AgentOp', () => {
    const op = mapToolCallToOp(call('create_document', { newTitle: '新笔记', content: '内容', subject: '学习', tags: ['a'] }));
    expect(op).toMatchObject({ type: 'create', newTitle: '新笔记', content: '内容', subject: '学习', tags: ['a'] });
  });

  it('未知工具返回 null', () => {
    expect(mapToolCallToOp(call('unknown_tool', { query: 'x' }))).toBeNull();
  });

  it('参数非合法 JSON 返回 null', () => {
    expect(mapToolCallToOp(call('search_notes', 'not-json{'))).toBeNull();
  });

  it('参数为非对象 JSON（字符串/数组）返回 null', () => {
    expect(mapToolCallToOp(call('search_notes', '"just a string"'))).toBeNull();
    expect(mapToolCallToOp(call('search_notes', '[1, 2]'))).toBeNull();
  });

  it('白名单外字段被丢弃', () => {
    const op = mapToolCallToOp(
      call('edit_document', { journalId: 'j1', content: '新内容', evilField: 'hack', type: 'delete' }),
    ) as unknown as Record<string, unknown>;
    expect(op.type).toBe('edit');
    expect(op.journalId).toBe('j1');
    expect(op).not.toHaveProperty('evilField');
    // 参数里的 type 不能覆盖映射出的操作类型
    expect(op.type).not.toBe('delete');
  });

  it('null 值字段不进入 op', () => {
    const op = mapToolCallToOp(call('read_document', { journalId: 'j1', title: null })) as unknown as Record<string, unknown>;
    expect(op.journalId).toBe('j1');
    expect(op).not.toHaveProperty('title');
  });

  it('空参数合法（如 delete_document 无必填参数）', () => {
    const op = mapToolCallToOp(call('delete_document', {}));
    expect(op).toMatchObject({ type: 'delete' });
  });
});

describe('mapToolCallsToOps 批量映射', () => {
  it('跳过无法映射的调用，保留合法调用', () => {
    const ops = mapToolCallsToOps([
      call('search_notes', { query: 'react' }),
      call('bad_tool', {}),
      call('add_tags', { journalId: 'j1', tags: ['review'] }),
    ]);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ type: 'search', query: 'react' });
    expect(ops[1]).toMatchObject({ type: 'addTags', journalId: 'j1', tags: ['review'] });
  });

  it('空数组返回空数组', () => {
    expect(mapToolCallsToOps([])).toEqual([]);
  });
});