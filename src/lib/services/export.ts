import { db } from '../db/schema';
import { markdownToHtml } from '../markdownUtils';

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
export function exportJournalHTML(title: string, markdown: string) {
  const body = markdownToHtml(markdown);
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
  downloadText(html, `${title || '未命名'}.html`, 'text/html;charset=utf-8');
}

/** 导出当前文档为 PDF（通过浏览器打印，调用 window.print） */
export function exportJournalPDF(title: string, markdown: string) {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  const body = markdownToHtml(markdown);
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
