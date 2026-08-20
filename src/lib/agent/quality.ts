// ──── 知识库增强能力（Phase 4）────
// 提供重复文档检测、文档质量检查、学习计划建议等只读分析能力。
// 这些能力只生成「建议/报告」，不直接写入，由用户确认后再执行。

import { getAllJournals, getBacklinks, getBrokenOutgoingLinks } from '../db/queries';
import type { JournalEntry } from '../db/schema';
import type { AgentOp, AgentPlan } from './tools';

export interface KnowledgeGapReport {
  topic: string;
  covered: { concept: string; evidence: string[]; confidence: number }[];
  missing: { concept: string; reason: string; confidence: number }[];
}

export interface MetadataSuggestion {
  journalId: string;
  title: string;
  suggestedTitle?: string;
  summary?: string;
  tags: string[];
  subject?: string;
  relatedIds: string[];
}

/** 将低风险元数据建议转换为已有的安全执行计划；高风险标题建议默认不进入计划。 */
export function metadataSuggestionsToPlan(suggestions: MetadataSuggestion[]): AgentPlan {
  return {
    summary: `应用 ${suggestions.length} 条收件箱元数据建议（仍需逐项确认）`,
    ops: suggestions.flatMap((s) => {
      const metadata: NonNullable<import('./tools').AgentOp['metadata']> = {};
      if (s.summary) metadata.summary = s.summary;
      if (s.tags.length) metadata.tags = s.tags;
      if (s.subject) metadata.subject = s.subject;
      return Object.keys(metadata).length ? [{ type: 'updateMetadata' as const, journalId: s.journalId, metadata, note: '收件箱元数据建议' }] : [];
    }),
  };
}

export interface RelatedJournal {
  journalId: string;
  title: string;
  score: number;
  reason: string;
}

const STOP_WORDS = new Set(['这个', '那个', '内容', '知识', '文档', '以及', '然后', '可以', '进行', '关于', 'the', 'and', 'for']);

function terms(text: string): string[] {
  const out = new Set<string>();
  for (const run of (text || '').toLowerCase().match(/[\u4e00-\u9fff]+|[a-z0-9]{2,}/g) ?? []) {
    if (run.length <= 2 && /[\u4e00-\u9fff]/.test(run)) out.add(run);
    if (run.length > 2 && !STOP_WORDS.has(run)) out.add(run);
    if (/^[\u4e00-\u9fff]+$/.test(run)) for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  return [...out];
}

export async function findRelatedJournals(input: { journalId?: string; topic?: string }, limit = 8): Promise<RelatedJournal[]> {
  const journals = (await getAllJournals()).filter((j) => !j.deletedAt);
  const source = input.journalId ? journals.find((j) => j.id === input.journalId) : undefined;
  const query = input.topic || source?.title || '';
  const queryTerms = terms(`${query} ${source?.content || ''}`);
  return journals
    .filter((j) => j.id !== input.journalId)
    .map((j) => {
      const haystack = `${j.title} ${j.summary || ''} ${j.contentPlain || j.content}`.toLowerCase();
      const hits = queryTerms.filter((t) => haystack.includes(t)).length;
      const score = queryTerms.length ? hits / queryTerms.length : 0;
      return { journalId: j.id, title: j.title, score, reason: hits ? `命中 ${hits} 个共同概念` : '分类或标签相近' };
    })
    .filter((j) => j.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function analyzeKnowledgeGaps(topic: string): Promise<KnowledgeGapReport> {
  const normalized = (topic || '').trim();
  const journals = (await getAllJournals()).filter((j) => !j.deletedAt);
  const topicTerms = terms(normalized);
  const related = journals.filter((j) => {
    const haystack = `${j.title} ${j.summary || ''} ${j.contentPlain || j.content}`.toLowerCase();
    return topicTerms.some((t) => haystack.includes(t));
  });
  const covered = topicTerms.filter((concept) => related.some((j) => `${j.title} ${j.contentPlain || j.content}`.toLowerCase().includes(concept))).map((concept) => ({
    concept,
    evidence: related.filter((j) => `${j.title} ${j.contentPlain || j.content}`.toLowerCase().includes(concept)).slice(0, 3).map((j) => j.title),
    confidence: Math.min(0.95, 0.45 + related.length * 0.08),
  }));
  const coveredSet = new Set(covered.map((x) => x.concept));
  const missing = topicTerms.filter((concept) => !coveredSet.has(concept)).map((concept) => ({
    concept,
    reason: related.length ? '相关文档中没有明确命中该概念' : '知识库中没有找到相关文档',
    confidence: related.length ? 0.68 : 0.86,
  }));
  return { topic: normalized, covered, missing };
}

export async function suggestJournalMetadata(journalId?: string): Promise<MetadataSuggestion[]> {
  const journals = (await getAllJournals()).filter((j) => !j.deletedAt && (journalId ? j.id === journalId : j.status === 'inbox'));
  const all = (await getAllJournals()).filter((j) => !j.deletedAt);
  return Promise.all(journals.map(async (j) => {
    const plain = (j.contentPlain || j.content || '').replace(/\s+/g, ' ').trim();
    const words = terms(`${j.title} ${plain}`).filter((t) => t.length > 1).slice(0, 5);
    const related = await findRelatedJournals({ journalId: j.id }, 5);
    const suggestedTitle = !j.title.trim() || /^未命名|^无标题/.test(j.title) ? (words.slice(0, 3).join(' · ') || '待整理笔记') : undefined;
    const subject = j.subject || all.find((x) => x.id !== j.id && x.tags?.some((tag) => words.includes(tag)))?.subject || undefined;
    return { journalId: j.id, title: j.title, suggestedTitle, summary: !j.summary && plain ? `${plain.slice(0, 120)}${plain.length > 120 ? '…' : ''}` : undefined, tags: words.slice(0, 4), subject, relatedIds: related.map((x) => x.journalId) };
  }));
}

// ──── 重复文档检测 ────

export interface DuplicateCandidate {
  /** 候选组 id（同一组内互为重复） */
  groupId: string;
  /** 组内文档 */
  items: { journalId: string; title: string; similarity: number }[];
  /** 建议：保留哪个文档（标题最规范、内容最完整者） */
  keepId?: string;
  /** 合并建议说明 */
  suggestion: string;
}

/** 计算两个字符串的相似度（0~1），基于字符集合 + 长度比 */
export function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = a.replace(/\s+/g, '').toLowerCase();
  const nb = b.replace(/\s+/g, '').toLowerCase();
  if (!na || !nb) return 0;
  // 长度比
  const lenRatio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
  // 字符集合 Jaccard
  const setA = new Set(na);
  const setB = new Set(nb);
  let inter = 0;
  for (const c of setA) if (setB.has(c)) inter++;
  const union = setA.size + setB.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;
  // 标题相似度（标题相同则高度重复）
  const titleA = a.trim().toLowerCase();
  const titleB = b.trim().toLowerCase();
  const titleSim = titleA === titleB ? 1 : titleA.includes(titleB) || titleB.includes(titleA) ? 0.9 : 0;
  return Math.max(lenRatio * 0.4 + jaccard * 0.3, titleSim);
}

/**
 * 检测重复文档：两两比较标题与内容相似度，超过阈值归为一组。
 * 只读，返回候选组列表。
 */
export async function findDuplicateJournals(
  threshold = 0.85,
): Promise<DuplicateCandidate[]> {
  const journals = (await getAllJournals()).filter((j) => !j.deletedAt);
  const groups: DuplicateCandidate[] = [];
  const visited = new Set<string>();

  for (let i = 0; i < journals.length; i++) {
    if (visited.has(journals[i].id)) continue;
    const group: { journalId: string; title: string; similarity: number }[] = [
      { journalId: journals[i].id, title: journals[i].title, similarity: 1 },
    ];
    visited.add(journals[i].id);
    for (let j = i + 1; j < journals.length; j++) {
      if (visited.has(journals[j].id)) continue;
      const sim = textSimilarity(journals[i].title, journals[j].title);
      const contentSim = textSimilarity(journals[i].content, journals[j].content);
      const combined = Math.max(sim, contentSim);
      if (combined >= threshold) {
        group.push({ journalId: journals[j].id, title: journals[j].title, similarity: combined });
        visited.add(journals[j].id);
      }
    }
    if (group.length > 1) {
      // 建议保留标题最长、内容最完整的文档
      const keep = [...group].sort(
        (a, b) =>
          (journals.find((j) => j.id === b.journalId)?.content.length ?? 0) -
          (journals.find((j) => j.id === a.journalId)?.content.length ?? 0),
      )[0];
      groups.push({
        groupId: `dup-${i}`,
        items: group,
        keepId: keep.journalId,
        suggestion: `检测到 ${group.length} 篇相似文档，建议保留「${keep.title}」并合并其余内容。`,
      });
    }
  }
  return groups;
}

// ──── 文档质量检查 ────

export interface QualityIssue {
  journalId: string;
  title: string;
  severity: 'info' | 'warning' | 'error';
  type: 'empty-title' | 'empty-content' | 'no-summary' | 'orphan' | 'broken-link' | 'duplicate';
  message: string;
}

/**
 * 文档质量检查：空标题、空内容、缺少摘要、孤立文档、失效链接。
 * 只读，返回问题清单。
 */
export async function reviewJournalQuality(): Promise<QualityIssue[]> {
  const journals = (await getAllJournals()).filter((j) => !j.deletedAt);
  const issues: QualityIssue[] = [];

  for (const j of journals) {
    // 空标题
    if (!j.title || !j.title.trim()) {
      issues.push({
        journalId: j.id,
        title: j.title || '（无标题）',
        severity: 'error',
        type: 'empty-title',
        message: '文档标题为空',
      });
    }
    // 空内容
    if (!j.content || !j.content.trim()) {
      issues.push({
        journalId: j.id,
        title: j.title || '（无标题）',
        severity: 'warning',
        type: 'empty-content',
        message: '文档内容为空',
      });
    }
    // 缺少摘要（内容较长但无摘要字段或开头无概述）
    if (j.content && j.content.trim().length > 200 && !j.summary) {
      issues.push({
        journalId: j.id,
        title: j.title || '（无标题）',
        severity: 'info',
        type: 'no-summary',
        message: '内容较长但缺少摘要',
      });
    }
    // 孤立文档（无入链）
    const backlinks = await getBacklinks(j.id);
    if (backlinks.length === 0) {
      issues.push({
        journalId: j.id,
        title: j.title || '（无标题）',
        severity: 'info',
        type: 'orphan',
        message: '孤立文档：没有其他文档链接到它',
      });
    }
    // 失效链接
    const broken = await getBrokenOutgoingLinks(j.id);
    if (broken.length > 0) {
      issues.push({
        journalId: j.id,
        title: j.title || '（无标题）',
        severity: 'warning',
        type: 'broken-link',
        message: `存在 ${broken.length} 个失效链接`,
      });
    }
  }

  // 重复文档（复用检测结果，标记为 error 级）
  const dups = await findDuplicateJournals();
  for (const g of dups) {
    for (const item of g.items) {
      issues.push({
        journalId: item.journalId,
        title: item.title,
        severity: 'warning',
        type: 'duplicate',
        message: `与「${g.items.find((x) => x.journalId !== item.journalId)?.title ?? '其他文档'}」内容重复`,
      });
    }
  }

  return issues;
}

// ──── 学习计划建议 ────

export interface StudyPlanItem {
  journalId: string;
  title: string;
  /** 建议复习时间（相对天数） */
  reviewInDays: number;
  reason: string;
}

/**
 * 生成学习计划建议：根据文档标签、卡片复习记录与内容长度，给出复习优先级。
 * 只读，返回计划建议。
 */
export async function createStudyPlanSuggestion(): Promise<StudyPlanItem[]> {
  const journals = (await getAllJournals()).filter((j) => !j.deletedAt);
  const cards = await import('../db/queries').then((m) => m.getAllCards());

  const items: StudyPlanItem[] = journals.map((j) => {
    const journalCards = cards.filter((c) => c.journalId === j.id);
    const dueCards = journalCards.filter((c) => c.nextReviewAt <= Date.now()).length;
    const totalCards = journalCards.length;
    // 优先级：有待复习卡片 > 内容长但无卡片 > 一般
    let reviewInDays = 7;
    let reason = '常规复习';
    if (dueCards > 0) {
      reviewInDays = 0;
      reason = `有 ${dueCards} 张卡片待复习`;
    } else if (totalCards === 0 && j.content && j.content.length > 500) {
      reviewInDays = 3;
      reason = '内容较长但尚未生成知识卡片，建议整理';
    } else if (j.tags && j.tags.length > 0) {
      reviewInDays = 5;
      reason = `标签：${j.tags.slice(0, 3).join('、')}`;
    }
    return { journalId: j.id, title: j.title || '（无标题）', reviewInDays, reason };
  });

  return items.sort((a, b) => a.reviewInDays - b.reviewInDays).slice(0, 20);
}

// ──── 文档质量问题一键修复建议（Phase 5）────

/** 修复建议的风险等级：低风险字段可自动修复，高风险字段需单独确认 */
export type FixRisk = 'low' | 'high';

/** 单条修复建议 */
export interface QualityFixSuggestion {
  journalId: string;
  title: string;
  /** 问题类型（与 QualityIssue.type 对应） */
  issueType: string;
  /** 修复风险：low=可自动修复，high=需单独确认 */
  risk: FixRisk;
  /** 修复字段 */
  field: 'summary' | 'tags' | 'link' | 'title' | 'content';
  /** 修复前值 */
  before: string;
  /** 修复后值 */
  after: string;
  /** 修复说明 */
  message: string;
}

/** 仅把低风险质量建议转换为安全计划；标题和正文整体替换保留人工处理。 */
export function qualityFixesToPlan(
  fixes: QualityFixSuggestion[],
  options?: { selectedKeys?: string[]; skippedIssueTypes?: string[] },
): AgentPlan {
  const selected = options?.selectedKeys ? new Set(options.selectedKeys) : null;
  const skipped = new Set(options?.skippedIssueTypes ?? []);
  const chosen = fixes.filter((fix) => {
    const key = `${fix.journalId}:${fix.issueType}:${fix.field}`;
    return (!selected || selected.has(key)) && !skipped.has(fix.issueType);
  });
  return {
    summary: `应用 ${chosen.filter((fix) => fix.risk === 'low').length} 条低风险质量修复建议（仍需逐项确认）`,
    ops: chosen.filter((fix) => fix.risk === 'low').flatMap((fix): AgentOp[] => {
      if (fix.field === 'tags') {
        return [{ type: 'updateMetadata' as const, journalId: fix.journalId, metadata: { tags: fix.after.split(/[、,，]/).map((t) => t.trim()).filter(Boolean) }, note: fix.message }];
      }
      if (fix.field === 'summary') {
        return [{ type: 'updateMetadata' as const, journalId: fix.journalId, metadata: { summary: fix.after }, note: fix.message }];
      }
      if (fix.field === 'link') {
        return [{ type: 'patchJournal' as const, journalId: fix.journalId, findText: `[[${fix.before}]]`, replaceText: `[[${fix.after}]]`, note: fix.message }];
      }
      return [];
    }),
  };
}

/**
 * 为文档质量问题生成「一键修复」建议。
 * 只读，返回修复前后对比。仅低风险字段（摘要、标签、双链）进入自动修复计划；
 * 标题、正文整体替换和删除仍要求单独确认（标记为 high 风险）。
 */
export async function suggestQualityFixes(): Promise<QualityFixSuggestion[]> {
  const journals = (await getAllJournals()).filter((j) => !j.deletedAt);
  const issues = await reviewJournalQuality();
  const suggestions: QualityFixSuggestion[] = [];

  for (const j of journals) {
    const journalIssues = issues.filter((i) => i.journalId === j.id);
    if (journalIssues.length === 0) continue;

    // 1. 缺少摘要：根据正文生成 1-3 句摘要（低风险，可自动修复）
    const noSummary = journalIssues.find((i) => i.type === 'no-summary');
    if (noSummary && j.content && j.content.trim().length > 200) {
      const summary = generateSummary(j.content);
      if (summary && summary !== j.summary) {
        suggestions.push({
          journalId: j.id,
          title: j.title || '（无标题）',
          issueType: 'no-summary',
          risk: 'low',
          field: 'summary',
          before: j.summary || '',
          after: summary,
          message: '根据正文生成摘要',
        });
      }
    }

    // 2. 标签缺失或过少：只推荐标签，不覆盖已有标签（低风险）
    const tagCount = j.tags?.length ?? 0;
    if (tagCount === 0 && j.content && j.content.trim().length > 50) {
      const recommended = recommendTags(j.title, j.content);
      if (recommended.length > 0) {
        suggestions.push({
          journalId: j.id,
          title: j.title || '（无标题）',
          issueType: 'no-tags',
          risk: 'low',
          field: 'tags',
          before: '',
          after: recommended.join('、'),
          message: `推荐标签：${recommended.join('、')}`,
        });
      }
    }

    // 3. 失效双链：根据现有标题和别名推荐可能的目标文档（低风险）
    const broken = await getBrokenOutgoingLinks(j.id);
    if (broken.length > 0) {
      for (const link of broken) {
        const target = findLinkTarget(link.targetTitle, journals);
        if (target) {
          suggestions.push({
            journalId: j.id,
            title: j.title || '（无标题）',
            issueType: 'broken-link',
            risk: 'low',
            field: 'link',
            before: link.targetTitle,
            after: target.title,
            message: `失效链接「${link.targetTitle}」可能指向「${target.title}」`,
          });
        }
      }
    }

    // 4. 空标题 / 空内容：标记为待处理，不自动生成（高风险，需单独确认）
    const emptyTitle = journalIssues.find((i) => i.type === 'empty-title');
    if (emptyTitle) {
      suggestions.push({
        journalId: j.id,
        title: j.title || '（无标题）',
        issueType: 'empty-title',
        risk: 'high',
        field: 'title',
        before: j.title || '',
        after: '',
        message: '文档标题为空，需人工补充标题',
      });
    }
    const emptyContent = journalIssues.find((i) => i.type === 'empty-content');
    if (emptyContent) {
      suggestions.push({
        journalId: j.id,
        title: j.title || '（无标题）',
        issueType: 'empty-content',
        risk: 'high',
        field: 'content',
        before: '',
        after: '',
        message: '文档内容为空，需人工补充内容',
      });
    }
  }

  return suggestions;
}

/** 根据正文生成 1-3 句摘要（取开头非空段落，最多 3 句） */
function generateSummary(content: string): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ') // 去掉代码块
    .replace(/[#>*_`~\-\[\]()!]/g, ' ') // 去掉 markdown 符号
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  // 按句号/问号/感叹号切句
  const sentences = plain.split(/(?<=[。！？.!?])\s*/).filter((s) => s.trim().length > 0);
  const picked = sentences.slice(0, 3).join(' ');
  return picked.length > 120 ? picked.slice(0, 120) + '…' : picked;
}

/** 根据标题和内容推荐标签（从标题关键词 + 常见主题词中提取） */
function recommendTags(title: string, content: string): string[] {
  const text = `${title} ${content}`.toLowerCase();
  const candidates = [
    '笔记', '学习', '总结', '教程', '指南', '心得', '方法', '技巧',
    '前端', '后端', '算法', '数据库', '设计', '产品', '管理', '英语',
    '数学', '物理', '化学', '生物', '历史', '地理', '编程', 'AI',
  ];
  const found = candidates.filter((c) => text.includes(c));
  return found.slice(0, 3);
}

/** 根据失效链接的标题，在现有文档中查找可能的目标（精确或包含匹配） */
function findLinkTarget(targetTitle: string, journals: JournalEntry[]): JournalEntry | null {
  const t = targetTitle.trim().toLowerCase();
  if (!t) return null;
  // 精确匹配
  const exact = journals.find((j) => j.title.trim().toLowerCase() === t);
  if (exact) return exact;
  // 包含匹配（标题包含目标，或目标包含标题）
  return (
    journals.find((j) => {
      const jt = j.title.trim().toLowerCase();
      return jt.includes(t) || t.includes(jt);
    }) ?? null
  );
}
