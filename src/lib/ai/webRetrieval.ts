import type { WebSearchSettings } from '../db/schema';
import type { RetrievedChunk } from './retrieval';
import { searchAndFetchWeb, type WebFetchedPage } from './webSearch';

const DEFAULT_WEB_SEARCH: WebSearchSettings = {
  enabled: false,
  provider: 'tavily',
  baseUrl: 'http://127.0.0.1:3210',
  apiKey: '',
  mode: 'manual',
  resultLimit: 5,
  fetchLimit: 3,
};

function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function chunkPage(page: WebFetchedPage, maxChars = 1200): RetrievedChunk[] {
  const content = cleanText(page.content || page.snippet);
  if (!content) return [];
  const chunks: RetrievedChunk[] = [];
  const urlHash = hashText(page.url);
  for (let start = 0; start < content.length && chunks.length < 3; start += maxChars) {
    const part = content.slice(start, start + maxChars).trim();
    if (part.length < 80 && chunks.length > 0) continue;
    chunks.push({
      source: 'web',
      sourceId: page.url,
      chunkId: `web:${urlHash}:${chunks.length}`,
      offset: { start, end: start + part.length },
      title: page.title || page.url,
      heading: new URL(page.url).hostname,
      content: part,
      score: 1,
      confidence: page.provider === 'tavily' || page.provider === 'open-websearch' ? 0.75 : 0.35,
      sourceUrl: page.url,
    });
  }
  return chunks;
}

export function normalizeWebSearchSettings(settings?: Partial<WebSearchSettings>): WebSearchSettings {
  return {
    ...DEFAULT_WEB_SEARCH,
    ...settings,
    provider: settings?.provider ?? DEFAULT_WEB_SEARCH.provider,
    resultLimit: Math.max(1, Math.min(10, settings?.resultLimit ?? DEFAULT_WEB_SEARCH.resultLimit)),
    fetchLimit: Math.max(1, Math.min(5, settings?.fetchLimit ?? DEFAULT_WEB_SEARCH.fetchLimit)),
  };
}

export function shouldUseWebSearch(
  question: string,
  chunks: RetrievedChunk[],
  settings?: Partial<WebSearchSettings>,
  manualRequested = false,
): boolean {
  const web = normalizeWebSearchSettings(settings);
  if (!web.enabled && !manualRequested) return false;
  if (web.mode === 'off') return manualRequested;
  if (manualRequested || web.mode === 'always') return true;
  if (web.mode !== 'auto') return false;
  if (chunks.length === 0) return true;
  if (chunks.every((chunk) => (chunk.confidence ?? 0) < 0.25)) return true;
  return /(最新|今天|现在|当前|实时|新闻|价格|版本|发布|政策|官网|公告|202[4-9]|latest|today|news|price|release)/i.test(question);
}

export async function retrieveWeb(question: string, settings?: Partial<WebSearchSettings>): Promise<RetrievedChunk[]> {
  const web = normalizeWebSearchSettings(settings);
  const pages = await searchAndFetchWeb(question, {
    provider: web.provider,
    baseUrl: web.baseUrl,
    apiKey: web.apiKey,
    limit: web.resultLimit,
    fetchLimit: web.fetchLimit,
  });
  const chunks = pages.flatMap((page) => chunkPage(page));
  return chunks.slice(0, Math.max(1, web.fetchLimit * 2));
}

export function formatWebContextForPrompt(chunks: RetrievedChunk[]): string {
  return chunks.map((chunk, index) => `[W${index + 1}] ${chunk.title}\n网页：${chunk.sourceUrl || chunk.sourceId}\n摘录：\n${chunk.content.slice(0, 1200)}`).join('\n\n---\n\n').slice(0, 9000);
}
