import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '../lib/ai/retrieval';
import MarkdownContent from './MarkdownContent';

const chunks: RetrievedChunk[] = [
  { source: 'personal', sourceId: 'a', chunkId: 'a:1', title: '个人笔记', content: 'A', score: 1 },
  { source: 'web', sourceId: 'https://example.com', chunkId: 'w:1', title: '网页', content: 'W', score: 1, sourceUrl: 'https://example.com' },
];

describe('MarkdownContent citations', () => {
  it('把数字、知识库和网页引用渲染为可点击来源', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, { citationItems: chunks }, '依据 [1]，联网补充 [W1]，知识库来源 [K1]。'),
    );
    expect(html).toContain('class="inline-citation"');
    expect(html).toContain('[1]');
    expect(html).toContain('[W1]');
    expect(html).toContain('[K1]');
  });
});
