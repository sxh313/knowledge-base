// 联网搜索：前端统一调用 /api/search，也支持通过 VITE_SEARCH_API_URL 指向远程 Vercel Function。
// GET 兼容旧版摘要搜索；POST 会搜索并抓取网页正文，失败时服务端退回轻量摘要搜索。

import type { WebSearchProvider } from '../db/schema';
import { recordDiagnostic } from '../observability/diagnostics';

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

const SEARCH_TIMEOUT_MS = 20000;
const CACHE_TTL_MS = 60_000;
const MAX_QUERY_LENGTH = 500;
const responseCache = new Map<string, { expiresAt: number; pages: WebFetchedPage[] }>();

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = SEARCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function cacheKey(query: string, options: WebSearchOptions): string {
  return JSON.stringify([query, options.provider ?? '', options.baseUrl ?? '', options.limit ?? 5, options.fetchLimit ?? 3]);
}

function boundedLimit(value: number | undefined, fallback: number, max: number): number {
  return Math.max(1, Math.min(max, Number(value) || fallback));
}

function searchApiUrl(): string {
  const configured = (import.meta.env.VITE_SEARCH_API_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return '/api/search';
  return configured.endsWith('/api/search') ? configured : `${configured}/api/search`;
}

async function browserDuckDuckGoFallback(query: string, limit: number): Promise<WebFetchedPage[]> {
  try {
    const response = await fetchWithTimeout(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
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
    const res = await fetchWithTimeout(`${searchApiUrl()}?q=${encodeURIComponent(query)}`);
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
  const normalizedQuery = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!normalizedQuery) return [];
  const normalizedOptions = {
    ...options,
    limit: boundedLimit(options.limit, 5, 10),
    fetchLimit: boundedLimit(options.fetchLimit, 3, 5),
  };
  const key = cacheKey(normalizedQuery, normalizedOptions);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.pages;
  responseCache.delete(key);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(searchApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: normalizedQuery,
        fetch: true,
        provider: options.provider,
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        limit: normalizedOptions.limit,
        fetchLimit: normalizedOptions.fetchLimit,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      recordDiagnostic({ category: 'ai', operation: 'web-search', outcome: 'failure', message: `HTTP ${res.status}` });
      return [];
    }
    const data = await res.json();
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const result = pages.length > 0 || options.provider !== 'duckduckgo'
      ? pages
      : await browserDuckDuckGoFallback(normalizedQuery, normalizedOptions.limit);
    responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, pages: result });
    return result;
  } catch (error) {
    recordDiagnostic({ category: 'ai', operation: 'web-search', outcome: 'failure', message: error instanceof Error ? error.message : String(error) });
    return options.provider === 'duckduckgo' ? browserDuckDuckGoFallback(normalizedQuery, normalizedOptions.limit) : [];
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

/** 格式化搜索结果为注入 prompt 的上下文 */
export function formatWebResults(results: WebResult[]): string {
  if (results.length === 0) return '';
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n来源: ${r.url}`)
    .join('\n\n');
}
