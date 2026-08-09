import { create } from 'zustand';
import { syncNow, testConnection, pullFromCloud } from '../lib/sync/github';
import type { SyncConfig } from '../lib/db/schema';
import { useSettingsStore } from './settingsStore';
import { useJournalStore } from './journalStore';
import { updateSettings } from '../lib/db/queries';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

interface SyncStore {
  status: SyncStatus;
  lastSyncAt: number | null;
  message: string | null;
  /** 执行一次完整同步（拉取→合并→推送）；未配置或正在同步时自动跳过 */
  doSync: () => Promise<boolean>;
  /** 仅从云端拉取合并到本地（不推送）；未配置或正在同步时自动跳过 */
  pullOnly: () => Promise<boolean>;
  testConn: (cfg: SyncConfig) => Promise<string>;
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  status: 'idle',
  lastSyncAt: null,
  message: null,

  doSync: async () => {
    const settings = useSettingsStore.getState().settings;
    const cfg = settings?.sync;
    if (!cfg?.enabled || !cfg.token || !cfg.owner || !cfg.repo) return false;
    if (get().status === 'syncing') return false; // 防并发

    set({ status: 'syncing', message: null });
    try {
      const result = await syncNow(cfg);
      const now = Date.now();
      await updateSettings({ sync: { ...cfg, lastSyncAt: now, lastSyncSha: result.sha, baselineHashes: result.baselineHashes } });
      await useSettingsStore.getState().load();
      const baseMsg = result.pulled > 0 ? `已同步，合并 ${result.pulled} 条远端记录` : '已同步';
      set({
        status: 'success',
        lastSyncAt: now,
        message: result.conflicts > 0 ? `${baseMsg}；检测到 ${result.conflicts} 处冲突，请在下方查看` : baseMsg,
      });
      await useJournalStore.getState().loadAll(); // 刷新文档列表，反映合并结果
      return true;
    } catch (e) {
      set({ status: 'error', message: (e as Error).message });
      return false;
    }
  },

  pullOnly: async () => {
    const settings = useSettingsStore.getState().settings;
    const cfg = settings?.sync;
    if (!cfg?.enabled || !cfg.token || !cfg.owner || !cfg.repo) return false;
    if (get().status === 'syncing') return false; // 防并发
    set({ status: 'syncing', message: null });
    try {
      const r = await pullFromCloud(cfg);
      set({
        status: 'success',
        lastSyncAt: Date.now(),
        message:
          r.pulled > 0
            ? `已从云端拉取 ${r.pulled} 条记录` + (r.conflicts > 0 ? `；检测到 ${r.conflicts} 处冲突，请在下方查看` : '')
            : '云端无新数据',
      });
      await useJournalStore.getState().loadAll();
      return true;
    } catch (e) {
      set({ status: 'error', message: (e as Error).message });
      return false;
    }
  },

  testConn: async (cfg) => {
    const r = await testConnection(cfg);
    return r.message;
  },
}));
