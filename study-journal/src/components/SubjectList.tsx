import { useMemo } from 'react';
import { Bookmark } from 'lucide-react';
import type { JournalEntry } from '../lib/db/schema';

interface SubjectListProps {
  entries: JournalEntry[];
  selectedSubject: string | null;
  onSelectSubject: (subject: string | null) => void;
  collapsed?: boolean;
}

export default function SubjectList({ entries, selectedSubject, onSelectSubject, collapsed }: SubjectListProps) {
  const subjects = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) {
      const subj = entry.subject || '未分类';
      counts[subj] = (counts[subj] || 0) + 1;
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a);
  }, [entries]);

  if (subjects.length === 0) return null;

  return (
    <div className="px-2 py-3">
      {!collapsed && (
        <div className="flex items-center gap-2 px-3 mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
          <Bookmark className="h-3.5 w-3.5" />
          <span>学科筛选</span>
        </div>
      )}
      <div className="space-y-0.5">
        {!collapsed && (
          <button
            className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors ${
              selectedSubject === null
                ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300'
                : 'text-[var(--color-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            onClick={() => onSelectSubject(null)}
          >
            全部 ({entries.length})
          </button>
        )}
        {subjects.map(([subject, count]) => (
          <button
            key={subject}
            className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors ${
              selectedSubject === subject
                ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 font-medium'
                : 'text-[var(--color-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            onClick={() => onSelectSubject(selectedSubject === subject ? null : subject)}
          >
            {collapsed ? '📂' : `📂 ${subject}`}
            {!collapsed && <span className="float-right opacity-60">{count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}