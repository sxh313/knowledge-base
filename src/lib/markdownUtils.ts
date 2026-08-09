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

// turndown rule：把 <span data-wikilink="标题"> 转回 [[标题]] 双向链接语法
turndown.addRule('wikilink', {
  filter: (node) =>
    node.nodeName === 'SPAN' && !!(node as HTMLElement).getAttribute('data-wikilink'),
  replacement: (_content, node) => {
    const target = (node as HTMLElement).getAttribute('data-wikilink') || '';
    return `[[${target}]]`;
  },
});

/** 提取一段 markdown 里所有双向链接的目标标题（用于反向引用统计） */
export function extractWikilinks(markdown: string): string[] {
  if (!markdown) return [];
  const matches = markdown.matchAll(/\[\[([^\]]+)\]\]/g);
  return Array.from(matches, (m) => m[1].trim());
}

/** 转义字符串中的正则元字符 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 把正文中第一处「未被 [[ ]] 包裹的目标标题文本」转换为 [[双链]]。
 * 若该标题已是双链、或正文无裸提及，则原样返回（用于"未链接提及 → 转为双链"）。
 */
export function linkifyFirstMention(content: string, title: string): string {
  if (!content || !title) return content;
  const escaped = escapeRegExp(title);
  // 前导不是 [[ 且后继不是 ]],命中第一处裸提及
  const re = new RegExp(`(?<!\\[\\[)(${escaped})(?!\\]\\])`, 'u');
  return content.replace(re, `[[${title}]]`);
}

/** Markdown → HTML，并把 GFM alert 块转成 callout div（供 TipTap / 预览使用） */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  let html = marked.parse(markdown) as string;

  // 双向链接 [[标题]] → <span data-wikilink="标题">标题</span>
  // 注意：marked 会把 [[x]] 当纯文本输出（在 <p> 内），这里整体替换
  html = html.replace(/\[\[([^\]]+)\]\]/g, (_m, target: string) => {
    const t = target.trim().replace(/<[^>]*>/g, '');
    return `<span data-wikilink="${t}">${t}</span>`;
  });

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