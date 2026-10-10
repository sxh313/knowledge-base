import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalEntry, SyncConfig } from '../db/schema';
import type { FullData } from './merge';
import {
  combineCategorizedSnapshot,
  documentJsonPath,
  safePathSegment,
  splitCategorizedSnapshot,
  readRemoteSnapshot,
  writeRemoteSnapshot,
} from './categorizedJsonSync';

const journal = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'doc-1',
  title: '同步设计',
  content: '# 正文',
  contentPlain: '正文',
  tags: [],
  subject: '工作/项目',
  sourceType: 'manual',
  createdAt: 1,
  updatedAt: 2,
  ...overrides,
});

const cfg: SyncConfig = { enabled: true, owner: 'owner', repo: 'repo', branch: 'main', path: 'data.json', token: 'test', autoSync: false };
const blobSha = (value: unknown) => {
  const json = JSON.stringify(value, null, 2);
  return createHash('sha1').update(`blob ${Buffer.byteLength(json)}\0${json}`).digest('hex');
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('GitHub snapshot requests', () => {
  it('does not upload or commit unchanged Unicode documents even with a new export timestamp', async () => {
    const data = snapshot();
    const { meta, documents } = splitCategorizedSnapshot(data);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/git/ref/')) return Response.json({ object: { sha: 'head' } });
      if (url.includes('/git/commits/')) return Response.json({ tree: { sha: 'tree' } });
      if (url.includes('/git/trees/')) return Response.json({ tree: [
        { path: 'documents-json/_meta/data.json', type: 'blob', sha: blobSha(meta) },
        { path: documentJsonPath(documents[0].journal), type: 'blob', sha: blobSha(documents[0]) },
      ] });
      throw new Error(`Unexpected upload: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await writeRemoteSnapshot(cfg, { ...data, exportedAt: Date.now() }, 'head')).toBe('head');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uploads only a changed document and atomically removes its old category path', async () => {
    const data = snapshot();
    const { meta, documents } = splitCategorizedSnapshot(data);
    const oldPath = documentJsonPath(documents[0].journal);
    const newJournal = journal({ subject: '学习', content: '# 新正文' });
    let treeChanges: unknown;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/git/ref/')) return Response.json({ object: { sha: 'head' } });
      if (url.endsWith('/git/commits/head')) return Response.json({ tree: { sha: 'tree' } });
      if (url.includes('/git/trees/tree')) return Response.json({ tree: [
        { path: 'documents-json/_meta/data.json', type: 'blob', sha: blobSha(meta) },
        { path: oldPath, type: 'blob', sha: blobSha(documents[0]) },
      ] });
      if (url.endsWith('/git/blobs')) return Response.json({ sha: 'new-blob' });
      if (url.endsWith('/git/trees')) {
        treeChanges = JSON.parse(String(init?.body)).tree;
        return Response.json({ sha: 'new-tree' });
      }
      if (url.endsWith('/git/commits')) return Response.json({ sha: 'new-head' });
      if (url.includes('/git/refs/')) return Response.json({});
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await writeRemoteSnapshot(cfg, { ...data, journals: [newJournal] }, 'head')).toBe('new-head');
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/git/blobs'))).toHaveLength(1);
    expect(treeChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: oldPath, sha: null }),
      expect.objectContaining({ path: documentJsonPath(newJournal), sha: 'new-blob' }),
    ]));
    expect(treeChanges).toHaveLength(2);
  });

  it('rejects a truncated tree before uploading or merging an incomplete snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/git/ref/')) return Response.json({ object: { sha: 'head' } });
      if (url.includes('/git/commits/')) return Response.json({ tree: { sha: 'tree' } });
      return Response.json({ tree: [], truncated: true });
    }));
    await expect(readRemoteSnapshot(cfg)).rejects.toThrow('无法完整读取');
    await expect(writeRemoteSnapshot(cfg, snapshot(), 'head')).rejects.toThrow('无法完整读取');
  });

  it('ends a stalled request after 30 seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const pending = expect(readRemoteSnapshot(cfg)).rejects.toThrow('超时（30 秒）');
    await vi.advanceTimersByTimeAsync(30_000);
    await pending;
  });
});

const snapshot = (): FullData => ({
  version: 5,
  exportedAt: 0,
  journals: [journal()],
  notes: [{ id: 'note-1', journalId: 'doc-1' }],
  cards: [{ id: 'card-1', journalId: 'doc-1' }, { id: 'global-card' }],
  graphNodes: [],
  graphEdges: [],
  aiConversations: [{ id: 'conversation-1', journalId: 'doc-1' }, { id: 'global-conversation' }],
  savedSearches: [],
  journalVersions: [{ id: 'version-1', journalId: 'doc-1' }],
  propertyDefinitions: [],
  categories: [{ id: 'category-1', name: '工作/项目' }],
  attachments: [{ id: 'attachment-1', journalId: 'doc-1' }],
  userPreferences: [],
  learningGoals: [],
  learningTasks: [],
});

describe('categorized document JSON sync', () => {
  it('uses a safe category directory and stable document id in the filename', () => {
    expect(documentJsonPath(journal())).toBe('documents-json/工作_项目/同步设计--doc-1.json');
    expect(documentJsonPath(journal({ id: 'doc-2', subject: '', title: '' }))).toBe('documents-json/未分类/无标题--doc-2.json');
    expect(documentJsonPath(journal({ id: 'doc-2' }))).not.toBe(documentJsonPath(journal()));
    expect(safePathSegment(' ../A:B\\C.. ', 'fallback')).toBe('_A_B_C');
  });

  it('stores document-linked records in the same JSON package and restores them losslessly', () => {
    const original = snapshot();
    const { meta, documents } = splitCategorizedSnapshot(original);

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      journal: { id: 'doc-1' },
      notes: [{ id: 'note-1', journalId: 'doc-1' }],
      cards: [{ id: 'card-1', journalId: 'doc-1' }],
      journalVersions: [{ id: 'version-1', journalId: 'doc-1' }],
      attachments: [{ id: 'attachment-1', journalId: 'doc-1' }],
      aiConversations: [{ id: 'conversation-1', journalId: 'doc-1' }],
    });
    expect(meta.journals).toEqual([]);
    expect(meta.cards).toEqual([{ id: 'global-card' }]);
    expect(meta.aiConversations).toEqual([{ id: 'global-conversation' }]);

    const restored = combineCategorizedSnapshot(meta, documents);
    expect(restored.journals).toEqual(original.journals);
    const byId = (rows: unknown[]) => [...rows].sort((a, b) => String((a as { id?: string }).id).localeCompare(String((b as { id?: string }).id)));
    expect(byId(restored.notes)).toEqual(byId(original.notes));
    expect(byId(restored.cards)).toEqual(byId(original.cards));
    expect(byId(restored.journalVersions)).toEqual(byId(original.journalVersions));
    expect(byId(restored.attachments)).toEqual(byId(original.attachments));
    expect(byId(restored.aiConversations)).toEqual(byId(original.aiConversations));
  });
});
