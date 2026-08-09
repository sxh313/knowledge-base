import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Menu, X, Copy, CalendarDays, UploadCloud, LayoutTemplate } from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useViewModeStore } from '../stores/viewModeStore';
import DocTree from '../components/DocTree';
import TemplatePicker from '../components/TemplatePicker';

export default function JournalList() {
  const navigate = useNavigate();
  const { entries, isLoading, loadAll, setCurrent, getFilteredEntries, searchQuery, setSearchQuery, selectedSubject, setSelectedSubject, togglePin, duplicate, sortBy, setSortBy, create, createTodayNote } = useJournalStore();
  const { hasAnyProviderConfigured } = useSettingsStore();
  const { isMobile } = useViewModeStore();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTreeDrawer, setShowTreeDrawer] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  // 手动拖拽排序
  const dragIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [manualTick, setManualTick] = useState(0);

  // 拖拽：把 fromId 移到 toId 的位置，写入 localStorage 并切到手动排序
  const reorderDocs = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ids = getFilteredEntries().map(f => f.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, fromId);
    localStorage.setItem('doc-manual-order', JSON.stringify(ids));
    setSortBy('manual');
    setManualTick(t => t + 1);
  }, [getFilteredEntries, setSortBy]);
  // 可拖拽调整目录树侧栏宽度（持久化）
  const [docTreeWidth, setDocTreeWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('doctree-width'));
    return Number.isFinite(saved) && saved > 0 ? saved : 176;
  });

  // 拖拽导入 .md 文件：批量读取并创建文档
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.toLowerCase().endsWith('.md') || f.name.toLowerCase().endsWith('.markdown') || f.type === 'text/markdown',
    );
    if (files.length === 0) return;
    let ok = 0;
    for (const f of files) {
      try {
        const text = await f.text();
        // 从内容提取首个标题作为文档标题
        const titleMatch = text.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : f.name.replace(/\.(md|markdown)$/i, '');
        const contentPlain = text.replace(/[#*`[\]()>|~_ -]/g, '').replace(/\s+/g, ' ').trim();
        await create({
          title,
          content: text,
          contentPlain,
          tags: [],
          subject: '导入',
          sourceType: 'import',
        });
        ok++;
      } catch {
        /* 跳过失败的文件 */
      }
    }
    setImportMsg(ok > 0 ? `✅ 已导入 ${ok} 篇文档` : '未能导入任何 .md 文件');
    setTimeout(() => setImportMsg(null), 3500);
  }, [create]);

  const handleToday = async () => {
    const { entry } = await createTodayNote();
    navigate(`/edit/${entry.id}`);
  };

  // 拖拽调整目录树宽度（基于起始位置 + 增量，避免依赖主侧栏宽度）
  const startDocTreeResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = docTreeWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(140, Math.min(360, startW + (ev.clientX - startX)));
      setDocTreeWidth(w);
    };
    const onUp = () => {
      setDocTreeWidth(w => {
        localStorage.setItem('doctree-width', String(w));
        return w;
      });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [docTreeWidth]);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    const dismissed = localStorage.getItem('onboarding-dismissed');
    if (!dismissed && !hasAnyProviderConfigured()) {
      setShowOnboarding(true);
    }
  }, [entries.length]);

  const filtered = getFilteredEntries();
  const allSubjects = [...new Set(entries.map(e => e.subject).filter(Boolean))].sort();
  const getDifficultyStars = (d?: number) => d ? '★'.repeat(d) + '☆'.repeat(5-d) : '';
  // 收藏夹：置顶文档，首页快捷直达
  const pinnedEntries = entries.filter(e => e.pinned && !e.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt);

  const dismissOnboarding = () => {
    localStorage.setItem('onboarding-dismissed', '1');
    setShowOnboarding(false);
  };

  return (
    <div
      className="flex h-full animate-fade-in relative"
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
    >
      {/* 拖拽导入遮罩 */}
      {dragging && (
        <div className="absolute inset-0 z-40 m-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-primary)] bg-[var(--color-primary-light)]/80 backdrop-blur-sm animate-fade-in pointer-events-none">
          <UploadCloud className="h-12 w-12 text-[var(--color-primary)] mb-2" />
          <p className="text-base font-medium text-[var(--color-primary)]">松开以导入 .md 文件</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">支持批量导入，自动识别标题</p>
        </div>
      )}
      {/* 导入结果提示 */}
      {importMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg px-4 py-2 text-sm animate-slide-up">
          {importMsg}
        </div>
      )}

      {/* 模板选择 */}
      {showTemplates && <TemplatePicker onClose={() => setShowTemplates(false)} />}

      {/* 左侧：文档目录树（桌面常驻，移动端抽屉） */}
      {!isMobile && (
        <div
          className="relative shrink-0 hidden lg:block"
          style={{ width: docTreeWidth }}
        >
          <aside className="h-full border-r border-[var(--color-border)] overflow-y-auto p-2">
            <DocTree />
          </aside>
          {/* 可拖拽调整宽度的把手（放在外层，避免被 aside 滚动条遮挡） */}
          <div
            onMouseDown={startDocTreeResize}
            className="absolute right-0 top-0 bottom-0 z-20 w-1.5 cursor-col-resize hover:bg-[var(--color-primary)]/40 transition-colors"
            title="拖动调整宽度"
          />
        </div>
      )}

      {isMobile && showTreeDrawer && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setShowTreeDrawer(false)}>
          <div className="w-64 h-full bg-[var(--color-surface)] border-r border-[var(--color-border)] overflow-y-auto p-2 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">目录</span>
              <button className="btn-ghost p-1" onClick={() => setShowTreeDrawer(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <DocTree onNavigate={() => setShowTreeDrawer(false)} />
          </div>
          <div className="flex-1 bg-black/30" />
        </div>
      )}

      {/* 右侧：文档列表 */}
      <div className="flex flex-col flex-1 min-w-0 px-4 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isMobile && (
              <button className="btn-ghost p-1.5" onClick={() => setShowTreeDrawer(true)} title="目录">
                <Menu className="h-5 w-5" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text)]">知识库</h1>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                {filtered.length > 0 ? `共 ${filtered.length} 篇文档` : '构建你的知识体系'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={handleToday} title="一键创建/打开今天的每日总结">
              <CalendarDays className="h-4 w-4" />
              今日笔记
            </button>
            <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => setShowTemplates(true)} title="从模板新建文档">
              <LayoutTemplate className="h-4 w-4" />
              模板
            </button>
            <button className="btn-primary text-sm" onClick={() => { setCurrent(null); navigate('/edit/new'); }}>
              新建文档
            </button>
          </div>
        </div>

        {/* 首次引导 */}
        {showOnboarding && (
          <div className="mb-3 rounded-xl border p-4 animate-fade-in" style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)', backgroundColor: 'var(--color-primary-light)' }}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">👋</span>
              <div className="flex-1">
                <h3 className="font-medium text-sm text-[var(--color-primary)]">欢迎来到知识库！</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  配置 AI API 入口后，即可使用智能总结、自动生成卡片、代码分析等功能。
                </p>
                <div className="flex gap-2 mt-3">
                  <button className="btn-primary text-xs px-3 py-1.5" onClick={() => navigate('/settings')}>
                    前往配置
                  </button>
                  <button className="btn-ghost text-xs px-3 py-1.5" onClick={dismissOnboarding}>
                    稍后再说
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-3 space-y-2">
          <input
            className="input-field"
            placeholder="搜索文档标题、内容、标签..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'created' | 'updated' | 'title' | 'manual')} className="input-field text-xs w-auto">
            <option value="created">创建时间</option>
            <option value="updated">修改时间</option>
            <option value="title">标题</option>
            <option value="manual">↕ 手动排序</option>
          </select>
          {allSubjects.length > 0 && (
            <div className="flex gap-2 flex-wrap text-xs">
              {allSubjects.map(s => (
                <button key={s}
                  className={`tag transition-all ${selectedSubject === s ? 'tag-accent' : 'tag-gray hover:scale-105'}`}
                  onClick={() => setSelectedSubject(selectedSubject === s ? null : s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 收藏夹快捷卡片 */}
        {pinnedEntries.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2 px-1 flex items-center gap-1">
              <Star className="h-3 w-3 text-[var(--color-accent)] fill-[var(--color-accent)]" />
              收藏夹
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pinnedEntries.map(e => (
                <button
                  key={e.id}
                  onClick={() => { setCurrent(e); navigate(`/edit/${e.id}`); }}
                  className="group shrink-0 w-36 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-left transition-all hover:border-[var(--color-accent)] hover:shadow-md hover:-translate-y-0.5"
                  title={e.title}
                >
                  <p className="text-xs font-medium text-[var(--color-text)] truncate">{e.title || '无标题'}</p>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1 truncate">
                    {e.subject || '未分类'} · {new Date(e.updatedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2 stagger">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-[var(--color-text-secondary)]">加载中...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-primary-light)] mb-4">
                <span className="text-3xl">📝</span>
              </div>
              {searchQuery || selectedSubject ? (
                <>
                  <p className="text-[var(--color-text-secondary)] text-sm">没有找到匹配的文档</p>
                  <button className="btn-ghost text-xs mt-3"
                    onClick={() => { setSearchQuery(''); setSelectedSubject(null); }}>
                    清除筛选
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[var(--color-text)] font-medium text-sm">你还没有任何文档</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">记录今天学到的第一个知识点吧</p>
                  <button className="btn-primary mt-4 px-6 py-2.5"
                    onClick={() => { setCurrent(null); navigate('/edit/new'); }}>
                    写第一篇文档
                  </button>
                </>
              )}
            </div>
          ) : (
            filtered.map(entry => (
              <article key={entry.id}
                className={`card card-hoverable cursor-pointer ${dragOverId === entry.id ? 'ring-2 ring-[var(--color-primary)]/40 border-[var(--color-primary)]' : ''}`}
                draggable
                onDragStart={(e) => { dragIdRef.current = entry.id; e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { e.preventDefault(); if (dragOverId !== entry.id) setDragOverId(entry.id); }}
                onDragLeave={() => { if (dragOverId === entry.id) setDragOverId(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragIdRef.current;
                  setDragOverId(null);
                  dragIdRef.current = null;
                  if (from) reorderDocs(from, entry.id);
                }}
                onClick={() => { setCurrent(entry); navigate(`/edit/${entry.id}`); }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[var(--color-text)] truncate flex items-center gap-1.5">
                      {entry.pinned && <Star className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-accent)] fill-[var(--color-accent)]" />}
                      {entry.title || '无标题'}
                    </h3>
                    <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2 mt-1">
                      {entry.contentPlain?.slice(0, 200) || entry.content?.slice(0, 200)}
                    </p>
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <span className="text-xs text-[var(--color-text-tertiary)]">
                        {new Date(entry.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                      {entry.subject && <span className="tag-accent">{entry.subject}</span>}
                      {entry.tags.slice(0, 3).map(t => <span key={t} className="tag-gray">{t}</span>)}
                      {entry.difficulty ? <span className="text-xs text-[var(--color-accent)]">{getDifficultyStars(entry.difficulty)}</span> : null}
                      {entry.timeSpentMinutes ? <span className="text-xs text-[var(--color-text-tertiary)]">⏱ {entry.timeSpentMinutes}min</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(entry.id); }}
                      className={`p-1 rounded-md transition-colors ${entry.pinned ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-surface-2)]'}`}
                      title={entry.pinned ? '取消置顶' : '置顶'}
                    >
                      <Star className={`h-4 w-4 ${entry.pinned ? 'fill-[var(--color-accent)]' : ''}`} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicate(entry.id); }}
                      className="p-1 rounded-md transition-colors text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-2)]"
                      title="复制文档"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    {entry.summary && (
                      <span className="text-xs text-[var(--color-primary)] whitespace-nowrap font-medium">
                        ✨ AI 已总结
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}