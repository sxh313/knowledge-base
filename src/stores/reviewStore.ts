import { create } from 'zustand';
import type { KnowledgeCard } from '../lib/db/schema';
import { getCardsDueToday, updateCard } from '../lib/db/queries';
import { scheduleFSRS } from '../lib/algorithms/fsrs';

type Rating = 1 | 2 | 3 | 4;

interface ReviewStore {
  cards: KnowledgeCard[];
  index: number;
  isFlipped: boolean;
  isLoading: boolean;
  isComplete: boolean;
  stats: { reviewed: number; again: number; hard: number; good: number; easy: number };

  load: () => Promise<void>;
  flip: () => void;
  rate: (rating: Rating) => Promise<void>;
  getCurrent: () => KnowledgeCard | null;
}

export const useReviewStore = create<ReviewStore>((set, get) => ({
  cards: [],
  index: 0,
  isFlipped: false,
  isLoading: false,
  isComplete: false,
  stats: { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 },

  load: async () => {
    set({ isLoading: true });
    const cards = await getCardsDueToday();
    set({
      cards,
      index: 0,
      isFlipped: false,
      isComplete: cards.length === 0,
      isLoading: false,
      stats: { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 },
    });
  },

  flip: () => set((s) => ({ isFlipped: !s.isFlipped })),

  rate: async (rating) => {
    const { cards, index } = get();
    const card = cards[index];
    if (!card) return;

    const updated = scheduleFSRS(card, rating);
    await updateCard(card.id, updated);

    const s = get().stats;
    const key = rating === 1 ? 'again' : rating === 2 ? 'hard' : rating === 3 ? 'good' : 'easy';
    const newStats = { ...s, [key]: s[key] + 1, reviewed: s.reviewed + 1 };
    const nextIndex = index + 1;

    if (nextIndex >= cards.length) {
      set({ stats: newStats, isFlipped: false, isComplete: true });
      // 检查是否还有新到期卡片（不覆盖当前统计）
      const dueCards = await getCardsDueToday();
      if (dueCards.length > 0) {
        set({ cards: dueCards, index: 0, isFlipped: false, isComplete: false });
      }
    } else {
      set({ index: nextIndex, isFlipped: false, stats: newStats });
    }
  },

  getCurrent: () => {
    const { cards, index } = get();
    return cards[index] ?? null;
  },
}));
