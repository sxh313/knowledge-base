import { db, type JournalEntry, type Note, type KnowledgeCard, type AIConversation, type AppSettings, type AISettings } from './schema';

// ──── Settings ────

export async function getSettings(): Promise<AppSettings> {
  let settings = await db.settings.get('global');
  if (!settings) {
    settings = {
      id: 'global',
      aiProviders: {
        shengsuanyun: { baseUrl: 'https://beta-router.shengsuanyun.com/api/v1', apiKey: '', enabled: false },
        relay: { baseUrl: '', apiKey: '', enabled: false },
        siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', apiKey: '', enabled: false },
        zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', enabled: false },
        deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', enabled: false },
      },
      preferredModels: {
        highQuality: 'deepseek-v4-flash',
        codeTask: 'deepseek-v4-flash',
        fastTask: 'deepseek-v4-flash',
      },
      availableModels: {},
      selectedModels: ['deepseek-v4-flash'],
      theme: 'auto',
      reviewDailyGoal: 20,
    };
    await db.settings.put(settings);
  }
  // 兼容旧数据：补全新增字段
  if (!settings.availableModels) settings.availableModels = {};
  if (!settings.selectedModels) settings.selectedModels = ['deepseek-v4-flash'];
  if (!settings.aiProviders.shengsuanyun) {
    settings.aiProviders.shengsuanyun = { baseUrl: 'https://beta-router.shengsuanyun.com/api/v1', apiKey: '', enabled: false };
  }
  return settings;
}

export async function updateSettings(partial: Partial<AppSettings>) {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await db.settings.put(updated);
  return updated;
}

export async function updateAIProviders(providers: Partial<AISettings>) {
  const current = await getSettings();
  const aiProviders = { ...current.aiProviders, ...providers };
  await db.settings.put({ ...current, aiProviders });
  return aiProviders;
}

// ──── Journals ────

export async function createJournal(data: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = Date.now();
  const id = crypto.randomUUID();
  const entry: JournalEntry = { id, ...data, createdAt: now, updatedAt: now };
  await db.journals.put(entry);
  return entry;
}

export async function updateJournal(id: string, data: Partial<JournalEntry>) {
  const existing = await db.journals.get(id);
  if (!existing) throw new Error('Journal not found');
  const updated = { ...existing, ...data, updatedAt: Date.now() };
  await db.journals.put(updated);
  return updated;
}

export async function deleteJournal(id: string) {
  await db.journals.update(id, { deletedAt: Date.now() });
}

export async function getJournal(id: string) {
  return db.journals.get(id);
}

export async function getAllJournals(includeDeleted = false) {
  if (includeDeleted) return db.journals.toArray();
  return db.journals.filter(j => !j.deletedAt).toArray();
}

export async function searchJournalsByTags(tags: string[]) {
  return db.journals.filter(j => !j.deletedAt && tags.some(t => j.tags.includes(t))).toArray();
}

export async function getJournalsBySubject(subject: string) {
  return db.journals.filter(j => !j.deletedAt && j.subject === subject).toArray();
}

// ──── Notes ────

export async function createNote(data: Omit<Note, 'id' | 'createdAt'>) {
  const note: Note = { id: crypto.randomUUID(), ...data, createdAt: Date.now() };
  await db.notes.put(note);
  return note;
}

export async function getNotesByJournal(journalId: string) {
  return db.notes.where('journalId').equals(journalId).sortBy('position');
}

// ──── Knowledge Cards ────

export async function createCard(data: Omit<KnowledgeCard, 'id' | 'createdAt' | 'stability' | 'difficulty' | 'nextReviewAt' | 'repetitions' | 'state'>) {
  const card: KnowledgeCard = {
    id: crypto.randomUUID(),
    ...data,
    stability: 1.0,
    difficulty: 5.0,
    nextReviewAt: Date.now() + 86400000,
    repetitions: 0,
    state: 'new',
    createdAt: Date.now(),
  };
  await db.cards.put(card);
  return card;
}

export async function updateCard(id: string, data: Partial<KnowledgeCard>) {
  const existing = await db.cards.get(id);
  if (!existing) throw new Error('Card not found');
  const updated = { ...existing, ...data };
  await db.cards.put(updated);
  return updated;
}

export async function getCardsDueToday() {
  const now = Date.now();
  return db.cards.where('nextReviewAt').belowOrEqual(now).toArray();
}

export async function getAllCards() {
  return db.cards.toArray();
}

export async function deleteCard(id: string) {
  await db.cards.delete(id);
}

/** 物理删除多张卡片（批量） */
export async function deleteCards(ids: string[]) {
  await db.cards.bulkDelete(ids);
}

/** 重置某张卡片的复习进度（编辑内容后重新学习用） */
export async function resetCardProgress(id: string) {
  const existing = await db.cards.get(id);
  if (!existing) throw new Error('Card not found');
  await db.cards.put({
    ...existing,
    stability: 1.0,
    difficulty: 5.0,
    repetitions: 0,
    state: 'new',
    lastReviewAt: undefined,
    nextReviewAt: Date.now(),
  });
  return existing;
}

// ──── Conversations ────

export async function saveConversation(data: Omit<AIConversation, 'id' | 'createdAt'>) {
  const conv: AIConversation = { id: crypto.randomUUID(), ...data, createdAt: Date.now() };
  await db.aiConversations.put(conv);
  return conv;
}

export async function getConversations(journalId?: string) {
  if (journalId) return db.aiConversations.where('journalId').equals(journalId).reverse().sortBy('createdAt');
  return db.aiConversations.reverse().toArray();
}

// ──── Fetch Available Models from Provider API ────

export async function fetchAvailableModels(
  providerKey: string,
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${cleanUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const models: string[] = (data.data ?? [])
      .map((m: { id?: string; model?: string }) => m.id ?? m.model ?? '')
      .filter(Boolean)
      .sort();

    // 保存到设置
    const settings = await getSettings();
    const updated = {
      ...settings,
      availableModels: { ...settings.availableModels, [providerKey]: models },
    };
    await db.settings.put(updated);

    return models;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ──── Data Export / Import ────

export async function exportAllData() {
  const data = {
    version: 1,
    exportedAt: Date.now(),
    journals: await db.journals.toArray(),
    notes: await db.notes.toArray(),
    cards: await db.cards.toArray(),
    graphNodes: await db.graphNodes.toArray(),
    graphEdges: await db.graphEdges.toArray(),
    settings: await db.settings.toArray(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `study-journal-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importData(file: File) {
  const text = await file.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('文件内容不是有效的 JSON 格式');
  }
  await db.transaction('rw', db.journals, db.notes, db.cards, db.graphNodes, db.graphEdges, async () => {
    if (Array.isArray(data.journals)) await db.journals.bulkPut(data.journals);
    if (Array.isArray(data.notes)) await db.notes.bulkPut(data.notes);
    if (Array.isArray(data.cards)) await db.cards.bulkPut(data.cards);
    if (Array.isArray(data.graphNodes)) await db.graphNodes.bulkPut(data.graphNodes);
    if (Array.isArray(data.graphEdges)) await db.graphEdges.bulkPut(data.graphEdges);
  });
}