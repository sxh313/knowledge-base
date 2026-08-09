// ──── GitHub 云同步引擎 ────
// 本地优先：本地 IndexedDB 为主存储，同步层负责把数据推送到 GitHub 私有仓库 / 拉取合并。
// 冲突策略：按记录 id 合并，每条取「较新」版本（updatedAt/createdAt/nextReviewAt），
//           软删除（deletedAt）会传播到远端。

import { db } from '../db/schema';
import type { SyncConfig, JournalEntry } from '../db/schema';
import { rebuildDocumentIndexes } from '../indexing/documents';
import { pushJournalsAsMarkdown, pushConversationsAsMarkdown } from './markdownSync';

const API = 'https://api.github.com';

// UTF-8 安全的 base64 编解码（GitHub Contents API 要求 base64）
function b64encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));
}

export interface FullData {
  version: number;
  exportedAt: number;
  journals: unknown[];
  notes: unknown[];
  cards: unknown[];
  graphNodes: unknown[];
  graphEdges: unknown[];
  aiConversations: unknown[];
  savedSearches: unknown[];
  journalVersions: unknown[];
  propertyDefinitions: unknown[];
  attachments: unknown[];
}

// Blob → dataURL（附件序列化用；settings 不参与同步，因其含 API Key）
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** 收集本地全部数据（同步用）；附件 Blob 序列化为 dataUrl，settings 不同步（含密钥） */
export async function collectAllData(): Promise<FullData> {
  const [journals, notes, cards, graphNodes, graphEdges, aiConversations, savedSearches, journalVersions, propertyDefinitions, rawAttachments] = await Promise.all([
    db.journals.toArray(),
    db.notes.toArray(),
    db.cards.toArray(),
    db.graphNodes.toArray(),
    db.graphEdges.toArray(),
    db.aiConversations.toArray(),
    db.savedSearches.toArray(),
    db.journalVersions.toArray(),
    db.propertyDefinitions.toArray(),
    db.attachments.toArray(),
  ]);
  // 附件 Blob 无法直接 JSON 序列化，转成 dataUrl
  const attachments = await Promise.all(
    rawAttachments.map(async (a) => ({
      ...a,
      blob: undefined,
      dataUrl: a.dataUrl ?? (a.blob ? await blobToDataUrl(a.blob).catch(() => undefined) : undefined),
    })),
  );
  return {
    version: 1,
    exportedAt: Date.now(),
    journals, notes, cards, graphNodes, graphEdges, aiConversations,
    savedSearches, journalVersions, propertyDefinitions, attachments,
  };
}

interface TimedRow {
  id?: string;
  updatedAt?: number;
  createdAt?: number;
  deletedAt?: number;
  nextReviewAt?: number;
  lastReviewAt?: number;
}

function rowTime(r: TimedRow): number {
  // deletedAt 优先（让软删除覆盖普通更新），其次 updatedAt，再退化到其它时间字段
  return r.deletedAt ?? r.updatedAt ?? r.lastReviewAt ?? r.nextReviewAt ?? r.createdAt ?? 0;
}

/** 按 id 合并两份数据，每条取「较新」版本 */
function mergeByNewest(a: unknown[], b: unknown[]): unknown[] {
  const m = new Map<string, unknown>();
  for (const row of [...a, ...b]) {
    const r = row as TimedRow;
    if (!r.id) continue;
    const ex = m.get(r.id) as TimedRow | undefined;
    if (!ex || rowTime(r) >= rowTime(ex)) m.set(r.id, row);
  }
  return [...m.values()];
}

export function mergeData(local: FullData, remote: FullData): FullData {
  // 远端为旧版本时可能缺新增字段，用 ?? [] 容错
  const r = remote as Partial<FullData>;
  return {
    version: 1,
    exportedAt: Date.now(),
    journals: mergeByNewest(local.journals, r.journals ?? []),
    notes: mergeByNewest(local.notes, r.notes ?? []),
    cards: mergeByNewest(local.cards, r.cards ?? []),
    graphNodes: mergeByNewest(local.graphNodes, r.graphNodes ?? []),
    graphEdges: mergeByNewest(local.graphEdges, r.graphEdges ?? []),
    aiConversations: mergeByNewest(local.aiConversations, r.aiConversations ?? []),
    savedSearches: mergeByNewest(local.savedSearches, r.savedSearches ?? []),
    journalVersions: mergeByNewest(local.journalVersions, r.journalVersions ?? []),
    propertyDefinitions: mergeByNewest(local.propertyDefinitions, r.propertyDefinitions ?? []),
    attachments: mergeByNewest(local.attachments, r.attachments ?? []),
  };
}

/** 将合并后的数据写回本地（bulkPut 覆盖同 id）；派生索引在 syncNow 中重建 */
export async function writeAllData(data: FullData): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.journals, db.notes, db.cards, db.graphNodes, db.graphEdges, db.aiConversations,
      db.savedSearches, db.journalVersions, db.propertyDefinitions, db.attachments,
    ],
    async () => {
      await Promise.all([
        db.journals.bulkPut(data.journals as never),
        db.notes.bulkPut(data.notes as never),
        db.cards.bulkPut(data.cards as never),
        db.graphNodes.bulkPut(data.graphNodes as never),
        db.graphEdges.bulkPut(data.graphEdges as never),
        db.aiConversations.bulkPut(data.aiConversations as never),
        db.savedSearches.bulkPut(data.savedSearches as never),
        db.journalVersions.bulkPut(data.journalVersions as never),
        db.propertyDefinitions.bulkPut(data.propertyDefinitions as never),
        db.attachments.bulkPut(data.attachments as never),
      ]);
    },
  );
}
// ──── 三方冲突检测（基于 contentHash 基线） ────

interface HashedRow {
  id?: string;
  contentHash?: string;
}

/** 检测冲突：本地与远端相对基线都发生改变、且彼此不同 → 冲突 */
function detectConflictedIds(localJ: unknown[], remoteJ: unknown[], baseline: Record<string, string>): Set<string> {
  const localMap = new Map<string, string>();
  for (const j of localJ as HashedRow[]) {
    if (j.id && j.contentHash) localMap.set(j.id, j.contentHash);
  }
  const conflict = new Set<string>();
  for (const r of remoteJ as HashedRow[]) {
    if (!r.id || !r.contentHash) continue;
    const lh = localMap.get(r.id);
    if (!lh) continue;
    const bh = baseline[r.id];
    if (bh && lh !== bh && r.contentHash !== bh && lh !== r.contentHash) conflict.add(r.id);
  }
  return conflict;
}

/** 记录冲突快照（已有未解决冲突则跳过，避免重复堆叠） */
async function recordConflicts(localJ: unknown[], remoteJ: unknown[], ids: Set<string>): Promise<number> {
  if (ids.size === 0) return 0;
  const localById = new Map(localJ.map((j) => [(j as HashedRow).id!, j]));
  const remoteById = new Map(remoteJ.map((j) => [(j as HashedRow).id!, j]));
  let recorded = 0;
  for (const id of ids) {
    const existing = await db.syncConflicts.where('journalId').equals(id).filter((c) => !c.resolvedAt).first();
    if (existing) continue;
    const localEntry = localById.get(id);
    const remoteEntry = remoteById.get(id);
    if (!localEntry || !remoteEntry) continue;
    await db.syncConflicts.put({
      id: crypto.randomUUID(),
      journalId: id,
      local: localEntry as JournalEntry,
      remote: remoteEntry as JournalEntry,
      detectedAt: Date.now(),
    });
    recorded++;
  }
  return recorded;
}

/** 冲突文档强制保留本地版本（不被远端覆盖） */
function keepLocalForConflicts(merged: FullData, local: FullData, ids: Set<string>): FullData {
  if (ids.size === 0) return merged;
  const localById = new Map(local.journals.map((j) => [(j as HashedRow).id!, j]));
  return {
    ...merged,
    journals: merged.journals.map((j) => {
      const id = (j as HashedRow).id;
      return id && ids.has(id) ? (localById.get(id) ?? j) : j;
    }),
  };
}

/** 由合并后的文档构建新的 contentHash 基线 */
function buildBaseline(journals: unknown[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const j of journals as HashedRow[]) {
    if (j.id && j.contentHash) m[j.id] = j.contentHash;
  }
  return m;
}
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

interface RemoteFile { sha?: string; content?: string }

async function ghGet(cfg: SyncConfig): Promise<RemoteFile | null> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, { headers: authHeaders(cfg.token) });
  if (res.status === 404) return null; // 远端还没有数据文件（首次同步）
  if (!res.ok) throw new Error(`GitHub GET 失败: HTTP ${res.status}`);
  return (await res.json()) as RemoteFile;
}

async function ghPut(cfg: SyncConfig, content: string, sha?: string): Promise<string> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(cfg.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `chore(sync): ${new Date().toISOString()}`,
      content: b64encode(content),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GitHub PUT 失败: HTTP ${res.status} ${t.slice(0, 160)}`);
  }
  const json = await res.json();
  return json?.content?.sha as string;
}

export interface SyncResult {
  sha: string;
  pulled: number;   // 从远端拉取并合并的记录数
  pushed: boolean;
  conflicts: number; // 本次检测到的冲突数
  baselineHashes: Record<string, string>; // 新基线（合并后 contentHash）
}

/**
 * 完整同步流程：拉取远端 → 与本地合并（取较新）→ 写回本地 → 推送合并结果
 */
export async function syncNow(cfg: SyncConfig): Promise<SyncResult> {
  const local = await collectAllData();
  const remote = await ghGet(cfg);
  const baseline = cfg.baselineHashes ?? {};

  let merged = local;
  let pulled = 0;
  let conflicts = 0;

  if (remote?.content) {
    const remoteData = JSON.parse(b64decode(remote.content)) as FullData;
    // 三方冲突检测（本地与远端相对基线都改变且不同）
    const conflictedIds = detectConflictedIds(local.journals, remoteData.journals, baseline);
    conflicts = await recordConflicts(local.journals, remoteData.journals, conflictedIds);
    // 合并：冲突文档保留本地，其余按「较新」
    merged = keepLocalForConflicts(mergeData(local, remoteData), local, conflictedIds);
    await writeAllData(merged);
    // 同步完成后本地重建派生索引（双链/分块/搜索），派生数据不参与同步
    await rebuildDocumentIndexes();
    pulled =
      remoteData.journals.length +
      remoteData.cards.length +
      remoteData.notes.length;
  }

  const json = JSON.stringify(merged);
  // GitHub 单文件硬上限 100MB，留余量用 95MB 提前拦截，避免推送失败
  const byteSize = new Blob([json]).size;
  const MAX_BYTES = 95 * 1024 * 1024; // 95MB（预留余量）
  if (byteSize > MAX_BYTES) {
    throw new Error(`数据体积 ${(byteSize / 1024 / 1024).toFixed(1)}MB 超过 95MB 上限，已阻止上传。请在设置中清理旧数据（如 AI 对话历史）后再试。`);
  }
  const sha = await ghPut(cfg, json, remote?.sha);
  // 自动推送文档 + AI 对话为 Markdown（每篇/每条一个文件到 docs/ 和 conversations/）
  try { await pushJournalsAsMarkdown(cfg); } catch { /* ignore */ }
  try { await pushConversationsAsMarkdown(cfg); } catch { /* ignore */ }
  return { sha, pulled, pushed: true, conflicts, baselineHashes: buildBaseline(merged.journals) };
}

/**
 * 仅从云端拉取：拉取远端 → 与本地合并（取较新、检测冲突）→ 写回本地 → 重建派生索引。
 * 不推送（不会把本地改动上传）。适合“把云端最新数据取到本设备”。
 */
export async function pullFromCloud(cfg: SyncConfig): Promise<{ pulled: number; conflicts: number }> {
  const local = await collectAllData();
  const remote = await ghGet(cfg);
  const baseline = cfg.baselineHashes ?? {};
  let pulled = 0;
  let conflicts = 0;
  if (remote?.content) {
    const remoteData = JSON.parse(b64decode(remote.content)) as FullData;
    const conflictedIds = detectConflictedIds(local.journals, remoteData.journals, baseline);
    conflicts = await recordConflicts(local.journals, remoteData.journals, conflictedIds);
    const merged = keepLocalForConflicts(mergeData(local, remoteData), local, conflictedIds);
    await writeAllData(merged);
    await rebuildDocumentIndexes();
    pulled = remoteData.journals.length + remoteData.cards.length + remoteData.notes.length;
  }
  return { pulled, conflicts };
}

/** 测试连接：验证 token + 仓库可访问 */
export async function testConnection(cfg: SyncConfig): Promise<{ ok: boolean; message: string }> {
  try {
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      return { ok: false, message: '请填写用户名、仓库名和 Token' };
    }
    const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}`, { headers: authHeaders(cfg.token) });
    if (res.status === 404) return { ok: false, message: '仓库不存在，请先在 GitHub 创建私有仓库' };
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'Token 无效或权限不足（需 repo 权限）' };
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const repo = await res.json();
    return { ok: true, message: `已连接：${repo.full_name}（默认分支 ${repo.default_branch}）` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
