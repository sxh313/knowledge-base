import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, FileText, FolderOpen, Plus, Hash,
  Star, Clock, Trash2, Files,
} from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';
import type { JournalEntry } from '../lib/db/schema';

/** 折叠区头部 */
function SectionHeader({
  icon, label, count, expanded, onClick, indent,
}: {
  icon: React.ReactNode; label: string; count?: number; expanded: boolean; onClick: () => void; indent?: boolean;
}) {
  return (
    <button
      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-2)] transition-colors text-[var(--color-text-secondary)]"
      onClick={onClick}
    >
      {expanded
        ? <ChevronDown className="h-3 w-3 flex-shrink-0" />
        : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
      {icon}
      <span className="text-xs font-medium truncate">{label}</span>
      {typeof count === 'number' && (
        <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">{count}</span>
      )}
    </button>
  );
}

export default function DocTree() {
  const navigate = useNavigate();
  const { entries, setCurrent, currentEntry } = useJournalStore();
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedTags, setExpandedTags] = useState(false);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);

  // 置顶文档
  const favorites = useMemo(
    () => entries.filter(e => e.pinned).sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  );

  // 最近文档（按更新时间，取前 8）
  const recent = useMemo(
    () => [...entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    [entries],
  );

  // 按分类分组
  const subjectGroups = useMemo(() => {
    const groups: Record<string, JournalEntry[]> = {};
    for (const entry of entries) {
      const subj = entry.subject || '未分类';
      if (!groups[subj]) groups[subj] = [];
      groups[subj].push(entry);
    }
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

  const isActive = (id: string) => currentEntry?.id === id;

  const renderDocRow = (doc: JournalEntry, indent = false) => (
    <button
      key={doc.id}
      className={`flex items-center gap-1.5 w-full px-2 py-1 rounded-md transition-colors ${
        isActive(doc.id)
          ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
          : 'hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]'
      }`}
      style={{ paddingLeft: indent ? 28 : 8 }}
      onClick={() => handleDocClick(doc)}
    >
      <FileText className="h-3 w-3 flex-shrink-0 opacity-50" />
      <span className="text-xs truncate">{doc.title || '无标题'}</span>
      {doc.pinned && <Star className="h-2.5 w-2.5 ml-auto flex-shrink-0 text-[var(--color-accent)]" />}
    </button>
  );

  return (
    <div className="space-y-1 text-sm">
      {/* 新建文档（始终可见的快捷入口） */}
      <button
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
        onClick={() => { setCurrent(null); navigate('/edit/new'); }}
      >
        <Plus className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-primary)]" />
        <span className="text-xs">新建文档</span>
      </button>

      {/* 全部文档 —— 可展开/收起 */}
      <SectionHeader
        icon={<Files className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-primary)]" />}
        label="全部文档"
        count={entries.length}
        expanded={showAllDocs}
        onClick={() => setShowAllDocs(v => !v)}
      />
      {showAllDocs && (
        <div className="ml-5 border-l border-[var(--color-border)] pl-1 space-y-0.5">
          {entries.length === 0 ? (
            <p className="px-2 py-1 text-[10px] text-[var(--color-text-tertiary)]">暂无文档</p>
          ) : (
            entries.map(doc => renderDocRow(doc))
          )}
        </div>
      )}

      <div className="h-px bg-[var(--color-border)] my-2" />

      {/* 置顶收藏 */}
      {favorites.length > 0 && (
        <>
          <SectionHeader
            icon={<Star className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />}
            label="置顶"
            count={favorites.length}
            expanded={showFavorites}
            onClick={() => setShowFavorites(v => !v)}
          />
          {showFavorites && (
            <div className="ml-5 border-l border-[var(--color-border)] pl-1 space-y-0.5">
              {favorites.map(doc => renderDocRow(doc))}
            </div>
          )}
        </>
      )}

      {/* 最近文档 */}
      {recent.length > 0 && (
        <>
          <SectionHeader
            icon={<Clock className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />}
            label="最近"
            count={recent.length}
            expanded={showRecent}
            onClick={() => setShowRecent(v => !v)}
          />
          {showRecent && (
            <div className="ml-5 border-l border-[var(--color-border)] pl-1 space-y-0.5">
              {recent.map(doc => renderDocRow(doc))}
            </div>
          )}
        </>
      )}

      {/* 按分类分组 */}
      <div className="text-[10px] font-medium text-[var(--color-text-tertiary)] px-2 pb-1 uppercase tracking-wide">分类</div>
      {subjectGroups.map(([subject, docs]) => {
        const expanded = expandedSubjects.has(subject);
        return (
          <div key={subject}>
            <SectionHeader
              icon={<FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />}
              label={subject}
              count={docs.length}
              expanded={expanded}
              onClick={() => toggleSubject(subject)}
            />
            {expanded && (
              <div className="ml-5 border-l border-[var(--color-border)] pl-1 space-y-0.5">
                {docs.map(doc => renderDocRow(doc))}
              </div>
            )}
          </div>
        );
      })}

      {/* 标签区 */}
      {allTags.length > 0 && (
        <>
          <div className="h-px bg-[var(--color-border)] my-2" />
          <SectionHeader
            icon={<Hash className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />}
            label="标签"
            count={allTags.length}
            expanded={expandedTags}
            onClick={() => setExpandedTags(v => !v)}
          />
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

      {/* 回收站入口 */}
      <button
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-secondary)] transition-colors"
        onClick={() => navigate('/trash')}
      >
        <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="text-xs">回收站</span>
      </button>
    </div>
  );
}