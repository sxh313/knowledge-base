import { useState, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, FileText, FolderOpen, Plus, Hash,
  Star, Clock, Trash2, Files, MoreVertical, FolderInput, Copy,
} from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';
import type { Category, JournalEntry } from '../lib/db/schema';
import ContextMenu from './ContextMenu';

/** 折叠区头部 */
function SectionHeader({
  icon, label, count, expanded, onClick, onContextMenu,
}: {
  icon: React.ReactNode; label: string; count?: number; expanded: boolean; onClick: () => void; onContextMenu?: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-2)] transition-colors text-[var(--color-text-secondary)]"
      onClick={onClick}
      onContextMenu={onContextMenu}
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

interface DocTreeProps {
  /** 移动端抽屉中使用：导航后关闭抽屉 */
  onNavigate?: () => void;
}

function DocTree({ onNavigate }: DocTreeProps = {}) {
  const navigate = useNavigate();
  const {
    entries, categories, setCurrent, currentEntry, remove, update, duplicate, togglePin,
    createCategory, renameCategory, deleteCategory,
  } = useJournalStore();
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedTags, setExpandedTags] = useState(false);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  // 右键/⋮菜单：主菜单 + “移动到”分类子菜单
  const [ctx, setCtx] = useState<{ x: number; y: number; doc: JournalEntry } | null>(null);
  const [moveCtx, setMoveCtx] = useState<{ x: number; y: number; doc: JournalEntry } | null>(null);
  const [subjectCtx, setSubjectCtx] = useState<{ x: number; y: number; category: Category } | null>(null);
  const allSubjects = useMemo(
    () => Array.from(new Set([
      ...categories.map((category) => category.name),
      ...entries.map((entry) => entry.subject).filter(Boolean),
    ] as string[])).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [categories, entries],
  );

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
    for (const category of categories) groups[category.name] = [];
    for (const entry of entries) {
      const subj = entry.subject || '未分类';
      if (!groups[subj]) groups[subj] = [];
      groups[subj].push(entry);
    }
    for (const subj of Object.keys(groups)) {
      groups[subj].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return Object.entries(groups).sort(([nameA, a], [nameB, b]) => {
      if (nameA === '未分类') return 1;
      if (nameB === '未分类') return -1;
      return b.length - a.length || nameA.localeCompare(nameB, 'zh-CN');
    });
  }, [categories, entries]);

  const handleCreateCategory = async (doc?: JournalEntry) => {
    const name = window.prompt('输入新的分类名称');
    if (!name?.trim()) return;
    try {
      const category = await createCategory(name);
      setExpandedSubjects((previous) => new Set(previous).add(category.name));
      if (doc) await update(doc.id, { subject: category.name });
    } catch (error) {
      window.alert((error as Error).message);
    }
  };

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
    onNavigate?.();
  };

  const isActive = (id: string) => currentEntry?.id === id;

  const renderDocRow = (doc: JournalEntry, indent = false) => (
    <div
      key={doc.id}
      className={`group flex items-start gap-1 w-full rounded-md transition-colors cv-auto ${
        isActive(doc.id)
          ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
          : 'hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]'
      }`}
      style={{ paddingLeft: indent ? 28 : 8 }}
      onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, doc }); }}
    >
      <button
        className="flex items-start gap-1.5 flex-1 min-w-0 py-1 pr-1 text-left"
        onClick={() => handleDocClick(doc)}
        title={doc.title || '无标题'}
      >
        <FileText className="h-3 w-3 flex-shrink-0 opacity-50" />
        <span className="text-xs min-w-0 whitespace-normal break-words leading-5">{doc.title || '无标题'}</span>
        {doc.pinned && <Star className="h-2.5 w-2.5 ml-auto flex-shrink-0 text-[var(--color-accent)]" />}
      </button>
      <button
        className="mr-1 p-0.5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] opacity-40 hover:opacity-100 focus:opacity-100 transition-opacity"
        title="更多操作"
        onClick={(e) => { e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, doc }); }}
      >
        <MoreVertical className="h-3 w-3" />
      </button>
    </div>
  );

  return (
    <div className="space-y-1 text-sm">
      {/* 新建文档（始终可见的快捷入口） */}
      <button
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
        onClick={() => { setCurrent(null); navigate('/edit/new'); onNavigate?.(); }}
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
      <div className="flex items-center justify-between px-2 pb-1 text-[var(--color-text-tertiary)]">
        <span className="text-[10px] font-medium uppercase tracking-wide">分类</span>
        <button
          className="rounded p-0.5 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]"
          onClick={() => handleCreateCategory()}
          title="新建分类"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {subjectGroups.map(([subject, docs]) => {
        const expanded = expandedSubjects.has(subject);
        const category = categories.find((item) => item.name === subject);
        return (
          <div key={subject}>
            <SectionHeader
              icon={<FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />}
              label={subject}
              count={docs.length}
              expanded={expanded}
              onClick={() => toggleSubject(subject)}
              onContextMenu={category ? (event) => {
                event.preventDefault();
                setSubjectCtx({ x: event.clientX, y: event.clientY, category });
              } : undefined}
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
        onClick={() => { navigate('/trash'); onNavigate?.(); }}
      >
        <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="text-xs">回收站</span>
      </button>

      {/* 文档右键/⋮ 菜单 */}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { key: 'move', label: '移动到…', icon: <FolderInput className="h-4 w-4" />, onClick: () => { const c = ctx; setCtx(null); if (c) setMoveCtx({ x: c.x, y: c.y, doc: c.doc }); } },
            { key: 'pin', label: ctx.doc.pinned ? '从“置顶”移除' : '收藏（置顶）', icon: <Star className="h-4 w-4" />, onClick: () => togglePin(ctx.doc.id) },
            { key: 'dup', label: '复制文档', icon: <Copy className="h-4 w-4" />, onClick: () => duplicate(ctx.doc.id) },
            { key: 'del', label: '删除（移到回收站）', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => { const t = ctx.doc.title || '无标题'; if (window.confirm(`删除文档「${t}」？\n（移到回收站，可在回收站恢复）`)) remove(ctx.doc.id); } },
          ]}
        />
      )}
      {moveCtx && (
        <ContextMenu
          x={moveCtx.x}
          y={moveCtx.y}
          onClose={() => setMoveCtx(null)}
          items={[
            { key: 'none', label: '（无分类）', onClick: () => { update(moveCtx.doc.id, { subject: '' }); } },
            ...allSubjects.map((s) => ({ key: `subj-${s}`, label: s, onClick: () => { update(moveCtx.doc.id, { subject: s }); } })),
            { key: 'new', label: '新建分类…', icon: <Plus className="h-4 w-4" />, divider: true, onClick: () => handleCreateCategory(moveCtx.doc) },
          ]}
        />
      )}
      {subjectCtx && (
        <ContextMenu
          x={subjectCtx.x}
          y={subjectCtx.y}
          onClose={() => setSubjectCtx(null)}
          items={[
            {
              key: 'rename',
              label: '重命名分类',
              onClick: async () => {
                const name = window.prompt('输入新的分类名称', subjectCtx.category.name);
                if (!name?.trim() || name.trim() === subjectCtx.category.name) return;
                try { await renameCategory(subjectCtx.category.id, name); }
                catch (error) { window.alert((error as Error).message); }
              },
            },
            {
              key: 'delete',
              label: '删除分类',
              icon: <Trash2 className="h-4 w-4" />,
              danger: true,
              onClick: async () => {
                const count = entries.filter((entry) => entry.subject === subjectCtx.category.name).length;
                if (!window.confirm(`删除分类「${subjectCtx.category.name}」？${count ? `\n其中 ${count} 篇文档将移到“未分类”。` : ''}`)) return;
                await deleteCategory(subjectCtx.category.id);
              },
            },
          ]}
        />
      )}
    </div>
  );
}

// memo：避免父组件（如 JournalEditor）因 content 变化重渲染时，DocTree 也跟着重渲染
export default memo(DocTree);
