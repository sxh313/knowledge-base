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
import { normalizeMarkdown } from '../indexing/documents';
import type {
  AgentOp,
  AgentPlan,
  AgentOpResult,
  AgentExecutionResult,
} from './tools';

/** 按 id 或标题定位文档 */
async function resolveJournal(op: AgentOp): Promise<JournalEntry | null> {
  if (op.journalId) {
    const byId = await getJournal(op.journalId);
    if (byId && !byId.deletedAt) return byId;
  }
  if (op.title) {
    const all = await db.journals.filter((j) => !j.deletedAt).toArray();
    const match = all.find(
      (j) => j.title.trim().toLowerCase() === op.title!.trim().toLowerCase(),
    );
    if (match) return match;
    // 模糊匹配：标题包含
    const fuzzy = all.find((j) =>
      j.title.toLowerCase().includes(op.title!.trim().toLowerCase()),
    );
    if (fuzzy) return fuzzy;
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

/** 计算单个操作的预览（不写入） */
async function previewOp(op: AgentOp): Promise<AgentOpResult> {
  switch (op.type) {
    case 'create':
      return {
        op,
        ok: true,
        title: op.newTitle || '未命名文档',
        content: `新建文档「${op.newTitle || '未命名'}」\n\n${op.content || ''}`,
      };
    case 'edit': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      return {
        op,
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `编辑「${target.title}」：\n\n${op.content || ''}`,
      };
    }
    case 'append': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      return {
        op,
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `在「${target.title}」末尾追加：\n\n${op.content || ''}`,
      };
    }
    case 'prepend': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      return {
        op,
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `在「${target.title}」开头插入：\n\n${op.content || ''}`,
      };
    }
    case 'insertAfter': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      return {
        op,
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `在「${target.title}」的「${op.afterHeading || ''}」后插入：\n\n${op.content || ''}`,
      };
    }
    case 'read': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      return {
        op,
        ok: true,
        journalId: target.id,
        title: target.title,
        content: target.content,
      };
    }
    case 'search': {
      const q = (op.query || '').toLowerCase();
      const all = await db.journals.filter((j) => !j.deletedAt).toArray();
      const hits = all
        .filter(
          (j) =>
            j.title.toLowerCase().includes(q) ||
            (j.content || '').toLowerCase().includes(q) ||
            (j.tags ?? []).some((t) => t.toLowerCase().includes(q)),
        )
        .slice(0, 10);
      return {
        op,
        ok: true,
        content: hits.length
          ? hits
              .map((h) => `- [${h.id}] ${h.title}（${h.subject || '无分类'}）`)
              .join('\n')
          : '（未找到匹配文档）',
      };
    }
    case 'rename': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      return {
        op,
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `将「${target.title}」重命名为「${op.newName || ''}」`,
      };
    }
    case 'delete': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      return {
        op,
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `删除「${target.title}」（移到回收站，可恢复）`,
      };
    }
    case 'move': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      return {
        op,
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `将「${target.title}」移动到分类「${op.newSubject || ''}」`,
      };
    }
    case 'addTags': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      return {
        op,
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `为「${target.title}」添加标签：${(op.tags ?? []).join(', ')}`,
      };
    }
    case 'removeTags': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      return {
        op,
        ok: true,
        journalId: target.id,
        title: target.title,
        content: `从「${target.title}」移除标签：${(op.tags ?? []).join(', ')}`,
      };
    }
    case 'generateCards': {
      const target = op.journalId || op.title ? await resolveJournal(op) : null;
      return {
        op,
        ok: true,
        journalId: target?.id,
        title: target?.title,
        content: `从${target ? `「${target.title}」` : '提供的内容'}生成知识卡片`,
      };
    }
    default:
      return { op, ok: false, error: `未知操作类型: ${(op as AgentOp).type}` };
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
      return { op, ok: true, journalId: entry.id, title: entry.title };
    }
    case 'edit': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      await saveVersion(target.id, target.title, target.content);
      await updateJournal(target.id, { content: normalizeMarkdown(op.content || '') });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'append': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      await saveVersion(target.id, target.title, target.content);
      const newContent = target.content.replace(/\s*$/, '\n') + '\n' + (op.content || '');
      await updateJournal(target.id, { content: normalizeMarkdown(newContent) });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'prepend': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      await saveVersion(target.id, target.title, target.content);
      const newContent = (op.content || '') + '\n\n' + target.content;
      await updateJournal(target.id, { content: normalizeMarkdown(newContent) });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'insertAfter': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      await saveVersion(target.id, target.title, target.content);
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
      const q = (op.query || '').toLowerCase();
      const all = await db.journals.filter((j) => !j.deletedAt).toArray();
      const hits = all
        .filter(
          (j) =>
            j.title.toLowerCase().includes(q) ||
            (j.content || '').toLowerCase().includes(q) ||
            (j.tags ?? []).some((t) => t.toLowerCase().includes(q)),
        )
        .slice(0, 10);
      return {
        op,
        ok: true,
        content: hits.length
          ? hits.map((h) => `- [${h.id}] ${h.title}`).join('\n')
          : '（未找到匹配文档）',
      };
    }
    case 'rename': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      await updateJournal(target.id, { title: op.newName || target.title });
      return { op, ok: true, journalId: target.id, title: op.newName || target.title };
    }
    case 'delete': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      await deleteJournal(target.id);
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'move': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      await updateJournal(target.id, { subject: op.newSubject || '' });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'addTags': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
      const merged = Array.from(new Set([...(target.tags ?? []), ...(op.tags ?? [])]));
      await updateJournal(target.id, { tags: merged });
      return { op, ok: true, journalId: target.id, title: target.title };
    }
    case 'removeTags': {
      const target = await resolveJournal(op);
      if (!target) return { op, ok: false, error: '未找到目标文档' };
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

/** 执行整个计划（真正写入） */
export async function applyPlan(plan: AgentPlan): Promise<AgentExecutionResult> {
  const results: AgentOpResult[] = [];
  for (const op of plan.ops) {
    results.push(await applyOp(op));
  }
  return { results, hasError: results.some((r) => !r.ok) };
}
