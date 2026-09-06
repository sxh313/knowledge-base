import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Star, Trash2, Bookmark, Filter, Sparkles, RotateCcw } from 'lucide-react';
import { searchDocuments, type SearchResult } from '../lib/search/searchDocuments';
import { parseQuery } from '../lib/search/queryParser';
import { getSavedSearches, saveSavedSearch, deleteSavedSearch } from '../lib/db/repositories/search';
import { useJournalStore } from '../stores/journalStore';
import type { SavedSearch } from '../lib/db/schema';
import { buildSearchAIContext, saveSearchAIContext } from '../lib/ai/searchContext';
import { Button, Input } from '../components/ui';

/** 把文本中命中 terms 的部分包成 <mark> */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const valid = useMemo(
    () => terms.map((t) => t.trim()).filter((t) => t.length >= 1),
    [terms],
  );
  if (!text) return null;
  if (valid.length === 0) return <>{text}</>;
  const escaped = valid.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        re.test(part) && valid.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/40 rounded px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { setCurrent } = useJournalStore();
  const [input, setInput] = useState(params.get('q') ?? '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<SavedSearch[]>([]);

  const activeQuery = params.get('q') ?? '';

  const loadSaved = useCallback(async () => {
    setSaved(await getSavedSearches());
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  // 同步 URL → 输入框
  useEffect(() => {
    setInput(params.get('q') ?? '');
  }, [params]);

  // 执行搜索（防抖）
  useEffect(() => {
    const q = activeQuery;
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchDocuments(q));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [activeQuery]);

  const submit = (value: string) => {
    const v = value.trim();
    setParams(v ? { q: v } : {});
  };

  const parsed = useMemo(() => parseQuery(activeQuery), [activeQuery]);
  const highlightTerms = useMemo(
    () => [...parsed.keywords, ...parsed.phrases],
    [parsed],
  );

  const handleSave = async () => {
    if (!activeQuery.trim()) return;
    const name = window.prompt('为该搜索命名（同名将覆盖）', activeQuery.trim().slice(0, 24));
    if (!name) return;
    await saveSavedSearch(name, activeQuery.trim());
    await loadSaved();
  };

  const handleOpen = (id: string) => {
    const entry = results.find((r) => r.item.id === id)?.item;
    if (entry) setCurrent(entry);
    navigate(`/edit/${id}`);
  };

  const askAIFromResults = () => {
    if (!activeQuery.trim() || results.length === 0) return;
    saveSearchAIContext(buildSearchAIContext(activeQuery, results));
    navigate(`/ai?q=${encodeURIComponent(activeQuery)}&from=search`);
  };

  return (
    <div className="content-frame flex h-full flex-col animate-fade-in">
      <div className="page-hero px-1">
        <div className="page-hero-copy">
          <div className="page-kicker">搜索工作区</div>
          <h1 className="text-lg font-bold mb-2 flex items-center gap-2">
          <Search className="h-4 w-4" /> 高级搜索
          </h1>
          <p className="page-subtitle">用关键词、标签和筛选条件定位你的知识。</p>
        </div>
      </div>
      <div className="page-toolbar">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <Input
            className="input-field flex-1 text-sm"
            placeholder="关键词 tag:编程 subject:计算机 after:2026-01-01 is:inbox &quot;精确短语&quot;"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          <Button type="submit" variant="primary" size="sm">搜索</Button>
          <button
            type="button"
            className="btn-ghost text-xs flex items-center gap-1"
            onClick={handleSave}
            disabled={!activeQuery.trim()}
            title="保存当前搜索"
          >
            <Star className="h-3.5 w-3.5" /> 保存
          </button>
        </form>
        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1.5">
          支持：<code>tag:</code> <code>subject:</code> <code>after:</code> <code>before:</code> <code>is:inbox</code> <code>has:attachment</code> <code>link:</code> / <code>-link:</code> <code>"精确短语"</code>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* 保存的搜索 */}
        {saved.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 flex items-center gap-1">
              <Bookmark className="h-3 w-3" /> 已保存的搜索
            </p>
            <div className="flex flex-wrap gap-1.5">
              {saved.map((s) => (
                <span key={s.id} className="group inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-2.5 pr-1 py-0.5 text-xs">
                  <button
                    className="text-[var(--color-primary)] hover:underline"
                    onClick={() => submit(s.query)}
                    title={s.query}
                  >
                    {s.name}
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] p-0.5"
                    onClick={async () => {
                      await deleteSavedSearch(s.id);
                      await loadSaved();
                    }}
                    title="删除"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 状态行 */}
        {activeQuery.trim() && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1">
              <Filter className="h-3 w-3" />
              {loading ? '搜索中…' : `找到 ${results.length} 条结果`}
            </p>
            {!loading && results.length > 0 && <Button type="button" variant="ghost" size="sm" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={askAIFromResults}>基于结果询问 AI</Button>}
          </div>
        )}

        {/* 结果列表 */}
        <div className="space-y-2">
          {results.map(({ item, reasons, snippet, matchedTerms }) => (
            <button
              key={item.id}
              onClick={() => handleOpen(item.id)}
              className="block w-full text-left rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 hover:border-[var(--color-primary)] hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[var(--color-primary)]">
                  <Highlight text={item.title || '无标题'} terms={highlightTerms} />
                </span>
                {item.subject && <span className="tag-accent">{item.subject}</span>}
                {(item.tags ?? []).slice(0, 3).map((t) => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]">#{t}</span>
                ))}
                <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">
                  {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
              {snippet && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 line-clamp-2">
                  <Highlight text={snippet} terms={matchedTerms.length ? matchedTerms : highlightTerms} />
                </p>
              )}
              <div className="flex items-center gap-1 mt-1.5">
                {reasons.map((r) => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-primary-light)] text-[var(--color-primary)]">{r}</span>
                ))}
              </div>
            </button>
          ))}

          {!loading && activeQuery.trim() && results.length === 0 && (
            <div className="empty-state"><div className="empty-state-icon mb-3"><Search className="h-6 w-6" /></div><p className="text-sm font-medium text-[var(--color-text)]">没有找到匹配内容</p><p className="mt-1 text-xs text-[var(--color-text-secondary)]">可以换个关键词、清除筛选，或直接让 AI 帮你继续探索。</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button className="btn-secondary text-xs" onClick={() => { setInput(''); submit(''); }} type="button"><RotateCcw className="h-3.5 w-3.5" />清除筛选</button><button className="btn-primary text-xs" onClick={() => navigate(`/ai?q=${encodeURIComponent(activeQuery)}`)} type="button"><Sparkles className="h-3.5 w-3.5" />问 AI</button></div></div>
          )}
          {!activeQuery.trim() && (
            <div className="empty-state"><div className="empty-state-icon mb-3"><Search className="h-6 w-6" /></div><p className="text-sm text-[var(--color-text-tertiary)]">输入关键词或使用字段语法开始搜索。</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
