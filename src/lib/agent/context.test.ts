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
    expect(contents.some((content) => content.includes('"type":"read"'))).toBe(false);
    expect(result.summary).toContain('早期问题');
  });
});
