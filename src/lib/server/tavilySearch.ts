import type { FetchedWebPage } from './openWebSearch';

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string | null;
  score?: number;
};

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const TAVILY_TIMEOUT_MS = 12000;
const MAX_CONTENT_CHARS = 12000;

function timeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

export async function searchTavily(
  query: string,
  limit = 5,
  fetchLimit = 3,
  apiKey = process.env.TAVILY_API_KEY || '',
): Promise<FetchedWebPage[]> {
  const key = apiKey.trim();
  if (!key) return [];
  const timeout = timeoutSignal(TAVILY_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        max_results: Math.max(1, Math.min(10, limit)),
        search_depth: 'advanced',
        include_answer: false,
        include_raw_content: true,
      }),
      signal: timeout.signal,
    });
  } finally {
    timeout.cancel();
  }
  if (!response.ok) throw new Error(`Tavily search failed: HTTP ${response.status}`);
  const data = await response.json() as { results?: TavilyResult[] };
  return (data.results ?? []).slice(0, fetchLimit).map((item) => {
    const content = (item.raw_content || item.content || '').trim().slice(0, MAX_CONTENT_CHARS);
    return {
      title: item.title || item.url || '网页来源',
      snippet: item.content || content.slice(0, 240),
      url: item.url || '',
      content,
      fetchedAt: Date.now(),
      provider: 'tavily' as const,
    };
  }).filter((page) => page.url && page.content);
}
