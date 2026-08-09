import { useState, useEffect, useMemo } from 'react';
import { List, ChevronRight } from 'lucide-react';

interface DocOutlineProps {
  content: string;
  /** 可选：点击大纲项的回调（用于滚动到对应位置） */
  onJump?: (headingId: string) => void;
  /** 嵌入模式：只渲染标题列表，不带外层面板与“大纲”标题栏（用于嵌入侧栏页签） */
  embedded?: boolean;
}

interface Heading {
  level: number;
  text: string;
  id: string;
}

/** 从 Markdown 内容中提取标题 */
function parseHeadings(markdown: string): Heading[] {
  const lines = markdown.split('\n');
  const headings: Heading[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/[*`~_]/g, '').trim();
      const id = text.toLowerCase()
        .replace(/[^一-龥a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      headings.push({ level, text, id });
    }
  }
  return headings;
}

export default function DocOutline({ content, onJump, embedded }: DocOutlineProps) {
  const [activeId, setActiveId] = useState<string>('');

  const headings = useMemo(() => parseHeadings(content), [content]);

  const handleClick = (h: Heading) => {
    setActiveId(h.id);
    onJump?.(h.id);

    // 尝试滚动到标题元素
    const el = document.getElementById(h.id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // 如果找不到 ID 元素（markdown 预览模式），尝试用文本匹配
      const preview = document.querySelector('.prose-custom');
      if (preview) {
        const allHeaders = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (const header of allHeaders) {
          if (header.textContent?.includes(h.text)) {
            header.scrollIntoView({ behavior: 'smooth', block: 'start' });
            break;
          }
        }
      }
    }
  };

  // 计算最小缩进级别
  const minLevel = headings.length ? Math.min(...headings.map(h => h.level)) : 1;

  const headingButtons = headings.map((h, i) => (
    <button
      key={i}
      onClick={() => handleClick(h)}
      className={`w-full text-left text-xs py-1 px-2 rounded transition-colors flex items-start gap-1 ${
        activeId === h.id
          ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'
      }`}
      style={{ paddingLeft: `${(h.level - minLevel) * 12 + 8}px` }}
      title={h.text}
    >
      <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0 opacity-50" />
      <span className="truncate">{h.text}</span>
    </button>
  ));

  // 嵌入模式：仅渲染标题列表（供侧栏页签复用），无外层面板与"大纲"标题栏
  if (embedded) {
    return (
      <div className="p-2 space-y-0.5">
        {headings.length < 2 ? (
          <p className="text-xs text-[var(--color-text-tertiary)] px-2 py-3">暂无标题大纲</p>
        ) : (
          headingButtons
        )}
      </div>
    );
  }

  // 独立面板模式（默认）：仅在标题数 ≥ 2 时显示
  if (headings.length < 2) return null;

  return (
    <div className="w-56 shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] overflow-y-auto">
      <div className="sticky top-0 p-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <span className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)]">
          <List className="h-3.5 w-3.5" />
          大纲
        </span>
      </div>
      <div className="p-2 space-y-0.5">{headingButtons}</div>
    </div>
  );
}