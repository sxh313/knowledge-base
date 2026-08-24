import { doSearch, type SearchResult } from './searchEngine';
import { searchAndFetchOpenWeb, type FetchedWebPage } from './openWebSearch';
import { searchTavily } from './tavilySearch';

export type ServerWebSearchProvider = 'tavily' | 'open-websearch' | 'duckduckgo';

export interface ServerWebSearchOptions {
  provider?: ServerWebSearchProvider;
  baseUrl?: string;
  apiKey?: string;
  limit?: number;
  fetchLimit?: number;
}

function normalizeLimit(value: unknown, fallback: number, max: number): number {
  return Math.max(1, Math.min(max, Number(value) || fallback));
}

function fallbackPages(results: SearchResult[], fetchLimit: number): FetchedWebPage[] {
  return results.slice(0, fetchLimit).map((result) => ({
    ...result,
    content: result.snippet,
    fetchedAt: Date.now(),
    provider: 'duckduckgo-lite' as const,
  })).filter((page) => page.content);
}

export async function searchAndFetchWeb(query: string, options: ServerWebSearchOptions = {}): Promise<FetchedWebPage[]> {
  const limit = normalizeLimit(options.limit, 5, 10);
  const fetchLimit = normalizeLimit(options.fetchLimit, 3, 5);
  const provider = options.provider ?? 'tavily';
  if (provider === 'tavily') {
    try {
      const pages = await searchTavily(query, limit, fetchLimit, options.apiKey);
      if (pages.length) return pages;
    } catch {
      // Fall through to the free lightweight fallback.
    }
    return fallbackPages(await doSearch(query), fetchLimit);
  }
  if (provider === 'open-websearch') {
    try {
      const pages = await searchAndFetchOpenWeb(query, limit, fetchLimit, options.baseUrl ? [options.baseUrl] : []);
      if (pages.length) return pages;
    } catch {
      // Fall through to the free lightweight fallback.
    }
    return fallbackPages(await doSearch(query), fetchLimit);
  }
  return fallbackPages(await doSearch(query), fetchLimit);
}
