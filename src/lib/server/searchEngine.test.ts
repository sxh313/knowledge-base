import { describe, expect, it } from 'vitest';
import { parseBingSearchHtml, parseBraveSearchHtml } from './searchEngine';

describe('Bing HTML fallback parser', () => {
  it('兼容 h2/a/p 带属性，并解码 Bing a1 重定向地址', () => {
    const target = 'https://example.com/agentic-rag';
    const encoded = Buffer.from(target).toString('base64url');
    const html = `<ol id="b_results"><li class="b_algo" data-id="1"><h2 class=""><a target="_blank" href="https://www.bing.com/ck/a?u=a1${encoded}&amp;ntb=1">Agentic <strong>RAG</strong></a></h2><div class="b_caption"><p class="b_lineclamp2">多轮检索与工具调用。</p></div></li></ol>`;
    expect(parseBingSearchHtml(html)).toEqual([{ title: 'Agentic RAG', snippet: '多轮检索与工具调用。', url: target }]);
  });

  it('解析 Brave 普通网页结果并清理摘要实体', () => {
    const html = `<main><div class="snippet svelte-x" data-pos="0" data-type="web"><div><a href="https://www.ibm.com/think/topics/agentic-rag" class="svelte-y l1"><div class="title search-snippet-title line-clamp-1" title="What is Agentic RAG? | IBM">What is Agentic RAG?</div></a><div class="generic-snippet"><div class="content desktop-default-regular t-primary">Agentic RAG&nbsp;会进行<strong>多轮检索</strong>。&#32;</div></div></div></div></main>`;
    expect(parseBraveSearchHtml(html)).toEqual([{ title: 'What is Agentic RAG? | IBM', snippet: 'Agentic RAG 会进行多轮检索。', url: 'https://www.ibm.com/think/topics/agentic-rag' }]);
  });
});
