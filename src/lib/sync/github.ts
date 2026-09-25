// ──── GitHub 云同步引擎 ────
// 本地优先：本地 IndexedDB 为主存储，同步层负责把数据推送到 GitHub 私有仓库 / 拉取合并。
// 冲突策略：按记录 id 合并，每条取「较新」版本（updatedAt/createdAt/nextReviewAt），
//           软删除（deletedAt）会传播到远端。

import { db } from '../db/schema';
import type { SyncConfig, JournalEntry } from '../db/schema';
import { rebuildDocumentIndexes } from '../indexing/documents';
import { readRemoteSnapshot, writeRemoteSnapshot } from './categorizedJsonSync';
import { mergeData, type FullData } from './merge';
import { createSingleFlight } from './singleFlight';

const API = 'https://api.github.com';

function applyZero2HistoryBoundary(data: FullData, enabled: boolean): FullData {
  if (enabled) return data;
  const safe = { ...data };
  delete safe.zero2ReviewMessages;
  delete safe.zero2ReviewAttempts;
  delete safe.zero2LearningMemories;
  return safe;
}

// 模块级 single-flight：自动同步和手动同步并发触发时共享同一次请求，
// 避免 Git Data API 分支引用竞态，也避免调用方把“跳过”误判为“已完成”。
const withSyncLock = createSingleFlight();

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
export async function collectAllData(syncAgentData = false, syncZero2ReviewHistory = false): Promise<FullData> {
  const [journals, notes, cards, graphNodes, graphEdges, aiConversations, savedSearches, journalVersions, propertyDefinitions, categories, rawAttachments, userPreferences, learningGoals, learningTasks, zero2ReviewSessions, zero2Mastery, zero2ReviewPlans, zero2ReviewTasks] = await Promise.all([
    db.journals.toArray(),
    db.notes.toArray(),
    db.cards.toArray(),
    db.graphNodes.toArray(),
    db.graphEdges.toArray(),
    db.aiConversations.toArray(),
    db.savedSearches.toArray(),
    db.journalVersions.toArray(),
    db.propertyDefinitions.toArray(),
    db.categories.toArray(),
    db.attachments.toArray(),
    db.userPreferences.toArray(),
    db.learningGoals.toArray(),
    db.learningTasks.toArray(),
    db.zero2ReviewSessions.toArray(),
    db.zero2Mastery.toArray(),
    db.zero2ReviewPlans.toArray(),
    db.zero2ReviewTasks.toArray(),
  ]);
  // Agent 数据（会话/消息/运行记录）可选同步：含撤销快照等敏感内容，默认关闭
  let agentSessions: unknown[] | undefined;
  let agentMessages: unknown[] | undefined;
  let agentRuns: unknown[] | undefined;
  let agentAuditLogs: unknown[] | undefined;
  let zero2ReviewMessages: unknown[] | undefined;
  let zero2ReviewAttempts: unknown[] | undefined;
  let zero2LearningMemories: unknown[] | undefined;
  if (syncAgentData) {
    [agentSessions, agentMessages, agentRuns, agentAuditLogs] = await Promise.all([
      db.agentSessions.toArray(),
      db.agentMessages.toArray(),
      db.agentRuns.toArray(),
      db.agentAuditLogs.toArray(),
    ]);
  }
  if (syncZero2ReviewHistory) {
    [zero2ReviewMessages, zero2ReviewAttempts, zero2LearningMemories] = await Promise.all([
      db.zero2ReviewMessages.toArray(),
      db.zero2ReviewAttempts.toArray(),
      db.zero2LearningMemories.toArray(),
    ]);
  }
  // 附件 Blob 无法直接 JSON 序列化，转成 dataUrl
  const attachments = await Promise.all(
    rawAttachments.map(async (a) => ({
      ...a,
      blob: undefined,
      dataUrl: a.dataUrl ?? (a.blob ? await blobToDataUrl(a.blob).catch(() => undefined) : undefined),
    })),
  );
  return {
    version: 5,
    exportedAt: Date.now(),
    journals, notes, cards, graphNodes, graphEdges, aiConversations,
    savedSearches, journalVersions, propertyDefinitions, categories, attachments,
    agentSessions, agentMessages, agentRuns, agentAuditLogs,
    userPreferences, learningGoals, learningTasks,
    zero2ReviewSessions, zero2Mastery, zero2ReviewPlans, zero2ReviewTasks,
    zero2ReviewMessages, zero2ReviewAttempts, zero2LearningMemories,
  };
}

interface JournalLinkedRow { journalId?: string }
interface GraphNodeRow { id?: string; entryIds?: string[] }
interface GraphEdgeRow { sourceId?: string; targetId?: string }
interface ConversationRow extends JournalLinkedRow {
  citations?: { journalId?: string }[];
  messages?: { citations?: { journalId?: string }[] }[];
}

function conversationReferencesLocalOnly(row: unknown, localOnlyIds: Set<string>): boolean {
  const conversation = row as ConversationRow;
  if (conversation.journalId && localOnlyIds.has(conversation.journalId)) return true;
  const citations = [
    ...(conversation.citations ?? []),
    ...(conversation.messages ?? []).flatMap((message) => message.citations ?? []),
  ];
  return citations.some((citation) => !!citation.journalId && localOnlyIds.has(citation.journalId));
}

/**
 * 从同步快照中移除仅本地文档及其关联数据。
 * 保留完整本机快照用于合并，只有写入 GitHub 的数据经过此清洗。
 */
export function removeLocalOnlyData(data: FullData, localOnlyIds: Set<string>): FullData {
  if (localOnlyIds.size === 0) return data;
  const journals = data.journals.filter((row) => !localOnlyIds.has((row as { id?: string }).id ?? ''));
  const graphNodes = data.graphNodes.filter((row) => !((row as GraphNodeRow).entryIds ?? []).some((id) => localOnlyIds.has(id)));
  const graphNodeIds = new Set(graphNodes.map((row) => (row as GraphNodeRow).id).filter(Boolean) as string[]);
  const categoriesInUse = new Set(journals.map((row) => (row as JournalEntry).subject).filter(Boolean));
  return {
    ...data,
    journals,
    notes: data.notes.filter((row) => !localOnlyIds.has((row as JournalLinkedRow).journalId ?? '')),
    cards: data.cards.filter((row) => !localOnlyIds.has((row as JournalLinkedRow).journalId ?? '')),
    journalVersions: data.journalVersions.filter((row) => !localOnlyIds.has((row as JournalLinkedRow).journalId ?? '')),
    attachments: data.attachments.filter((row) => !localOnlyIds.has((row as JournalLinkedRow).journalId ?? '')),
    aiConversations: data.aiConversations.filter((row) => !conversationReferencesLocalOnly(row, localOnlyIds)),
    categories: data.categories.filter((row) => categoriesInUse.has((row as { name?: string }).name ?? '')),
    graphNodes,
    graphEdges: data.graphEdges.filter((row) => {
      const edge = row as GraphEdgeRow;
      return (!edge.sourceId || graphNodeIds.has(edge.sourceId)) && (!edge.targetId || graphNodeIds.has(edge.targetId));
    }),
    // Agent 消息和运行快照可能包含完整正文，无法仅凭结构可靠判定来源。
    // 设备上存在仅本地文档时，宁可不上传 Agent 历史，也不冒泄露正文的风险。
    agentSessions: [],
    agentMessages: [],
    agentRuns: [],
    agentAuditLogs: [],
  };
}

/** 将合并后的数据写回本地（bulkPut 覆盖同 id）；派生索引在 syncNow 中重建 */
export async function writeAllData(data: FullData): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.journals, db.notes, db.cards, db.graphNodes, db.graphEdges, db.aiConversations,
      db.savedSearches, db.journalVersions, db.propertyDefinitions, db.attachments,
      db.categories, db.agentSessions, db.agentMessages, db.agentRuns, db.agentAuditLogs,
      db.userPreferences, db.learningGoals, db.learningTasks,
      db.zero2ReviewSessions, db.zero2ReviewMessages, db.zero2Mastery,
      db.zero2ReviewPlans, db.zero2ReviewTasks, db.zero2ReviewAttempts,
      db.zero2LearningMemories,
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
        db.categories.bulkPut(data.categories as never),
        db.attachments.bulkPut(data.attachments as never),
        db.agentSessions.bulkPut((data.agentSessions ?? []) as never),
        db.agentMessages.bulkPut((data.agentMessages ?? []) as never),
        db.agentRuns.bulkPut((data.agentRuns ?? []) as never),
        db.agentAuditLogs.bulkPut((data.agentAuditLogs ?? []) as never),
        db.userPreferences.bulkPut((data.userPreferences ?? []) as never),
        db.learningGoals.bulkPut((data.learningGoals ?? []) as never),
        db.learningTasks.bulkPut((data.learningTasks ?? []) as never),
        db.zero2ReviewSessions.bulkPut((data.zero2ReviewSessions ?? []) as never),
        db.zero2Mastery.bulkPut((data.zero2Mastery ?? []) as never),
        db.zero2ReviewPlans.bulkPut((data.zero2ReviewPlans ?? []) as never),
        db.zero2ReviewTasks.bulkPut((data.zero2ReviewTasks ?? []) as never),
        ...(data.zero2ReviewMessages ? [db.zero2ReviewMessages.bulkPut(data.zero2ReviewMessages as never)] : []),
        ...(data.zero2ReviewAttempts ? [db.zero2ReviewAttempts.bulkPut(data.zero2ReviewAttempts as never)] : []),
        ...(data.zero2LearningMemories ? [db.zero2LearningMemories.bulkPut(data.zero2LearningMemories as never)] : []),
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

export interface SyncResult {
  sha: string;
  pulled: number;   // 从远端拉取并合并的记录数
  pushed: boolean;
  conflicts: number; // 本次检测到的冲突数
  baselineHashes: Record<string, string>; // 新基线（合并后 contentHash）
}

/**
 * 拉取远端 → 与本地合并（取较新、检测冲突）→ 写回本地 → 重建派生索引。
 * 返回 { merged, json, remoteSha, pulled, conflicts }，供推送使用。
 */
async function pullAndMerge(cfg: SyncConfig, local: FullData, baseline: Record<string, string>) {
  const remote = await readRemoteSnapshot(cfg);
  let merged = local;
  let pulled = 0;
  let conflicts = 0;

  if (remote.data) {
    const remoteData = applyZero2HistoryBoundary(remote.data, !!cfg.syncZero2ReviewHistory);
    const localOnlyIds = new Set((local.journals as JournalEntry[]).filter((entry) => entry.localOnly).map((entry) => entry.id));
    const safeRemoteData = removeLocalOnlyData(remoteData, localOnlyIds);
    // 三方冲突检测（本地与远端相对基线都改变且不同）
    const conflictedIds = detectConflictedIds(local.journals, safeRemoteData.journals, baseline);
    conflicts = await recordConflicts(local.journals, safeRemoteData.journals, conflictedIds);
    // 合并：冲突文档保留本地，其余按「较新」
    merged = keepLocalForConflicts(mergeData(local, safeRemoteData), local, conflictedIds);
    await writeAllData(merged);
    // 同步完成后本地重建派生索引（双链/分块/搜索），派生数据不参与同步
    await rebuildDocumentIndexes();
    pulled =
      safeRemoteData.journals.length +
      safeRemoteData.cards.length +
      safeRemoteData.notes.length;
  }

  const localOnlyIds = new Set((merged.journals as JournalEntry[]).filter((entry) => entry.localOnly).map((entry) => entry.id));
  const cloudData = removeLocalOnlyData(merged, localOnlyIds);
  return { merged, cloudData, remoteCommitSha: remote.commitSha, pulled, conflicts };
}

/**
 * 完整同步流程：拉取远端 → 与本地合并（取较新）→ 写回本地 → 推送合并结果。
 * 推送遇 409（远端被其他设备/进程并发修改）时，自动重新拉取远端并重新合并后再推送，
 * 指数退避重试，避免覆盖其他设备的改动，也避免因 GitHub 最终一致性导致的间歇性失败。
 */
export async function syncNow(cfg: SyncConfig): Promise<SyncResult> {
  return withSyncLock(async () => {
    const local = await collectAllData(cfg.syncAgentData, cfg.syncZero2ReviewHistory);
    const baseline = cfg.baselineHashes ?? {};

    // 首次拉取合并
    let { merged, cloudData, remoteCommitSha, pulled, conflicts } = await pullAndMerge(cfg, local, baseline);

    // 推送：遇 409 重新拉取合并再推，最多 5 次（指数退避）
    let sha: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      sha = await writeRemoteSnapshot(cfg, cloudData, remoteCommitSha);
      if (sha) break;
      // 409：远端被并发修改。等待后重新拉取远端并重新合并（基于最新远端，避免覆盖他人改动）
      await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
      // 使用上一轮合并结果作为新的本地快照，避免 409 重试时丢掉刚合并的数据。
      const again = await pullAndMerge(cfg, merged, baseline);
      merged = again.merged;
      cloudData = again.cloudData;
      remoteCommitSha = again.remoteCommitSha;
      pulled = again.pulled;
      conflicts = again.conflicts;
    }
    if (!sha) throw new Error('GitHub 同步失败: 多次重试后分支仍有并发更新，请稍后再试');
    const localOnlyIds = new Set((merged.journals as JournalEntry[]).filter((entry) => entry.localOnly).map((entry) => entry.id));
    return { sha, pulled, pushed: true, conflicts, baselineHashes: buildBaseline(removeLocalOnlyData(merged, localOnlyIds).journals) };
  }) as Promise<SyncResult>;
}

/**
 * 仅从云端拉取：拉取远端 → 与本地合并（取较新、检测冲突）→ 写回本地 → 重建派生索引。
 * 不推送（不会把本地改动上传）。适合“把云端最新数据取到本设备”。
 */
export interface PullResult {
  pulled: number;
  conflicts: number;
  lastSyncSha?: string;
  baselineHashes: Record<string, string>;
}

export async function pullFromCloud(cfg: SyncConfig): Promise<PullResult> {
  return withSyncLock(async () => {
    const local = await collectAllData(cfg.syncAgentData, cfg.syncZero2ReviewHistory);
    const remote = await readRemoteSnapshot(cfg);
    const baseline = cfg.baselineHashes ?? {};
    let pulled = 0;
    let conflicts = 0;
    let baselineHashes: Record<string, string> = {};
    if (remote.data) {
      const remoteData = applyZero2HistoryBoundary(remote.data, !!cfg.syncZero2ReviewHistory);
      const localOnlyIds = new Set((local.journals as JournalEntry[]).filter((entry) => entry.localOnly).map((entry) => entry.id));
      const safeRemoteData = removeLocalOnlyData(remoteData, localOnlyIds);
      const conflictedIds = detectConflictedIds(local.journals, safeRemoteData.journals, baseline);
      conflicts = await recordConflicts(local.journals, safeRemoteData.journals, conflictedIds);
      const merged = keepLocalForConflicts(mergeData(local, safeRemoteData), local, conflictedIds);
      await writeAllData(merged);
      await rebuildDocumentIndexes();
      pulled = safeRemoteData.journals.length + safeRemoteData.cards.length + safeRemoteData.notes.length;
      baselineHashes = buildBaseline(removeLocalOnlyData(merged, localOnlyIds).journals);
    }
    return { pulled, conflicts, lastSyncSha: remote.commitSha, baselineHashes };
  });
}

/** 测试连接：验证 token + 仓库可访问 */
export async function testConnection(cfg: SyncConfig): Promise<{ ok: boolean; message: string }> {
  try {
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      return { ok: false, message: '请填写用户名、仓库名和 Token' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}`, { headers: authHeaders(cfg.token), signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (res.status === 404) return { ok: false, message: '仓库不存在，请先在 GitHub 创建私有仓库' };
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'Token 无效或权限不足（需 repo 权限）' };
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const repo = await res.json();
    return { ok: true, message: `已连接：${repo.full_name}（默认分支 ${repo.default_branch}）` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
