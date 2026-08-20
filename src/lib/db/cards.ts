import { db, type KnowledgeCard } from './schema';

export async function createCard(data: Omit<KnowledgeCard, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'stability' | 'difficulty' | 'nextReviewAt' | 'repetitions' | 'state'>) {
  const now = Date.now();
  const card: KnowledgeCard = { id: crypto.randomUUID(), ...data, stability: 1, difficulty: 5, nextReviewAt: now + 86400000, repetitions: 0, state: 'new', createdAt: now, updatedAt: now };
  await db.cards.put(card);
  return card;
}

export async function updateCard(id: string, data: Partial<KnowledgeCard>) {
  const existing = await db.cards.get(id);
  if (!existing) throw new Error('Card not found');
  const updated = { ...existing, ...data, updatedAt: Date.now() };
  await db.cards.put(updated);
  return updated;
}

export async function getCardsDueToday() {
  return db.cards.where('nextReviewAt').belowOrEqual(Date.now()).filter((card) => !card.deletedAt).toArray();
}

export async function getAllCards() {
  return db.cards.filter((card) => !card.deletedAt).toArray();
}

export async function deleteCard(id: string) {
  const existing = await db.cards.get(id);
  if (!existing || existing.deletedAt) return;
  const now = Date.now();
  await db.cards.put({ ...existing, deletedAt: now, updatedAt: now });
}

export async function deleteCards(ids: string[]) {
  const cards = await db.cards.bulkGet(ids);
  const now = Date.now();
  await db.cards.bulkPut(cards.filter((card): card is KnowledgeCard => !!card).map((card) => ({ ...card, deletedAt: now, updatedAt: now })));
}

export async function resetCardProgress(id: string) {
  const existing = await db.cards.get(id);
  if (!existing) throw new Error('Card not found');
  const updated = { ...existing, stability: 1, difficulty: 5, repetitions: 0, state: 'new' as const, lastReviewAt: undefined, nextReviewAt: Date.now(), updatedAt: Date.now() };
  await db.cards.put(updated);
  return updated;
}
