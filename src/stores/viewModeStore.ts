import { create } from 'zustand';

export type ViewMode = 'auto' | 'desktop' | 'mobile';

interface ViewModeStore {
  mode: ViewMode;
  /** 当前实际生效的布局（auto 模式下根据屏幕宽度解析） */
  isMobile: boolean;
  setMode: (mode: ViewMode) => void;
  cycleMode: () => void;
}

const STORAGE_KEY = 'study-journal-viewmode';
const MOBILE_QUERY = '(max-width: 768px)';

function getStoredMode(): ViewMode {
  if (typeof window === 'undefined') return 'auto';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'auto' || stored === 'desktop' || stored === 'mobile') return stored;
  return 'auto';
}

function getSystemMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function resolveIsMobile(mode: ViewMode): boolean {
  if (mode === 'auto') return getSystemMobile();
  return mode === 'mobile';
}

const initialMode = getStoredMode();

export const useViewModeStore = create<ViewModeStore>((set, get) => ({
  mode: initialMode,
  isMobile: resolveIsMobile(initialMode),

  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    set({ mode, isMobile: resolveIsMobile(mode) });
  },

  cycleMode: () => {
    const order: ViewMode[] = ['auto', 'desktop', 'mobile'];
    const next = order[(order.indexOf(get().mode) + 1) % order.length];
    get().setMode(next);
  },
}));

if (typeof window !== 'undefined') {
  window.matchMedia(MOBILE_QUERY).addEventListener('change', (e) => {
    const { mode } = useViewModeStore.getState();
    if (mode !== 'auto') return;
    useViewModeStore.setState({ isMobile: e.matches });
  });
}
