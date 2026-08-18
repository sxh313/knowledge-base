import { db, type JournalEntry } from '../db/schema';
import { getAttachment } from '../db/queries';
import { markdownToHtml } from '../markdownUtils';
import JSZip from 'jszip';

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
  const data = {
    version: 1,
    exportedAt: Date.now(),
    journals: await db.journals.toArray(),
    notes: await db.notes.toArray(),
    cards: await db.cards.toArray(),
    graphNodes: await db.graphNodes.toArray(),
    graphEdges: await db.graphEdges.toArray(),
    settings: await db.settings.toArray(),
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
  const text = await file.text();
  const data = JSON.parse(text);
  await db.transaction('rw',
    db.journals, db.notes, db.cards, db.graphNodes, db.graphEdges,
    async () => {
      if (data.journals) await db.journals.bulkPut(data.journals);
      if (data.notes) await db.notes.bulkPut(data.notes);
      if (data.cards) await db.cards.bulkPut(data.cards);
      if (data.graphNodes) await db.graphNodes.bulkPut(data.graphNodes);
      if (data.graphEdges) await db.graphEdges.bulkPut(data.graphEdges);
    }
  );
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

/** 导出当前文档为 PDF（通过浏览器打印，调用 window.print） */
export async function exportJournalPDF(title: string, markdown: string) {
  const resolved = await resolveAttachmentMarkdown(markdown);
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  const body = markdownToHtml(resolved);
  root.innerHTML = `<h1>${escapeHtml(title)}</h1>${body}`;
  // 等一帧让 DOM 渲染，再触发打印
  requestAnimationFrame(() => {
    setTimeout(() => {
      window.print();
      // 打印对话框关闭后清理
      setTimeout(() => { const r = document.getElementById('print-root'); if (r) r.innerHTML = ''; }, 1500);
    }, 150);
  });
}
