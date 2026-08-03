import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useJournalStore } from './stores/journalStore';
import { buildSearchIndex } from './lib/search/fuse';

import Layout from './components/Layout';
import JournalList from './pages/JournalList';
import JournalEditor from './pages/JournalEditor';
import AIChat from './pages/AIChat';
import ReviewPage from './pages/ReviewPage';
import Stats from './pages/Stats';
import KnowledgeMap from './pages/KnowledgeMap';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const { load: loadSettings } = useSettingsStore();
  const { entries, loadAll } = useJournalStore();

  useEffect(() => {
    loadSettings();
    loadAll();
  }, []);
  useEffect(() => { if (entries.length > 0) buildSearchIndex(entries); }, [entries]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<JournalList />} />
          <Route path="/edit/:id" element={<JournalEditor />} />
          <Route path="/ai" element={<AIChat />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/knowledge" element={<KnowledgeMap />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}