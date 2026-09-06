import { doSearch, type SearchResult } from './searchEngine';

export interface FetchedWebPage extends SearchResult {
  content: string;
  fetchedAt: number;
  provider: 'tavily' | 'open-websearch' | 'duckduckgo-lite';
}

type UnknownRecord = Record<string, unknown>;

const DEFAULT_OPEN_WEBSEARCH_BASES = ['http://127.0.0.1:3210', 'http://localhost:3210', 'http://127.0.0.1:3000', 'http://localhost:3000'];
const SEARCH_TIMEOUT_MS = 10000;
const FETCH_TIMEOUT_MS = 12000;
const MAX_FETCH_CHARS = 12000;

function configuredBases(extraBases: string[] = []): string[] {
  const raw = process.env.OPEN_WEBSEARCH_BASE_URL || process.env.WEB_SEARCH_BASE_URL || '';
  const bases = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return [...extraBases, ...bases, ...DEFAULT_OPEN_WEBSEARCH_BASES].filter((value, index, all) => all.indexOf(value) === index);
}

function timeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function textField(source: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function firstArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  for (const key of ['results', 'items', 'data']) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  const nested = asRecord(record.data);
  if (nested) return firstArray(nested);
  return [];
}

function normalizeSearchResponse(payload: unknown): SearchResult[] {
  return firstArray(payload)
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const url = textField(record, ['url', 'link', 'href']);
      const title = textField(record, ['title', 'name']) || url;
      const snippet = textField(record, ['snippet', 'description', 'summary', 'content', 'text']);
      return url && title ? { title, snippet, url } : null;
    })
    .filter((item): item is SearchResult => Boolean(item));
}

function normalizeFetchResponse(payload: unknown, fallback: SearchResult): FetchedWebPage | null {
  const record = asRecord(payload);
  const data = asRecord(record?.data) ?? record;
  if (!data) return null;
  const content = textField(data, ['content', 'text', 'markdown', 'body', 'mainText']).slice(0, MAX_FETCH_CHARS);
  if (!content) return null;
  const url = textField(data, ['url', 'sourceUrl', 'finalUrl']) || fallback.url;
  return {
    title: textField(data, ['title', 'name']) || fallback.title || url,
    snippet: textField(data, ['snippet', 'description', 'summary']) || fallback.snippet || content.slice(0, 240),
    url,
    content,
    fetchedAt: Date.now(),
    provider: 'open-websearch',
  };
}

function isPrivateIp(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (/^(127|10)\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host === '0.0.0.0' || host === '::1' || host.startsWith('169.254.')) return true;
  return false;
}

export function assertSafePublicUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Only http/https URLs are allowed');
  if (parsed.username || parsed.password) throw new Error('Credentialed URLs are not allowed');
  if (isPrivateIp(parsed.hostname)) throw new Error('Private or local URLs are not allowed');
  return parsed.toString();
}

async function callOpenWebSearch(path: string, body: UnknownRecord, timeoutMs: number, baseUrls: string[] = []): Promise<unknown | null> {
  for (const base of configuredBases(baseUrls)) {
    const timeout = timeoutSignal(timeoutMs);
    try {
      const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: timeout.signal,
      });
      if (!response.ok) continue;
      return await response.json();
    } catch {
      // Try the next configured base, then fall back to the lightweight provider.
    } finally {
      timeout.cancel();
    }
  }
  return null;
}

export async function searchOpenWeb(query: string, limit = 5, baseUrls: string[] = []): Promise<SearchResult[]> {
  const payload = await callOpenWebSearch('/search', { query, limit }, SEARCH_TIMEOUT_MS, baseUrls);
  const openResults = payload ? normalizeSearchResponse(payload).slice(0, limit) : [];
  if (openResults.length) return openResults;
  return doSearch(query).then((results) => results.slice(0, limit));
}

export async function fetchOpenWebPage(result: SearchResult, baseUrls: string[] = []): Promise<FetchedWebPage | null> {
  const url = assertSafePublicUrl(result.url);
  const payload = await callOpenWebSearch('/fetch-web', { url }, FETCH_TIMEOUT_MS, baseUrls);
  const page = payload ? normalizeFetchResponse(payload, { ...result, url }) : null;
  if (page) return page;
  if (result.snippet) {
    return { ...result, url, content: result.snippet, fetchedAt: Date.now(), provider: 'duckduckgo-lite' };
  }
  return null;
}

export async function searchAndFetchOpenWeb(query: string, limit = 5, fetchLimit = 3, baseUrls: string[] = []): Promise<FetchedWebPage[]> {
  const results = await searchOpenWeb(query, limit, baseUrls);
  const pages = await Promise.allSettled(results.slice(0, fetchLimit).map((result) => fetchOpenWebPage(result, baseUrls)));
  return pages
    .map((item) => item.status === 'fulfilled' ? item.value : null)
    .filter((item): item is FetchedWebPage => Boolean(item));
}
