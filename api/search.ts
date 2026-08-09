// @ts-nocheck
// Vercel Serverless Function: /api/search
// 服务端搜索代理（无 CORS 限制），调用 DuckDuckGo HTML + Open-Meteo 天气
import { doSearch } from '../src/lib/server/searchEngine';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const q = typeof req.query?.q === 'string' ? req.query.q : Array.isArray(req.query?.q) ? req.query.q[0] : '';
  if (!q) { res.status(400).json({ error: 'Missing query parameter: q' }); return; }
  try {
    const results = await doSearch(q);
    res.status(200).json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Search failed' });
  }
}
