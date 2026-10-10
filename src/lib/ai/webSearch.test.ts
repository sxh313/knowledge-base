import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAndFetchWeb } from './webSearch';

describe('web search client', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('caches identical successful requests for the short TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pages: [{ title: 'T', snippet: 'S', url: 'https://example.com', content: 'C' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await searchAndFetchWeb('  cache-test-unique  ', { provider: 'duckduckgo', limit: 2, fetchLimit: 1 });
    const second = await searchAndFetchWeb('cache-test-unique', { provider: 'duckduckgo', limit: 2, fetchLimit: 1 });
    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('truncates oversized queries before sending them', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ pages: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await searchAndFetchWeb('x'.repeat(700), { provider: 'tavily' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { query: string };
    expect(body.query).toHaveLength(500);
  });
});
