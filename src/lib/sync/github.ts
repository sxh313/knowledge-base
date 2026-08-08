// ──── GitHub 云同步引擎 ────
// 本地优先：本地 IndexedDB 为主存储，同步层负责把数据推送到 GitHub 私有仓库 / 拉取合并。
// 冲突策略：按记录 id 合并，每条取「较新」版本（updatedAt/createdAt/nextReviewAt），
//           软删除（deletedAt）会传播到远端。

import { db } from '../db/schema';
import type { SyncConfig } from '../db/schema';

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
}

/** 收集本地全部数据（同步用） */
export async function collectAllData(): Promise<FullData> {
  const [journals, notes, cards, graphNodes, graphEdges, aiConversations] = await Promise.all([
    db.journals.toArray(),
    db.notes.toArray(),
    db.cards.toArray(),
    db.graphNodes.toArray(),
    db.graphEdges.toArray(),
    db.aiConversations.toArray(),
  ]);
  return { version: 1, exportedAt: Date.now(), journals, notes, cards, graphNodes, graphEdges, aiConversations };
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
  return {
    version: 1,
    exportedAt: Date.now(),
    journals: mergeByNewest(local.journals, remote.journals),
    notes: mergeByNewest(local.notes, remote.notes),
    cards: mergeByNewest(local.cards, remote.cards),
    graphNodes: mergeByNewest(local.graphNodes, remote.graphNodes),
    graphEdges: mergeByNewest(local.graphEdges, remote.graphEdges),
    aiConversations: mergeByNewest(local.aiConversations, remote.aiConversations),
  };
}

/** 将合并后的数据写回本地（bulkPut 覆盖同 id） */
export async function writeAllData(data: FullData): Promise<void> {
  await db.transaction(
    'rw',
    [db.journals, db.notes, db.cards, db.graphNodes, db.graphEdges, db.aiConversations],
    async () => {
      await Promise.all([
        db.journals.bulkPut(data.journals as never),
        db.notes.bulkPut(data.notes as never),
        db.cards.bulkPut(data.cards as never),
        db.graphNodes.bulkPut(data.graphNodes as never),
        db.graphEdges.bulkPut(data.graphEdges as never),
        db.aiConversations.bulkPut(data.aiConversations as never),
      ]);
    },
  );
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
}

/**
 * 完整同步流程：拉取远端 → 与本地合并（取较新）→ 写回本地 → 推送合并结果
 */
export async function syncNow(cfg: SyncConfig): Promise<SyncResult> {
  const local = await collectAllData();
  const remote = await ghGet(cfg);

  let merged = local;
  let pulled = 0;
  if (remote?.content) {
    const remoteData = JSON.parse(b64decode(remote.content)) as FullData;
    merged = mergeData(local, remoteData);
    await writeAllData(merged);
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
  return { sha, pulled, pushed: true };
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
