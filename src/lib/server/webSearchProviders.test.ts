import { beforeEach, describe, expect, it, vi } from 'vitest';
import { doSearch } from './searchEngine';
import { searchTavily } from './tavilySearch';
import { searchAndFetchOpenWeb } from './openWebSearch';
import { searchAndFetchWeb } from './webSearchProviders';

vi.mock('./searchEngine', () => ({ doSearch: vi.fn() }));
vi.mock('./tavilySearch', () => ({ searchTavily: vi.fn() }));
vi.mock('./openWebSearch', () => ({ searchAndFetchOpenWeb: vi.fn() }));

describe('web search providers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('优先返回 Tavily 抓取正文', async () => {
    vi.mocked(searchTavily).mockResolvedValueOnce([
      { title: 'T', url: 'https://t.example', snippet: 's', content: 'body', fetchedAt: 1, provider: 'tavily' },
    ]);
    const pages = await searchAndFetchWeb('rag', { provider: 'tavily', apiKey: 'k' });
    expect(pages[0].provider).toBe('tavily');
    expect(doSearch).not.toHaveBeenCalled();
  });

  it('Tavily 不可用时回退 DuckDuckGo 摘要', async () => {
    vi.mocked(searchTavily).mockRejectedValueOnce(new Error('fail'));
    vi.mocked(doSearch).mockResolvedValueOnce([{ title: 'D', url: 'https://d.example', snippet: 'snippet' }]);
    const pages = await searchAndFetchWeb('rag', { provider: 'tavily', apiKey: 'k' });
    expect(pages[0].provider).toBe('duckduckgo-lite');
    expect(pages[0].content).toBe('snippet');
  });

  it('显式 DuckDuckGo provider 不调用正文抓取 provider', async () => {
    vi.mocked(doSearch).mockResolvedValueOnce([{ title: 'D', url: 'https://d.example', snippet: 'snippet' }]);
    const pages = await searchAndFetchWeb('rag', { provider: 'duckduckgo' });
    expect(pages[0].provider).toBe('duckduckgo-lite');
    expect(searchTavily).not.toHaveBeenCalled();
    expect(searchAndFetchOpenWeb).not.toHaveBeenCalled();
  });
});
