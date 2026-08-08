import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeStore {
  mode: ThemeMode;
  /** 当前实际生效的主题（auto 模式下根据系统解析为 light 或 dark） */
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  /** 根据系统主题变化重新解析（仅 auto 模式生效） */
  applySystemChange: (isDark: boolean) => void;
}

const STORAGE_KEY = 'knowledge-base-theme';
const LEGACY_KEY = 'study-journal-theme';

function getStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  let stored = localStorage.getItem(STORAGE_KEY);
  // 无损迁移：旧版本用 study-journal-theme，搬过来后删除旧键
  if (stored === null) {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy !== null) {
      localStorage.setItem(STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_KEY);
      stored = legacy;
    }
  }
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
  return 'auto';
}

function getSystemDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'auto') return getSystemDark() ? 'dark' : 'light';
  return mode;
}

function applyToDOM(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.style.colorScheme = resolved;
}

const initialMode = getStoredMode();
const initialResolved = resolveTheme(initialMode);
applyToDOM(initialResolved);

export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: initialMode,
  resolved: initialResolved,

  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    const resolved = resolveTheme(mode);
    applyToDOM(resolved);
    set({ mode, resolved });
  },

  toggle: () => {
    const current = get().resolved;
    // 在 light / dark 之间直接切换（auto 模式也根据当前实际生效主题切换到对端）
    get().setMode(current === 'dark' ? 'light' : 'dark');
  },

  applySystemChange: (isDark) => {
    const { mode } = get();
    if (mode !== 'auto') return;
    const resolved = isDark ? 'dark' : 'light';
    applyToDOM(resolved);
    set({ resolved });
  },
}));
