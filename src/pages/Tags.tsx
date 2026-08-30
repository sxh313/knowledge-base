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

  // 三种语义色提供轻微区分，避免标签云变成无规则彩虹。
  const palette = [
    'var(--color-primary)',
    'var(--color-accent)',
    'var(--color-info)',
  ];
  const colorFor = (idx: number) => palette[idx % palette.length];

  const jumpToTag = (tag: string) => {
    setSelectedTag(tag);
    setSearchQuery('');
    navigate('/');
  };

  return (
    <div className="content-frame flex h-full flex-col animate-fade-in">
      {/* Header */}
      <div className="page-hero">
        <div className="page-hero-copy">
          <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
            <Tag className="h-6 w-6" /> 标签管理
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            共 {allTags.length} 个标签 · {totalTagged} 篇已标注文档
          </p>
        </div>
      </div>

      {/* 过滤 */}
      <div className="page-toolbar mb-4">
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
        <div className="empty-state compact-empty">
          <Tag className="mb-1 h-5 w-5 text-[var(--color-primary)]" />
          <p className="text-[var(--color-text)] font-medium text-sm">还没有任何标签</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">在文档里添加标签后会在这里汇总</p>
          <button className="btn-secondary mt-3 text-xs" onClick={() => navigate('/edit/new')}>创建第一篇带标签的文档</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p className="text-sm text-[var(--color-text-secondary)]">没有匹配的标签</p></div>
      ) : (
        <div className="tags-layout flex-1">
          <div className="card p-5 mb-4">
            <p className="mb-3 text-xs font-medium text-[var(--color-text-secondary)]">标签云 · 字号代表使用频次，点击查看对应文档</p>
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
          <div className="min-h-0 overflow-y-auto space-y-1.5">
            <p className="mb-2 px-1 text-xs font-medium text-[var(--color-text-secondary)]">按使用频次排序</p>
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
        </div>
      )}
    </div>
  );
}
