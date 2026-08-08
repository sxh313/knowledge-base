import { create } from 'zustand';
import type { AppSettings, AISettings } from '../lib/db/schema';
import { getSettings, updateSettings, updateAIProviders } from '../lib/db/queries';

interface SettingsStore {
  settings: AppSettings | null;
  isLoading: boolean;

  load: () => Promise<void>;
  update: (partial: Partial<AppSettings>) => Promise<void>;
  updateAI: (providers: Partial<AISettings>) => Promise<void>;
  getActiveProvider: () => { name: string; baseUrl: string; apiKey: string } | null;
  hasAnyProviderConfigured: () => boolean;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    const settings = await getSettings();
    set({ settings, isLoading: false });
  },

  update: async (partial) => {
    const updated = await updateSettings(partial);
    set({ settings: updated });
  },

  updateAI: async (providers) => {
    const updatedProviders = await updateAIProviders(providers);
    const current = get().settings;
    if (current) {
      set({ settings: { ...current, aiProviders: updatedProviders } });
    }
  },

  getActiveProvider: () => {
    const { settings } = get();
    if (!settings) return null;
    const providers = settings.aiProviders;
    const order: (keyof AISettings)[] = ['shengsuanyun', 'relay', 'siliconflow', 'zhipu', 'deepseek'];
    for (const key of order) {
      const p = providers[key];
      if (p.enabled && p.apiKey) {
        return { name: key, baseUrl: p.baseUrl, apiKey: p.apiKey };
      }
    }
    return null;
  },

  hasAnyProviderConfigured: () => {
    const { settings } = get();
    if (!settings) return false;
    const providers = settings.aiProviders;
    return (Object.keys(providers) as (keyof AISettings)[]).some(
      (key) => providers[key].enabled && providers[key].apiKey,
    );
  },
}));
