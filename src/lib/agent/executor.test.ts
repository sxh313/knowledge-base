import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Dexie db 与查询层，聚焦测试 executor 的防重复、hash 校验与事务回滚逻辑
const mocks = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockJournals: { filter: vi.fn(), toArray: vi.fn() },
  mockGetJournal: vi.fn(),
  mockUpdateJournal: vi.fn(),
  mockSaveVersion: vi.fn(),
  mockDeleteJournal: vi.fn(),
  mockCreateCard: vi.fn(),
  mockCalculateContentHash: vi.fn(),
}));

vi.mock('../db/schema', () => ({
  db: {
    journals: mocks.mockJournals,
    journalVersions: {},
    cards: {},
    transaction: mocks.mockTransaction,
  },
}));

vi.mock('../db/queries', () => ({
  getJournal: mocks.mockGetJournal,
  updateJournal: mocks.mockUpdateJournal,
  saveVersion: mocks.mockSaveVersion,
  deleteJournal: mocks.mockDeleteJournal,
  createCard: mocks.mockCreateCard,
  createJournal: vi.fn(),
}));

vi.mock('../indexing/documents', () => ({
  normalizeMarkdown: (s: string) => s,
  calculateContentHash: mocks.mockCalculateContentHash,
}));

import { applyPlan, undoRun, searchJournals } from './executor';
import type { AgentPlan } from './tools';

function makeJournal(id: string, title: string, content: string) {
  return {
    id,
    title,
    content,
    contentPlain: content,
    tags: [],
    subject: '',
    sourceType: 'manual' as const,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('applyPlan 防重复执行', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockTransaction.mockImplementation(async (_mode, _tables, fn) => fn());
  });

  it('同一 planId 重复执行时第二次被拒绝', async () => {
    mocks.mockGetJournal.mockResolvedValue(makeJournal('1', '标题', '内容'));
    mocks.mockCalculateContentHash.mockResolvedValue('hash1');
    const plan: AgentPlan = {
      planId: 'plan-1',
      ops: [{ opId: 'plan-1:0', type: 'edit', journalId: '1', content: '新内容', expectedHash: 'hash1' }],
    };

    const first = await applyPlan(plan);
    expect(first.hasError).toBe(false);
    expect(mocks.mockUpdateJournal).toHaveBeenCalledTimes(1);

    const second = await applyPlan(plan);
    expect(second.hasError).toBe(true);
    expect(second.results[0].error).toContain('已执行过');
    expect(mocks.mockUpdateJournal).toHaveBeenCalledTimes(1); // 第二次未写入
  });
});

describe('applyPlan 事务回滚', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('事务抛错时整体回滚并返回失败结果', async () => {
    mocks.mockTransaction.mockRejectedValue(new Error('db locked'));
    const plan: AgentPlan = {
      planId: 'plan-2',
      ops: [{ opId: 'plan-2:0', type: 'create', newTitle: 't', content: 'x' }],
    };
    const result = await applyPlan(plan);
    expect(result.hasError).toBe(true);
    expect(result.results[0].error).toContain('整体回滚');
  });
});

describe('applyPlan hash 校验', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockTransaction.mockImplementation(async (_mode, _tables, fn) => fn());
  });

  it('目标文档 hash 与计划不一致时拒绝执行', async () => {
    mocks.mockGetJournal.mockResolvedValue(makeJournal('1', '标题', '内容'));
    mocks.mockCalculateContentHash.mockResolvedValue('different-hash');
    const plan: AgentPlan = {
      planId: 'plan-3',
      ops: [{ opId: 'plan-3:0', type: 'edit', journalId: '1', content: '新内容', expectedHash: 'expected-hash' }],
    };
    const result = await applyPlan(plan);
    expect(result.hasError).toBe(true);
    expect(result.results[0].error).toContain('已被修改');
    expect(mocks.mockUpdateJournal).not.toHaveBeenCalled();
  });

  it('目标文档 hash 一致时正常执行', async () => {
    mocks.mockGetJournal.mockResolvedValue(makeJournal('1', '标题', '内容'));
    mocks.mockCalculateContentHash.mockResolvedValue('same-hash');
    const plan: AgentPlan = {
      planId: 'plan-4',
      ops: [{ opId: 'plan-4:0', type: 'edit', journalId: '1', content: '新内容', expectedHash: 'same-hash' }],
    };
    const result = await applyPlan(plan);
    expect(result.hasError).toBe(false);
    expect(mocks.mockUpdateJournal).toHaveBeenCalledTimes(1);
  });
});

describe('applyPlan 逐项批准', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockTransaction.mockImplementation(async (_mode, _tables, fn) => fn());
  });

  it('只执行被批准的 opId，未批准的标记为 skipped', async () => {
    mocks.mockGetJournal.mockResolvedValue(makeJournal('1', '标题', '内容'));
    mocks.mockCalculateContentHash.mockResolvedValue('hash1');
    const plan: AgentPlan = {
      planId: 'plan-5',
      ops: [
        { opId: 'plan-5:0', type: 'edit', journalId: '1', content: 'A', expectedHash: 'hash1' },
        { opId: 'plan-5:1', type: 'edit', journalId: '1', content: 'B', expectedHash: 'hash1' },
      ],
    };
    const approved = new Set(['plan-5:0']);
    const result = await applyPlan(plan, approved);
    expect(result.hasError).toBe(false);
    // 只执行了第一个操作
    expect(mocks.mockUpdateJournal).toHaveBeenCalledTimes(1);
    // 第二个操作被跳过
    const skipped = result.results.find((r) => r.op.opId === 'plan-5:1');
    expect(skipped?.skipped).toBe(true);
  });
});

describe('rename/delete/move/tags operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockTransaction.mockImplementation(async (_mode, _tables, fn) => fn());
    mocks.mockGetJournal.mockResolvedValue(makeJournal('1', '标题', '内容'));
    mocks.mockCalculateContentHash.mockResolvedValue('hash1');
  });

  it('executes metadata and delete operations through the transaction', async () => {
    const plan: AgentPlan = { planId: 'plan-crud', ops: [
      { opId: 'crud:1', type: 'rename', journalId: '1', newName: '新标题', expectedHash: 'hash1' },
      { opId: 'crud:2', type: 'move', journalId: '1', newSubject: '新分类', expectedHash: 'hash1' },
      { opId: 'crud:3', type: 'addTags', journalId: '1', tags: ['A'], expectedHash: 'hash1' },
      { opId: 'crud:4', type: 'removeTags', journalId: '1', tags: ['A'], expectedHash: 'hash1' },
      { opId: 'crud:5', type: 'delete', journalId: '1', expectedHash: 'hash1' },
    ] };
    const result = await applyPlan(plan);
    expect(result.hasError).toBe(false);
    expect(mocks.mockUpdateJournal).toHaveBeenCalledWith('1', { title: '新标题' });
    expect(mocks.mockUpdateJournal).toHaveBeenCalledWith('1', { subject: '新分类' });
    expect(mocks.mockDeleteJournal).toHaveBeenCalledWith('1');
  });
});

describe('undoRun 撤销本次运行', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockTransaction.mockImplementation(async (_mode, _tables, fn) => fn());
  });

  it('恢复被修改文档的版本快照，并删除新建文档', async () => {
    mocks.mockGetJournal.mockImplementation(async (id: string) =>
      id === '1' ? makeJournal('1', '新标题', '新内容') : makeJournal('2', '新建', '内容'),
    );
    const undo = {
      planId: 'plan-6',
      versions: [{ journalId: '1', title: '旧标题', content: '旧内容' }],
      createdJournalIds: ['2'],
    };
    const result = await undoRun(undo);
    expect(result.restored).toBe(1);
    expect(result.deleted).toBe(1);
    // 恢复：updateJournal 被调用一次（恢复文档1）
    expect(mocks.mockUpdateJournal).toHaveBeenCalledWith('1', { title: '旧标题', content: '旧内容' });
    // 删除：deleteJournal 被调用一次（删除文档2）
    expect(mocks.mockDeleteJournal).toHaveBeenCalledWith('2');
  });
});

describe('searchJournals 结构化搜索', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('返回带来源引用的结构化命中（含章节与匹配片段）', async () => {
    mocks.mockJournals.filter.mockReturnValue({
      toArray: async () => [
        makeJournal('1', 'React 入门', '# Hooks\nuseState 是 React 的核心 Hook'),
        makeJournal('2', 'Vue 入门', 'Vue 是渐进式框架'),
      ],
    });
    const hits = await searchJournals('React');
    expect(hits.length).toBe(1);
    expect(hits[0].journalId).toBe('1');
    expect(hits[0].title).toBe('React 入门');
    expect(hits[0].heading).toBe('Hooks');
    expect(hits[0].snippet).toContain('useState');
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('空查询返回空数组', async () => {
    const hits = await searchJournals('   ');
    expect(hits).toEqual([]);
  });

  it('无命中时返回空数组', async () => {
    mocks.mockJournals.filter.mockReturnValue({
      toArray: async () => [makeJournal('1', 'React 入门', '内容')],
    });
    const hits = await searchJournals('不存在的词xyz');
    expect(hits).toEqual([]);
  });
});
