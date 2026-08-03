import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useJournalStore } from './stores/journalStore';
import { useThemeStore } from './stores/themeStore';
import { buildSearchIndex } from './lib/search/fuse';

import Layout from './components/Layout';
import JournalList from './pages/JournalList';
import JournalEditor from './pages/JournalEditor';
import AIChat from './pages/AIChat';
import ReviewPage from './pages/ReviewPage';
import Cards from './pages/Cards';
import Stats from './pages/Stats';
import KnowledgeMap from './pages/KnowledgeMap';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const { load: loadSettings } = useSettingsStore();
  const { entries, loadAll } = useJournalStore();
  const { applySystemChange } = useThemeStore();

  useEffect(() => {
    loadSettings();
    loadAll();
  }, []);

  // 监听系统主题变化（auto 模式下自动切换）
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => applySystemChange(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [applySystemChange]);

  useEffect(() => { if (entries.length > 0) buildSearchIndex(entries); }, [entries]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<JournalList />} />
          <Route path="/edit/:id" element={<JournalEditor />} />
          <Route path="/ai" element={<AIChat />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/knowledge" element={<KnowledgeMap />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}