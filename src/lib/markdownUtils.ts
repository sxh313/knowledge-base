import { marked } from 'marked';
import TurndownService from 'turndown';

// ─── Markdown ↔ HTML 转换工具 ───
// 存储层用 Markdown，编辑器用 HTML，这里做双向转换

marked.setOptions({
  gfm: true,
  breaks: true,
});

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});

// 配置 turndown 规则
turndown.addRule('taskList', {
  filter: (node) => {
    return node.nodeName === 'INPUT' && (node as HTMLInputElement).hasAttribute('type') && (node as HTMLInputElement).getAttribute('type') === 'checkbox';
  },
  replacement: (content, node) => {
    return (node as HTMLInputElement).checked ? '[x] ' : '[ ] ';
  },
});

// ─── Callout (GFM alerts) 双向转换 ───
// Markdown: > [!NOTE] / > [!TIP] / > [!WARNING] / > [!IMPORTANT]
// HTML:    <div data-type="callout" data-variant="note">...</div>
// 类型映射：IMPORTANT → danger（红色危险块），WARNING → warning（黄色）
const CALLOUT_TYPE_MAP: Record<string, string> = {
  note: 'note',
  tip: 'tip',
  warning: 'warning',
  important: 'danger',
  caution: 'danger',
  danger: 'danger',
};
const CALLOUT_REVERSE_MAP: Record<string, string> = {
  note: 'NOTE',
  tip: 'TIP',
  warning: 'WARNING',
  danger: 'IMPORTANT',
};

// turndown rule：把 div[data-type=callout] 转回 > [!TYPE] GFM alert 语法
// content 是 turndown 递归处理好的内部 markdown，逐行加 "> " 前缀即可
turndown.addRule('callout', {
  filter: (node) =>
    node.nodeName === 'DIV' && (node as HTMLElement).getAttribute('data-type') === 'callout',
  replacement: (content, node) => {
    const variant = ((node as HTMLElement).getAttribute('data-variant') || 'note').toLowerCase();
    const type = CALLOUT_REVERSE_MAP[variant] || 'NOTE';
    const lines = content.trim().split('\n');
    return [`> [!${type}]`, ...lines.map((l) => `> ${l}`.trimEnd())].join('\n') + '\n';
  },
});

/** Markdown → HTML，并把 GFM alert 块转成 callout div（供 TipTap / 预览使用） */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  let html = marked.parse(markdown) as string;

  // 把 <blockquote><p>[!NOTE]</p>... 结构转成 callout div
  // 兼容 marked 输出：<blockquote>\n<p>[!NOTE]<br>... 或 <p>[!NOTE]</p>
  html = html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION|DANGER)\]\s*(?:<br\s*\/?>)?\s*<\/p>([\s\S]*?)<\/blockquote>/gi,
    (_m, typeRaw: string, inner: string) => {
      const variant = CALLOUT_TYPE_MAP[typeRaw.toUpperCase()] || 'note';
      return `<div data-type="callout" data-variant="${variant}">${inner}</div>`;
    },
  );
  // 另一种形式：[!NOTE] 后面紧跟内容（同一 <p> 内）
  html = html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION|DANGER)\]\s*([\s\S]*?)<\/blockquote>/gi,
    (_m, typeRaw: string, rest: string) => {
      const variant = CALLOUT_TYPE_MAP[typeRaw.toUpperCase()] || 'note';
      return `<div data-type="callout" data-variant="${variant}"><p>${rest}</div>`;
    },
  );
  return html;
}

/** HTML → Markdown，把 callout div 转回 GFM alert 语法（由下方 turndown rule 处理） */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  return turndown.turndown(html);
}

/** 纯文本提取（用于搜索） */
export function markdownToPlainText(markdown: string): string {
  if (!markdown) return '';
  const html = markdownToHtml(markdown);
  // 移除 HTML 标签
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}