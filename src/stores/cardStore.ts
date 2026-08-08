import { create } from 'zustand';
import type { KnowledgeCard } from '../lib/db/schema';
import {
  getAllCards, createCard, updateCard, deleteCard,
  resetCardProgress, deleteCards,
} from '../lib/db/queries';

export type CardFilterState = 'all' | 'due' | 'new' | 'review' | 'relearning';

export type NewCardInput = {
  front: string;
  back: string;
  tags: string[];
  cardType: KnowledgeCard['cardType'];
  journalId?: string;
};

interface CardStore {
  cards: KnowledgeCard[];
  isLoading: boolean;
  searchQuery: string;
  filterTag: string | null;
  filterState: CardFilterState;

  load: () => Promise<void>;
  setSearch: (q: string) => void;
  setFilterTag: (tag: string | null) => void;
  setFilterState: (s: CardFilterState) => void;
  clearFilters: () => void;

  addCard: (input: NewCardInput) => Promise<void>;
  editCard: (id: string, data: Partial<KnowledgeCard>) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  resetProgress: (id: string) => Promise<void>;

  /** 按当前搜索/筛选条件计算的结果（无副作用，供组件调用） */
  getFiltered: () => KnowledgeCard[];
  /** 所有出现过的标签（去重 + 按频次降序） */
  getAllTags: () => string[];
  /** 到期待复习数量 */
  getDueCount: () => number;
}

export const useCardStore = create<CardStore>((set, get) => ({
  cards: [],
  isLoading: false,
  searchQuery: '',
  filterTag: null,
  filterState: 'all',

  load: async () => {
    set({ isLoading: true });
    const cards = await getAllCards();
    // 最新创建的排前面，与文档列表一致的心智
    cards.sort((a, b) => b.createdAt - a.createdAt);
    set({ cards, isLoading: false });
  },

  setSearch: (q) => set({ searchQuery: q }),
  setFilterTag: (tag) => set({ filterTag: tag }),
  setFilterState: (s) => set({ filterState: s }),
  clearFilters: () => set({ searchQuery: '', filterTag: null, filterState: 'all' }),

  addCard: async (input) => {
    await createCard({
      front: input.front.trim(),
      back: input.back.trim(),
      tags: input.tags,
      cardType: input.cardType,
      journalId: input.journalId,
    });
    await get().load();
  },

  editCard: async (id, data) => {
    await updateCard(id, data);
    await get().load();
  },

  removeCard: async (id) => {
    await deleteCard(id);
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
  },

  removeMany: async (ids) => {
    await deleteCards(ids);
    const setIds = new Set(ids);
    set((s) => ({ cards: s.cards.filter((c) => !setIds.has(c.id)) }));
  },

  resetProgress: async (id) => {
    await resetCardProgress(id);
    await get().load();
  },

  getFiltered: () => {
    const { cards, searchQuery, filterTag, filterState } = get();
    const now = Date.now();
    const q = searchQuery.trim().toLowerCase();

    return cards.filter((c) => {
      // 关键词：匹配 front / back / tags
      if (q) {
        const haystack = `${c.front} ${c.back} ${c.tags.join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // 标签
      if (filterTag && !c.tags.includes(filterTag)) return false;
      // 状态
      switch (filterState) {
        case 'due': return c.nextReviewAt <= now;
        case 'new': return c.state === 'new';
        case 'review': return c.state === 'review';
        case 'relearning': return c.state === 'learning' || c.state === 'relearning';
        case 'all': default: return true;
      }
    });
  },

  getAllTags: () => {
    const counts = new Map<string, number>();
    for (const c of get().cards) {
      for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  },

  getDueCount: () => {
    const now = Date.now();
    return get().cards.filter((c) => c.nextReviewAt <= now).length;
  },
}));
