import { describe, it, expect } from 'vitest';
import { diffLines, diffStats, formatDiffText } from './diff';

describe('diffLines 行级 diff', () => {
  it('相同文本全部标记为 same', () => {
    const lines = diffLines('a\nb\nc', 'a\nb\nc');
    expect(lines.every((l) => l.type === 'same')).toBe(true);
    expect(lines).toHaveLength(3);
  });

  it('新增行标记为 add', () => {
    const lines = diffLines('a\nc', 'a\nb\nc');
    const added = lines.filter((l) => l.type === 'add');
    expect(added).toHaveLength(1);
    expect(added[0].text).toBe('b');
  });

  it('删除行标记为 remove', () => {
    const lines = diffLines('a\nb\nc', 'a\nc');
    const removed = lines.filter((l) => l.type === 'remove');
    expect(removed).toHaveLength(1);
    expect(removed[0].text).toBe('b');
  });

  it('空文本与有内容文本', () => {
    const lines = diffLines('', 'x\ny');
    expect(lines.filter((l) => l.type === 'add')).toHaveLength(2);
  });
});

describe('diffStats 统计', () => {
  it('统计新增与删除行数', () => {
    const lines = diffLines('a\nb\nc', 'a\nx\nc\nd');
    const stats = diffStats(lines);
    expect(stats.added).toBe(2); // x 和 d
    expect(stats.removed).toBe(1); // b
  });
});

describe('formatDiffText 格式化', () => {
  it('带 +/- 前缀输出', () => {
    const lines = diffLines('a\nb', 'a\nc');
    const text = formatDiffText(lines);
    expect(text).toContain('+ c');
    expect(text).toContain('- b');
    expect(text).toContain('  a');
  });
});
