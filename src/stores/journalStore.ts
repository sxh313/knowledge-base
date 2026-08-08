import { create } from 'zustand';
import type { JournalEntry } from '../lib/db/schema';
import { createJournal, updateJournal, deleteJournal, getJournal, getAllJournals } from '../lib/db/queries';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface JournalStore {
  entries: JournalEntry[];
  currentEntry: JournalEntry | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedTag: string | null;
  selectedSubject: string | null;
  saveStatus: SaveStatus;

  loadAll: () => Promise<void>;
  loadOne: (id: string) => Promise<void>;
  create: (data: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<JournalEntry>;
  update: (id: string, data: Partial<JournalEntry>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  setCurrent: (entry: JournalEntry | null) => void;
  setSearchQuery: (q: string) => void;
  setSelectedTag: (tag: string | null) => void;
  setSelectedSubject: (subject: string | null) => void;
  getFilteredEntries: () => JournalEntry[];
  setSaveStatus: (status: SaveStatus) => void;
}

export const useJournalStore = create<JournalStore>((set, get) => ({
  entries: [],
  currentEntry: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  selectedTag: null,
  selectedSubject: null,
  saveStatus: 'idle' as SaveStatus,

  loadAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const entries = await getAllJournals();
      entries.sort((a, b) => b.createdAt - a.createdAt);
      set({ entries, isLoading: false });
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
      set((state) => ({ entries: [entry, ...state.entries], saveStatus: 'saved' }));
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
      const updated = await getJournal(id);
      if (!updated) return;
      set((state) => ({
        entries: state.entries.map((e) => (e.id === id ? updated : e)),
        currentEntry: state.currentEntry?.id === id ? updated : state.currentEntry,
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

  setCurrent: (entry) => set({ currentEntry: entry }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  setSelectedSubject: (subject) => set({ selectedSubject: subject }),
  setSaveStatus: (status) => set({ saveStatus: status }),

  getFilteredEntries: () => {
    const { entries, searchQuery, selectedTag, selectedSubject } = get();
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

    return filtered;
  },
}));
