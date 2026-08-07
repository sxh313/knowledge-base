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
    return node.nodeName === 'INPUT' && node.hasAttribute('type') && node.getAttribute('type') === 'checkbox';
  },
  replacement: (content, node: HTMLInputElement) => {
    return node.checked ? '[x] ' : '[ ] ';
  },
});

/** Markdown → HTML */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  return marked.parse(markdown) as string;
}

/** HTML → Markdown */
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