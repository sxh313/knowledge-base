import { describe, expect, it } from 'vitest';
import { parseHeadings } from './DocOutline';

describe('parseHeadings', () => {
  it('keeps duplicate headings unique and tied to their source lines', () => {
    const headings = parseHeadings([
      '# 重复标题',
      '',
      '第一段',
      '',
      '# 中间标题',
      '',
      '# 重复标题',
    ].join('\n'));

    expect(headings.map(({ text, line }) => ({ text, line }))).toEqual([
      { text: '重复标题', line: 0 },
      { text: '中间标题', line: 4 },
      { text: '重复标题', line: 6 },
    ]);
    expect(new Set(headings.map((heading) => heading.id)).size).toBe(3);
  });

  it('ignores heading-like text inside fenced code blocks', () => {
    const headings = parseHeadings('# 正文标题\n```md\n# 代码标题\n```\n## 末尾标题');

    expect(headings.map((heading) => heading.text)).toEqual(['正文标题', '末尾标题']);
  });
});
