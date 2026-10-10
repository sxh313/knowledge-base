import type { JournalEntry, SyncConfig } from '../db/schema';
import type { FullData } from './merge';

const API = 'https://api.github.com';
export const DOCUMENT_JSON_ROOT = 'documents-json';
const META_PATH = `${DOCUMENT_JSON_ROOT}/_meta/data.json`;

async function mapConcurrent<T, R>(items: T[], operation: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(3, items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await operation(items[index]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  // Drain active requests before releasing the sync lock after a failure.
  const outcomes = await Promise.allSettled(workers);
  const failure = outcomes.find((outcome) => outcome.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return results;
}

export interface DocumentJsonPayload {
  version: 1;
  exportedAt: number;
  journal: JournalEntry;
  notes: unknown[];
  cards: unknown[];
  journalVersions: unknown[];
  attachments: unknown[];
  aiConversations: unknown[];
}

interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string | null;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function repoBase(cfg: SyncConfig): string {
  return `${API}/repos/${cfg.owner}/${cfg.repo}`;
}

async function gh<T>(cfg: SyncConfig, method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${repoBase(cfg)}${path}`, {
      method,
      headers: headers(cfg.token),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`GitHub ${method} ${path} 失败: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('GitHub 同步请求超时（30 秒），请检查网络或代理后重试');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function b64encode(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

function b64decode(value: string): string {
  return decodeURIComponent(escape(atob(value.replace(/\s/g, ''))));
}

function parseBlobJson<T>(encoded: string): T {
  let decoded = b64decode(encoded);
  try {
    return JSON.parse(decoded) as T;
  } catch {
    // 兼容旧版曾产生的双重 base64 文件。
    decoded = b64decode(decoded);
    return JSON.parse(decoded) as T;
  }
}

export function safePathSegment(value: string, fallback: string): string {
  const safe = value.trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim();
  return (safe || fallback).slice(0, 72);
}

export function documentJsonPath(entry: JournalEntry): string {
  const category = safePathSegment(entry.subject || '', '未分类');
  const title = safePathSegment(entry.title || '', '无标题');
  const id = safePathSegment(entry.id, 'document');
  return `${DOCUMENT_JSON_ROOT}/${category}/${title}--${id}.json`;
}

async function getHead(cfg: SyncConfig): Promise<{ commitSha: string; treeSha: string }> {
  const ref = await gh<{ object: { sha: string } }>(cfg, 'GET', `/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
  const commitSha = ref.object.sha;
  const commit = await gh<{ tree: { sha: string } }>(cfg, 'GET', `/git/commits/${commitSha}`);
  return { commitSha, treeSha: commit.tree.sha };
}

async function listTree(cfg: SyncConfig, treeSha: string): Promise<TreeEntry[]> {
  const result = await gh<{ tree: TreeEntry[]; truncated?: boolean }>(cfg, 'GET', `/git/trees/${treeSha}?recursive=1`);
  if (result.truncated) throw new Error('GitHub 仓库目录过大，无法完整读取。请使用独立的同步仓库后重试。');
  return result.tree ?? [];
}

async function readBlobJson<T>(cfg: SyncConfig, sha: string): Promise<T> {
  const blob = await gh<{ content: string }>(cfg, 'GET', `/git/blobs/${sha}`);
  return parseBlobJson<T>(blob.content || '');
}

async function isLegacySyncedJournalMarkdown(cfg: SyncConfig, entry: TreeEntry): Promise<boolean> {
  if (!entry.sha || !entry.path.startsWith('docs/') || !entry.path.endsWith('.md')) return false;
  const blob = await gh<{ content: string }>(cfg, 'GET', `/git/blobs/${entry.sha}`);
  const markdown = b64decode(blob.content || '');
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1] ?? '';
  return /^id:\s*\S+/m.test(frontmatter) && /^createdAt:\s*\S+/m.test(frontmatter) && /^updatedAt:\s*\S+/m.test(frontmatter);
}

async function createBlob(cfg: SyncConfig, value: unknown, existingSha?: string | null): Promise<string> {
  const json = JSON.stringify(value, null, 2);
  const byteSize = new Blob([json]).size;
  const maxBytes = 95 * 1024 * 1024;
  if (byteSize > maxBytes) {
    throw new Error(`单个同步 JSON 为 ${(byteSize / 1024 / 1024).toFixed(1)}MB，超过 95MB 安全上限。请移除该文档的大附件或清理全局历史后重试。`);
  }
  // Git hashes the UTF-8 content with its blob header, so unchanged files need no upload.
  const bytes = new TextEncoder().encode(`blob ${byteSize}\0${json}`);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  const sha = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (sha === existingSha) return sha;
  const content = b64encode(json);
  const result = await gh<{ sha: string }>(cfg, 'POST', '/git/blobs', { content, encoding: 'base64' });
  return result.sha;
}

function emptyData(): FullData {
  return {
    version: 5,
    exportedAt: 0,
    journals: [], notes: [], cards: [], graphNodes: [], graphEdges: [], aiConversations: [],
    savedSearches: [], journalVersions: [], propertyDefinitions: [], categories: [], attachments: [],
    userPreferences: [], learningGoals: [], learningTasks: [],
  };
}

function journalIdOf(row: unknown): string | undefined {
  return (row as { journalId?: string }).journalId;
}

export function splitCategorizedSnapshot(data: FullData): { meta: FullData; documents: DocumentJsonPayload[] } {
  const documents = (data.journals as JournalEntry[]).map((journal) => ({
    version: 1 as const,
    exportedAt: 0,
    journal,
    notes: data.notes.filter((row) => journalIdOf(row) === journal.id),
    cards: data.cards.filter((row) => journalIdOf(row) === journal.id),
    journalVersions: data.journalVersions.filter((row) => journalIdOf(row) === journal.id),
    attachments: data.attachments.filter((row) => journalIdOf(row) === journal.id),
    aiConversations: data.aiConversations.filter((row) => journalIdOf(row) === journal.id),
  }));
  const linkedIds = new Set(documents.map((document) => document.journal.id));
  const isUnlinked = (row: unknown) => {
    const journalId = journalIdOf(row);
    return !journalId || !linkedIds.has(journalId);
  };
  return {
    documents,
    meta: {
      ...data,
      exportedAt: 0,
      journals: [],
      notes: data.notes.filter(isUnlinked),
      cards: data.cards.filter(isUnlinked),
      journalVersions: data.journalVersions.filter(isUnlinked),
      attachments: data.attachments.filter(isUnlinked),
      aiConversations: data.aiConversations.filter(isUnlinked),
    },
  };
}

export function combineCategorizedSnapshot(meta: FullData, documents: DocumentJsonPayload[]): FullData {
  return {
    ...emptyData(),
    ...meta,
    journals: documents.map((document) => document.journal),
    notes: [...(meta.notes ?? []), ...documents.flatMap((document) => document.notes ?? [])],
    cards: [...(meta.cards ?? []), ...documents.flatMap((document) => document.cards ?? [])],
    journalVersions: [...(meta.journalVersions ?? []), ...documents.flatMap((document) => document.journalVersions ?? [])],
    attachments: [...(meta.attachments ?? []), ...documents.flatMap((document) => document.attachments ?? [])],
    aiConversations: [...(meta.aiConversations ?? []), ...documents.flatMap((document) => document.aiConversations ?? [])],
  };
}

export interface RemoteSnapshot {
  data: FullData | null;
  commitSha: string;
  format: 'categorized-json' | 'legacy-json' | 'empty';
}

/** 读取分类 JSON；首次升级时若新目录不存在，则兼容读取旧 data.json。 */
export async function readRemoteSnapshot(cfg: SyncConfig): Promise<RemoteSnapshot> {
  const { commitSha, treeSha } = await getHead(cfg);
  const tree = await listTree(cfg, treeSha);
  const meta = tree.find((entry) => entry.path === META_PATH && entry.sha);
  const documents = tree.filter(
    (entry) => entry.sha && entry.path.startsWith(`${DOCUMENT_JSON_ROOT}/`) && entry.path.endsWith('.json') && entry.path !== META_PATH,
  );

  if (meta || documents.length > 0) {
    const base = meta?.sha ? await readBlobJson<FullData>(cfg, meta.sha) : emptyData();
    const payloads = await mapConcurrent(documents, async (entry): Promise<DocumentJsonPayload> => {
      const value = await readBlobJson<DocumentJsonPayload | JournalEntry>(cfg, entry.sha!);
      // 兼容开发预览期间生成的“文档对象直存”格式。
      return 'journal' in value ? value : {
        version: 1,
        exportedAt: Date.now(),
        journal: value,
        notes: [], cards: [], journalVersions: [], attachments: [], aiConversations: [],
      };
    });
    return { data: combineCategorizedSnapshot(base, payloads), commitSha, format: 'categorized-json' };
  }

  const legacy = tree.find((entry) => entry.path === (cfg.path || 'data.json') && entry.sha);
  if (legacy?.sha) {
    return { data: await readBlobJson<FullData>(cfg, legacy.sha), commitSha, format: 'legacy-json' };
  }
  return { data: null, commitSha, format: 'empty' };
}

/**
 * 原子写入分类 JSON。返回 null 表示分支在写入期间变化，调用方应重新拉取并合并。
 * 同一提交会移除旧聚合 data.json、docs/ 和 conversations/，避免留下重复副本。
 */
export async function writeRemoteSnapshot(cfg: SyncConfig, data: FullData, expectedCommitSha: string): Promise<string | null> {
  const current = await getHead(cfg);
  if (current.commitSha !== expectedCommitSha) return null;
  const tree = await listTree(cfg, current.treeSha);
  const changes = new Map<string, TreeEntry>();

  for (const entry of tree) {
    const isManaged =
      entry.path.startsWith(`${DOCUMENT_JSON_ROOT}/`) ||
      entry.path === (cfg.path || 'data.json') ||
      entry.path.startsWith('conversations/');
    if (isManaged && entry.type === 'blob') {
      changes.set(entry.path, { path: entry.path, mode: '100644', type: 'blob', sha: null });
    }
  }
  // 旧版曾把用户文档写到仓库 docs/。只删除带知屿文档 frontmatter 的文件，
  // 保留发布指南、架构说明等普通项目文档。
  const legacyDocs = tree.filter((item) => item.type === 'blob' && item.path.startsWith('docs/') && item.path.endsWith('.md'));
  const legacyFlags = await mapConcurrent(legacyDocs, (entry) => isLegacySyncedJournalMarkdown(cfg, entry));
  for (const [index, entry] of legacyDocs.entries()) {
    if (legacyFlags[index]) {
      changes.set(entry.path, { path: entry.path, mode: '100644', type: 'blob', sha: null });
    }
  }

  const { meta, documents } = splitCategorizedSnapshot(data);
  const existing = new Map(tree.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry.sha]));
  const files = [{ path: META_PATH, value: meta }, ...documents.map((document) => ({ path: documentJsonPath(document.journal), value: document }))];
  await mapConcurrent(files, async ({ path, value }) => {
    const sha = await createBlob(cfg, value, existing.get(path));
    if (sha === existing.get(path)) changes.delete(path);
    else changes.set(path, { path, mode: '100644', type: 'blob', sha });
  });
  if (changes.size === 0) return current.commitSha;

  const newTree = await gh<{ sha: string }>(cfg, 'POST', '/git/trees', {
    base_tree: current.treeSha,
    tree: [...changes.values()],
  });
  const commit = await gh<{ sha: string }>(cfg, 'POST', '/git/commits', {
    tree: newTree.sha,
    parents: [current.commitSha],
    message: `chore(sync): 按分类同步 ${data.journals.length} 篇文档 ${new Date().toISOString()}`,
  });

  try {
    await gh(cfg, 'PATCH', `/git/refs/heads/${encodeURIComponent(cfg.branch)}`, { sha: commit.sha, force: false });
  } catch (error) {
    if ((error as Error).message.includes('422')) return null;
    throw error;
  }
  return commit.sha;
}
