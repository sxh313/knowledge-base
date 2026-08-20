import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 查询层与 db，聚焦测试 impact.ts 的纯逻辑（影响分析、链接修复计划）
const mocks = vi.hoisted(() => ({
  mockGetAllJournals: vi.fn(),
  mockGetBacklinks: vi.fn(),
  mockDbJournalsGet: vi.fn(),
  mockDbJournalsBulkGet: vi.fn(),
  mockDbDocumentLinksWhere: vi.fn(),
  mockDbDocumentLinksToArray: vi.fn(),
  mockDbCardsWhere: vi.fn(),
}));

vi.mock('../db/queries', () => ({
  getAllJournals: mocks.mockGetAllJournals,
  getBacklinks: mocks.mockGetBacklinks,
}));

// 模拟 db.documentLinks.where('targetId').equals(id).toArray() 等链式调用
function makeWhereChain(result: any[]) {
  return {
    equals: () => ({
      toArray: async () => result,
    }),
  };
}

vi.mock('../db/schema', () => ({
  db: {
    journals: {
      get: mocks.mockDbJournalsGet,
      bulkGet: mocks.mockDbJournalsBulkGet,
    },
    documentLinks: {
      where: (field: string) => {
        if (field === 'targetId') return makeWhereChain(mocks.mockDbDocumentLinksWhere('targetId'));
        return makeWhereChain(mocks.mockDbDocumentLinksWhere('sourceId'));
      },
      toArray: async () => mocks.mockDbDocumentLinksToArray(),
    },
    cards: {
      where: () => ({
        equals: () => ({
          toArray: async () => mocks.mockDbCardsWhere(),
        }),
      }),
    },
  },
}));

import { analyzeJournalImpact, buildRenameLinkRepairPlan, repairDocumentLinks, linkRepairPlanToAgentPlan } from './impact';

function makeJournal(overrides: Partial<any> = {}) {
  return {
    id: 'j1',
    title: '测试文档',
    content: '这是测试内容',
    subject: '测试',
    tags: ['tag1'],
    summary: '',
    deletedAt: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockGetBacklinks.mockResolvedValue([]);
  mocks.mockDbDocumentLinksWhere.mockReturnValue([]);
  mocks.mockDbCardsWhere.mockResolvedValue([]);
  mocks.mockDbJournalsBulkGet.mockResolvedValue([]);
  mocks.mockDbDocumentLinksToArray.mockResolvedValue([]);
});

describe('analyzeJournalImpact', () => {
  it('文档不存在时返回 unknown', async () => {
    mocks.mockDbJournalsGet.mockResolvedValue(undefined);
    const impact = await analyzeJournalImpact('missing');
    expect(impact.level).toBe('unknown');
  });

  it('无入链出链卡片时返回 none', async () => {
    mocks.mockDbJournalsGet.mockResolvedValue(makeJournal({ id: 'a' }));
    mocks.mockDbDocumentLinksWhere.mockReturnValue([]);
    mocks.mockDbCardsWhere.mockResolvedValue([]);
    const impact = await analyzeJournalImpact('a');
    expect(impact.level).toBe('none');
    expect(impact.items).toHaveLength(0);
  });

  it('有入链时返回 affected 并列出来源', async () => {
    mocks.mockDbJournalsGet.mockResolvedValue(makeJournal({ id: 'a', title: '目标' }));
    // targetId 查询返回入链
    mocks.mockDbDocumentLinksWhere.mockImplementation((field: string) => {
      if (field === 'targetId') {
        return [{ id: 'l1', sourceId: 'src1', targetId: 'a', targetTitle: '目标', linkText: '目标', broken: false }];
      }
      return [];
    });
    mocks.mockDbJournalsBulkGet.mockResolvedValue([makeJournal({ id: 'src1', title: '来源文档' })]);
    mocks.mockDbCardsWhere.mockResolvedValue([]);
    const impact = await analyzeJournalImpact('a');
    expect(impact.level).toBe('affected');
    expect(impact.items.some((i) => i.kind === 'backlink')).toBe(true);
  });

  it('有出链时返回 affected', async () => {
    mocks.mockDbJournalsGet.mockResolvedValue(makeJournal({ id: 'a', title: '源' }));
    mocks.mockDbDocumentLinksWhere.mockImplementation((field: string) => {
      if (field === 'sourceId') {
        return [{ id: 'l1', sourceId: 'a', targetId: 'b', targetTitle: '目标B', linkText: '目标B', broken: false }];
      }
      return [];
    });
    mocks.mockDbCardsWhere.mockResolvedValue([]);
    const impact = await analyzeJournalImpact('a');
    expect(impact.level).toBe('affected');
    expect(impact.items.some((i) => i.kind === 'broken-link')).toBe(true);
  });

  it('有卡片关联时返回 affected', async () => {
    mocks.mockDbJournalsGet.mockResolvedValue(makeJournal({ id: 'a', title: '目标' }));
    mocks.mockDbDocumentLinksWhere.mockReturnValue([]);
    mocks.mockDbCardsWhere.mockResolvedValue([{ id: 'c1', journalId: 'a', cardType: 'basic', front: '问题' }]);
    const impact = await analyzeJournalImpact('a');
    expect(impact.level).toBe('affected');
    expect(impact.items.some((i) => i.kind === 'card')).toBe(true);
  });
});

describe('buildRenameLinkRepairPlan', () => {
  it('生成重命名后的链接修复计划', async () => {
    mocks.mockDbJournalsGet.mockResolvedValue(makeJournal({ id: 'a', title: '旧标题' }));
    mocks.mockDbDocumentLinksWhere.mockImplementation((field: string) => {
      if (field === 'targetId') {
        return [{ id: 'l1', sourceId: 'src1', targetId: 'a', targetTitle: '旧标题', linkText: '旧标题', broken: false }];
      }
      return [];
    });
    mocks.mockDbJournalsBulkGet.mockResolvedValue([makeJournal({ id: 'src1', title: '来源' })]);
    const plan = await buildRenameLinkRepairPlan('a', '新标题');
    expect(plan.oldTitle).toBe('旧标题');
    expect(plan.newTitle).toBe('新标题');
    expect(plan.repairs).toHaveLength(1);
    expect(plan.repairs[0].newLinkText).toBe('新标题');
  });
});

describe('repairDocumentLinks', () => {
  it('无失效链接时返回空计划', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([makeJournal({ id: 'a', title: '目标' })]);
    mocks.mockDbDocumentLinksToArray.mockResolvedValue([]);
    const plan = await repairDocumentLinks();
    expect(plan.total).toBe(0);
    expect(plan.autoFixable).toBe(0);
  });

  it('失效链接能匹配到现有文档时标记为可自动修复', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({ id: 'a', title: '目标文档' }),
      makeJournal({ id: 'b', title: '来源文档' }),
    ]);
    mocks.mockDbDocumentLinksToArray.mockResolvedValue([
      { id: 'l1', sourceId: 'b', targetId: undefined, targetTitle: '目标文档', linkText: '目标文档', broken: true },
    ]);
    mocks.mockDbJournalsBulkGet.mockResolvedValue([makeJournal({ id: 'b', title: '来源文档' })]);
    const plan = await repairDocumentLinks();
    expect(plan.total).toBe(1);
    expect(plan.autoFixable).toBe(1);
    expect(plan.items[0].autoFixable).toBe(true);
    expect(plan.items[0].newLinkText).toBe('目标文档');
  });

  it('无法匹配的失效链接标记为需人工确认', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([makeJournal({ id: 'a', title: '目标文档' })]);
    mocks.mockDbDocumentLinksToArray.mockResolvedValue([
      { id: 'l1', sourceId: 'a', targetId: undefined, targetTitle: '不存在的文档', linkText: '不存在的文档', broken: true },
    ]);
    mocks.mockDbJournalsBulkGet.mockResolvedValue([makeJournal({ id: 'a', title: '目标文档' })]);
    const plan = await repairDocumentLinks();
    expect(plan.total).toBe(1);
    expect(plan.manualCount).toBe(1);
    expect(plan.items[0].autoFixable).toBe(false);
  });

  it('别名匹配的失效链接可自动修复', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({ id: 'a', title: '正式标题', aliases: ['别名A'] }),
    ]);
    mocks.mockDbDocumentLinksToArray.mockResolvedValue([
      { id: 'l1', sourceId: 'a', targetId: undefined, targetTitle: '别名A', linkText: '别名A', broken: true },
    ]);
    mocks.mockDbJournalsBulkGet.mockResolvedValue([makeJournal({ id: 'a', title: '正式标题' })]);
    const plan = await repairDocumentLinks();
    expect(plan.total).toBe(1);
    expect(plan.autoFixable).toBe(1);
    expect(plan.items[0].newLinkText).toBe('正式标题');
  });

  it('同名/别名冲突不生成自动修复计划', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({ id: 'a', title: '文档A', aliases: ['旧名'] }),
      makeJournal({ id: 'b', title: '文档B', aliases: ['旧名'] }),
    ]);
    mocks.mockDbDocumentLinksToArray.mockResolvedValue([{ id: 'l1', sourceId: 'a', targetTitle: '旧名', linkText: '旧名', broken: true }]);
    mocks.mockDbJournalsBulkGet.mockResolvedValue([makeJournal({ id: 'a', title: '文档A' })]);
    const plan = await repairDocumentLinks();
    expect(plan.manualCount).toBe(1);
    expect(linkRepairPlanToAgentPlan(plan).ops).toHaveLength(0);
  });
});
