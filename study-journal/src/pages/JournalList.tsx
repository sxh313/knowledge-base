import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJournalStore } from '../stores/journalStore';
import { useSettingsStore } from '../stores/settingsStore';
import DocTree from '../components/DocTree';

export default function JournalList() {
  const navigate = useNavigate();
  const { entries, isLoading, loadAll, setCurrent, getFilteredEntries, searchQuery, setSearchQuery, selectedSubject, setSelectedSubject } = useJournalStore();
  const { hasAnyProviderConfigured } = useSettingsStore();
  const [showOnboarding, setShowOnboarding] = useState(false);

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

  const dismissOnboarding = () => {
    localStorage.setItem('onboarding-dismissed', '1');
    setShowOnboarding(false);
  };

  return (
    <div className="flex h-full animate-fade-in">
      {/* 左侧：文档目录树 */}
      <aside className="w-52 shrink-0 border-r border-[var(--color-border)] overflow-y-auto p-2 hidden lg:block">
        <DocTree />
      </aside>

      {/* 右侧：文档列表 */}
      <div className="flex flex-col flex-1 min-w-0 px-4 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gradient">知识库</h1>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              {filtered.length > 0 ? `共 ${filtered.length} 篇文档` : '构建你的知识体系'}
            </p>
          </div>
          <button className="btn-primary text-sm" onClick={() => { setCurrent(null); navigate('/edit/new'); }}>
            ✏️ 新文档
          </button>
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

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2">
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
                    ✏️ 写第一篇文档
                  </button>
                </>
              )}
            </div>
          ) : (
            filtered.map(entry => (
              <article key={entry.id}
                className="card card-hoverable cursor-pointer"
                onClick={() => { setCurrent(entry); navigate(`/edit/${entry.id}`); }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[var(--color-text)] truncate">{entry.title || '无标题'}</h3>
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
                  {entry.summary && (
                    <span className="text-xs text-[var(--color-primary)] whitespace-nowrap shrink-0 font-medium">
                      ✨ AI 已总结
                    </span>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}