// 基于 GitHub Git Data API 的「每篇文档一个 .md」同步（方案B）
// 文档存放目录：docs/（每个文档一个 .md，带 YAML frontmatter：id/标题/分类/标签/时间/contentHash 等）
// 设计：推送时用 Git Data API 一次提交整目录覆盖（增/改/删/重命名一并处理），保持 docs/ 与本地一致。

import type { SyncConfig, JournalEntry, AIConversation } from '../db/schema';
import { db } from '../db/schema';

const API = 'https://api.github.com';
const DOCS_DIR = 'docs';

function b64encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
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

function safeFilename(title: string): string {
  const t = (title || '无标题').replace(/[\\/:*?"<>|\n\r\t]+/g, '_').replace(/\s+/g, ' ').trim();
  return t.slice(0, 80) || '无标题';
}

/** 把文档序列化为 frontmatter + 正文 */
export function journalToMarkdown(j: JournalEntry): string {
  const fm: string[] = ['---'];
  fm.push(`id: ${j.id}`);
  fm.push(`title: ${JSON.stringify(j.title || '无标题')}`);
  if (j.subject) fm.push(`subject: ${JSON.stringify(j.subject)}`);
  if (j.tags?.length) fm.push(`tags: [${j.tags.map((t) => JSON.stringify(t)).join(', ')}]`);
  if (j.aliases?.length) fm.push(`aliases: [${j.aliases.map((a) => JSON.stringify(a)).join(', ')}]`);
  if (j.status && j.status !== 'active') fm.push(`status: ${j.status}`);
  fm.push(`createdAt: ${new Date(j.createdAt).toISOString()}`);
  fm.push(`updatedAt: ${new Date(j.updatedAt).toISOString()}`);
  if (j.contentHash) fm.push(`contentHash: ${j.contentHash}`);
  if (j.pinned) fm.push('pinned: true');
  if (j.sourceRef?.url) fm.push(`sourceUrl: ${JSON.stringify(j.sourceRef.url)}`);
  fm.push('---', '');
  return fm.join('\n') + (j.content || '');
}

/** 解析 .md（frontmatter + 正文）→ 部分还原 JournalEntry 字段（供拉取用） */
export function parseJournalMarkdown(md: string): Partial<JournalEntry> & { id?: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { content: md };
  const meta: Record<string, unknown> = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^(\w+):\s*(.*)$/);
    if (!mm) continue;
    const raw = mm[2].trim();
    let val: unknown = raw;
    if (raw.startsWith('[') && raw.endsWith(']')) {
      val = raw.slice(1, -1).split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    } else if (/^".*"$/.test(raw)) {
      val = raw.slice(1, -1);
    } else if (/^-?\d+$/.test(raw)) {
      val = Number(raw);
    } else if (raw === 'true') val = true;
    else if (raw === 'false') val = false;
    meta[mm[1]] = val;
  }
  const r: Partial<JournalEntry> & { id?: string } = { content: m[2] };
  if (meta.id) r.id = String(meta.id);
  if (meta.title) r.title = String(meta.title);
  if (meta.subject) r.subject = String(meta.subject);
  if (Array.isArray(meta.tags)) r.tags = meta.tags as string[];
  if (Array.isArray(meta.aliases)) r.aliases = meta.aliases as string[];
  if (meta.status) r.status = String(meta.status) as JournalEntry['status'];
  if (meta.createdAt) r.createdAt = new Date(String(meta.createdAt)).getTime() || undefined;
  if (meta.updatedAt) r.updatedAt = new Date(String(meta.updatedAt)).getTime() || undefined;
  if (meta.contentHash) r.contentHash = String(meta.contentHash);
  if (meta.pinned) r.pinned = true;
  if (meta.sourceUrl) r.sourceRef = { url: String(meta.sourceUrl) };
  return r;
}

// ── Git Data API ──
interface TreeEntry { path: string; mode: string; type: string; sha: string | null }

async function gh<T>(cfg: SyncConfig, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${repoBase(cfg)}${path}`, {
    method,
    headers: headers(cfg.token),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GitHub ${method} ${path} 失败: HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  // 204 或空 body
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function getBranchSha(cfg: SyncConfig): Promise<string> {
  const r = await gh<{ object: { sha: string } }>(cfg, 'GET', `/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
  return r.object.sha;
}
async function getCommitTreeSha(cfg: SyncConfig, commitSha: string): Promise<string> {
  const r = await gh<{ tree: { sha: string } }>(cfg, 'GET', `/git/commits/${commitSha}`);
  return r.tree.sha;
}
async function listTree(cfg: SyncConfig, treeSha: string): Promise<TreeEntry[]> {
  const r = await gh<{ tree: TreeEntry[] }>(cfg, 'GET', `/git/trees/${treeSha}?recursive=1`);
  return r.tree ?? [];
}
async function createBlob(cfg: SyncConfig, contentB64: string): Promise<string> {
  const r = await gh<{ sha: string }>(cfg, 'POST', `/git/blobs`, { content: contentB64, encoding: 'base64' });
  return r.sha;
}
async function createTree(cfg: SyncConfig, baseTreeSha: string, entries: TreeEntry[]): Promise<string> {
  const r = await gh<{ sha: string }>(cfg, 'POST', `/git/trees`, { base_tree: baseTreeSha, tree: entries });
  return r.sha;
}
async function createCommit(cfg: SyncConfig, treeSha: string, parentSha: string, message: string): Promise<string> {
  const r = await gh<{ sha: string }>(cfg, 'POST', `/git/commits`, { tree: treeSha, parents: [parentSha], message });
  return r.sha;
}
async function updateRef(cfg: SyncConfig, sha: string): Promise<void> {
  await gh(cfg, 'PATCH', `/git/ref/heads/${encodeURIComponent(cfg.branch)}`, { sha });
}

/**
 * 推送：把所有未删除文档写成 docs/*.md，整目录覆盖提交（增/改/删/重命名一并处理）。
 * 用 Git Data API 一次提交完成。返回写入的文档数。
 */
export async function pushJournalsAsMarkdown(cfg: SyncConfig): Promise<{ pushed: number; commitSha: string }> {
  if (!cfg?.token || !cfg.owner || !cfg.repo) throw new Error('未配置同步 Token/仓库');
  const journals = await db.journals.filter((j) => !j.deletedAt).toArray();
  // 增量优化：若所有文档 contentHash 与上次同步基线一致，且无文档被删除，则跳过推送（避免无谓的 Git Data API 调用）
  const baseline = cfg.baselineHashes ?? {};
  const journalIds = new Set(journals.map((j) => j.id));
  const hasContentChange = journals.some((j) => (j.contentHash ?? '') !== (baseline[j.id] ?? ''));
  const hasRemoval = Object.keys(baseline).some((id) => !journalIds.has(id));
  if (!hasContentChange && !hasRemoval) {
    return { pushed: 0, commitSha: '' };
  }
  const commitSha = await getBranchSha(cfg);
  const baseTreeSha = await getCommitTreeSha(cfg, commitSha);

  // 已有 docs/*.md → 全部标记删除（随后用本地最新重建，确保目录与本地完全一致）
  const existing = (await listTree(cfg, baseTreeSha)).filter(
    (e) => e.path.startsWith(`${DOCS_DIR}/`) && e.path.endsWith('.md'),
  );
  const entries: TreeEntry[] = existing.map((e) => ({ path: e.path, mode: '100644', type: 'blob', sha: null }));

  // 写入本地文档（标题去重）
  const used = new Map<string, number>();
  for (const j of journals) {
    let name = safeFilename(j.title);
    if (used.has(name)) {
      const n = (used.get(name) ?? 1) + 1;
      used.set(name, n);
      name = `${name}-${n}`;
    } else {
      used.set(name, 1);
    }
    const sha = await createBlob(cfg, b64encode(journalToMarkdown(j)));
    entries.push({ path: `${DOCS_DIR}/${name}.md`, mode: '100644', type: 'blob', sha });
  }

  if (entries.length === 0) return { pushed: 0, commitSha };
  const newTreeSha = await createTree(cfg, baseTreeSha, entries);
  const newCommitSha = await createCommit(cfg, newTreeSha, commitSha, `docs(sync): 推送 ${journals.length} 篇文档 ${new Date().toISOString()}`);
  await updateRef(cfg, newCommitSha);
  return { pushed: journals.length, commitSha: newCommitSha };
}

const CONV_DIR = 'conversations';

function conversationToMarkdown(c: AIConversation): string {
  const fm: string[] = ['---'];
  fm.push(`id: ${c.id}`);
  fm.push(`model: ${c.model || 'auto'}`);
  fm.push(`createdAt: ${new Date(c.createdAt).toISOString()}`);
  if (c.journalId) fm.push(`journalId: ${c.journalId}`);
  fm.push('---', '');
  for (const m of c.messages) {
    if (m.role === 'system') continue;
    fm.push(`## ${m.role === 'user' ? '👤 用户' : '🤖 助手'}`, '', m.content, '');
  }
  return fm.join('\n');
}

/** 推送 AI 对话为 conversations/*.md（每条对话一个文件） */
export async function pushConversationsAsMarkdown(cfg: SyncConfig): Promise<{ pushed: number }> {
  if (!cfg?.token || !cfg.owner || !cfg.repo) throw new Error('未配置同步 Token/仓库');
  const convs = await db.aiConversations.toArray();
  const commitSha = await getBranchSha(cfg);
  const baseTreeSha = await getCommitTreeSha(cfg, commitSha);
  const existing = (await listTree(cfg, baseTreeSha)).filter((e) => e.path.startsWith(`${CONV_DIR}/`) && e.path.endsWith('.md'));
  const entries: TreeEntry[] = existing.map((e) => ({ path: e.path, mode: '100644', type: 'blob', sha: null }));
  const used = new Map<string, number>();
  for (const c of convs) {
    const firstUser = c.messages.find((m) => m.role === 'user');
    let name = safeFilename(firstUser?.content || '新对话');
    if (used.has(name)) { const n = (used.get(name) ?? 1) + 1; used.set(name, n); name = `${name}-${n}`; } else used.set(name, 1);
    const sha = await createBlob(cfg, b64encode(conversationToMarkdown(c)));
    entries.push({ path: `${CONV_DIR}/${name}.md`, mode: '100644', type: 'blob', sha });
  }
  if (entries.length === 0) return { pushed: 0 };
  const newTreeSha = await createTree(cfg, baseTreeSha, entries);
  const newCommitSha = await createCommit(cfg, newTreeSha, commitSha, `conversations(sync): 推送 ${convs.length} 条对话 ${new Date().toISOString()}`);
  await updateRef(cfg, newCommitSha);
  return { pushed: convs.length };
}

/**
 * 拉取：读取远端 docs/*.md，解析为文档数组（按 id）。供后续合并用。
 */
export async function pullJournalsFromMarkdown(cfg: SyncConfig): Promise<(Partial<JournalEntry> & { id: string })[]> {
  if (!cfg?.token || !cfg.owner || !cfg.repo) throw new Error('未配置同步 Token/仓库');
  const commitSha = await getBranchSha(cfg);
  const treeSha = await getCommitTreeSha(cfg, commitSha);
  const entries = (await listTree(cfg, treeSha)).filter(
    (e) => e.path.startsWith(`${DOCS_DIR}/`) && e.path.endsWith('.md') && e.sha,
  );
  const out: (Partial<JournalEntry> & { id: string })[] = [];
  for (const e of entries) {
    const blob = await gh<{ content: string }>(cfg, 'GET', `/git/blobs/${e.sha}`);
    const md = decodeURIComponent(escape(atob((blob.content || '').replace(/\s/g, ''))));
    const parsed = parseJournalMarkdown(md);
    if (parsed.id) out.push({ ...parsed, id: parsed.id } as Partial<JournalEntry> & { id: string });
  }
  return out;
}
