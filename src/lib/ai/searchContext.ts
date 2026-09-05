import type { SearchResult } from '../search/searchDocuments';
import type { RetrievedChunk } from './retrieval';
import { trimTextToTokenBudget } from './tokenBudget';

export interface SearchAIContextItem {
  journalId: string;
  title: string;
  heading: string;
  snippet: string;
  contentExcerpt: string;
  source: 'personal';
}

export interface SearchAIContext {
  query: string;
  items: SearchAIContextItem[];
  createdAt: number;
}

export const SEARCH_AI_CONTEXT_KEY = 'knowledge-base-search-ai-context';
const MAX_ITEMS = 12;
const MAX_EXCERPT = 1800;
const MAX_TOTAL_EXCERPT = 12000;

export function buildSearchAIContext(query: string, results: SearchResult[]): SearchAIContext {
  const seen = new Set<string>();
  const candidates = results.filter((result) => {
    if (seen.has(result.item.id)) return false;
    seen.add(result.item.id);
    return true;
  }).slice(0, MAX_ITEMS).map(({ item, snippet }) => ({
    journalId: item.id,
    title: item.title || '无标题',
    heading: item.subject || '正文',
    snippet: snippet || item.contentPlain.slice(0, 180),
    contentExcerpt: item.contentPlain.slice(0, MAX_EXCERPT),
    source: 'personal' as const,
  }));
  let used = 0;
  const items = candidates.filter((item) => {
    if (used >= MAX_TOTAL_EXCERPT) return false;
    const remaining = MAX_TOTAL_EXCERPT - used;
    item.contentExcerpt = item.contentExcerpt.slice(0, remaining);
    used += item.contentExcerpt.length;
    return item.contentExcerpt.length > 0;
  });
  return { query: query.trim(), items, createdAt: Date.now() };
}

export function saveSearchAIContext(context: SearchAIContext): void {
  try { sessionStorage.setItem(SEARCH_AI_CONTEXT_KEY, JSON.stringify(context)); } catch { /* storage is optional */ }
}

export function readSearchAIContext(): SearchAIContext | null {
  try {
    const raw = sessionStorage.getItem(SEARCH_AI_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SearchAIContext;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch { return null; }
}

export function searchContextToChunks(context: SearchAIContext): RetrievedChunk[] {
  return context.items.map((item, index) => ({
    source: item.source,
    sourceId: item.journalId,
    journalId: item.journalId,
    chunkId: `search:${item.journalId}:${index}`,
    title: item.title,
    heading: item.heading,
    content: item.contentExcerpt,
    score: 1,
    confidence: 1,
    localUrl: `/edit/${item.journalId}`,
  }));
}

export function formatSearchContextForPrompt(context: SearchAIContext): string {
  const formatted = context.items.map((item, index) => `[${index + 1}] journalId=${item.journalId}\n标题：${item.title}\n章节：${item.heading}\n命中摘要：${item.snippet.slice(0, 300)}\n原文摘录：\n${item.contentExcerpt.slice(0, 1200)}`).join('\n\n---\n\n');
  return trimTextToTokenBudget(formatted, 4500);
}
