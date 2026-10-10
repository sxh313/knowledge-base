import { useState, useEffect, useMemo, memo } from 'react';
import { List, ChevronDown, ChevronRight } from 'lucide-react';

interface DocOutlineProps {
  content: string;
  /** 可选：点击大纲项的回调（用于滚动到对应位置） */
  onJump?: (line: number) => void;
  /** 嵌入模式：只渲染标题列表，不带外层面板与“大纲”标题栏（用于嵌入侧栏页签） */
  embedded?: boolean;
}

interface Heading {
  level: number;
  text: string;
  id: string;
  line: number;
}

/** 从 Markdown 内容中提取标题 */
export function parseHeadings(markdown: string): Heading[] {
  const lines = markdown.split('\n');
  const headings: Heading[] = [];
  let inCodeBlock = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/[*`~_]/g, '').trim();
      const slug = text.toLowerCase()
        .replace(/[^一-龥a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      // 行号保证重复标题也有唯一的大纲状态键。
      const id = `${slug || 'heading'}-${lineIndex}`;
      headings.push({ level, text, id, line: lineIndex });
    }
  }
  return headings;
}

function DocOutline({ content, onJump, embedded }: DocOutlineProps) {
  const [activeId, setActiveId] = useState<string>('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const headings = useMemo(() => parseHeadings(content), [content]);

  useEffect(() => {
    // 标题变化后清理已不存在的折叠项，避免旧文档状态影响新文档。
    const ids = new Set(headings.map((heading) => heading.id));
    setCollapsed((previous) => {
      const next = new Set([...previous].filter((id) => ids.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [headings]);

  const handleClick = (h: Heading, headingIndex: number) => {
    setActiveId(h.id);
    onJump?.(h.line);

    // 富文本模式按「级别 + 文本 + 同名出现次数」定位，避免重复标题总跳到第一处。
    const preview = document.querySelector('.prose-custom');
    if (preview) {
      const allHeaders = Array.from(preview.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
      const sameBefore = headings.slice(0, headingIndex).filter((item) => item.level === h.level && item.text === h.text).length;
      const exactMatches = allHeaders.filter((header) =>
        header.tagName === `H${h.level}` && (header.textContent?.trim() ?? '') === h.text,
      );
      const target = exactMatches[sameBefore] ?? allHeaders[headingIndex];
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 计算最小缩进级别
  const minLevel = headings.length ? Math.min(...headings.map(h => h.level)) : 1;

  const headingButtons: React.ReactNode[] = [];
  const expandedStack: number[] = [];
  headings.forEach((h, i) => {
    while (expandedStack.length && headings[expandedStack[expandedStack.length - 1]].level >= h.level) expandedStack.pop();
    if (expandedStack.some((index) => collapsed.has(headings[index].id))) return;
    const hasChildren = headings[i + 1]?.level > h.level;
    headingButtons.push(
      <div key={h.id} className="flex items-start gap-0" style={{ paddingLeft: `${(h.level - minLevel) * 12 + 4}px` }}>
        {hasChildren ? (
          <button
            type="button"
            aria-label={collapsed.has(h.id) ? `展开${h.text}` : `折叠${h.text}`}
            aria-expanded={!collapsed.has(h.id)}
            className="mt-1 rounded p-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-2)]"
            onClick={() => setCollapsed((previous) => {
              const next = new Set(previous);
              if (next.has(h.id)) next.delete(h.id); else next.add(h.id);
              return next;
            })}
          >
            {collapsed.has(h.id) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        ) : <span className="mt-1 h-4 w-4 flex-shrink-0" />}
        <button
          onClick={() => handleClick(h, i)}
          className={`min-w-0 flex-1 text-left text-xs py-1 px-1 rounded transition-colors flex items-start gap-1 ${
            activeId === h.id
              ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'
          }`}
          title={h.text}
        >
          <span className="truncate">{h.text}</span>
        </button>
      </div>,
    );
    expandedStack.push(i);
  });

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

// memo：content 已由父组件防抖，避免输入时大纲频繁重算
export default memo(DocOutline);
