import { create } from 'zustand';

/**
 * 应用更新状态（PWA Service Worker 版本检测）。
 * UpdatePrompt 组件通过 useRegisterSW 注册后把状态同步到此 store，
 * 设置页与全局 Toast 共享同一份状态。
 */
interface UpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
  checking: boolean;
  lastCheckAt: number | null;
  setNeedRefresh: (v: boolean) => void;
  setOfflineReady: (v: boolean) => void;
  setChecking: (v: boolean) => void;
  markChecked: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  needRefresh: false,
  offlineReady: false,
  checking: false,
  lastCheckAt: null,
  setNeedRefresh: (v) => set({ needRefresh: v }),
  setOfflineReady: (v) => set({ offlineReady: v }),
  setChecking: (v) => set({ checking: v }),
  markChecked: () => set({ lastCheckAt: Date.now() }),
}));

// 模块级持有 updateServiceWorker 函数（由 UpdatePrompt 在挂载时注入）
let _updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
export function setUpdateSW(fn: (reloadPage?: boolean) => Promise<void>) {
  _updateSW = fn;
}

/** 应用更新：激活新的 Service Worker 并刷新页面（即"安装"新版本） */
export async function applyUpdate(): Promise<void> {
  try {
    await _updateSW?.(true);
  } catch {
    /* 忽略，回退到普通刷新 */
    window.location.reload();
  }
}

/** 手动检查更新：强制刷新 SW 注册，触发版本比对 */
export async function manualCheck(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update();
      return true;
    }
  } catch {
    /* 忽略 */
  }
  return false;
}
