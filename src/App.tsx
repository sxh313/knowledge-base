import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useJournalStore } from './stores/journalStore';
import { useThemeStore } from './stores/themeStore';
import { useSyncStore } from './stores/syncStore';
import { buildSearchIndex } from './lib/search/fuse';
import { getCardsDueToday, ensureIndexesRebuilt } from './lib/db/queries';

import Layout from './components/Layout';
import CommandPalette from './components/CommandPalette';
import ShortcutsModal from './components/ShortcutsModal';
import PomodoroWidget from './components/PomodoroWidget';
import UpdatePrompt from './components/UpdatePrompt';

// 路由级懒加载：按需加载各页面，显著减小首屏主 chunk 体积
const JournalList = lazy(() => import('./pages/JournalList'));
const JournalEditor = lazy(() => import('./pages/JournalEditor'));
const AIChat = lazy(() => import('./pages/AIChat'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const Cards = lazy(() => import('./pages/Cards'));
const Stats = lazy(() => import('./pages/Stats'));
const KnowledgeMap = lazy(() => import('./pages/KnowledgeMap'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const Manual = lazy(() => import('./pages/Manual'));
const Trash = lazy(() => import('./pages/Trash'));
const Tags = lazy(() => import('./pages/Tags'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const Inbox = lazy(() => import('./pages/Inbox'));

// 桌面端(Electron)用 HashRouter 配合 file://;浏览器端用 BrowserRouter
const isElectron = typeof navigator !== 'undefined' && /Electron/.test(navigator.userAgent);
const Router = isElectron ? HashRouter : BrowserRouter;
// 兼容桌面/浏览器的硬导航
const goPath = (p: string) => {
  if (isElectron) window.location.hash = '#' + p;
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

  // 复习提醒：加载后检查到期卡片，浏览器通知
  useEffect(() => {
    if (!('Notification' in window)) return;
    const check = async () => {
      try {
        const cards = await getCardsDueToday();
        if (cards.length === 0) return;
        if (Notification.permission === 'granted') {
          new Notification('📅 复习提醒', { body: `有 ${cards.length} 张卡片待复习，去复习吧！` });
        } else if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            new Notification('📅 复习提醒', { body: `有 ${cards.length} 张卡片待复习，去复习吧！` });
          }
        }
      } catch { /* 忽略 */ }
    };
    check();
  }, []);

  // Ctrl+K 打开命令面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        goPath('/inbox');
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        goPath('/edit/new');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
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

  // 构建搜索索引时做防抖，避免编辑过程中 entries 频繁变更导致反复重建（O(n)）
  useEffect(() => {
    if (entries.length === 0) return;
    const t = setTimeout(() => { buildSearchIndex(entries); }, 400);
    return () => clearTimeout(t);
  }, [entries]);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">加载中…</div>}>
      <Routes>
        <Route element={<Layout onOpenPalette={() => setPaletteOpen(true)} />}>
          <Route path="/" element={<JournalList />} />
          <Route path="/edit/:id" element={<JournalEditor />} />
          <Route path="/ai" element={<AIChat />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/knowledge" element={<KnowledgeMap />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/tags" element={<Tags />} />
          <Route path="/manual" element={<Manual />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/trash" element={<Trash />} />
        </Route>
      </Routes>
      </Suspense>
      <PomodoroWidget />
      <UpdatePrompt />
    </Router>
  );
}