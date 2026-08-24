// @ts-nocheck
// Vercel Serverless Function: /api/search
// GET: 兼容旧版摘要搜索（DuckDuckGo HTML + Open-Meteo）
// POST: 搜索并抓取正文（Tavily / open-webSearch / DuckDuckGo 兜底）
import { doSearch } from '../src/lib/server/searchEngine';
import { searchAndFetchWeb } from '../src/lib/server/webSearchProviders';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const q = typeof req.query?.q === 'string'
    ? req.query.q
    : Array.isArray(req.query?.q)
      ? req.query.q[0]
      : typeof body.query === 'string'
        ? body.query
        : '';
  if (!q) { res.status(400).json({ error: 'Missing query parameter: q' }); return; }
  try {
    if (req.method === 'POST' && body.fetch !== false) {
      const pages = await searchAndFetchWeb(q, {
        provider: body.provider,
        baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
        // Vercel 环境变量优先；body.apiKey 仅作为本地/设备端兜底，避免要求把 Key 写进部署代码。
        apiKey: process.env.TAVILY_API_KEY || (typeof body.apiKey === 'string' ? body.apiKey : undefined),
        limit: body.limit ?? req.query?.limit,
        fetchLimit: body.fetchLimit ?? req.query?.fetchLimit,
      });
      res.status(200).json({ pages });
      return;
    }
    const results = await doSearch(q);
    res.status(200).json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Search failed' });
  }
}
