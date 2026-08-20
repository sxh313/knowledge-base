// ──── 文档关系与变更影响分析（Phase 5）────
// 在重命名、移动、合并或删除文档前，分析该操作会影响哪些双链、卡片、引用和相关文档。
// 只读，返回「无影响 / 有影响 / 无法确定」三种结果，不自动执行任何修改。

import { db } from '../db/schema';
import type { JournalEntry, DocumentLink } from '../db/schema';
import { getAllJournals } from '../db/queries';
import type { AgentPlan } from './tools';

// ──── 影响分析结果类型 ────

export type ImpactLevel = 'none' | 'affected' | 'unknown';

export interface ImpactItem {
  /** 受影响文档 id */
  journalId: string;
  /** 受影响文档标题 */
  title: string;
  /** 影响类型：被引用 / 引用失效 / 卡片关联 */
  kind: 'backlink' | 'broken-link' | 'card';
  /** 影响说明 */
  detail: string;
}

export interface JournalImpact {
  /** 目标文档 id */
  journalId: string;
  /** 目标文档标题 */
  title: string;
  /** 整体影响等级 */
  level: ImpactLevel;
  /** 影响明细 */
  items: ImpactItem[];
  /** 一句话总结 */
  summary: string;
}

/** 计算某文档的入链（被哪些文档引用） */
export async function getIncomingLinks(journalId: string): Promise<DocumentLink[]> {
  return db.documentLinks.where('targetId').equals(journalId).toArray();
}

/** 计算某文档的出链（引用了哪些文档） */
export async function getOutgoingLinks(sourceId: string): Promise<DocumentLink[]> {
  return db.documentLinks.where('sourceId').equals(sourceId).toArray();
}

/**
 * 分析「重命名/删除/移动」某文档的影响范围。
 * - 入链：指向该文档的链接（重命名/删除后这些链接会失效）
 * - 出链：该文档引用的链接（删除后这些引用会丢失）
 * - 卡片：关联的知识卡片（删除后卡片失去来源）
 * 只读，返回影响清单。
 */
export async function analyzeJournalImpact(journalId: string): Promise<JournalImpact> {
  const target = await db.journals.get(journalId);
  if (!target || target.deletedAt) {
    return {
      journalId,
      title: '（文档不存在）',
      level: 'unknown',
      items: [],
      summary: '无法确定影响：目标文档不存在或已删除。',
    };
  }

  const items: ImpactItem[] = [];

  // 1. 入链：被哪些文档引用
  const incoming = await getIncomingLinks(journalId);
  const incomingSources = await db.journals.bulkGet(
    Array.from(new Set(incoming.map((l) => l.sourceId))),
  );
  const sourceMap = new Map<string, JournalEntry>();
  incomingSources.forEach((s) => {
    if (s && !s.deletedAt) sourceMap.set(s.id, s);
  });
  const liveIncoming = incoming.filter((l) => sourceMap.has(l.sourceId));
  for (const l of liveIncoming) {
    const src = sourceMap.get(l.sourceId)!;
    items.push({
      journalId: src.id,
      title: src.title || '（无标题）',
      kind: 'backlink',
      detail: `引用了「${target.title}」（链接文本：${l.linkText || l.targetTitle}）`,
    });
  }

  // 2. 出链：该文档引用了哪些文档（删除后这些引用丢失）
  const outgoing = await getOutgoingLinks(journalId);
  for (const l of outgoing) {
    items.push({
      journalId: l.targetId || '',
      title: l.targetTitle || '（未知目标）',
      kind: 'broken-link',
      detail: `引用了「${l.targetTitle}」${l.broken ? '（当前已是失效链接）' : ''}`,
    });
  }

  // 3. 卡片：关联的知识卡片
  const cards = await db.cards.where('journalId').equals(journalId).toArray();
  for (const c of cards) {
    items.push({
      journalId,
      title: target.title,
      kind: 'card',
      detail: `关联 ${c.cardType} 卡片「${c.front.slice(0, 30)}」`,
    });
  }

  // 汇总影响等级
  let level: ImpactLevel = 'none';
  if (items.length > 0) {
    level = 'affected';
  }

  const summary =
    level === 'none'
      ? `「${target.title}」无入链、出链或卡片关联，变更影响较小。`
      : `「${target.title}」有 ${items.length} 处关联：${items
          .slice(0, 5)
          .map((i) => i.title)
          .join('、')}${items.length > 5 ? ' 等' : ''}。`;

  return { journalId, title: target.title, level, items, summary };
}

/**
 * 生成「重命名后链接修复计划」：当某文档被重命名时，列出所有指向旧标题的失效链接，
 * 以及建议的新链接文本。只读，不自动执行。
 */
export async function buildRenameLinkRepairPlan(
  journalId: string,
  newTitle: string,
): Promise<{
  journalId: string;
  oldTitle: string;
  newTitle: string;
  repairs: { sourceId: string; sourceTitle: string; linkText: string; newLinkText: string }[];
}> {
  const target = await db.journals.get(journalId);
  if (!target) {
    return { journalId, oldTitle: '', newTitle, repairs: [] };
  }
  const incoming = await getIncomingLinks(journalId);
  const sourceIds = Array.from(new Set(incoming.map((l) => l.sourceId)));
  const sources = await db.journals.bulkGet(sourceIds);
  const sourceMap = new Map<string, JournalEntry>();
  sources.forEach((s) => {
    if (s && !s.deletedAt) sourceMap.set(s.id, s);
  });

  const repairs = incoming
    .filter((l) => sourceMap.has(l.sourceId))
    .map((l) => {
      const src = sourceMap.get(l.sourceId)!;
      return {
        sourceId: src.id,
        sourceTitle: src.title || '（无标题）',
        linkText: l.linkText || l.targetTitle,
        newLinkText: newTitle,
      };
    });

  return { journalId, oldTitle: target.title, newTitle, repairs };
}

/**
 * 批量分析多篇文档的影响（供 Agent 一次分析多个目标）。
 */
export async function analyzeJournalsImpact(journalIds: string[]): Promise<JournalImpact[]> {
  const results: JournalImpact[] = [];
  for (const id of journalIds) {
    results.push(await analyzeJournalImpact(id));
  }
  return results;
}

// ──── 失效链接修复计划 ────

export interface LinkRepairItem {
  /** 来源文档 id（含失效链接的文档） */
  sourceId: string;
  /** 来源文档标题 */
  sourceTitle: string;
  /** 失效链接的原始文本 */
  linkText: string;
  /** 建议修复后的链接文本（匹配到的目标文档标题） */
  newLinkText: string;
  /** 匹配到的目标文档 id（若可解析） */
  targetId?: string;
  /** 是否可自动修复（能唯一匹配到现有文档） */
  autoFixable: boolean;
}

export interface LinkRepairPlan {
  /** 待修复的失效链接总数 */
  total: number;
  /** 可自动修复的数量 */
  autoFixable: number;
  /** 需人工确认的数量 */
  manualCount: number;
  /** 逐条修复计划 */
  items: LinkRepairItem[];
}

/** 将唯一匹配的失效链接转换为逐条精确补丁；无法唯一匹配的条目不会自动写入。 */
export function linkRepairPlanToAgentPlan(plan: LinkRepairPlan): AgentPlan {
  return {
    summary: `修复 ${plan.autoFixable} 条可确认的失效链接（共 ${plan.total} 条）`,
    ops: plan.items.filter((item) => item.autoFixable && item.targetId).map((item) => ({
      type: 'patchJournal' as const,
      journalId: item.sourceId,
      findText: `[[${item.linkText}]]`,
      replaceText: `[[${item.newLinkText}]]`,
      note: `修复「${item.sourceTitle}」中的失效链接`,
    })),
  };
}

/**
 * 扫描全库失效链接，尝试匹配到现有文档（精确标题或别名），生成逐条修复计划。
 * 只读，不自动执行。无法唯一匹配的链接保留人工确认，不做全库猜测替换。
 */
export async function repairDocumentLinks(): Promise<LinkRepairPlan> {
  const journals = (await getAllJournals()).filter((j) => !j.deletedAt);
  const allLinks = await db.documentLinks.toArray();
  const brokenLinks = allLinks.filter((l) => l.broken);

  // 建立标题/别名 → 文档 的索引，用于匹配
  const titleIndex = new Map<string, JournalEntry[]>();
  const addTitle = (name: string, journal: JournalEntry) => {
    const key = name.trim().toLowerCase();
    if (!key) return;
    const list = titleIndex.get(key) ?? [];
    if (!list.some((item) => item.id === journal.id)) list.push(journal);
    titleIndex.set(key, list);
  };
  for (const j of journals) {
    addTitle(j.title, j);
    for (const alias of j.aliases ?? []) addTitle(alias, j);
  }

  const items: LinkRepairItem[] = [];
  for (const link of brokenLinks) {
    const key = link.targetTitle.trim().toLowerCase();
    const candidates = titleIndex.get(key) ?? [];
    const target = candidates.length === 1 ? candidates[0] : undefined;
    if (target) {
      items.push({
        sourceId: link.sourceId,
        sourceTitle: link.sourceId,
        linkText: link.linkText || link.targetTitle,
        newLinkText: target.title,
        targetId: target.id,
        autoFixable: true,
      });
    } else {
      items.push({
        sourceId: link.sourceId,
        sourceTitle: link.sourceId,
        linkText: link.linkText || link.targetTitle,
        newLinkText: link.targetTitle,
        autoFixable: false,
      });
    }
  }

  // 补充来源文档标题
  const sourceIds = Array.from(new Set(items.map((i) => i.sourceId)));
  const sources = await db.journals.bulkGet(sourceIds);
  const sourceMap = new Map<string, JournalEntry>();
  sources.forEach((s) => {
    if (s) sourceMap.set(s.id, s);
  });
  for (const item of items) {
    const src = sourceMap.get(item.sourceId);
    if (src) item.sourceTitle = src.title || '（无标题）';
  }

  const autoFixable = items.filter((i) => i.autoFixable).length;
  return {
    total: items.length,
    autoFixable,
    manualCount: items.length - autoFixable,
    items,
  };
}
