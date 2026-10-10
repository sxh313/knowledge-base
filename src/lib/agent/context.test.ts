import { describe, expect, it } from 'vitest';
import { applyContextBudget, estimateTokens } from './context';

describe('Agent context budget', () => {
  it('uses a conservative mixed Chinese/English token estimate', () => {
    expect(estimateTokens('你好 hello')).toBeGreaterThanOrEqual(4);
  });

  it('keeps assistant tool plans and their following result together', () => {
    const toolResult = '以下是只读工具（read/search）返回的结果，' + '内容'.repeat(2000);
    const history = [
      { role: 'user' as const, content: '早期问题' },
      { role: 'assistant' as const, content: '{"summary":"读取","ops":[{"type":"read"}]}' },
      { role: 'user' as const, content: toolResult },
      { role: 'assistant' as const, content: '近期结论' },
    ];
    const result = applyContextBudget(history, {
      system: { role: 'system', content: '系统' },
      current: { role: 'user', content: '当前问题' },
      maxInputTokens: 3000,
      reservedOutputTokens: 1000,
    });
    const contents = result.messages.filter((message) => message.role !== 'system').map((message) => message.content);
    expect(contents.some((content) => content.startsWith('以下是只读工具'))).toBe(false);
    // 压缩摘要现在以普通 user 上下文保留这组信息，但不能再以 system 角色提升优先级。
    expect(result.messages.filter((message) => message.content.includes('"type":"read"')).every((message) => message.role !== 'system')).toBe(true);
    expect(result.summary).toContain('早期问题');
  });

  it('hard caps an oversized current message instead of returning an over-budget prompt', () => {
    const result = applyContextBudget([], {
      system: { role: 'system', content: '系统规则' },
      current: { role: 'user', content: '附件内容'.repeat(20000) },
      maxInputTokens: 3000,
      reservedOutputTokens: 1000,
    });
    expect(result.estimatedTokens).toBeLessThanOrEqual(2000);
    expect(result.messages.at(-1)?.content).toContain('上下文已截断');
  });

  it('does not elevate compressed user history to system priority', () => {
    const result = applyContextBudget([
      { role: 'user', content: '历史内容' },
      { role: 'assistant', content: '历史回答' },
    ], {
      system: { role: 'system', content: '系统规则' },
      current: { role: 'user', content: '当前问题' },
      maxInputTokens: 20,
      reservedOutputTokens: 10,
    });
    expect(result.messages.filter((message) => message.content.includes('历史上下文')).every((message) => message.role !== 'system')).toBe(true);
  });
});
