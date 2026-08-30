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
import type {
  AgentOp,
  AgentPlan,
  AgentOpResult,
  AgentExecutionResult,
} from './tools';
import { classifyRisk } from './tools';
import {
  findDuplicateJournals,
  reviewJournalQuality,
  createStudyPlanSuggestion,
  suggestQualityFixes,
  qualityFixesToPlan,
  type QualityIssue,
} from './quality';
import { analyzeJournalImpact, repairDocumentLinks, linkRepairPlanToAgentPlan } from './impact';
import { analyzeKnowledgeGaps, suggestJournalMetadata, findRelatedJournals, metadataSuggestionsToPlan } from './quality';
import { explainSyncConflict, prepareConflictMerge, conflictToResult } from './conflicts';
import { searchJournals } from './search';
export { searchJournals } from './search';

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
  // 未找到标题必须失败，不能静默追加到文档末尾。
  throw new Error(`未找到标题「${target}」，已阻止插入`);
}

/** 只替换第一处精确文本，避免链接修复或质量修复误改其它段落。 */
function patchText(content: string, findText: string, replaceText: string): string {
  const index = content.indexOf(findText);
  if (index < 0) throw new Error(`未找到待替换文本「${findText.slice(0, 80)}」`);
  return content.slice(0, index) + replaceText + content.slice(index + findText.length);
}

function buildCardDrafts(sourceContent: string): { front: string; back: string }[] {
  return sourceContent.split(/\n(?=#{1,3}\s)/).map((s) => s.trim()).filter((s) => s.length > 10).slice(0, 10).map((section) => {
    const lines = section.split('\n');
    const front = lines.find((line) => /^#{1,3}\s/.test(line))?.replace(/^#{1,3}\s/, '') || '知识点';
    const back = lines.filter((line) => !/^#{1,3}\s/.test(line)).join('\n').trim();
    return { front, back: back || section.slice(0, 200) };
  });
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
        suggestedPlan: qualityFixesToPlan(low),
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
        suggestedPlan: linkRepairPlanToAgentPlan(plan),
      };
    }
    case 'patchJournal': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      let afterContent: string;
      try { afterContent = normalizeMarkdown(patchText(target.content, op.findText || '', op.replaceText ?? '')); }
      catch (e) { return { op: { ...op, risk }, ok: false, error: (e as Error).message }; }
      return {
        op: { ...op, risk }, ok: true, journalId: target.id, title: target.title,
        content: `在「${target.title}」中精确替换一处文本`, beforeContent: target.content, afterContent,
        beforeTitle: target.title, afterTitle: target.title, beforeTags: target.tags, afterTags: target.tags,
        beforeSubject: target.subject, afterSubject: target.subject,
      };
    }
    case 'updateMetadata': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      const metadata = op.metadata ?? {};
      const afterTags = metadata.tags ? Array.from(new Set(metadata.tags.filter(Boolean))) : target.tags;
      return {
        op: { ...op, risk }, ok: true, journalId: target.id, title: target.title,
        content: `更新「${target.title}」的元数据`, beforeTitle: target.title, afterTitle: target.title,
        beforeTags: target.tags, afterTags, beforeSubject: target.subject, afterSubject: metadata.subject ?? target.subject,
        beforeSummary: target.summary || '', afterSummary: metadata.summary ?? (target.summary || ''),
      };
    }
    case 'analyzeKnowledgeGaps': {
      const report = await analyzeKnowledgeGaps(op.topic || op.query || op.title || '');
      return {
        op: { ...op, risk },
        ok: true,
        content: report.missing.length
          ? `主题「${report.topic}」已覆盖 ${report.covered.length} 个概念，发现 ${report.missing.length} 个知识缺口：${report.missing.map((x) => x.concept).join('、')}`
          : `主题「${report.topic}」已覆盖 ${report.covered.length} 个概念，暂未发现明显缺口。`,
        knowledgeGaps: report,
      };
    }
    case 'suggestJournalMetadata': {
      const suggestions = await suggestJournalMetadata(op.journalId);
      return {
        op: { ...op, risk },
        ok: true,
        content: suggestions.length ? suggestions.map((s) => `「${s.title}」${s.suggestedTitle ? `建议标题：${s.suggestedTitle}；` : ''}${s.summary ? `摘要：${s.summary}` : ''}${s.tags.length ? `；标签：${s.tags.join('、')}` : ''}`).join('\n') : '（没有找到待整理文档）',
        metadataSuggestions: suggestions,
        suggestedPlan: metadataSuggestionsToPlan(suggestions),
      };
    }
    case 'findRelatedJournals': {
      const related = await findRelatedJournals({ journalId: op.journalId, topic: op.topic || op.query || op.title });
      return {
        op: { ...op, risk },
        ok: true,
        content: related.length ? related.map((r) => `- ${r.title}（${Math.round(r.score * 100)}%）：${r.reason}`).join('\n') : '（未找到明显相关文档）',
        relatedJournals: related,
      };
    }
    case 'explainSyncConflict': {
      return conflictToResult(op, await explainSyncConflict(op.conflictId, op.journalId));
    }
    case 'prepareConflictMerge': {
      return conflictToResult(op, await prepareConflictMerge(op.conflictId, op.journalId));
    }
    case 'applyConflictMerge': {
      const report = await prepareConflictMerge(op.conflictId, op.journalId);
      if (!report) return { op: { ...op, risk }, ok: false, error: '没有找到未解决的同步冲突' };
      const target = await resolveJournal({ ...op, journalId: report.journalId });
      if (!target) return { op: { ...op, risk }, ok: false, error: '冲突目标文档不存在' };
      const draft = op.content ?? report.draft ?? report.local;
      return { op: { ...op, risk }, ok: true, journalId: target.id, title: target.title,
        content: `将合并草案写入「${target.title}」（保留冲突前版本）`, beforeContent: target.content, afterContent: normalizeMarkdown(draft),
        beforeTitle: target.title, afterTitle: target.title, beforeTags: target.tags, afterTags: target.tags,
        beforeSubject: target.subject, afterSubject: target.subject };
    }
    case 'rename': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      const impact = await analyzeJournalImpact(target.id);
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `将「${target.title}」重命名为「${op.newName || ''}」\n${impact.summary}`,
        journalImpact: impact,
        beforeTitle: target.title,
        afterTitle: op.newName || target.title,
      };
    }
    case 'delete': {
      const target = await resolveJournal(op);
      if (!target) return { op: { ...op, risk }, ok: false, error: '未找到目标文档' };
      const impact = await analyzeJournalImpact(target.id);
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `删除「${target.title}」（移到回收站，可恢复）\n${impact.summary}`,
        journalImpact: impact,
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
      const cards = buildCardDrafts(target?.content || op.content || '');
      return {
        op: { ...op, risk },
        ok: true,
        journalId: target?.id,
        title: target?.title,
        content: `从${target ? `「${target.title}」` : '提供的内容'}生成 ${cards.length} 张知识卡片`,
        cards,
      };
    }
    default:
      return { op: { ...op, risk }, ok: false, error: `未知操作类型: ${(op as AgentOp).type}` };
  }
}

/** 真正执行单个操作（写入） */
interface ExecutionContext {
  versions: UndoInfo['versions'];
  createdJournalIds: string[];
  createdJournalHashes: Record<string, string>;
}

async function applyOp(op: AgentOp, execution: ExecutionContext): Promise<AgentOpResult> {
  switch (op.type) {
    case 'create': {
      const entry = await createJournal({
        title: op.newTitle || '未命名文档',
        content: normalizeMarkdown(op.content || ''),
        tags: op.tags ?? [],
        subject: op.subject ?? '',
        sourceType: 'manual',
      });
      execution.createdJournalIds.push(entry.id);
      return { op, ok: true, journalId: entry.id, title: entry.title };
    }
    case 'edit': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
      await updateJournal(target.id, { content: normalizeMarkdown(op.content || '') });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'append': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
      const newContent = target.content.replace(/\s*$/, '\n') + '\n' + (op.content || '');
      await updateJournal(target.id, { content: normalizeMarkdown(newContent) });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'prepend': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
      const newContent = (op.content || '') + '\n\n' + target.content;
      await updateJournal(target.id, { content: normalizeMarkdown(newContent) });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'insertAfter': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
      const newContent = insertAfterHeading(target.content, op.afterHeading || '', op.content || '');
      await updateJournal(target.id, { content: normalizeMarkdown(newContent) });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'patchJournal': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
      const newContent = normalizeMarkdown(patchText(target.content, op.findText || '', op.replaceText ?? ''));
      await updateJournal(target.id, { content: newContent });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'updateMetadata': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
      const metadata = op.metadata ?? {};
      await updateJournal(target.id, {
        summary: metadata.summary ?? target.summary,
        tags: metadata.tags ? Array.from(new Set(metadata.tags.filter(Boolean))) : target.tags,
        subject: metadata.subject ?? target.subject,
        aliases: metadata.aliases ?? target.aliases,
        status: metadata.status ?? target.status,
      });
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
    case 'applyConflictMerge': {
      const report = await prepareConflictMerge(op.conflictId, op.journalId);
      if (!report) return { op, ok: false, error: '没有找到未解决的同步冲突' };
      const target = await resolveJournal({ ...op, journalId: report.journalId });
      if (!target) return { op, ok: false, error: '冲突目标文档不存在' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
      const draft = op.content ?? report.draft ?? report.local;
      await updateJournal(target.id, { content: normalizeMarkdown(draft) });
      await db.syncConflicts.update(report.conflictId, { resolvedAt: Date.now(), resolution: 'both' });
      return { op, ok: true, journalId: target.id, title: target.title, content: '已保存合并结果，并保留冲突前快照' };
    }
    case 'rename': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
      await updateJournal(target.id, { title: op.newName || target.title });
      return { op, ok: true, journalId: target.id, title: op.newName || target.title };
    }
    case 'delete': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
      await deleteJournal(target.id);
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'move': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
      await updateJournal(target.id, { subject: op.newSubject || '' });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'addTags': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
      const merged = Array.from(new Set([...(target.tags ?? []), ...(op.tags ?? [])]));
      await updateJournal(target.id, { tags: merged });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'removeTags': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const hashErr = await verifyExpectedHash(op, target);
      if (hashErr) return { op, ok: false, error: hashErr };
      await captureSnapshot(target, execution);
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
      const cards = buildCardDrafts(sourceContent);
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
        cards,
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

/** 运行时操作状态（拓扑执行过程中的生命周期） */
export type OpStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

/**
 * 拓扑排序：按依赖关系重排操作（依赖在前），执行顺序不再完全依赖模型返回数组。
 * 存在循环依赖时抛出错误。
 */
export function topologicalSort(ops: AgentOp[]): AgentOp[] {
  const keys = ops.map((op, i) => op.opId ?? `__op_${i}`);
  const idSet = new Set(ops.map((op) => op.opId).filter((id): id is string => !!id));
  const keyById = new Map<string, string>();
  ops.forEach((op, i) => {
    if (op.opId) keyById.set(op.opId, keys[i]);
  });
  const indegree = new Map<string, number>(keys.map((k) => [k, 0]));
  const dependents = new Map<string, string[]>(keys.map((k) => [k, []]));
  ops.forEach((op, i) => {
    for (const dep of op.dependsOn ?? []) {
      if (!idSet.has(dep)) continue; // 未知依赖在 validateAgentPlan 阶段已拦截
      const depKey = keyById.get(dep)!;
      indegree.set(keys[i], (indegree.get(keys[i]) ?? 0) + 1);
      dependents.get(depKey)!.push(keys[i]);
    }
  });
  const result: AgentOp[] = [];
  let queue = ops.map((op, i) => ({ op, key: keys[i] }));
  while (queue.length) {
    const idx = queue.findIndex((e) => (indegree.get(e.key) ?? 0) === 0);
    if (idx < 0) throw new Error('计划存在循环依赖，无法确定执行顺序');
    const [entry] = queue.splice(idx, 1);
    result.push(entry.op);
    for (const dependent of dependents.get(entry.key) ?? []) {
      indegree.set(dependent, (indegree.get(dependent) ?? 1) - 1);
    }
  }
  return result;
}

/** 前置条件校验：不满足返回错误信息，满足返回 null */
async function checkPreconditions(op: AgentOp): Promise<string | null> {
  const preconditions = op.preconditions ?? [];
  if (!preconditions.length) return null;
  const target = op.journalId || op.title ? await resolveJournal(op) : null;
  for (const p of preconditions) {
    if (!p) continue;
    if (p.journalExists === true && !target) return '前置条件不满足：目标文档不存在';
    if (p.journalExists === false && target) return '前置条件不满足：目标文档已存在';
    if (p.expectedHash && target) {
      const currentHash = await calculateContentHash({ title: target.title, content: target.content });
      if (currentHash !== p.expectedHash) return '前置条件不满足：文档内容与预期不一致';
    }
  }
  return null;
}

/** 内部信号：任一写操作失败时携带逐操作结果触发整体回滚（默认保持整批事务回滚语义） */
class RollbackWithResults extends Error {
  constructor(readonly opResults: AgentOpResult[]) {
    super('操作失败，已整体回滚');
  }
}

class DuplicatePlanError extends Error {}

/**
 * 执行整个计划（真正写入）。
 * 所有写入操作包裹在单个 Dexie transaction 中：按拓扑顺序执行，
 * 前置依赖失败的操作标记为 skipped 并跳过；任一写操作失败仍整体回滚，
 * 避免数据处于「半完成」状态。同时用 planId 去重，防止重复点击造成重复写入。
 *
 * @param approvedOpIds 可选：仅执行这些 opId 的操作（逐项批准）。缺省执行全部。
 * @returns 执行结果，以及本次运行产生的版本快照（供撤销）
 */
export async function applyPlan(
  plan: AgentPlan,
  approvedOpIds?: Set<string>,
): Promise<AgentExecutionResult & { undo?: UndoInfo }> {
  const planId = plan.planId || crypto.randomUUID();
  // 防重复执行：同一 planId 只允许执行一次（防止重复点击造成重复写入）
  const persistedReceipt = await db.agentExecutionReceipts.get(planId);
  if (appliedPlanIds.has(planId) || persistedReceipt) {
    return {
      results: plan.ops.map((op) => ({ op, ok: false, error: '该计划已执行过，请勿重复提交' })),
      hasError: true,
    };
  }
  appliedPlanIds.add(planId);
  const execution: ExecutionContext = { versions: [], createdJournalIds: [], createdJournalHashes: {} };
  // 逐项批准：过滤出要执行的操作
  const opsToRun = approvedOpIds
    ? plan.ops.filter((op) => op.opId && approvedOpIds.has(op.opId))
    : plan.ops;
  const skipped = approvedOpIds
    ? plan.ops.filter((op) => !(op.opId && approvedOpIds.has(op.opId)))
    : [];
  // 拓扑排序：按依赖关系执行；循环依赖直接拒绝
  let ordered: AgentOp[];
  try {
    ordered = topologicalSort(opsToRun);
  } catch (e) {
    appliedPlanIds.delete(planId);
    return {
      results: opsToRun.map((op) => ({ op, ok: false, error: (e as Error).message })),
      hasError: true,
    };
  }
  try {
      const results = await db.transaction(
        'rw',
      [db.journals, db.journalVersions, db.cards, db.documentLinks, db.documentChunks, db.attachments, db.syncConflicts, db.agentExecutionReceipts],
      async () => {
        if (await db.agentExecutionReceipts.get(planId)) {
          throw new DuplicatePlanError('该计划已执行过，请勿重复提交');
        }
        await db.agentExecutionReceipts.put({ planId, status: 'running', startedAt: Date.now() });
        const out: AgentOpResult[] = [];
        const statusById = new Map<string, OpStatus>();
        const runnableIds = new Set(ordered.map((op) => op.opId).filter((id): id is string => !!id));
        for (const op of ordered) {
          const opKey = op.opId ?? '';
          // 前置依赖失败或被跳过：该操作自动跳过，不执行写入
          const deps = (op.dependsOn ?? []).filter((d) => runnableIds.has(d));
          const blocked = deps.find((d) => statusById.get(d) !== 'success');
          if (blocked) {
            statusById.set(opKey, 'skipped');
            out.push({
              op,
              ok: false,
              skipped: true,
              opStatus: 'skipped',
              skippedReason: '前置操作失败，已自动跳过',
            });
            continue;
          }
          // 前置条件校验（journalExists / expectedHash）
          const preError = await checkPreconditions(op);
          if (preError) {
            statusById.set(opKey, 'failed');
            out.push({ op, ok: false, opStatus: 'failed', error: preError });
            continue;
          }
          const startedAt = performance.now();
          const result = await applyOp(op, execution);
          const durationMs = Math.round(performance.now() - startedAt);
          statusById.set(opKey, result.ok ? 'success' : 'failed');
          out.push({ ...result, durationMs, opStatus: result.ok ? 'success' : 'failed' });
        }
        // 默认保持整批事务回滚：任一写操作失败则抛出信号回滚全部写入
        if (out.some((r) => !r.ok && !r.skipped)) {
          throw new RollbackWithResults(out);
        }
        for (const version of execution.versions) {
          const current = await getJournal(version.journalId);
          if (current) {
            version.afterHash = await calculateContentHash({ title: current.title, content: current.content });
          }
        }
        for (const id of execution.createdJournalIds) {
          const current = await getJournal(id);
          if (current) {
            execution.createdJournalHashes[id] = await calculateContentHash({ title: current.title, content: current.content });
          }
        }
        await db.agentExecutionReceipts.put({
          planId,
          status: 'success',
          startedAt: Date.now(),
          finishedAt: Date.now(),
        });
        return out;
      },
    );
    // 记录本次运行产生的版本快照，供「撤销本次运行」恢复
    const undo: UndoInfo = {
      planId,
      versions: execution.versions,
      createdJournalIds: execution.createdJournalIds,
      createdJournalHashes: execution.createdJournalHashes,
    };
    const skippedResults: AgentOpResult[] = skipped.map((op) => ({
      op,
      ok: true,
      skipped: true,
      opStatus: 'skipped' as const,
      skippedReason: '未批准，已跳过',
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
    if (e instanceof RollbackWithResults) {
      // 保留逐操作的失败/跳过信息；已成功的写入标注整体回滚
      return {
        results: e.opResults.map((r) =>
          r.ok && !r.skipped ? { ...r, ok: false, error: '执行失败，已整体回滚' } : r,
        ),
        hasError: true,
      };
    }
    if (e instanceof DuplicatePlanError) {
      return {
        results: opsToRun.map((op) => ({ op, ok: false, error: e.message })),
        hasError: true,
      };
    }
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
  versions: {
    journalId: string;
    title: string;
    content: string;
    tags?: string[];
    subject?: string;
    aliases?: string[];
    status?: JournalEntry['status'];
    deletedAt?: number;
    /** Agent 执行完成后该文档的内容哈希；撤销前必须匹配。 */
    afterHash?: string;
  }[];
  /** 本次运行新建的文档 id（撤销时删除） */
  createdJournalIds: string[];
  /** 新建文档执行完成后的内容哈希；撤销前必须匹配。 */
  createdJournalHashes?: Record<string, string>;
}

async function captureSnapshot(target: JournalEntry, execution: ExecutionContext): Promise<void> {
  await saveVersion(target.id, target.title, target.content);
  if (execution.versions.some((v) => v.journalId === target.id)) return;
  execution.versions.push({
    journalId: target.id,
    title: target.title,
    content: target.content,
    tags: target.tags,
    subject: target.subject,
    aliases: target.aliases,
    status: target.status,
    deletedAt: target.deletedAt,
  });
}

/**
 * 撤销本次运行：恢复所有被修改文档的版本快照，并删除本次新建的文档。
 * 返回被恢复/删除的文档数量。
 */
export interface UndoConflict {
  journalId: string;
  title?: string;
  reason: 'missing_after_hash' | 'missing_document' | 'modified_after_run';
}

export class UndoConflictError extends Error {
  constructor(readonly conflicts: UndoConflict[]) {
    super(`无法安全撤销：${conflicts.map((item) => item.title || item.journalId).join('、')} 在执行后已变化或缺少校验信息`);
    this.name = 'UndoConflictError';
  }
}

export async function undoRun(undo: UndoInfo): Promise<{ restored: number; deleted: number }> {
  const conflicts: UndoConflict[] = [];
  for (const version of undo.versions) {
    if (!version.afterHash) {
      conflicts.push({ journalId: version.journalId, title: version.title, reason: 'missing_after_hash' });
      continue;
    }
    const current = await getJournal(version.journalId);
    if (!current) {
      conflicts.push({ journalId: version.journalId, title: version.title, reason: 'missing_document' });
      continue;
    }
    const currentHash = await calculateContentHash({ title: current.title, content: current.content });
    if (currentHash !== version.afterHash) {
      conflicts.push({ journalId: version.journalId, title: current.title, reason: 'modified_after_run' });
    }
  }
  for (const id of undo.createdJournalIds) {
    const current = await getJournal(id);
    if (!current || current.deletedAt) continue;
    const expectedHash = undo.createdJournalHashes?.[id];
    const currentHash = await calculateContentHash({ title: current.title, content: current.content });
    if (!expectedHash || currentHash !== expectedHash) {
      conflicts.push({ journalId: id, title: current.title, reason: expectedHash ? 'modified_after_run' : 'missing_after_hash' });
    }
  }
  if (conflicts.length) throw new UndoConflictError(conflicts);

  let restored = 0;
  let deleted = 0;
  await db.transaction('rw', [db.journals, db.journalVersions, db.documentLinks, db.documentChunks, db.attachments, db.agentExecutionReceipts], async () => {
    for (const v of undo.versions) {
      const existing = await getJournal(v.journalId);
      if (existing) {
        await updateJournal(v.journalId, {
          title: v.title,
          content: v.content,
          tags: v.tags,
          subject: v.subject,
          aliases: v.aliases,
          status: v.status,
          deletedAt: v.deletedAt,
        });
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
    if (undo.planId) await db.agentExecutionReceipts.delete(undo.planId);
  });
  if (undo.planId) appliedPlanIds.delete(undo.planId);
  return { restored, deleted };
}

/** 已执行过的 planId 集合（内存级防重复） */
const appliedPlanIds = new Set<string>();
