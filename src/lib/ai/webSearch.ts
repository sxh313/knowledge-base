// 联网搜索：前端调用 /api/search（Vite dev 中间件 / Vercel Serverless Function）
// 服务端无 CORS 限制，可调用 DuckDuckGo HTML + Open-Meteo 天气

export interface WebResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * 联网搜索：调用后端 /api/search 接口。
 * dev 环境：Vite 中间件处理；生产：Vercel Serverless Function。
 */
export async function searchWeb(query: string, limit = 5): Promise<WebResult[]> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, limit);
  } catch {
    return [];
  }
}

/** 格式化搜索结果为注入 prompt 的上下文 */
export function formatWebResults(results: WebResult[]): string {
  if (results.length === 0) return '';
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n来源: ${r.url}`)
    .join('\n\n');
}
