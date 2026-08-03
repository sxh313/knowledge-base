import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJournalStore } from '../stores/journalStore';

export default function JournalList() {
  const navigate = useNavigate();
  const { entries, isLoading, loadAll, setCurrent, getFilteredEntries, searchQuery, setSearchQuery, selectedTag, setSelectedTag, selectedSubject, setSelectedSubject } = useJournalStore();

  useEffect(() => { loadAll(); }, []);

  const filtered = getFilteredEntries();

  // Get all unique tags and subjects
  const allTags = [...new Set(entries.flatMap(e => e.tags))].sort();
  const allSubjects = [...new Set(entries.map(e => e.subject).filter(Boolean))].sort();

  const getDifficultyStars = (d?: number) => d ? '★'.repeat(d) + '☆'.repeat(5-d) : '';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <h1 className="text-lg font-bold">📚 学习日记</h1>
        <button className="btn-primary text-sm" onClick={() => { setCurrent(null); navigate('/edit/new'); }}>
          ✏️ 新日记
        </button>
      </div>

      {/* Search & Filters */}
      <div className="px-4 py-3 space-y-2 border-b border-[var(--color-border)]">
        <input
          className="input-field"
          placeholder="搜索日记标题、内容、标签..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex gap-2 flex-wrap text-xs">
          {allSubjects.map(s => (
            <button key={s}
              className={`tag ${selectedSubject === s ? 'tag-accent' : 'tag-gray'}`}
              onClick={() => setSelectedSubject(selectedSubject === s ? null : s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><p className="text-gray-400">加载中...</p></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 space-y-2">
            <span className="text-4xl">📝</span>
            <p>{searchQuery ? '没有找到匹配的日记' : '还没有日记，开始记录你的学习吧！'}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {filtered.map(entry => (
              <article key={entry.id}
                className="px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                onClick={() => { setCurrent(entry); navigate(`/edit/${entry.id}`); }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[var(--color-text)] truncate">{entry.title || '无标题'}</h3>
                    <p className="text-sm text-gray-400 line-clamp-2 mt-1">
                      {entry.contentPlain?.slice(0, 200) || entry.content?.slice(0, 200)}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-xs text-gray-400">{new Date(entry.createdAt).toLocaleDateString('zh-CN')}</span>
                      {entry.subject && <span className="tag-accent">{entry.subject}</span>}
                      {entry.tags.slice(0, 3).map(t => <span key={t} className="tag-gray">{t}</span>)}
                      {entry.difficulty && <span className="text-xs text-yellow-500">{getDifficultyStars(entry.difficulty)}</span>}
                      {entry.timeSpentMinutes && <span className="text-xs text-gray-400">⏱ {entry.timeSpentMinutes}分钟</span>}
                    </div>
                  </div>
                  {entry.summary && (
                    <span className="text-xs text-indigo-500 whitespace-nowrap shrink-0">AI 已总结</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
