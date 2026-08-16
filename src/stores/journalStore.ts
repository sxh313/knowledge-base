import { create } from 'zustand';
import type { Category, JournalEntry } from '../lib/db/schema';
import {
  createJournal,
  updateJournal,
  deleteJournal,
  getJournal,
  getAllJournals,
  duplicateJournal,
  getCategories,
  createCategory as createCategoryRecord,
  renameCategory as renameCategoryRecord,
  deleteCategory as deleteCategoryRecord,
} from '../lib/db/queries';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface JournalStore {
  entries: JournalEntry[];
  categories: Category[];
  currentEntry: JournalEntry | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedTag: string | null;
  selectedSubject: string | null;
  saveStatus: SaveStatus;
  sortBy: 'created' | 'updated' | 'title' | 'manual';

  loadAll: () => Promise<void>;
  loadOne: (id: string) => Promise<void>;
  create: (data: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<JournalEntry>;
  update: (id: string, data: Partial<JournalEntry>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** 批量删除（移到回收站）：一次删除多个文档 */
  removeMany: (ids: string[]) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  /** 一键创建/打开今日笔记（每日总结），返回 entry 与是否新建 */
  createTodayNote: () => Promise<{ entry: JournalEntry; created: boolean }>;
  setCurrent: (entry: JournalEntry | null) => void;
  setSearchQuery: (q: string) => void;
  setSelectedTag: (tag: string | null) => void;
  setSelectedSubject: (subject: string | null) => void;
  getFilteredEntries: () => JournalEntry[];
  setSaveStatus: (status: SaveStatus) => void;
  setSortBy: (s: 'created' | 'updated' | 'title' | 'manual') => void;
  createCategory: (name: string) => Promise<Category>;
  renameCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
}

export const useJournalStore = create<JournalStore>((set, get) => ({
  entries: [],
  categories: [],
  currentEntry: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  selectedTag: null,
  selectedSubject: null,
  saveStatus: 'idle' as SaveStatus,
  sortBy: 'created' as 'created' | 'updated' | 'title' | 'manual',

  loadAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const [entries, categories] = await Promise.all([getAllJournals(), getCategories()]);
      entries.sort((a, b) => b.createdAt - a.createdAt);
      set({ entries, categories, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  loadOne: async (id) => {
    set({ isLoading: true });
    try {
      const entry = await getJournal(id);
      set({ currentEntry: entry, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  create: async (data) => {
    set({ saveStatus: 'saving' });
    try {
      const entry = await createJournal(data);
      if (entry.subject) await createCategoryRecord(entry.subject);
      const categories = await getCategories();
      set((state) => ({ entries: [entry, ...state.entries], categories, saveStatus: 'saved' }));
      return entry;
    } catch (e) {
      set({ saveStatus: 'error', error: (e as Error).message });
      throw e;
    }
  },

  update: async (id, data) => {
    set({ saveStatus: 'saving' });
    try {
      await updateJournal(id, data);
      if (typeof data.subject === 'string' && data.subject.trim()) await createCategoryRecord(data.subject);
      const updated = await getJournal(id);
      if (!updated) return;
      const categories = await getCategories();
      set((state) => ({
        entries: state.entries.map((e) => (e.id === id ? updated : e)),
        currentEntry: state.currentEntry?.id === id ? updated : state.currentEntry,
        categories,
        saveStatus: 'saved',
      }));
    } catch (e) {
      set({ saveStatus: 'error', error: (e as Error).message });
      throw e;
    }
  },

  remove: async (id) => {
    await deleteJournal(id);
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      currentEntry: state.currentEntry?.id === id ? null : state.currentEntry,
    }));
  },

  removeMany: async (ids) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    for (const id of ids) {
      await deleteJournal(id);
    }
    set((state) => ({
      entries: state.entries.filter((e) => !idSet.has(e.id)),
      currentEntry: state.currentEntry && idSet.has(state.currentEntry.id) ? null : state.currentEntry,
    }));
  },

  togglePin: async (id) => {
    const { entries } = get();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    await updateJournal(id, { pinned: !entry.pinned });
    const updated = await getJournal(id);
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? updated! : e)),
      currentEntry: state.currentEntry?.id === id ? updated : state.currentEntry,
    }));
  },

  duplicate: async (id) => {
    const entry = await duplicateJournal(id);
    set((state) => ({ entries: [entry, ...state.entries] }));
  },
  createTodayNote: async () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const title = `${y}年${m}月${d}日`;
    // 查找今天的每日笔记（标题匹配 dateStr 或中文标题，或今日创建且标签含"日记"）
    const { entries } = get();
    const todayStart = new Date(y, m - 1, d).getTime();
    const todayEnd = todayStart + 86400000;
    const existing = entries.find((e) =>
      !e.deletedAt &&
      e.createdAt >= todayStart && e.createdAt < todayEnd &&
      (e.title === title || e.title === dateStr || (e.tags ?? []).includes('日记')),
    );
    if (existing) {
      const fresh = await getJournal(existing.id);
      set({ currentEntry: fresh });
      return { entry: fresh ?? existing, created: false };
    }
    const entry = await get().create({
      title,
      content: `# ${title}\n\n## 今日总结\n\n`,
      contentPlain: '',
      tags: ['日记'],
      subject: '每日笔记',
      sourceType: 'manual',
    });
    return { entry, created: true };
  },
  setCurrent: (entry) => set({ currentEntry: entry }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  setSelectedSubject: (subject) => set({ selectedSubject: subject }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  setSortBy: (s) => set({ sortBy: s }),
  createCategory: async (name) => {
    const category = await createCategoryRecord(name);
    set({ categories: await getCategories() });
    return category;
  },
  renameCategory: async (id, name) => {
    await renameCategoryRecord(id, name);
    const [entries, categories] = await Promise.all([getAllJournals(), getCategories()]);
    set({ entries, categories });
  },
  deleteCategory: async (id) => {
    await deleteCategoryRecord(id);
    const [entries, categories] = await Promise.all([getAllJournals(), getCategories()]);
    set({ entries, categories });
  },

  getFilteredEntries: () => {
    const { entries, searchQuery, selectedTag, selectedSubject, sortBy } = get();
    let filtered = entries;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.contentPlain?.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)) ||
          e.subject?.toLowerCase().includes(q),
      );
    }

    if (selectedTag) {
      filtered = filtered.filter((e) => e.tags.includes(selectedTag!));
    }

    if (selectedSubject) {
      filtered = filtered.filter((e) => e.subject === selectedSubject);
    }

    if (sortBy === 'manual') {
      // 手动排序：按 localStorage 保存的 id 顺序；未记录的按创建时间补在后面
      let orderArr: string[] = [];
      try { orderArr = JSON.parse(localStorage.getItem('doc-manual-order') || '[]'); } catch { /* ignore */ }
      const orderMap = new Map(orderArr.map((id, i) => [id, i]));
      filtered = [...filtered].sort((a, b) => {
        const oa = orderMap.has(a.id) ? orderMap.get(a.id)! : 1e9;
        const ob = orderMap.has(b.id) ? orderMap.get(b.id)! : 1e9;
        if (oa !== ob) return oa - ob;
        return b.createdAt - a.createdAt;
      });
    } else if (sortBy === 'title') {
      filtered = [...filtered].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortBy === 'updated') {
      filtered = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
    } else {
      filtered = [...filtered].sort((a, b) => b.createdAt - a.createdAt);
    }
    filtered = [...filtered].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return filtered;
  },
}));
