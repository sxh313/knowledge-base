import { describe, it, expect, vi, beforeEach } from 'vitest';

// 必须先声明 mock（vitest 会将其提升到 import 之前）
vi.mock('../db/queries', () => ({ getSettings: vi.fn() }));
vi.mock('./client', () => ({ chatCompletion: vi.fn() }));

import { routeAI } from './router';
import { chatCompletion } from './client';
import { getSettings } from '../db/queries';
import type { AppSettings } from '../db/schema';

const mockedChat = vi.mocked(chatCompletion);
const mockedGetSettings = vi.mocked(getSettings);

function makeSettings(providers: Record<string, { baseUrl: string; apiKey: string; enabled: boolean }>): AppSettings {
  return {
    id: 'global',
    aiProviders: providers as unknown as AppSettings['aiProviders'],
    preferredModels: { highQuality: '', codeTask: '', fastTask: '' },
    availableModels: {},
    selectedModels: [],
    theme: 'auto',
    reviewDailyGoal: 20,
  };
}

describe('routeAI failover', () => {
  beforeEach(() => vi.clearAllMocks());

  it('第一个模型失败时应自动 fallback 到下一个', async () => {
    mockedGetSettings.mockResolvedValue(
      makeSettings({ shengsuanyun: { baseUrl: 'https://a', apiKey: 'k1', enabled: true } }),
    );
    // summarize 模型序列均为 shengsuanyun：[deepseek-v4-flash, deepseek-v4]
    mockedChat
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ content: 'ok', model: 'deepseek-v4', usage: undefined });

    const res = await routeAI('summarize', [{ role: 'user', content: 'hi' }]);
    expect(res.content).toBe('ok');
    expect(mockedChat).toHaveBeenCalledTimes(2);
  });

  it('所有模型均失败时应抛出聚合错误', async () => {
    mockedGetSettings.mockResolvedValue(
      makeSettings({ shengsuanyun: { baseUrl: 'https://a', apiKey: 'k1', enabled: true } }),
    );
    mockedChat.mockRejectedValue(new Error('down'));
    await expect(routeAI('qa', [{ role: 'user', content: 'hi' }])).rejects.toThrow(/All AI endpoints failed/);
  });

  it('provider 未配置 apiKey 时应跳过且不调用底层 client', async () => {
    mockedGetSettings.mockResolvedValue(
      makeSettings({ shengsuanyun: { baseUrl: 'https://a', apiKey: '', enabled: true } }),
    );
    mockedChat.mockResolvedValue({ content: 'x', model: 'm', usage: undefined });
    await expect(routeAI('qa', [{ role: 'user', content: 'hi' }])).rejects.toThrow(/All AI endpoints failed/);
    expect(mockedChat).not.toHaveBeenCalled();
  });
});
