import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 查询层，聚焦测试 quality.ts 的纯逻辑（相似度、查重、质量检查、学习计划）
const mocks = vi.hoisted(() => ({
  mockGetAllJournals: vi.fn(),
  mockGetBacklinks: vi.fn(),
  mockGetBrokenOutgoingLinks: vi.fn(),
  mockGetAllCards: vi.fn(),
}));

vi.mock('../db/queries', () => ({
  getAllJournals: mocks.mockGetAllJournals,
  getBacklinks: mocks.mockGetBacklinks,
  getBrokenOutgoingLinks: mocks.mockGetBrokenOutgoingLinks,
  getAllCards: mocks.mockGetAllCards,
}));

import {
  textSimilarity,
  findDuplicateJournals,
  reviewJournalQuality,
  createStudyPlanSuggestion,
  suggestQualityFixes,
} from './quality';

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
  mocks.mockGetBrokenOutgoingLinks.mockResolvedValue([]);
  mocks.mockGetAllCards.mockResolvedValue([]);
});

describe('textSimilarity', () => {
  it('空字符串返回 0', () => {
    expect(textSimilarity('', 'abc')).toBe(0);
    expect(textSimilarity('abc', '')).toBe(0);
  });

  it('完全相同返回 1', () => {
    expect(textSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('标题包含关系返回高相似度', () => {
    expect(textSimilarity('React 入门', 'React 入门教程')).toBeGreaterThan(0.8);
  });

  it('完全无关返回低相似度', () => {
    expect(textSimilarity('苹果', '香蕉')).toBeLessThan(0.5);
  });
});

describe('findDuplicateJournals', () => {
  it('无重复时返回空数组', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({ id: 'a', title: '苹果', content: '关于苹果的内容' }),
      makeJournal({ id: 'b', title: '香蕉', content: '关于香蕉的内容' }),
    ]);
    const groups = await findDuplicateJournals();
    expect(groups).toEqual([]);
  });

  it('标题相同归为一组并给出保留建议', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({ id: 'a', title: 'React 入门', content: '短内容' }),
      makeJournal({ id: 'b', title: 'React 入门', content: '这是一段非常长的内容，用于测试保留建议' }),
    ]);
    const groups = await findDuplicateJournals();
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    // 保留内容更长的文档
    expect(groups[0].keepId).toBe('b');
    expect(groups[0].suggestion).toContain('建议保留');
  });
});

describe('reviewJournalQuality', () => {
  it('空标题与空内容被标记', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({ id: 'a', title: '', content: '' }),
    ]);
    const issues = await reviewJournalQuality();
    const types = issues.map((i) => i.type);
    expect(types).toContain('empty-title');
    expect(types).toContain('empty-content');
  });

  it('长内容无摘要被标记为 info', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({ id: 'a', title: '长文档', content: 'x'.repeat(300), summary: '' }),
    ]);
    const issues = await reviewJournalQuality();
    expect(issues.some((i) => i.type === 'no-summary')).toBe(true);
  });

  it('孤立文档被标记', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([makeJournal({ id: 'a' })]);
    mocks.mockGetBacklinks.mockResolvedValue([]);
    const issues = await reviewJournalQuality();
    expect(issues.some((i) => i.type === 'orphan')).toBe(true);
  });

  it('失效链接被标记', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([makeJournal({ id: 'a' })]);
    mocks.mockGetBrokenOutgoingLinks.mockResolvedValue([{ id: 'x' }]);
    const issues = await reviewJournalQuality();
    expect(issues.some((i) => i.type === 'broken-link')).toBe(true);
  });
});

describe('createStudyPlanSuggestion', () => {
  it('有待复习卡片的文档排在最前', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({ id: 'a', title: '有卡片', content: '内容' }),
      makeJournal({ id: 'b', title: '无卡片', content: '内容' }),
    ]);
    mocks.mockGetAllCards.mockResolvedValue([
      { journalId: 'a', nextReviewAt: Date.now() - 1000 },
    ]);
    const plan = await createStudyPlanSuggestion();
    expect(plan[0].journalId).toBe('a');
    expect(plan[0].reviewInDays).toBe(0);
  });

  it('长内容无卡片建议整理', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({ id: 'a', title: '长文', content: 'x'.repeat(600), tags: [] }),
    ]);
    mocks.mockGetAllCards.mockResolvedValue([]);
    const plan = await createStudyPlanSuggestion();
    expect(plan[0].reviewInDays).toBe(3);
  });
});

describe('suggestQualityFixes', () => {
  it('长内容无摘要时生成低风险摘要修复建议', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({
        id: 'a',
        title: '测试文档',
        content: '这是第一句。这是第二句。这是第三句。'.repeat(30),
        summary: '',
      }),
    ]);
    mocks.mockGetBrokenOutgoingLinks.mockResolvedValue([]);
    const fixes = await suggestQualityFixes();
    const summaryFix = fixes.find((f) => f.field === 'summary');
    expect(summaryFix).toBeDefined();
    expect(summaryFix!.risk).toBe('low');
    expect(summaryFix!.after.length).toBeGreaterThan(0);
  });

  it('无标签文档生成标签修复建议', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({
        id: 'a',
        title: '前端学习笔记',
        content: '这是一篇关于前端编程的学习笔记内容，介绍了前端开发的方法和技巧。'.repeat(5),
        tags: [],
      }),
    ]);
    mocks.mockGetBrokenOutgoingLinks.mockResolvedValue([]);
    const fixes = await suggestQualityFixes();
    const tagFix = fixes.find((f) => f.field === 'tags');
    expect(tagFix).toBeDefined();
    expect(tagFix!.risk).toBe('low');
  });

  it('失效链接能匹配到可能的目标文档', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({ id: 'a', title: '源文档', content: '内容' }),
      makeJournal({ id: 'b', title: '目标文档', content: '内容' }),
    ]);
    mocks.mockGetBrokenOutgoingLinks.mockResolvedValue([
      { id: 'x', sourceId: 'a', targetTitle: '目标文档', linkText: '目标文档', broken: true },
    ]);
    const fixes = await suggestQualityFixes();
    const linkFix = fixes.find((f) => f.field === 'link');
    expect(linkFix).toBeDefined();
    expect(linkFix!.after).toBe('目标文档');
  });

  it('空标题被标记为高风险需确认', async () => {
    mocks.mockGetAllJournals.mockResolvedValue([
      makeJournal({ id: 'a', title: '', content: '内容' }),
    ]);
    mocks.mockGetBrokenOutgoingLinks.mockResolvedValue([]);
    const fixes = await suggestQualityFixes();
    const titleFix = fixes.find((f) => f.field === 'title');
    expect(titleFix).toBeDefined();
    expect(titleFix!.risk).toBe('high');
  });
});
