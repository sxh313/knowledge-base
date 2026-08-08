import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useJournalStore } from './stores/journalStore';
import { useThemeStore } from './stores/themeStore';
import { buildSearchIndex } from './lib/search/fuse';

import Layout from './components/Layout';
import CommandPalette from './components/CommandPalette';
import JournalList from './pages/JournalList';
import JournalEditor from './pages/JournalEditor';
import AIChat from './pages/AIChat';
import ReviewPage from './pages/ReviewPage';
import Cards from './pages/Cards';
import Stats from './pages/Stats';
import KnowledgeMap from './pages/KnowledgeMap';
import SettingsPage from './pages/SettingsPage';
import Manual from './pages/Manual';
import Trash from './pages/Trash';

export default function App() {
  const { load: loadSettings } = useSettingsStore();
  const { entries, loadAll } = useJournalStore();
  const { applySystemChange } = useThemeStore();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    loadSettings();
    loadAll();
  }, []);

  // Ctrl+K 打开命令面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
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

  useEffect(() => { if (entries.length > 0) buildSearchIndex(entries); }, [entries]);

  return (
    <BrowserRouter>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
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
          <Route path="/manual" element={<Manual />} />
          <Route path="/trash" element={<Trash />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}