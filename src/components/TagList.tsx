import { useMemo } from 'react';
import { Tag } from 'lucide-react';
import type { JournalEntry } from '../lib/db/schema';

interface TagListProps {
  entries: JournalEntry[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  collapsed?: boolean;
}

export default function TagList({ entries, selectedTag, onSelectTag, collapsed }: TagListProps) {
  const tags = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) {
      for (const tag of entry.tags) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20);
  }, [entries]);

  if (tags.length === 0) return null;

  return (
    <div className="px-2 py-3 border-b border-[var(--color-border)]">
      {!collapsed && (
        <div className="flex items-center gap-2 px-3 mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
          <Tag className="h-3.5 w-3.5" />
          <span>标签筛选</span>
        </div>
      )}
      <div className="space-y-0.5">
        {!collapsed && (
          <button
            className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors ${
              selectedTag === null
                ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                : 'text-[var(--color-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            onClick={() => onSelectTag(null)}
          >
            全部 ({entries.length})
          </button>
        )}
        {tags.map(([tag, count]) => (
          <button
            key={tag}
            className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors ${
              selectedTag === tag
                ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium'
                : 'text-[var(--color-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
            title={collapsed ? `${tag} (${count})` : undefined}
          >
            {collapsed ? '#' : `# ${tag}`}
            {!collapsed && <span className="float-right opacity-60">{count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}