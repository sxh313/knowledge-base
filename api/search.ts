// Vercel Serverless Function: /api/search
// GET: 兼容旧版摘要搜索（DuckDuckGo HTML + Open-Meteo）
// POST: 搜索并抓取正文（Tavily / open-webSearch / DuckDuckGo 兜底）
import { doSearch } from '../src/lib/server/searchEngine';
import { searchAndFetchWeb, type ServerWebSearchProvider } from '../src/lib/server/webSearchProviders';

interface ApiRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(payload: unknown): void;
  end(): void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const WEB_SEARCH_PROVIDERS = new Set<ServerWebSearchProvider>(['tavily', 'open-websearch', 'duckduckgo']);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const body = asRecord(req.body);
  const q = firstQueryValue(req.query?.q) ?? (typeof body.query === 'string' ? body.query : '');
  if (!q) { res.status(400).json({ error: 'Missing query parameter: q' }); return; }
  if (q.length > 500) { res.status(413).json({ error: 'Query is too long' }); return; }
  try {
    if (req.method === 'POST' && body.fetch !== false) {
      const provider = typeof body.provider === 'string' && WEB_SEARCH_PROVIDERS.has(body.provider as ServerWebSearchProvider)
        ? body.provider as ServerWebSearchProvider
        : undefined;
      const pages = await searchAndFetchWeb(q, {
        provider,
        baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
        // Vercel 环境变量优先；body.apiKey 仅作为本地/设备端兜底，避免要求把 Key 写进部署代码。
        apiKey: process.env.TAVILY_API_KEY || (typeof body.apiKey === 'string' ? body.apiKey : undefined),
        limit: body.limit ?? firstQueryValue(req.query?.limit),
        fetchLimit: body.fetchLimit ?? firstQueryValue(req.query?.fetchLimit),
      });
      res.status(200).json({ pages });
      return;
    }
    const results = await doSearch(q);
    res.status(200).json({ results });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Search failed' });
  }
}
