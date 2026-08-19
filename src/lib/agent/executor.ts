// ──── Agent 执行器 ────
// 解析 AI 生成的操作计划并执行。
// 支持两种模式：
//  - preview：只计算每个操作会产生的「变更预览」，不真正写入（用于用户确认）
//  - apply：真正执行写入（新建/编辑/追加等）
// 编辑已有文档前会自动保存版本快照（saveVersion），保证可回滚。

import { db } from '../db/schema';
import type { JournalEntry } from '../db/schema';
import {
  createJournal,
  updateJournal,
  saveVersion,
  getJournal,
  deleteJournal,
  createCard,
} from '../db/queries';
import { normalizeMarkdown, calculateContentHash } from '../indexing/documents';
import { diffLines } from './diff';
import type {
  AgentOp,
  AgentPlan,
  AgentOpResult,
  AgentExecutionResult,
  AgentSearchHit,
} from './tools';
import { classifyRisk } from './tools';
import {
  findDuplicateJournals,
  reviewJournalQuality,
  createStudyPlanSuggestion,
  suggestQualityFixes,
  type QualityIssue,
} from './quality';
import { analyzeJournalImpact, repairDocumentLinks } from './impact';

/** 按 id 或标题精确定位文档（不做模糊匹配，避免误命中） */
async function resolveJournal(op: AgentOp): Promise<JournalEntry | null> {
  if (op.journalId) {
    const byId = await getJournal(op.journalId);
    if (byId && !byId.deletedAt) return byId;
  }
  if (op.title) {
    const all = await db.journals.filter((j) => !j.deletedAt).toArray();
    // 仅精确匹配（忽略大小写与首尾空白），不做「包含」模糊匹配，防止误改笔记
    const exact = all.find(
      (j) => j.title.trim().toLowerCase() === op.title!.trim().toLowerCase(),
    );
    if (exact) return exact;
  }
  return null;
}

/** 校验目标文档 contentHash 是否与计划一致（防止目标被修改后误执行旧计划） */
async function verifyExpectedHash(op: AgentOp, target: JournalEntry | null): Promise<string | null> {
  if (!op.expectedHash) return null;
  if (!target) return '目标文档不存在，无法校验 contentHash';
  const currentHash = await calculateContentHash({ title: target.title, content: target.content });
  if (currentHash !== op.expectedHash) {
    return `目标文档「${target.title}」已被修改，请重新生成预览后再执行`;
  }
  return null;
}

/** 在指定标题后插入内容 */
function insertAfterHeading(content: string, heading: string, insert: string): string {
  const lines = content.split('\n');
  const target = heading.trim();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // 匹配 ## 或 ### 标题（忽略层级，按文本匹配）
    if (/^#{1,6}\s+/.test(line) && line.replace(/^#{1,6}\s+/, '').trim() === target) {
      const insertLines = insert.split('\n');
      lines.splice(i + 1, 0, ...insertLines);
      return lines.join('\n');
    }
  }
  // 未找到标题：追加到末尾
  return content.replace(/\s*$/, '\n') + '\n' + insert;
}

/** 提取匹配片段：返回命中关键词附近的上下文（最多约 120 字符） */
function makeSnippet(content: string, query: string): string {
  const lower = content || '';
  const q = query.toLowerCase();
  const idx = lower.toLowerCase().indexOf(q);
  if (idx < 0) return lower.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(lower.length, idx + q.length + 80);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < lower.length ? '…' : '';
  return (prefix + lower.slice(start, end) + suffix).replace(/\s+/g, ' ').trim();
}

/** 提取内容中第一个标题作为章节引用 */
function firstHeading(content: string): string | undefined {
  const m = (content || '').match(/^#{1,6}\s+(.+)$/m);
  return m ? m[1].trim() : undefined;
}

/**
 * 结构化搜索：返回带来源引用（文档 ID、标题、章节、匹配片段）的命中列表。
 * 匹配范围：标题、正文、标签；每篇文档最多返回 1 条，按命中数排序。
 */
export async function searchJournals(query: string): Promise<AgentSearchHit[]> {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const all = await db.journals.filter((j) => !j.deletedAt).toArray();
  const scored: { hit: AgentSearchHit; count: number }[] = [];
  for (const j of all) {
    const title = j.title || '';
    const content = j.content || '';
    const tags = j.tags ?? [];
    let count = 0;
    if (title.toLowerCase().includes(q)) count += 3;
    if (tags.some((t) => t.toLowerCase().includes(q))) count += 2;
    if (content.toLowerCase().includes(q)) count += 1;
    if (count === 0) continue;
    scored.push({
      count,
      hit: {
        journalId: j.id,
        title,
        subject: j.subject || '',
        heading: firstHeading(content),
        snippet: makeSnippet(content, q),
        score: count,
      },
    });
  }
  scored.sort((a, b) => b.count - a.count);
  return scored.slice(0, 10).map((s) => s.hit);
}

/** 计算单个操作的预览（不写入） */
async function previewOp(op: AgentOp): Promise<AgentOpResult> {
  const risk = classifyRisk(op);
  switch (op.type) {
    case 'create':
      return {
        op: { ...op, risk },
        ok: true,
        title: op.newTitle || '未命名文档',
        content: `新建文档「${op.newTitle || '未命名'}」\n\n${op.content || ''}`,
        afterTitle: op.newTitle || '未命名文档',
        afterContent: op.content || '',
      };
    case 'edit': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      const afterContent = normalizeMarkdown(op.content || '');
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `编辑「${target.title}」`,
        beforeContent: target.content,
        afterContent,
        beforeTitle: target.title,
        afterTitle: target.title,
        beforeTags: target.tags,
        afterTags: target.tags,
        beforeSubject: target.subject,
        afterSubject: target.subject,
      };
    }
    case 'append': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      const afterContent = normalizeMarkdown(target.content.replace(/\s*$/, '\n') + '\n' + (op.content || ''));
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `在「${target.title}」末尾追加`,
        beforeContent: target.content,
        afterContent,
        beforeTitle: target.title,
        afterTitle: target.title,
        beforeTags: target.tags,
        afterTags: target.tags,
        beforeSubject: target.subject,
        afterSubject: target.subject,
      };
    }
    case 'prepend': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      const afterContent = normalizeMarkdown((op.content || '') + '\n\n' + target.content);
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `在「${target.title}」开头插入`,
        beforeContent: target.content,
        afterContent,
        beforeTitle: target.title,
        afterTitle: target.title,
        beforeTags: target.tags,
        afterTags: target.tags,
        beforeSubject: target.subject,
        afterSubject: target.subject,
      };
    }
    case 'insertAfter': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      const afterContent = normalizeMarkdown(insertAfterHeading(target.content, op.afterHeading || '', op.content || ''));
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `在「${target.title}」的「${op.afterHeading || ''}」后插入`,
        beforeContent: target.content,
        afterContent,
        beforeTitle: target.title,
        afterTitle: target.title,
        beforeTags: target.tags,
        afterTags: target.tags,
        beforeSubject: target.subject,
        afterSubject: target.subject,
      };
    }
    case 'read': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: target.content,
      };
    }
    case 'search': {
      const hits = await searchJournals(op.query || '');
      return {
        op: { ...op, risk },
        ok: true,
        content: hits.length
          ? hits
              .map((h) => `- [${h.journalId}] ${h.title}（${h.subject || '无分类'}）`)
              .join('\n')
          : '（未找到匹配文档）',
        searchResults: hits,
      };
    }
    case 'findDuplicates': {
      const groups = await findDuplicateJournals();
      return {
        op: { ...op, risk },
        ok: true,
        content: groups.length
          ? groups
              .map(
                (g) =>
                  `- 重复组：${g.items.map((i) => `「${i.title}」(${i.similarity.toFixed(2)})`).join('、')}\n  建议：${g.suggestion}`,
              )
              .join('\n')
          : '（未发现明显重复文档）',
        duplicateGroups: groups,
      };
    }
    case 'reviewQuality': {
      const issues = await reviewJournalQuality();
      const bySeverity = (s: QualityIssue['severity']) => issues.filter((i) => i.severity === s);
      return {
        op: { ...op, risk },
        ok: true,
        content: issues.length
          ? [
              `共发现 ${issues.length} 个问题：`,
              `- 错误：${bySeverity('error').length} 个`,
              `- 警告：${bySeverity('warning').length} 个`,
              `- 提示：${bySeverity('info').length} 个`,
              '',
              ...issues.slice(0, 20).map((i) => `- [${i.severity}] ${i.title}：${i.message}`),
            ].join('\n')
          : '（未发现问题，知识库质量良好）',
        qualityIssues: issues,
      };
    }
    case 'createStudyPlan': {
      const plan = await createStudyPlanSuggestion();
      return {
        op: { ...op, risk },
        ok: true,
        content: plan.length
          ? plan
              .map(
                (p) =>
                  `- ${p.reviewInDays === 0 ? '今天' : `${p.reviewInDays} 天后`}复习「${p.title}」：${p.reason}`,
              )
              .join('\n')
          : '（暂无学习计划建议）',
        studyPlan: plan,
      };
    }
    case 'suggestQualityFixes': {
      const fixes = await suggestQualityFixes();
      const low = fixes.filter((f) => f.risk === 'low');
      const high = fixes.filter((f) => f.risk === 'high');
      return {
        op: { ...op, risk },
        ok: true,
        content: fixes.length
          ? [
              `共 ${fixes.length} 条修复建议（低风险可自动修复 ${low.length} 条，高风险需确认 ${high.length} 条）：`,
              '',
              ...low.slice(0, 20).map(
                (f) => `- [可自动修复] ${f.title}：${f.message}\n  ${f.field}：${f.before || '（空）'} → ${f.after || '（待补充）'}`,
              ),
              ...high.slice(0, 10).map(
                (f) => `- [需确认] ${f.title}：${f.message}`,
              ),
            ].join('\n')
          : '（未发现可修复的质量问题）',
        qualityFixes: fixes,
      };
    }
    case 'analyzeJournalImpact': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      const impact = await analyzeJournalImpact(target.id);
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: [
          `影响等级：${impact.level === 'none' ? '无影响' : impact.level === 'affected' ? '有影响' : '无法确定'}`,
          impact.summary,
          '',
          ...impact.items.slice(0, 20).map((i) => `- [${i.kind}] ${i.title}：${i.detail}`),
        ].join('\n'),
        journalImpact: impact,
      };
    }
    case 'repairDocumentLinks': {
      const plan = await repairDocumentLinks();
      return {
        op: { ...op, risk },
        ok: true,
        content: plan.total
          ? [
              `共 ${plan.total} 条失效链接，可自动修复 ${plan.autoFixable} 条，需人工确认 ${plan.manualCount} 条：`,
              '',
              ...plan.items.slice(0, 20).map(
                (i) =>
                  `- [${i.autoFixable ? '可自动修复' : '需人工确认'}] ${i.sourceTitle}：「${i.linkText}」${i.autoFixable ? ` → 「${i.newLinkText}」` : '（无法匹配目标）'}`,
              ),
            ].join('\n')
          : '（未发现失效链接）',
        linkRepairPlan: plan,
      };
    }
    case 'rename': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `将「${target.title}」重命名为「${op.newName || ''}」`,
        beforeTitle: target.title,
        afterTitle: op.newName || target.title,
      };
    }
    case 'delete': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `删除「${target.title}」（移到回收站，可恢复）`,
        beforeTitle: target.title,
        afterTitle: target.title,
      };
    }
    case 'move': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `将「${target.title}」移动到分类「${op.newSubject || ''}」`,
        beforeSubject: target.subject,
        afterSubject: op.newSubject || '',
      };
    }
    case 'addTags': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      const merged = Array.from(new Set([...(target.tags ?? []), ...(op.tags ?? [])]));
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `为「${target.title}」添加标签：${(op.tags ?? []).join(', ')}`,
        beforeTags: target.tags,
        afterTags: merged,
      };
    }
    case 'removeTags': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      const remove = new Set(op.tags ?? []);
      const remaining = (target.tags ?? []).filter((t) => !remove.has(t));
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `从「${target.title}」移除标签：${(op.tags ?? []).join(', ')}`,
        beforeTags: target.tags,
        afterTags: remaining,
      };
    }
    case 'generateCards': {
      const target = op.journalId || op.title ? await resolveJournal(op) : null;
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target?.id,
        title: target?.title,
        content: `从${target ? `「${target.title}」` : '提供的内容'}生成知识卡片`,
      };
    }
    default:
      return { op: { ...op, risk }, ok: false, error: `未知操作类型: ${(op as AgentOp).type}` };
  }
}

/** 真正执行单个操作（写入） */
async function applyOp(op: AgentOp): Promise<AgentOpResult> {
  switch (op.type) {
    case 'create': {
      const entry = await createJournal({
        title: op.newTitle || '未命名文档',
        content: normalizeMarkdown(op.content || ''),
        tags: op.tags ?? [],
        subject: op.subject ?? '',
        sourceType: 'manual',
      });
      runCreatedJournalIds.push(entry.id);
      return { op, ok: true, journalId: entry.id, title: entry.title };
    }
    case 'edit': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await saveVersion(target.id, target.title, target.content);
      runVersions.push({ journalId: target.id, title: target.title, content: target.content });
      await updateJournal(target.id, { content: normalizeMarkdown(op.content || '') });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'append': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await saveVersion(target.id, target.title, target.content);
      runVersions.push({ journalId: target.id, title: target.title, content: target.content });
      const newContent = target.content.replace(/\s*$/, '\n') + '\n' + (op.content || '');
      await updateJournal(target.id, { content: normalizeMarkdown(newContent) });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'prepend': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await saveVersion(target.id, target.title, target.content);
      runVersions.push({ journalId: target.id, title: target.title, content: target.content });
      const newContent = (op.content || '') + '\n\n' + target.content;
      await updateJournal(target.id, { content: normalizeMarkdown(newContent) });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'insertAfter': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await saveVersion(target.id, target.title, target.content);
      runVersions.push({ journalId: target.id, title: target.title, content: target.content });
      const newContent = insertAfterHeading(target.content, op.afterHeading || '', op.content || '');
      await updateJournal(target.id, { content: normalizeMarkdown(newContent) });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'read': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      return { op, ok: true, journalId: target.id, title: target.title, content: target.content };
    }
    case 'search': {
      const hits = await searchJournals(op.query || '');
      return {
        op,
        ok: true,
        content: hits.length
          ? hits.map((h) => `- [${h.journalId}] ${h.title}`).join('\n')
          : '（未找到匹配文档）',
        searchResults: hits,
      };
    }
    case 'findDuplicates': {
      const groups = await findDuplicateJournals();
      return {
        op,
        ok: true,
        content: groups.length
          ? groups.map((g) => `- ${g.suggestion}`).join('\n')
          : '（未发现明显重复文档）',
        duplicateGroups: groups,
      };
    }
    case 'reviewQuality': {
      const issues = await reviewJournalQuality();
      return {
        op,
        ok: true,
        content: issues.length
          ? issues.slice(0, 20).map((i) => `- [${i.severity}] ${i.title}：${i.message}`).join('\n')
          : '（未发现问题，知识库质量良好）',
        qualityIssues: issues,
      };
    }
    case 'createStudyPlan': {
      const plan = await createStudyPlanSuggestion();
      return {
        op,
        ok: true,
        content: plan.length
          ? plan
              .map((p) => `- ${p.reviewInDays === 0 ? '今天' : `${p.reviewInDays} 天后`}复习「${p.title}」：${p.reason}`)
              .join('\n')
          : '（暂无学习计划建议）',
        studyPlan: plan,
      };
    }
    case 'suggestQualityFixes': {
      const fixes = await suggestQualityFixes();
      const low = fixes.filter((f) => f.risk === 'low');
      const high = fixes.filter((f) => f.risk === 'high');
      return {
        op,
        ok: true,
        content: fixes.length
          ? `共 ${fixes.length} 条修复建议（低风险 ${low.length} 条，高风险 ${high.length} 条）`
          : '（未发现可修复的质量问题）',
        qualityFixes: fixes,
      };
    }
    case 'analyzeJournalImpact': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const impact = await analyzeJournalImpact(target.id);
      return {
        op,
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `影响等级：${impact.level === 'none' ? '无影响' : impact.level === 'affected' ? '有影响' : '无法确定'}。${impact.summary}`,
        journalImpact: impact,
      };
    }
    case 'repairDocumentLinks': {
      const plan = await repairDocumentLinks();
      return {
        op,
        ok: true,
        content: plan.total
          ? `共 ${plan.total} 条失效链接，可自动修复 ${plan.autoFixable} 条，需人工确认 ${plan.manualCount} 条`
          : '（未发现失效链接）',
        linkRepairPlan: plan,
      };
    }
    case 'rename': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await updateJournal(target.id, { title: op.newName || target.title });
      return { op, ok: true, journalId: target.id, title: op.newName || target.title };
    }
    case 'delete': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await deleteJournal(target.id);
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'move': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await updateJournal(target.id, { subject: op.newSubject || '' });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'addTags': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      const merged = Array.from(new Set([...(target.tags ?? []), ...(op.tags ?? [])]));
      await updateJournal(target.id, { tags: merged });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'removeTags': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      const remove = new Set(op.tags ?? []);
      const remaining = (target.tags ?? []).filter((t) => !remove.has(t));
      await updateJournal(target.id, { tags: remaining });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'generateCards': {
      // 从目标文档或提供的内容生成知识卡片
      const target = op.journalId || op.title ? await resolveJournal(op) : null;
      const sourceContent = target?.content || op.content || '';
      if (!sourceContent.trim()) return { op, ok: false, error: '没有可生成卡片的内容' };
      // 简单切分：按 ## 标题或段落生成卡片
      const sections = sourceContent
        .split(/\n(?=#{1,3}\s)/)
        .map((s) => s.trim())
        .filter((s) => s.length > 10)
        .slice(0, 10);
      const cards = sections.map((sec) => {
        const lines = sec.split('\n');
        const heading = lines.find((l) => /^#{1,3}\s/.test(l))?.replace(/^#{1,3}\s/, '') || '知识点';
        const body = lines.filter((l) => !/^#{1,3}\s/.test(l)).join('\n').trim();
        return { front: heading, back: body || sec.slice(0, 200) };
      });
      for (const c of cards) {
        await createCard({
          front: c.front,
          back: c.back,
          cardType: 'basic',
          tags: op.tags ?? [],
          journalId: target?.id,
        });
      }
      return {
        op,
        ok: true,
        journalId: target?.id,
        title: target?.title,
        content: `已生成 ${cards.length} 张知识卡片`,
      };
    }
    default:
      return { op, ok: false, error: `未知操作类型: ${(op as AgentOp).type}` };
  }
}

/** 预览整个计划（不写入） */
export async function previewPlan(plan: AgentPlan): Promise<AgentExecutionResult> {
  const results: AgentOpResult[] = [];
  for (const op of plan.ops) {
    results.push(await previewOp(op));
  }
  return { results, hasError: results.some((r) => !r.ok) };
}

/**
 * 执行整个计划（真正写入）。
 * 所有写入操作包裹在单个 Dexie transaction 中：任一操作失败则整体回滚，
 * 避免数据处于「半完成」状态。同时用 planId 去重，防止重复点击造成重复写入。
 *
 * @param approvedOpIds 可选：仅执行这些 opId 的操作（逐项批准）。缺省执行全部。
 * @returns 执行结果，以及本次运行产生的版本快照（供撤销）
 */
export async function applyPlan(
  plan: AgentPlan,
  approvedOpIds?: Set<string>,
): Promise<AgentExecutionResult & { undo?: UndoInfo }> {
  const planId = plan.planId || 'plan';
  // 防重复执行：同一 planId 只允许执行一次（防止重复点击造成重复写入）
  if (appliedPlanIds.has(planId)) {
    return {
      results: plan.ops.map((op) => ({ op, ok: false, error: '该计划已执行过，请勿重复提交' })),
      hasError: true,
    };
  }
  appliedPlanIds.add(planId);
  // 逐项批准：过滤出要执行的操作
  const opsToRun = approvedOpIds
    ? plan.ops.filter((op) => op.opId && approvedOpIds.has(op.opId))
    : plan.ops;
  const skipped = approvedOpIds
    ? plan.ops.filter((op) => !(op.opId && approvedOpIds.has(op.opId)))
    : [];
  try {
    const results = await db.transaction(
      'rw',
      [db.journals, db.journalVersions, db.cards],
      async () => {
        const out: AgentOpResult[] = [];
        for (const op of opsToRun) {
          out.push(await applyOp(op));
        }
        return out;
      },
    );
    // 记录本次运行产生的版本快照，供「撤销本次运行」恢复
    const undo: UndoInfo = {
      planId,
      versions: runVersions.slice(),
      createdJournalIds: runCreatedJournalIds.slice(),
    };
    runVersions.length = 0;
    runCreatedJournalIds.length = 0;
    const skippedResults: AgentOpResult[] = skipped.map((op) => ({
      op,
      ok: true,
      skipped: true,
      content: '已跳过（未批准）',
    }));
    return {
      results: [...results, ...skippedResults],
      hasError: results.some((r) => !r.ok),
      undo,
    };
  } catch (e) {
    // 事务失败：整体回滚，返回失败结果；允许该计划重试
    appliedPlanIds.delete(planId);
    runVersions.length = 0;
    runCreatedJournalIds.length = 0;
    return {
      results: opsToRun.map((op) => ({ op, ok: false, error: `执行失败，已整体回滚：${(e as Error).message}` })),
      hasError: true,
    };
  }
}

/** 撤销信息：记录本次运行产生的版本快照与新建文档，供「撤销本次运行」恢复 */
export interface UndoInfo {
  planId?: string;
  /** 本次运行保存的版本快照（journalId → 变更前内容） */
  versions: { journalId: string; title: string; content: string }[];
  /** 本次运行新建的文档 id（撤销时删除） */
  createdJournalIds: string[];
}

/** 本次运行保存的版本快照（供撤销） */
const runVersions: { journalId: string; title: string; content: string }[] = [];
/** 本次运行新建的文档 id（供撤销） */
const runCreatedJournalIds: string[] = [];

/**
 * 撤销本次运行：恢复所有被修改文档的版本快照，并删除本次新建的文档。
 * 返回被恢复/删除的文档数量。
 */
export async function undoRun(undo: UndoInfo): Promise<{ restored: number; deleted: number }> {
  let restored = 0;
  let deleted = 0;
  await db.transaction('rw', [db.journals, db.journalVersions], async () => {
    for (const v of undo.versions) {
      const existing = await getJournal(v.journalId);
      if (existing && !existing.deletedAt) {
        await updateJournal(v.journalId, { title: v.title, content: v.content });
        restored++;
      }
    }
    for (const id of undo.createdJournalIds) {
      const existing = await getJournal(id);
      if (existing && !existing.deletedAt) {
        await deleteJournal(id);
        deleted++;
      }
    }
  });
  return { restored, deleted };
}

/** 已执行过的 planId 集合（内存级防重复） */
const appliedPlanIds = new Set<string>();
