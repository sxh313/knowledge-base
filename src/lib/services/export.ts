import { db, type JournalEntry } from '../db/schema';
import { getAttachment } from '../db/repositories/attachments';
import { rebuildDocumentIndexes } from '../indexing/documents';
import { markdownToHtml } from '../markdownUtils';
import JSZip from 'jszip';

const BACKUP_ARRAY_FIELDS = [
  'journals', 'notes', 'cards', 'graphNodes', 'graphEdges', 'aiConversations', 'journalVersions', 'attachments',
  'savedSearches', 'propertyDefinitions', 'categories', 'syncConflicts', 'agentSessions', 'agentMessages',
  'agentRuns', 'agentAuditLogs', 'agentRunEvents', 'agentStates', 'agentExecutionReceipts', 'memoryItems',
  'userPreferences', 'learningGoals', 'learningTasks', 'zero2ReviewSessions', 'zero2ReviewMessages',
  'zero2Mastery', 'zero2ReviewPlans', 'zero2ReviewTasks', 'zero2ReviewAttempts', 'zero2LearningMemories',
] as const;

export function validateBackupPayload(data: unknown): asserts data is Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('备份根对象格式错误');
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.journals)) throw new Error('备份缺少 journals 数组');
  if (record.version !== undefined && (typeof record.version !== 'number' || record.version < 1 || record.version > 20)) {
    throw new Error('备份版本号无效');
  }
  for (const field of BACKUP_ARRAY_FIELDS) {
    if (record[field] !== undefined && !Array.isArray(record[field])) throw new Error(`备份字段 ${field} 格式错误`);
  }
}

/**
 * 把 markdown 中 attachment://<id> 的图片引用解析为可渲染的 dataUrl。
 * 已保存文档的图片以附件落库、正文用 attachment://id 引用；导出 HTML/PDF 前必须解析，
 * 否则导出的 <img src="attachment://id"> 无法显示。
 */
async function resolveAttachmentMarkdown(markdown: string): Promise<string> {
  if (!markdown || !markdown.includes('attachment://')) return markdown;
  const ids = new Set<string>();
  for (const m of markdown.matchAll(/attachment:\/\/([^\s)\]"']+)/g)) {
    if (m[1]) ids.add(m[1]);
  }
  const cache = new Map<string, string>();
  for (const id of ids) {
    try {
      const att = await getAttachment(id);
      if (att?.dataUrl) cache.set(id, att.dataUrl);
    } catch {
      /* 附件缺失则保留原引用 */
    }
  }
  if (cache.size === 0) return markdown;
  return markdown.replace(/attachment:\/\/([^\s)\]"']+)/g, (raw, id: string) => {
    const url = cache.get(id);
    return url ? url : raw;
  });
}

/** 下载文本为文件 */
function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 生成导出文件名时间戳（yyyyMMdd-HHmmss），避免多次导出覆盖同名文件 */
function exportTimestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 导出文件名（标题 + 时间戳，去非法字符） */
function exportFilename(title: string, ext: string): string {
  const base = safeFilename(title);
  return `${base}-${exportTimestamp()}.${ext}`;
}

export async function exportAllData() {
  const rawAttachments = await db.attachments.toArray();
  const attachments = await Promise.all(rawAttachments.map(async (attachment) => ({
    ...attachment,
    blob: undefined,
    dataUrl: attachment.dataUrl ?? (attachment.blob ? await blobToDataUrl(attachment.blob) : undefined),
  })));
  const data = {
    version: 5,
    exportedAt: Date.now(),
    journals: await db.journals.toArray(),
    notes: await db.notes.toArray(),
    cards: await db.cards.toArray(),
    graphNodes: await db.graphNodes.toArray(),
    graphEdges: await db.graphEdges.toArray(),
    aiConversations: await db.aiConversations.toArray(),
    journalVersions: await db.journalVersions.toArray(),
    attachments,
    savedSearches: await db.savedSearches.toArray(),
    propertyDefinitions: await db.propertyDefinitions.toArray(),
    categories: await db.categories.toArray(),
    syncConflicts: await db.syncConflicts.toArray(),
    agentSessions: await db.agentSessions.toArray(),
    agentMessages: await db.agentMessages.toArray(),
    agentRuns: await db.agentRuns.toArray(),
    agentAuditLogs: await db.agentAuditLogs.toArray(),
    agentRunEvents: await db.agentRunEvents.toArray(),
    agentStates: await db.agentStates.toArray(),
    agentExecutionReceipts: await db.agentExecutionReceipts.toArray(),
    memoryItems: await db.memoryItems.toArray(),
    userPreferences: await db.userPreferences.toArray(),
    learningGoals: await db.learningGoals.toArray(),
    learningTasks: await db.learningTasks.toArray(),
    zero2ReviewSessions: await db.zero2ReviewSessions.toArray(),
    zero2ReviewMessages: await db.zero2ReviewMessages.toArray(),
    zero2Mastery: await db.zero2Mastery.toArray(),
    zero2ReviewPlans: await db.zero2ReviewPlans.toArray(),
    zero2ReviewTasks: await db.zero2ReviewTasks.toArray(),
    zero2ReviewAttempts: await db.zero2ReviewAttempts.toArray(),
    zero2LearningMemories: await db.zero2LearningMemories.toArray(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'knowledge-base-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

export async function importData(file: File) {
  if (file.size > 120 * 1024 * 1024) throw new Error('备份文件超过 120MB 上限');
  const text = await file.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('文件内容不是有效的 JSON 格式');
  }
  validateBackupPayload(data);
  await db.transaction(
    'rw',
    [
      db.journals, db.notes, db.cards, db.graphNodes, db.graphEdges,
      db.aiConversations, db.journalVersions, db.attachments, db.savedSearches,
      db.propertyDefinitions, db.categories, db.syncConflicts,
      db.agentSessions, db.agentMessages, db.agentRuns, db.agentAuditLogs,
      db.agentRunEvents, db.agentStates, db.agentExecutionReceipts, db.memoryItems,
      db.userPreferences, db.learningGoals, db.learningTasks,
      db.zero2ReviewSessions, db.zero2ReviewMessages, db.zero2Mastery,
      db.zero2ReviewPlans, db.zero2ReviewTasks, db.zero2ReviewAttempts,
      db.zero2LearningMemories,
    ],
    async () => {
      const put = async (value: unknown, table: { bulkPut: (rows: never[]) => Promise<unknown> }) => {
        if (Array.isArray(value) && value.length > 0) await table.bulkPut(value as never[]);
      };
      await put(data.journals, db.journals);
      await put(data.notes, db.notes);
      await put(data.cards, db.cards);
      await put(data.graphNodes, db.graphNodes);
      await put(data.graphEdges, db.graphEdges);
      await put(data.aiConversations, db.aiConversations);
      await put(data.journalVersions, db.journalVersions);
      await put(data.attachments, db.attachments);
      await put(data.savedSearches, db.savedSearches);
      await put(data.propertyDefinitions, db.propertyDefinitions);
      await put(data.categories, db.categories);
      await put(data.syncConflicts, db.syncConflicts);
      await put(data.agentSessions, db.agentSessions);
      await put(data.agentMessages, db.agentMessages);
      await put(data.agentRuns, db.agentRuns);
      await put(data.agentAuditLogs, db.agentAuditLogs);
      await put(data.agentRunEvents, db.agentRunEvents);
      await put(data.agentStates, db.agentStates);
      await put(data.agentExecutionReceipts, db.agentExecutionReceipts);
      await put(data.memoryItems, db.memoryItems);
      await put(data.userPreferences, db.userPreferences);
      await put(data.learningGoals, db.learningGoals);
      await put(data.learningTasks, db.learningTasks);
      await put(data.zero2ReviewSessions, db.zero2ReviewSessions);
      await put(data.zero2ReviewMessages, db.zero2ReviewMessages);
      await put(data.zero2Mastery, db.zero2Mastery);
      await put(data.zero2ReviewPlans, db.zero2ReviewPlans);
      await put(data.zero2ReviewTasks, db.zero2ReviewTasks);
      await put(data.zero2ReviewAttempts, db.zero2ReviewAttempts);
      await put(data.zero2LearningMemories, db.zero2LearningMemories);
    },
  );
  await rebuildDocumentIndexes();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** 把文件名中的非法字符替换为下划线 */
function safeFilename(title: string): string {
  const t = (title || '无标题').replace(/[\\/:*?"<>|\n\r\t]+/g, '_').replace(/\s+/g, ' ').trim();
  return t.slice(0, 80) || '无标题';
}

/** 生成 YAML frontmatter（含 id/标题/分类/标签/时间等元数据） */
function journalFrontmatter(j: JournalEntry): string {
  const fm: string[] = ['---'];
  fm.push(`id: ${j.id}`);
  fm.push(`title: ${JSON.stringify(j.title || '无标题')}`);
  if (j.subject) fm.push(`subject: ${JSON.stringify(j.subject)}`);
  if (j.tags?.length) fm.push(`tags: [${j.tags.map((t) => JSON.stringify(t)).join(', ')}]`);
  if (j.aliases?.length) fm.push(`aliases: [${j.aliases.map((a) => JSON.stringify(a)).join(', ')}]`);
  if (j.status && j.status !== 'active') fm.push(`status: ${j.status}`);
  fm.push(`createdAt: ${new Date(j.createdAt).toISOString()}`);
  fm.push(`updatedAt: ${new Date(j.updatedAt).toISOString()}`);
  if (j.pinned) fm.push('pinned: true');
  fm.push('---');
  return fm.join('\n');
}

/**
 * 方案A（单向）：把每篇文档导出为独立 .md（frontmatter + 正文），打包成 zip 下载。
 * 文件名 = 标题（去非法字符），重名自动加序号；不写入 GitHub、不影响现有同步。
 */
export async function exportJournalsAsMarkdownZip() {
  const journals = await db.journals.filter((j) => !j.deletedAt).toArray();
  const zip = new JSZip();
  const folder = zip.folder('docs')!;
  const used = new Map<string, number>();
  for (const j of journals) {
    let name = safeFilename(j.title);
    if (used.has(name)) {
      const n = (used.get(name) ?? 1) + 1;
      used.set(name, n);
      name = `${name}-${n}`;
    } else {
      used.set(name, 1);
    }
    folder.file(`${name}.md`, `${journalFrontmatter(j)}\n\n${j.content || ''}\n`);
  }
  folder.file(
    '_README.md',
    `# 导出说明\n\n导出时间：${new Date().toISOString()}\n文档数：${journals.length}\n\n每篇文档为一个独立 .md 文件，头部 YAML frontmatter 包含 id / 标题 / 分类 / 标签 / 时间等元数据。\n`,
  );
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `knowledge-base-md-${new Date().toISOString().split('T')[0]}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 内联排版样式（独立 HTML 文件用，保证分享出去也能正常显示） */
function buildInlineStyles(): string {
  return `
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1f2329; line-height: 1.7; }
    h1 { font-size: 2rem; font-weight: 700; border-bottom: 2px solid #e4e6eb; padding-bottom: 0.3rem; }
    h2 { font-size: 1.5rem; font-weight: 600; margin-top: 1.5rem; }
    h3 { font-size: 1.2rem; font-weight: 600; }
    a { color: #3370ff; }
    code { background: #f1f2f4; padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 0.9em; }
    pre { background: #0d1117; color: #c9d1d9; padding: 14px; border-radius: 8px; overflow-x: auto; }
    pre code { background: transparent; padding: 0; }
    blockquote { border-left: 4px solid #3370ff; background: #eaf1ff; margin: 0.5rem 0; padding: 0.5rem 1rem; border-radius: 0 8px 8px 0; color: #646a73; }
    table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; }
    th, td { border: 1px solid #d0d3da; padding: 6px 10px; text-align: left; }
    th { background: #f1f2f4; font-weight: 600; }
    img { max-width: 100%; border-radius: 8px; }
    div[data-type="callout"] { margin: 0.75rem 0; padding: 0.75rem 1rem; border-radius: 8px; border-left: 4px solid #3370ff; background: #eaf1ff; }
    div[data-type="callout"][data-variant="tip"] { border-color: #34c059; background: #e8f7ee; }
    div[data-type="callout"][data-variant="warning"] { border-color: #f5a623; background: #fff7e6; }
    div[data-type="callout"][data-variant="danger"] { border-color: #f54a45; background: #feefee; }
    .export-meta { color: #8f959e; font-size: 0.85rem; margin-bottom: 1.5rem; }
  `;
}

/** 导出当前文档为独立 HTML 文件（含内联样式，可分享） */
export async function exportJournalHTML(title: string, markdown: string) {
  const resolved = await resolveAttachmentMarkdown(markdown);
  const body = markdownToHtml(resolved);
  const dateStr = new Date().toLocaleString('zh-CN');
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${buildInlineStyles()}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="export-meta">导出于 ${dateStr}</p>
${body}
</body>
</html>`;
  downloadText(html, exportFilename(title, 'html'), 'text/html;charset=utf-8');
}

/** 导出当前文档为 PDF（直接生成 .pdf 文件下载，不弹打印对话框） */
export async function exportJournalPDF(title: string, markdown: string) {
  const resolved = await resolveAttachmentMarkdown(markdown);
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    // 内联样式兜底：确保渲染时内容位于最上层，不被工具栏/面板覆盖
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.top = '0';
    root.style.width = '100%';
    root.style.zIndex = '9999';
    root.style.background = '#fff';
    document.body.appendChild(root);
  }
  const body = markdownToHtml(resolved);
  root.innerHTML = `<h1>${escapeHtml(title)}</h1>${body}`;
  // 等一帧让 DOM 渲染，再生成 PDF
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100)));
  try {
    const { default: html2pdf } = await import('html2pdf.js');
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: exportFilename(title, 'pdf'),
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(root)
      .save();
  } finally {
    // 生成完成后清理
    const r = document.getElementById('print-root');
    if (r) r.innerHTML = '';
  }
}
