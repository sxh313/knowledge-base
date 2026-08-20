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

  it('主模型 provider 未配置时，应自动 fallback 到其他已配置的 provider', async () => {
    // 胜算云未配置，但硅基流动已配置 → 应自动用硅基流动的默认模型
    mockedGetSettings.mockResolvedValue(
      makeSettings({
        shengsuanyun: { baseUrl: 'https://a', apiKey: '', enabled: false },
        siliconflow: { baseUrl: 'https://sf', apiKey: 'k2', enabled: true },
      }),
    );
    mockedChat.mockResolvedValue({ content: 'ok', model: 'deepseek-ai/DeepSeek-V2.5', usage: undefined });

    const res = await routeAI('qa', [{ role: 'user', content: 'hi' }]);
    expect(res.content).toBe('ok');
    expect(res.provider).toBe('siliconflow');
    expect(mockedChat).toHaveBeenCalledTimes(1);
  });

  it('主模型调用失败时，应自动 fallback 到其他已配置的 provider', async () => {
    // 胜算云已配置但调用失败（如预算超限），DeepSeek 官方可用 → 应自动切换
    mockedGetSettings.mockResolvedValue(
      makeSettings({
        shengsuanyun: { baseUrl: 'https://a', apiKey: 'k1', enabled: true },
        deepseek: { baseUrl: 'https://ds', apiKey: 'k3', enabled: true },
      }),
    );
    // qa 主序列为 [deepseek-v4-flash, deepseek-v4]（均指向胜算云），都失败后 fallback 到 deepseek
    mockedChat
      .mockRejectedValueOnce(new Error('budget_limit_exceeded'))
      .mockRejectedValueOnce(new Error('budget_limit_exceeded'))
      .mockResolvedValueOnce({ content: 'ok', model: 'deepseek-chat', usage: undefined });

    const res = await routeAI('qa', [{ role: 'user', content: 'hi' }]);
    expect(res.content).toBe('ok');
    expect(res.provider).toBe('deepseek');
    expect(mockedChat).toHaveBeenCalledTimes(3);
  });

  it('本地 OpenAI-compatible provider 不需要 API Key', async () => {
    mockedGetSettings.mockResolvedValue(
      makeSettings({
        local: { baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', enabled: true },
      }),
    );
    mockedChat.mockResolvedValue({ content: 'local-ok', model: 'llama3.2', usage: undefined });

    const res = await routeAI('qa', [{ role: 'user', content: 'hi' }]);
    expect(res.provider).toBe('local');
    expect(res.model).toBe('dsv4');
  });

  it('优先使用设置页选择的高质量模型', async () => {
    const settings = makeSettings({
      zhipu: { baseUrl: 'https://glm', apiKey: 'k', enabled: true },
      shengsuanyun: { baseUrl: 'https://fallback', apiKey: 'k2', enabled: true },
    });
    settings.preferredModels.highQuality = 'glm-4';
    mockedGetSettings.mockResolvedValue(settings);
    mockedChat.mockResolvedValue({ content: 'preferred', model: 'glm-4', usage: undefined });

    const res = await routeAI('qa', [{ role: 'user', content: 'hi' }]);
    expect(res.provider).toBe('zhipu');
    expect(res.model).toBe('glm-4');
    expect(mockedChat).toHaveBeenCalledTimes(1);
  });

  it('支持设置页保存的 local/<modelId> 本地模型名称', async () => {
    const settings = makeSettings({
      local: { baseUrl: 'http://61.172.167.64:4900/v1', apiKey: '', enabled: true },
    });
    settings.preferredModels.highQuality = 'local/dsv4';
    settings.selectedModels = ['local/dsv4'];
    mockedGetSettings.mockResolvedValue(settings);
    mockedChat.mockResolvedValue({ content: 'local-preferred', model: 'dsv4', usage: undefined });

    const res = await routeAI('qa', [{ role: 'user', content: 'hi' }]);
    expect(res.provider).toBe('local');
    expect(res.model).toBe('dsv4');
    expect(mockedChat).toHaveBeenCalledTimes(1);
  });
});
