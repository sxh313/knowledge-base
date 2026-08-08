import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileText, FolderOpen, Plus, Hash } from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';
import type { JournalEntry } from '../lib/db/schema';

export default function DocTree() {
  const navigate = useNavigate();
  const { entries, setCurrent, currentEntry } = useJournalStore();
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedTags, setExpandedTags] = useState(false);

  // 按学科分组
  const subjectGroups = useMemo(() => {
    const groups: Record<string, JournalEntry[]> = {};
    for (const entry of entries) {
      const subj = entry.subject || '未分类';
      if (!groups[subj]) groups[subj] = [];
      groups[subj].push(entry);
    }
    // 每组内按更新时间排序
    for (const subj of Object.keys(groups)) {
      groups[subj].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return Object.entries(groups).sort(([, a], [, b]) => b.length - a.length);
  }, [entries]);

  // 所有标签
  const allTags = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      for (const t of e.tags) counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 15);
  }, [entries]);

  const toggleSubject = (subj: string) => {
    setExpandedSubjects(prev => {
      const next = new Set(prev);
      if (next.has(subj)) next.delete(subj);
      else next.add(subj);
      return next;
    });
  };

  const handleDocClick = (entry: JournalEntry) => {
    setCurrent(entry);
    navigate(`/edit/${entry.id}`);
  };

  return (
    <div className="space-y-1 text-sm">
      {/* 全部文档 */}
      <button
        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md transition-colors ${
          !currentEntry ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' : 'hover:bg-[var(--color-surface-2)]'
        }`}
        onClick={() => { setCurrent(null); navigate('/'); }}
      >
        <FileText className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="text-xs">全部文档</span>
        <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">{entries.length}</span>
      </button>

      {/* 新建文档 */}
      <button
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
        onClick={() => { setCurrent(null); navigate('/edit/new'); }}
      >
        <Plus className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-primary)]" />
        <span className="text-xs">新建文档</span>
      </button>

      <div className="h-px bg-[var(--color-border)] my-2" />

      {/* 按学科分组 */}
      <div className="text-[10px] font-medium text-[var(--color-text-tertiary)] px-2 pb-1 uppercase tracking-wide">学科</div>
      {subjectGroups.map(([subject, docs]) => {
        const expanded = expandedSubjects.has(subject);
        return (
          <div key={subject}>
            <button
              className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-2)] transition-colors text-[var(--color-text-secondary)]"
              onClick={() => toggleSubject(subject)}
            >
              {expanded
                ? <ChevronDown className="h-3 w-3 flex-shrink-0" />
                : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
              <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
              <span className="text-xs font-medium truncate">{subject}</span>
              <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">{docs.length}</span>
            </button>
            {expanded && (
              <div className="ml-5 border-l border-[var(--color-border)] pl-1">
                {docs.map(doc => (
                  <button
                    key={doc.id}
                    className={`flex items-center gap-1.5 w-full px-2 py-1 rounded-md transition-colors ${
                      currentEntry?.id === doc.id
                        ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                        : 'hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]'
                    }`}
                    onClick={() => handleDocClick(doc)}
                  >
                    <FileText className="h-3 w-3 flex-shrink-0 opacity-50" />
                    <span className="text-xs truncate">{doc.title || '无标题'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 标签区 */}
      {allTags.length > 0 && (
        <>
          <div className="h-px bg-[var(--color-border)] my-2" />
          <button
            className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-2)] transition-colors text-[var(--color-text-secondary)]"
            onClick={() => setExpandedTags(!expandedTags)}
          >
            {expandedTags
              ? <ChevronDown className="h-3 w-3 flex-shrink-0" />
              : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
            <Hash className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
            <span className="text-xs font-medium">标签</span>
            <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">{allTags.length}</span>
          </button>
          {expandedTags && (
            <div className="ml-5 border-l border-[var(--color-border)] pl-1 space-y-0.5">
              {allTags.map(([tag, count]) => (
                <div key={tag} className="flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--color-text-secondary)]">
                  <span className="truncate">#{tag}</span>
                  <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">{count}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}