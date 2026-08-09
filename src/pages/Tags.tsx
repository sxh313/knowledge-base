import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag, Plus, ArrowRight } from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';

interface TagStat {
  tag: string;
  count: number;
  lastUpdated: number;
}

export default function Tags() {
  const navigate = useNavigate();
  const { entries, loadAll, setSearchQuery, setSelectedTag } = useJournalStore();
  const [filter, setFilter] = useState('');

  useEffect(() => { loadAll(); }, []);

  const allTags = useMemo<TagStat[]>(() => {
    const map = new Map<string, TagStat>();
    for (const e of entries) {
      if (e.deletedAt) continue;
      for (const t of e.tags ?? []) {
        const cur = map.get(t);
        if (cur) {
          cur.count++;
          cur.lastUpdated = Math.max(cur.lastUpdated, e.updatedAt);
        } else {
          map.set(t, { tag: t, count: 1, lastUpdated: e.updatedAt });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [entries]);

  const filtered = filter.trim()
    ? allTags.filter(t => t.tag.toLowerCase().includes(filter.toLowerCase()))
    : allTags;

  const totalTagged = entries.filter(e => !e.deletedAt && (e.tags?.length ?? 0) > 0).length;
  const maxCount = Math.max(1, ...allTags.map(t => t.count));

  // 字号映射（标签云）
  const fontSizeFor = (count: number) => {
    const ratio = count / maxCount;
    return 0.85 + ratio * 0.9; // rem
  };

  // 颜色调色板（按取模分配，让标签云更缤纷）
  const palette = [
    'var(--color-primary)',
    'var(--color-accent)',
    'var(--color-success)',
    '#a855f7', '#ec4899', '#14b8a6', '#f97316',
  ];
  const colorFor = (idx: number) => palette[idx % palette.length];

  const jumpToTag = (tag: string) => {
    setSelectedTag(tag);
    setSearchQuery('');
    navigate('/');
  };

  return (
    <div className="flex flex-col h-full animate-fade-in px-4 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
            <Tag className="h-6 w-6" /> 标签管理
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            共 {allTags.length} 个标签 · {totalTagged} 篇已标注文档
          </p>
        </div>
      </div>

      {/* 过滤 */}
      <div className="mb-4 flex items-center gap-2">
        <input
          className="input-field flex-1 text-sm"
          placeholder="筛选标签…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="btn-primary text-sm" onClick={() => navigate('/edit/new')}>
          <Plus className="h-4 w-4" /> 新建文档
        </button>
      </div>

      {/* 标签云 */}
      {allTags.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-surface-2)] mb-4">
            <Tag className="h-8 w-8 text-[var(--color-text-tertiary)]" />
          </div>
          <p className="text-[var(--color-text)] font-medium text-sm">还没有任何标签</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">在文档里添加标签后会在这里汇总</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-text-secondary)] py-12">没有匹配的标签</p>
      ) : (
        <>
          <div className="card p-5 mb-4">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-3">🏷️ 标签云（字号代表使用频次，点击进入对应文档）</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              {filtered.map((t, i) => (
                <button
                  key={t.tag}
                  onClick={() => jumpToTag(t.tag)}
                  className="font-semibold transition-all hover:underline active:scale-95"
                  style={{ fontSize: `${fontSizeFor(t.count)}rem`, color: colorFor(i) }}
                  title={`${t.tag} · ${t.count} 篇文档`}
                >
                  #{t.tag}
                  <span className="ml-1 text-[11px] font-normal align-super" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto space-y-1.5">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2 px-1">📋 按使用频次排序</p>
            {filtered.map((t, i) => (
              <button
                key={t.tag}
                onClick={() => jumpToTag(t.tag)}
                className="card w-full flex items-center gap-3 text-left hover:border-[var(--color-primary)] transition-colors"
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold shrink-0"
                  style={{ background: colorFor(i) }}
                >
                  {t.tag.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">#{t.tag}</p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">
                    {t.count} 篇文档 · 最近更新 {new Date(t.lastUpdated).toLocaleDateString('zh-CN')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* 频次条 */}
                  <div className="hidden sm:block h-1.5 w-20 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(t.count / maxCount) * 100}%`, background: colorFor(i) }} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
