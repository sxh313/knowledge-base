import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useEffect, useState, lazy, Suspense, useRef } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useJournalStore } from './stores/journalStore';
import { useThemeStore } from './stores/themeStore';
import { useSyncStore } from './stores/syncStore';
import { buildSearchIndex } from './lib/search/fuse';
import { ensureIndexesRebuilt } from './lib/db/queries';

import Layout from './components/Layout';
import CommandPalette from './components/CommandPalette';
import ShortcutsModal from './components/ShortcutsModal';
import PomodoroWidget from './components/PomodoroWidget';
import UpdatePrompt from './components/UpdatePrompt';
import ToastViewport from './components/ToastViewport';

// 路由级懒加载：按需加载各页面，显著减小首屏主 chunk 体积
const JournalList = lazy(() => import('./pages/JournalList'));
const JournalEditor = lazy(() => import('./pages/JournalEditor'));
const AIChat = lazy(() => import('./pages/AIChat'));
const Agent = lazy(() => import('./pages/Agent'));
const Stats = lazy(() => import('./pages/Stats'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const Manual = lazy(() => import('./pages/Manual'));
const Trash = lazy(() => import('./pages/Trash'));
const Tags = lazy(() => import('./pages/Tags'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const Inbox = lazy(() => import('./pages/Inbox'));
const LearningGoals = lazy(() => import('./pages/LearningGoals'));
const Zero2Review = lazy(() => import('./pages/Zero2Review'));
const Zero2Source = lazy(() => import('./pages/Zero2Source'));

// Electron/Capacitor 容器使用 HashRouter；普通浏览器使用 BrowserRouter。
const isElectron = typeof navigator !== 'undefined' && /Electron/.test(navigator.userAgent);
const isNativeApp = Capacitor.isNativePlatform();
const Router = isElectron || isNativeApp ? HashRouter : BrowserRouter;
// 兼容桌面/浏览器的硬导航
const goPath = (p: string) => {
  if (isElectron || isNativeApp) window.location.hash = '#' + p;
  else window.location.href = p;
};

export default function App() {
  const { load: loadSettings } = useSettingsStore();
  const { entries, loadAll } = useJournalStore();
  const { applySystemChange } = useThemeStore();
  const { doSync } = useSyncStore();
  const syncEnabled = !!useSettingsStore((s) => s.settings?.sync?.enabled);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    loadSettings();
    // 先加载列表让用户尽快看到内容；派生索引重建在后台执行，不阻塞首屏
    loadAll();
    (async () => {
      try {
        const rebuilt = await ensureIndexesRebuilt();
        // 若后台重建了派生索引（chunks/links/hash），刷新列表以触发搜索索引重建
        if (rebuilt) loadAll();
      } catch { /* 忽略重建错误 */ }
    })();
  }, []);

  // 自动云同步：启用后，打开应用 / 切回标签页 / 恢复联网时自动同步一次
  useEffect(() => {
    if (!syncEnabled) return;
    const trigger = () => { if (document.visibilityState === 'visible') doSync(); };
    document.addEventListener('visibilitychange', trigger);
    window.addEventListener('online', trigger);
    const t = setTimeout(() => doSync(), 3000); // 启动后稍延迟同步一次
    return () => {
      document.removeEventListener('visibilitychange', trigger);
      window.removeEventListener('online', trigger);
      clearTimeout(t);
    };
  }, [syncEnabled, doSync]);


  // Ctrl+K 打开命令面板；Ctrl+F 在非编辑器页面也打开命令面板（编辑器内 Ctrl+F 由查找替换栏接管）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
      // Ctrl+F：仅在非编辑器页面打开全局搜索，避免与编辑器内查找替换冲突
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'f') {
        const path = window.location.hash.replace(/^#/, '') || window.location.pathname;
        if (!path.startsWith('/edit/')) {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        goPath('/inbox');
      } else if (mod && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        goPath('/edit/new');
      }
      if (mod && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 监听系统主题变化
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => applySystemChange(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [applySystemChange]);

  // 构建搜索索引：仅在初始加载时全量构建一次。
  // 编辑/保存文档时由 persistJournalWithIndexes 做增量更新（updateSearchEntry），
  // 无需每次 entries 变化都全量重建（O(n) 开销，文档多时会导致卡顿）。
  const searchBuiltRef = useRef(false);
  useEffect(() => {
    if (entries.length === 0 || searchBuiltRef.current) return;
    searchBuiltRef.current = true;
    buildSearchIndex(entries);
  }, [entries]);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Suspense fallback={<div className="app-loading-state"><div className="app-loading-card"><div className="app-loading-mark"><span className="text-lg">⌁</span></div><strong className="text-sm text-[var(--color-text)]">正在打开知屿</strong><span className="text-xs">整理你的知识航线…</span></div></div>}>
      <Routes>
        <Route element={<Layout onOpenPalette={() => setPaletteOpen(true)} />}>
          <Route path="/" element={<JournalList />} />
          <Route path="/edit/:id" element={<JournalEditor />} />
          <Route path="/ai" element={<AIChat />} />
          <Route path="/agent" element={<Agent />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/tags" element={<Tags />} />
          <Route path="/manual" element={<Manual />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/learning" element={<LearningGoals />} />
          <Route path="/zero2-review" element={<Zero2Review />} />
          <Route path="/source/zero2agent" element={<Zero2Source />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/trash" element={<Trash />} />
        </Route>
      </Routes>
      </Suspense>
      <PomodoroWidget />
      <UpdatePrompt />
      <ToastViewport />
    </Router>
  );
}
