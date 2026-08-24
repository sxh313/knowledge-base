// 联网搜索：前端统一调用 /api/search，也支持通过 VITE_SEARCH_API_URL 指向远程 Vercel Function。
// GET 兼容旧版摘要搜索；POST 会搜索并抓取网页正文，失败时服务端退回轻量摘要搜索。

import type { WebSearchProvider } from '../db/schema';

export interface WebResult {
  title: string;
  snippet: string;
  url: string;
}

export interface WebFetchedPage extends WebResult {
  content: string;
  fetchedAt: number;
  provider?: string;
}

export interface WebSearchOptions {
  provider?: WebSearchProvider;
  baseUrl?: string;
  apiKey?: string;
  limit?: number;
  fetchLimit?: number;
}

function searchApiUrl(): string {
  const configured = (import.meta.env.VITE_SEARCH_API_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return '/api/search';
  return configured.endsWith('/api/search') ? configured : `${configured}/api/search`;
}

async function browserDuckDuckGoFallback(query: string, limit: number): Promise<WebFetchedPage[]> {
  try {
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    if (!response.ok) return [];
    const data = await response.json();
    const pages: WebFetchedPage[] = [];
    if (data.AbstractText) {
      pages.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        content: data.AbstractText,
        url: data.AbstractURL || 'https://duckduckgo.com/',
        fetchedAt: Date.now(),
        provider: 'duckduckgo-browser',
      });
    }
    const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    for (const topic of topics) {
      const candidates = Array.isArray(topic?.Topics) ? topic.Topics : [topic];
      for (const item of candidates) {
        if (!item?.Text || !item?.FirstURL) continue;
        pages.push({ title: item.Text.split(' - ')[0] || query, snippet: item.Text, content: item.Text, url: item.FirstURL, fetchedAt: Date.now(), provider: 'duckduckgo-browser' });
        if (pages.length >= limit) return pages;
      }
    }
    return pages.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * 旧版联网搜索：只返回标题、摘要和 URL。
 */
export async function searchWeb(query: string, limit = 5): Promise<WebResult[]> {
  try {
    const res = await fetch(`${searchApiUrl()}?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * 搜索并抓取网页正文。主 provider 不可用时，服务端会尽量退回摘要内容。
 */
export async function searchAndFetchWeb(query: string, options: WebSearchOptions = {}): Promise<WebFetchedPage[]> {
  try {
    const res = await fetch(searchApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        fetch: true,
        provider: options.provider,
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        limit: options.limit ?? 5,
        fetchLimit: options.fetchLimit ?? 3,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = Array.isArray(data.pages) ? data.pages : [];
    if (pages.length > 0 || options.provider !== 'duckduckgo') return pages;
    return browserDuckDuckGoFallback(query, options.limit ?? 5);
  } catch {
    return options.provider === 'duckduckgo' ? browserDuckDuckGoFallback(query, options.limit ?? 5) : [];
  }
}

/** 格式化搜索结果为注入 prompt 的上下文 */
export function formatWebResults(results: WebResult[]): string {
  if (results.length === 0) return '';
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n来源: ${r.url}`)
    .join('\n\n');
}
