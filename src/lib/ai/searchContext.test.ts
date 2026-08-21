import { describe, expect, it } from 'vitest';
import { buildSearchAIContext, formatSearchContextForPrompt, searchContextToChunks } from './searchContext';
import type { SearchResult } from '../search/searchDocuments';

function result(id: string, contentPlain: string): SearchResult {
  return { item: { id, title: `文档 ${id}`, subject: '学习', contentPlain, content: contentPlain, tags: [], updatedAt: 1, createdAt: 1, sourceType: 'manual' } as unknown as SearchResult['item'], score: 0, reasons: ['正文'], snippet: contentPlain.slice(0, 20), matchedTerms: ['知识'] };
}

describe('search AI context', () => {
  it('deduplicates results and exposes stable source chunks', () => {
    const context = buildSearchAIContext('知识', [result('a', '知识内容'), result('a', '重复内容'), result('b', '另一段')]);
    expect(context.items.map((item) => item.journalId)).toEqual(['a', 'b']);
    expect(searchContextToChunks(context).map((chunk) => chunk.chunkId)).toEqual(['search:a:0', 'search:b:1']);
    expect(formatSearchContextForPrompt(context)).toContain('journalId=a');
  });

  it('keeps the total excerpt bounded', () => {
    const context = buildSearchAIContext('知识', Array.from({ length: 12 }, (_, index) => result(String(index), 'x'.repeat(1800))));
    expect(context.items.reduce((total, item) => total + item.contentExcerpt.length, 0)).toBeLessThanOrEqual(12000);
  });
});
