import { db, type JournalEntry, type Note, type KnowledgeCard, type AIConversation, type AppSettings, type AISettings } from './schema';

// ──── Settings ────

export async function getSettings(): Promise<AppSettings> {
  let settings = await db.settings.get('global');
  if (!settings) {
    const env = import.meta.env;
    settings = {
      id: 'global',
      aiProviders: {
        shengsuanyun: {
          baseUrl: 'https://beta-router.shengsuanyun.com/api/v1',
          apiKey: env.VITE_SHENGSUANYUN_API_KEY ?? '',
          enabled: !!env.VITE_SHENGSUANYUN_API_KEY,
        },
        relay: {
          baseUrl: env.VITE_RELAY_BASE_URL ?? '',
          apiKey: env.VITE_RELAY_API_KEY ?? '',
          enabled: !!env.VITE_RELAY_API_KEY,
        },
        siliconflow: {
          baseUrl: 'https://api.siliconflow.cn/v1',
          apiKey: env.VITE_SILICONFLOW_API_KEY ?? '',
          enabled: !!env.VITE_SILICONFLOW_API_KEY,
        },
        zhipu: {
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          apiKey: env.VITE_ZHIPU_API_KEY ?? '',
          enabled: !!env.VITE_ZHIPU_API_KEY,
        },
        deepseek: {
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: env.VITE_DEEPSEEK_API_KEY ?? '',
          enabled: !!env.VITE_DEEPSEEK_API_KEY,
        },
      },
      preferredModels: {
        // 默认走胜算云中转别名 deepseek-v4-flash；详见 providers.ts 中 MODEL_MAP 的别名说明
        highQuality: 'deepseek-v4-flash',
        codeTask: 'deepseek-v4-flash',
        fastTask: 'deepseek-v4-flash',
      },
      availableModels: {},
      selectedModels: ['deepseek-v4-flash'],
      theme: 'auto',
      reviewDailyGoal: 20,
      sync: {
        enabled: false,
        owner: 'sxh313',
        repo: 'knowledge-base',
        branch: 'knowledge-base',
        path: 'data.json',
        token: '',
        autoSync: true,
      },
    };
    await db.settings.put(settings);
  }
  // 兼容旧数据：补全新增字段
  if (!settings.availableModels) settings.availableModels = {};
  if (!settings.selectedModels) settings.selectedModels = ['deepseek-v4-flash'];
  if (!settings.aiProviders.shengsuanyun) {
    settings.aiProviders.shengsuanyun = { baseUrl: 'https://beta-router.shengsuanyun.com/api/v1', apiKey: '', enabled: false };
  }
  // 兼容旧数据：补全云同步配置
  if (!settings.sync) {
    settings.sync = { enabled: false, owner: 'sxh313', repo: 'knowledge-base', branch: 'knowledge-base', path: 'data.json', token: '', autoSync: true };
  }
  // 若某 provider 的 apiKey 仍为空，且本地环境变量提供了值，则补填（不会覆盖已手动填写的内容）
  const env = import.meta.env;
  const envBackfill: Record<keyof AISettings, string | undefined> = {
    shengsuanyun: env.VITE_SHENGSUANYUN_API_KEY,
    relay: env.VITE_RELAY_API_KEY,
    siliconflow: env.VITE_SILICONFLOW_API_KEY,
    zhipu: env.VITE_ZHIPU_API_KEY,
    deepseek: env.VITE_DEEPSEEK_API_KEY,
  };
  let backfilled = false;
  for (const key of Object.keys(envBackfill) as (keyof AISettings)[]) {
    const envKey = envBackfill[key];
    if (envKey && !settings.aiProviders[key].apiKey) {
      settings.aiProviders[key] = { ...settings.aiProviders[key], apiKey: envKey, enabled: true };
      backfilled = true;
    }
  }
  if (env.VITE_RELAY_BASE_URL && !settings.aiProviders.relay.baseUrl) {
    settings.aiProviders.relay.baseUrl = env.VITE_RELAY_BASE_URL;
    backfilled = true;
  }
  // 修正：sxh313/knowledge-base 仓库的默认分支为 knowledge-base（早期默认 main 会导致同步 404）
  if (settings.sync && settings.sync.owner === 'sxh313' && settings.sync.repo === 'knowledge-base'
      && (settings.sync.branch === 'main' || settings.sync.branch === '')) {
    settings.sync.branch = 'knowledge-base';
    backfilled = true;
  }
  if (backfilled) await db.settings.put(settings);
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
  // Dexie 不会为 undefined 值建立索引，「未删除」无法走 deletedAt 索引，只能全表过滤
  return db.journals.filter(j => !j.deletedAt).toArray();
}

/** 回收站：仅已删除的文档（走 deletedAt 索引，避免全表扫描） */
export async function getTrashedJournals() {
  return db.journals.where('deletedAt').above(0).toArray();
}

/** 从回收站恢复文档 */
export async function restoreJournal(id: string) {
  const existing = await db.journals.get(id);
  if (!existing) throw new Error('Journal not found');
  const updated = { ...existing, deletedAt: undefined, updatedAt: Date.now() };
  await db.journals.put(updated);
  return updated;
}

/** 物理删除（彻底删除）文档 */
export async function purgeJournal(id: string) {
  await db.journals.delete(id);
}

export async function searchJournalsByTags(tags: string[]) {
  // 利用 *tags 多值索引：anyOf 命中任一标签即返回，再去掉已删除项
  return db.journals
    .where('tags')
    .anyOf(tags)
    .filter(j => !j.deletedAt)
    .toArray();
}

export async function getJournalsBySubject(subject: string) {
  // 走 subject 索引，再去掉已删除项
  return db.journals
    .where('subject')
    .equals(subject)
    .filter(j => !j.deletedAt)
    .toArray();
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
  a.download = `knowledge-base-backup-${new Date().toISOString().split('T')[0]}.json`;
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