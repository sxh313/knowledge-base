import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, markdownToHtml } from './markdownUtils';

describe('markdown callouts', () => {
  it('keeps callout variants when parsing GitHub alerts', () => {
    expect(markdownToHtml('> [!TIP]\n> 记住这个技巧')).toContain('data-variant="tip"');
    expect(markdownToHtml('> [!WARNING]\n> 注意风险')).toContain('data-variant="warning"');
    expect(markdownToHtml('> [!IMPORTANT]\n> 不要删除')).toContain('data-variant="danger"');
  });

  it('serializes editor callouts back to alert markdown', () => {
    const markdown = htmlToMarkdown('<div data-type="callout" data-variant="warning"><p>注意风险</p></div>');
    expect(markdown).toContain('> [!WARNING]');
    expect(markdown).toContain('> 注意风险');
  });
});

describe('markdown headings', () => {
  it('keeps heading levels one through five', () => {
    const html = markdownToHtml('# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5');
    expect(html).toContain('<h1>H1</h1>');
    expect(html).toContain('<h2>H2</h2>');
    expect(html).toContain('<h3>H3</h3>');
    expect(html).toContain('<h4>H4</h4>');
    expect(html).toContain('<h5>H5</h5>');
  });
});
