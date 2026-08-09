// 文档检索引擎：结构化条件过滤 + Fuse 相关度搜索
// 策略：queryParser 抽出结构化条件做硬过滤；剩余自由文本交给 Fuse 做加权相关度匹配；
//       无自由文本时（纯过滤）返回全部符合条件的文档（按更新时间倒序）。

import { db } from '../db/schema';
import type { JournalEntry } from '../db/schema';
import { searchJournalsWithScore } from './fuse';
import { parseQuery, hasStructuredFilters, type ParsedQuery } from './queryParser';

export interface SearchResult {
  item: JournalEntry;
  /** Fuse 相关度分数（越低越相关）；纯过滤结果为 0 */
  score: number;
  /** 命中原因：标题/正文/别名/标签/分类/筛选条件 */
  reasons: string[];
  /** 正文命中片段（围绕首个命中词） */
  snippet: string;
  /** 实际命中的词（用于 UI 高亮） */
  matchedTerms: string[];
}

function lower(s: string | undefined | null): string {
  return (s ?? '').toLowerCase();
}

/** 判断文档是否命中任一检索词；返回命中的词与命中的字段 */
function matchTerms(
  doc: JournalEntry,
  terms: string[],
): { matched: string[]; fields: Set<string> } {
  const matched = new Set<string>();
  const fields = new Set<string>();
  if (terms.length === 0) return { matched: [], fields };
  const title = lower(doc.title);
  const aliases = (doc.aliases ?? []).map(lower);
  const tags = (doc.tags ?? []).map(lower);
  const subject = lower(doc.subject);
  const content = lower(doc.contentPlain);
  for (const t of terms) {
    const tl = t.toLowerCase();
    if (!tl) continue;
    if (title.includes(tl)) fields.add('标题');
    if (aliases.some((a) => a.includes(tl))) fields.add('别名');
    if (tags.some((a) => a.includes(tl))) fields.add('标签');
    if (subject.includes(tl)) fields.add('分类');
    if (content.includes(tl)) fields.add('正文');
    if (title.includes(tl) || aliases.some((a) => a.includes(tl)) || tags.some((a) => a.includes(tl)) || subject.includes(tl) || content.includes(tl)) {
      matched.add(t);
    }
  }
  return { matched: [...matched], fields };
}

/** 围绕首个命中词截取正文片段（约 90 字） */
function buildSnippet(doc: JournalEntry, terms: string[]): string {
  const content = doc.contentPlain || '';
  if (!content) return '';
  if (terms.length === 0) return content.slice(0, 90);
  const lowerContent = content.toLowerCase();
  let idx = -1;
  for (const t of terms) {
    const i = lowerContent.indexOf(t.toLowerCase());
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  if (idx < 0) return content.slice(0, 90);
  const start = Math.max(0, idx - 35);
  const end = Math.min(content.length, idx + 55);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

/** 应用结构化硬过滤（标签/分类/时间/状态/附件/链接） */
function applyStructuralFilters(docs: JournalEntry[], pq: ParsedQuery, linkedIds: Set<string>): JournalEntry[] {
  return docs.filter((doc) => {
    if (pq.status && doc.status !== pq.status) return false;
    if (pq.subject && doc.subject !== pq.subject) return false;
    if (pq.tags.length > 0 && !pq.tags.every((t) => (doc.tags ?? []).includes(t))) return false;
    if (pq.excludeTags.length > 0 && pq.excludeTags.some((t) => (doc.tags ?? []).includes(t))) return false;
    if (pq.after !== undefined && doc.updatedAt < pq.after) return false;
    if (pq.before !== undefined && doc.updatedAt > pq.before) return false;
    if (pq.hasLink === true && !linkedIds.has(doc.id)) return false;
    if (pq.hasLink === false && linkedIds.has(doc.id)) return false;
    return true;
  });
}

/**
 * 执行文档搜索。
 * - 有自由文本：Fuse 相关度排序；只保留既满足结构化过滤、又被 Fuse 匹配的文档。
 * - 无自由文本（纯过滤）：返回全部满足结构化过滤的文档，按更新时间倒序。
 */
export async function searchDocuments(rawQuery: string): Promise<SearchResult[]> {
  const pq = parseQuery(rawQuery);
  let docs = (await db.journals.filter((j) => !j.deletedAt).toArray());

  // 链接/附件相关过滤需要全量 documentLinks
  let linkedIds = new Set<string>();
  if (pq.hasLink !== undefined) {
    const links = await db.documentLinks.toArray();
    for (const l of links) {
      if (l.broken) continue;
      linkedIds.add(l.sourceId);
      if (l.targetId) linkedIds.add(l.targetId);
    }
  }
  // 附件过滤（has:attachment）
  if (pq.hasAttachment) {
    const attachJids = new Set((await db.attachments.toArray()).map((a) => a.journalId));
    docs = docs.filter((d) => attachJids.has(d.id));
  }

  const structured = hasStructuredFilters(pq);
  if (structured) docs = applyStructuralFilters(docs, pq, linkedIds);
  if (docs.length === 0) return [];

  const terms = [...pq.keywords, ...pq.phrases];

  // 无自由文本 → 纯过滤结果
  if (!pq.text.trim()) {
    return docs
      .map((item) => {
        const { matched, fields } = matchTerms(item, terms);
        return {
          item,
          score: 0,
          reasons: fields.size > 0 ? [...fields] : ['筛选条件'],
          snippet: buildSnippet(item, terms),
          matchedTerms: matched,
        } satisfies SearchResult;
      })
      .sort((a, b) => b.item.updatedAt - a.item.updatedAt);
  }

  // 有自由文本 → Fuse 相关度
  const fuseResults = searchJournalsWithScore(pq.text, Math.max(50, docs.length * 2));
  const scoreById = new Map<string, number>();
  for (const r of fuseResults) scoreById.set(r.item.id, r.score);

  const results: SearchResult[] = [];
  for (const item of docs) {
    if (!scoreById.has(item.id)) continue; // Fuse 未匹配则不收录
    const { matched, fields } = matchTerms(item, terms);
    results.push({
      item,
      score: scoreById.get(item.id) ?? 0,
      reasons: fields.size > 0 ? [...fields] : ['相关'],
      snippet: buildSnippet(item, terms),
      matchedTerms: matched,
    });
  }
  // 按相关度（Fuse 分数升序）排序
  results.sort((a, b) => a.score - b.score);
  return results;
}
