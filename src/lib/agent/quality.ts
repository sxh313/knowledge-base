// ──── 知识库增强能力（Phase 4）────
// 提供重复文档检测、文档质量检查、学习计划建议等只读分析能力。
// 这些能力只生成「建议/报告」，不直接写入，由用户确认后再执行。

import { getAllJournals, getBacklinks, getBrokenOutgoingLinks } from '../db/queries';
import type { JournalEntry } from '../db/schema';

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
