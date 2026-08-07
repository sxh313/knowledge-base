import { useEffect, useState } from 'react';
import {
  Plus, Search, Pencil, RotateCcw, Trash2, Layers,
  PackageOpen, ChevronDown, X, CalendarClock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCardStore, type CardFilterState } from '../stores/cardStore';
import type { KnowledgeCard } from '../lib/db/schema';
import CardEditorModal from '../components/CardEditorModal';

const stateMeta: Record<KnowledgeCard['state'], { label: string; emoji: string }> = {
  new: { label: '新', emoji: '🆕' },
  learning: { label: '学习中', emoji: '🔶' },
  review: { label: '复习中', emoji: '✅' },
  relearning: { label: '重学', emoji: '🔁' },
};

const stateFilters: { key: CardFilterState; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'due', label: '待复习' },
  { key: 'new', label: '未学' },
  { key: 'review', label: '复习中' },
  { key: 'relearning', label: '重学中' },
];

export default function Cards() {
  const navigate = useNavigate();
  const {
    cards, isLoading, searchQuery, filterTag, filterState,
    load, setSearch, setFilterTag, setFilterState, clearFilters,
    getFiltered, getAllTags, getDueCount,
    removeCard, resetProgress,
  } = useCardStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeCard | undefined>(undefined);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const filtered = getFiltered();
  const allTags = getAllTags();
  const dueCount = getDueCount();
  const total = cards.length;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openNew = () => { setEditing(undefined); setModalOpen(true); };
  const openEdit = (card: KnowledgeCard) => { setEditing(card); setModalOpen(true); };

  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await removeCard(id);
    setConfirmDelete(null);
  };

  const hasFilters = !!searchQuery || !!filterTag || filterState !== 'all';

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-1 py-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
            <Layers className="h-6 w-6" /> 卡片库
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">管理你的全部知识卡片</p>
        </div>
        <button className="btn-primary text-sm" onClick={openNew}>
          <Plus className="h-4 w-4" /> 新建卡片
        </button>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-3 gap-2 px-1 py-2">
        <StatTile label="总卡片" value={total} />
        <StatTile label="待复习" value={dueCount} highlight={dueCount > 0} onClick={() => setFilterState('due')} />
        <StatTile label="标签数" value={allTags.length} />
      </div>

      {/* 工具栏：搜索 */}
      <div className="px-1 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            className="input-field pl-9"
            placeholder="搜索正面、背面或标签…"
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost p-1"
              onClick={() => setSearch('')} title="清除"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="flex gap-1.5 flex-wrap px-1 pb-2">
        {stateFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterState(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              filterState === f.key
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 标签筛选 */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap px-1 pb-3">
          {allTags.slice(0, 12).map((t) => (
            <button
              key={t}
              onClick={() => setFilterTag(filterTag === t ? null : t)}
              className={`tag transition-all ${filterTag === t ? 'tag-accent' : 'tag-gray hover:scale-105'}`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto space-y-2 px-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          </div>
        ) : total === 0 ? (
          /* 从未创建过卡片 */
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-primary-light)] mb-4">
              <PackageOpen className="h-8 w-8 text-[var(--color-primary)]" />
            </div>
            <p className="text-[var(--color-text)] font-medium text-sm">还没有任何知识卡片</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              手动创建，或在写文档时让 AI 自动生成
            </p>
            <button className="btn-primary mt-4 px-6 py-2.5" onClick={openNew}>
              <Plus className="h-4 w-4" /> 创建第一张卡片
            </button>
          </div>
        ) : filtered.length === 0 ? (
          /* 筛选无结果 */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-[var(--color-text-secondary)] text-sm">没有匹配的卡片</p>
            <button className="btn-ghost text-xs mt-3" onClick={clearFilters}>清除筛选</button>
          </div>
        ) : (
          filtered.map((card) => {
            const meta = stateMeta[card.state];
            const isExpanded = expanded.has(card.id);
            const days = Math.ceil((card.nextReviewAt - Date.now()) / 86400000);
            const due = days <= 0;
            return (
              <article key={card.id} className="card space-y-2.5">
                {/* 正面 */}
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-[var(--color-text)] flex-1 whitespace-pre-wrap break-words">
                    {card.front}
                  </p>
                  <span className="text-xs whitespace-nowrap" title="卡片状态">
                    {meta.emoji} {meta.label}
                  </span>
                </div>

                {/* 背面（可展开） */}
                {card.back && (
                  <div>
                    <button
                      className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                      onClick={() => toggleExpand(card.id)}
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      {isExpanded ? '隐藏答案' : '查看答案'}
                    </button>
                    {isExpanded && (
                      <p className="mt-2 text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap break-words rounded-lg bg-[var(--color-surface-2)] p-3">
                        {card.back}
                      </p>
                    )}
                  </div>
                )}

                {/* 元信息 */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className={`inline-flex items-center gap-1 text-[11px] ${due ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-tertiary)]'}`}>
                    <CalendarClock className="h-3 w-3" />
                    {due ? '现在可复习' : `${days} 天后复习`}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                    已复习 {card.repetitions} 次
                  </span>
                  {card.tags.slice(0, 4).map((t) => (
                    <span key={t} className="tag-gray">#{t}</span>
                  ))}
                </div>

                {/* 操作 */}
                <div className="flex items-center gap-1 border-t border-[var(--color-border)] pt-2 -mx-1 px-1">
                  <button
                    className="btn-ghost text-xs px-2 py-1"
                    onClick={() => openEdit(card)} title="编辑"
                  >
                    <Pencil className="h-3.5 w-3.5" /> 编辑
                  </button>
                  <button
                    className="btn-ghost text-xs px-2 py-1"
                    onClick={() => resetProgress(card.id)} title="重置为未学习状态"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> 重置进度
                  </button>
                  <button
                    className={`btn-ghost text-xs px-2 py-1 ml-auto ${
                      confirmDelete === card.id ? 'text-red-500' : ''
                    }`}
                    onClick={() => handleDelete(card.id)}
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {confirmDelete === card.id ? '确认删除？' : '删除'}
                  </button>
                  {confirmDelete === card.id && (
                    <button
                      className="btn-ghost text-xs px-2 py-1"
                      onClick={() => setConfirmDelete(null)}
                    >
                      取消
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* 底部：前往复习入口（有待复习卡片时显示） */}
      {dueCount > 0 && (
        <div className="px-1 py-3">
          <button
            className="btn-primary w-full"
            onClick={() => navigate('/review')}
          >
            📅 你有 {dueCount} 张卡片待复习，去复习
          </button>
        </div>
      )}

      {/* 编辑/新建模态框 */}
      {modalOpen && (
        <CardEditorModal card={editing} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}

function StatTile({
  label, value, highlight, onClick,
}: { label: string; value: number; highlight?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      className={`card text-left py-3 ${onClick ? 'card-hoverable cursor-pointer' : 'cursor-default'}`}
      onClick={onClick}
    >
      <p className={`text-2xl font-bold ${highlight ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`}>
        {value}
      </p>
      <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
    </button>
  );
}
