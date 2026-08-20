import {
  db,
  type JournalEntry,
  type Note,
  type AIConversation,
  type AppSettings,
  type AISettings,
  type JournalVersion,
  type DocumentLink,
  type SavedSearch,
  type SyncConflict,
} from './schema';
export { createCard, updateCard, getCardsDueToday, getAllCards, deleteCard, deleteCards, resetCardProgress } from './cards';
export { blobToDataUrl, putAttachment, getAttachment, getAttachmentsForJournal, deleteAttachment, deleteAttachmentsForJournal } from './attachments';
export { getCategories, createCategory, renameCategory, deleteCategory } from './categories';
import {
  persistJournalWithIndexes,
  rebuildDocumentIndexes,
  type JournalCreateInput,
} from '../indexing/documents';

// ──── Settings ────

export async function getSettings(): Promise<AppSettings> {
  let settings = await db.settings.get('global');
  if (!settings) {
    settings = {
      id: 'global',
      aiProviders: {
        shengsuanyun: {
          baseUrl: 'https://beta-router.shengsuanyun.com/api/v1',
          apiKey: '',
          enabled: false,
        },
        relay: {
          baseUrl: '',
          apiKey: '',
          enabled: false,
        },
        siliconflow: {
          baseUrl: 'https://api.siliconflow.cn/v1',
          apiKey: '',
          enabled: false,
        },
        zhipu: {
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          apiKey: '',
          enabled: false,
        },
        deepseek: {
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: '',
          enabled: false,
        },
        local: {
          baseUrl: 'http://127.0.0.1:11434/v1',
          apiKey: '',
          enabled: false,
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
        owner: '',
        repo: '',
        branch: 'main',
        path: 'data.json',
        token: '',
        autoSync: true,
      },
    };
    await db.settings.put(settings);
  }
  // 兼容旧数据：补全新增字段
  let backfilled = false;
  if (!settings.availableModels) settings.availableModels = {};
  if (!settings.selectedModels) settings.selectedModels = ['deepseek-v4-flash'];
  if (!settings.providerOrder) settings.providerOrder = ['shengsuanyun', 'relay', 'siliconflow', 'zhipu', 'deepseek', 'local'];
  else if (!settings.providerOrder.includes('local')) { settings.providerOrder = [...settings.providerOrder, 'local']; backfilled = true; }
  if (!settings.aiProviders.shengsuanyun) {
    settings.aiProviders.shengsuanyun = { baseUrl: 'https://beta-router.shengsuanyun.com/api/v1', apiKey: '', enabled: false };
  }
  if (!settings.aiProviders.local) {
    settings.aiProviders.local = { baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', enabled: false };
    backfilled = true;
  }
  // 兼容旧数据：补全云同步配置
  if (!settings.sync) {
    settings.sync = { enabled: false, owner: 'sxh313', repo: 'knowledge-base', branch: 'knowledge-base', path: 'data.json', token: '', autoSync: true };
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

export async function createJournal(data: JournalCreateInput) {
  const now = Date.now();
  const entry: JournalEntry = {
    id: crypto.randomUUID(),
    ...data,
    contentPlain: data.contentPlain ?? '',
    aliases: data.aliases ?? [],
    tags: data.tags ?? [],
    subject: data.subject ?? '',
    status: data.status ?? 'active',
    properties: data.properties ?? {},
    createdAt: now,
    updatedAt: now,
  };
  return persistJournalWithIndexes(entry);
}

// ──── 文档版本历史 ────

/** 保存一个版本快照（内容与最近一次不同才存，每篇文档最多保留 30 个） */
export async function saveVersion(journalId: string, title: string, content: string) {
  if (!journalId || !content?.trim()) return;
  const latest = await db.journalVersions
    .where('journalId').equals(journalId)
    .reverse().sortBy('createdAt');
  const last = latest[0];
  // 与最近一次内容相同则跳过（避免自动保存产生大量重复快照）
  if (last && last.title === title && last.content === content) return;
  const now = Date.now();
  const v: JournalVersion = {
    id: crypto.randomUUID(),
    journalId,
    title,
    content,
    createdAt: now,
  };
  await db.journalVersions.put(v);
  // 超过 30 个，删掉最旧的
  if (latest.length >= 30) {
    const toDelete = latest.slice(29).map(x => x.id); // latest 已 reverse，最旧在末尾
    await db.journalVersions.bulkDelete(toDelete);
  }
}
/** 获取某篇文档的全部历史版本（新→旧） */
export async function getVersions(journalId: string): Promise<JournalVersion[]> {
  const all = await db.journalVersions.where('journalId').equals(journalId).toArray();
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** 删除某个版本 */
export async function deleteVersion(id: string) {
  await db.journalVersions.delete(id);
}

/** 复制文档（克隆，生成新 id） */
export async function duplicateJournal(id: string) {
  const orig = await db.journals.get(id);
  if (!orig) throw new Error('Journal not found');
  const now = Date.now();
  const entry: JournalEntry = {
    ...orig,
    id: crypto.randomUUID(),
    title: (orig.title || '无标题') + '（副本）',
    pinned: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
  };
  return persistJournalWithIndexes(entry);
}

export async function updateJournal(id: string, data: Partial<JournalEntry>) {
  const existing = await db.journals.get(id);
  if (!existing) throw new Error('Journal not found');
  return persistJournalWithIndexes({ ...existing, ...data, id, updatedAt: Date.now() });
}

export async function deleteJournal(id: string) {
  const existing = await db.journals.get(id);
  if (!existing) return;
  await persistJournalWithIndexes({ ...existing, deletedAt: Date.now(), updatedAt: Date.now() });
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

export async function restoreJournal(id: string) {
  const existing = await db.journals.get(id);
  if (!existing) throw new Error('Journal not found');
  return persistJournalWithIndexes({ ...existing, deletedAt: undefined, updatedAt: Date.now() });
}

/** 彻底隐藏文档并清理派生数据；保留文档/附件墓碑以传播跨设备删除。 */
export async function purgeJournal(id: string) {
  await db.transaction('rw', [db.journals, db.documentLinks, db.documentChunks, db.attachments], async () => {
    const existing = await db.journals.get(id);
    if (existing) {
      const now = Date.now();
      await db.journals.put({ ...existing, deletedAt: existing.deletedAt ?? now, updatedAt: now });
      await db.attachments.where('journalId').equals(id).modify({ deletedAt: now, updatedAt: now });
    }
    await db.documentLinks.where('sourceId').equals(id).delete();
    await db.documentLinks.where('targetId').equals(id).delete();
    await db.documentChunks.where('journalId').equals(id).delete();
  });
}

// ──── 文档索引与反向链接 ────

/**
 * 启动时检查：若存在未软删且缺少 contentHash 的文档（旧数据 / 导入数据），
 * 则重建全部文档索引（chunks / links / hash）并刷新搜索索引。返回是否执行了重建。
 */
export async function ensureIndexesRebuilt(): Promise<boolean> {
  const all = await db.journals.toArray();
  const needsRebuild = all.some((j) => !j.deletedAt && !j.contentHash);
  if (!needsRebuild) return false;
  await rebuildDocumentIndexes();
  return true;
}

export interface BacklinkInfo {
  link: DocumentLink;
  source: JournalEntry;
}

/**
 * 反向链接：所有指向 journalId 的文档链接（含来源文档信息）。
 * 只返回未软删的来源文档，按来源更新时间倒序。
 */
export async function getBacklinks(journalId: string): Promise<BacklinkInfo[]> {
  const links = await db.documentLinks.where('targetId').equals(journalId).toArray();
  if (links.length === 0) return [];
  const sourceIds = Array.from(new Set(links.map((l) => l.sourceId)));
  const sources = await db.journals.bulkGet(sourceIds);
  const sourceMap = new Map<string, JournalEntry>();
  sources.forEach((s) => {
    if (s) sourceMap.set(s.id, s);
  });
  return links
    .filter((l) => {
      const src = sourceMap.get(l.sourceId);
      return !!src && !src.deletedAt;
    })
    .map((l) => ({ link: l, source: sourceMap.get(l.sourceId)! }))
    .sort((a, b) => b.source.updatedAt - a.source.updatedAt);
}

/**
 * 当前文档的失效出链：指向不存在目标的 [[链接]]（broken=true）。
 * 按出现位置（position）升序，便于在正文中定位。
 */
export async function getBrokenOutgoingLinks(sourceId: string): Promise<DocumentLink[]> {
  const links = await db.documentLinks
    .where('sourceId')
    .equals(sourceId)
    .filter((l) => l.broken)
    .toArray();
  return links.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
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

export async function createNote(data: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) {
  const now = Date.now();
  const note: Note = { id: crypto.randomUUID(), ...data, createdAt: now, updatedAt: now };
  await db.notes.put(note);
  return note;
}

export async function getNotesByJournal(journalId: string) {
  const notes = await db.notes.where('journalId').equals(journalId).sortBy('position');
  return notes.filter((note) => !note.deletedAt);
}

// ──── 同步冲突（syncConflicts） ────

export async function getSyncConflicts(): Promise<SyncConflict[]> {
  const all = await db.syncConflicts.toArray();
  return all.sort((a, b) => b.detectedAt - a.detectedAt);
}

/** 解决冲突：local=保留本地 / remote=用远端覆盖本地 / both=保留本地并把远端存为副本 */
export async function resolveSyncConflict(id: string, resolution: 'local' | 'remote' | 'both') {
  const c = await db.syncConflicts.get(id);
  if (!c) return;
  if (resolution === 'remote') {
    // 用远端版本覆盖本地
    await persistJournalWithIndexes(c.remote);
  } else if (resolution === 'both') {
    // 保留本地，同时把远端版本存为新文档副本
    await persistJournalWithIndexes({
      ...c.remote,
      id: crypto.randomUUID(),
      title: (c.remote.title || '无标题') + '（远端副本）',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  // 'local'：保留本地，无需操作
  await db.syncConflicts.update(id, { resolvedAt: Date.now(), resolution });
}

export async function deleteSyncConflict(id: string) {
  await db.syncConflicts.delete(id);
}

// ──── 保存的搜索（savedSearches） ────

/** 获取全部保存的搜索（按更新时间倒序） */
export async function getSavedSearches(): Promise<SavedSearch[]> {
  const all = await db.savedSearches.filter((search) => !search.deletedAt).toArray();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 创建或更新保存的搜索（同名覆盖查询串，不缓存结果） */
export async function saveSavedSearch(name: string, query: string): Promise<SavedSearch> {
  const nameTrim = name.trim();
  if (!nameTrim) throw new Error('搜索名称不能为空');
  const now = Date.now();
  const existing = await db.savedSearches.where('name').equals(nameTrim).first();
  const ss: SavedSearch = existing
    ? { ...existing, query, updatedAt: now }
    : { id: crypto.randomUUID(), name: nameTrim, query, createdAt: now, updatedAt: now };
  await db.savedSearches.put(ss);
  return ss;
}

export async function deleteSavedSearch(id: string) {
  const existing = await db.savedSearches.get(id);
  if (!existing || existing.deletedAt) return;
  const now = Date.now();
  await db.savedSearches.put({ ...existing, deletedAt: now, updatedAt: now });
}

// ──── Conversations ────

export async function saveConversation(data: Omit<AIConversation, 'id' | 'createdAt'>) {
  const now = Date.now();
  const conv: AIConversation = { id: crypto.randomUUID(), ...data, createdAt: now, updatedAt: now };
  await db.aiConversations.put(conv);
  return conv;
}

export async function getConversations(journalId?: string, limit = 30) {
  // 过滤软删除的对话
  const filter = (c: AIConversation) => !c.deletedAt;
  if (journalId) {
    const list = await db.aiConversations.where('journalId').equals(journalId).reverse().sortBy('createdAt');
    return list.filter(filter);
  }
  const all = await db.aiConversations.orderBy('createdAt').reverse().limit(limit * 2).toArray();
  return all.filter(filter).slice(0, limit);
}

/** 获取单个对话 */
export async function getConversation(id: string) {
  return db.aiConversations.get(id);
}

/** 新建或更新对话（upsert，按 id 覆盖；一个对话一条记录） */
export async function upsertConversation(conv: AIConversation): Promise<AIConversation> {
  const updated = { ...conv, updatedAt: conv.updatedAt ?? Date.now() };
  await db.aiConversations.put(updated);
  return updated;
}

/** 删除对话（软删除：标记 deletedAt 墓碑，云同步时传播到远端，避免被远端数据复活） */
export async function deleteConversation(id: string) {
  const existing = await db.aiConversations.get(id);
  if (!existing) return;
  const now = Date.now();
  await db.aiConversations.put({ ...existing, deletedAt: now, updatedAt: now });
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
    const headers: Record<string, string> = {};
    if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
    const res = await fetch(`${cleanUrl}/models`, {
      headers,
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
