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

describe('code block notes', () => {
  it('restores a persisted note onto the code block', () => {
    const html = markdownToHtml('<!-- code-note:%E8%BF%99%E6%98%AF%E5%A4%87%E6%B3%A8 -->\n```ts\nconst answer = 42;\n```');
    expect(html).toContain('data-code-note="这是备注"');
    expect(html).toContain('language-ts');
  });

  it('serializes a code block note without mixing it into source code', () => {
    const markdown = htmlToMarkdown('<pre data-code-note="初始化"><code class="language-js">const value = 1;</code></pre>');
    expect(markdown).toContain('<!-- code-note:%E5%88%9D%E5%A7%8B%E5%8C%96 -->');
    expect(markdown).toContain('```js\nconst value = 1;\n```');
    expect(markdown).not.toMatch(/```js\nconst value = 1;\n```\n\n/);
  });

  it('serializes the default prompt as a plain Markdown quote', () => {
    const markdown = htmlToMarkdown('<div data-type="callout" data-variant="note"><p>工具执行前先做权限判断 — 权限管线决定哪些操作需要审批。</p><p><strong>Harness 层</strong>: 权限 — 在工具执行前加一道门。</p></div>');
    expect(markdown).not.toContain('[!NOTE]');
    expect(markdown).toContain('> 工具执行前先做权限判断 — 权限管线决定哪些操作需要审批。');
    expect(markdown).toContain('> **Harness 层**: 权限 — 在工具执行前加一道门。');
  });
});

describe('markdown spacing', () => {
  it('preserves an intentional empty paragraph between blocks', () => {
    const markdown = htmlToMarkdown('<p>第一行</p><p></p><p>第二行</p>');
    expect(markdown).toMatch(/第一行\n{2,}第二行/);
  });
});
