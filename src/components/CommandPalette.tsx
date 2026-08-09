import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Plus, Brain, BookOpen, BarChart3, Settings, MessageSquare, CalendarDays, Tag } from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';
import { searchJournals } from '../lib/search/fuse';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { entries, setCurrent, createTodayNote } = useJournalStore();
  const [query, setQuery] = useState('');
  // 让搜索计算延后，避免快速输入时阻塞 UI（大数据量下尤其明显）
  const deferredQuery = useDeferredValue(query);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Build command list
  const commands = useMemo(() => {
    const actions = [
      { type: 'action' as const, icon: Plus, label: '新建文档', desc: '创建一篇新文档', action: () => { setCurrent(null); navigate('/edit/new'); } },
      { type: 'action' as const, icon: CalendarDays, label: '今日笔记', desc: '一键创建/打开今天的每日总结', action: async () => {
        const { entry } = await createTodayNote();
        navigate(`/edit/${entry.id}`);
      } },
      { type: 'action' as const, icon: MessageSquare, label: 'AI 助手', desc: '与 AI 对话', action: () => navigate('/ai') },
      { type: 'action' as const, icon: BookOpen, label: '复习', desc: '复习知识卡片', action: () => navigate('/review') },
      { type: 'action' as const, icon: Brain, label: '知识图谱', desc: '查看知识关联', action: () => navigate('/knowledge') },
      { type: 'action' as const, icon: BarChart3, label: '统计', desc: '查看学习数据', action: () => navigate('/stats') },
      { type: 'action' as const, icon: Tag, label: '标签管理', desc: '标签云与按标签筛选', action: () => navigate('/tags') },
      { type: 'action' as const, icon: Settings, label: '设置', desc: 'API 配置和数据管理', action: () => navigate('/settings') },
    ];

    // Search documents if query is not empty
    let docResults: { type: 'doc'; id: string; title: string; subject: string; tags: string[]; createdAt: number }[] = [];
    if (deferredQuery.trim()) {
      // 优先用 Fuse 模糊搜索（加权 + 拼写容错，索引由 App 启动时构建）；
      // 若索引尚未就绪（冷启动），降级为简单字段 includes 匹配，保证总有结果
      const fuseResults = searchJournals(deferredQuery, 8);
      const ql = deferredQuery.toLowerCase();
      const matched = fuseResults.length > 0
        ? fuseResults
        : entries.filter(e =>
            e.title.toLowerCase().includes(ql) ||
            e.contentPlain?.toLowerCase().includes(ql) ||
            e.tags.some(t => t.toLowerCase().includes(ql)) ||
            e.subject?.toLowerCase().includes(ql),
          ).slice(0, 8);
      docResults = matched.map(e => ({
        type: 'doc' as const,
        id: e.id,
        title: e.title || '无标题',
        subject: e.subject,
        tags: e.tags,
        createdAt: e.createdAt,
      }));
    }

    // Filter actions by query
    const qAct = deferredQuery.toLowerCase();
    const filteredActions = deferredQuery.trim()
      ? actions.filter(a => a.label.toLowerCase().includes(qAct) || a.desc.toLowerCase().includes(qAct))
      : actions;

    return [...filteredActions, ...docResults];
  }, [deferredQuery, entries, navigate, setCurrent]);

  // Reset active index when query changes
  useEffect(() => { setActiveIndex(0); }, [query]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, commands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(activeIndex);
    }
  };

  const handleSelect = (index: number) => {
    const cmd = commands[index];
    if (!cmd) return;
    if (cmd.type === 'action') {
      cmd.action();
    } else {
      const entry = entries.find(e => e.id === cmd.id);
      if (entry) {
        setCurrent(entry);
        navigate(`/edit/${entry.id}`);
      }
    }
    onClose();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
        onClick={onClose}
      >
        {/* Panel */}
        <div
          className="w-full max-w-xl bg-[var(--color-surface)] rounded-2xl shadow-2xl border border-[var(--color-border)] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
            <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent border-none outline-none text-base text-[var(--color-text)] placeholder:text-gray-400"
              placeholder="搜索文档或输入命令..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <kbd className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">ESC</kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {commands.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                没有找到匹配的结果
              </div>
            ) : (
              commands.map((cmd, i) => (
                <button
                  key={i}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === activeIndex ? 'bg-brand-50 dark:bg-brand-900/20' : ''
                  }`}
                  onClick={() => handleSelect(i)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  {cmd.type === 'action' ? (
                    <cmd.icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">{cmd.type === 'action' ? cmd.label : cmd.title}</p>
                    {cmd.type === 'action' ? (
                      <p className="text-xs text-gray-400 truncate">{cmd.desc}</p>
                    ) : (
                      <p className="text-xs text-gray-400 truncate">
                        {cmd.subject && <span>{cmd.subject} · </span>}
                        {new Date(cmd.createdAt).toLocaleDateString('zh-CN')}
                      </p>
                    )}
                  </div>
                  {cmd.type === 'doc' && cmd.tags.length > 0 && (
                    <div className="flex gap-1 flex-shrink-0">
                      {cmd.tags.slice(0, 2).map(t => (
                        <span key={t} className="tag-gray text-[10px]">{t}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] text-[10px] text-gray-400">
            <div className="flex items-center gap-3">
              <span><kbd className="bg-gray-100 dark:bg-gray-800 px-1 rounded">↑↓</kbd> 导航</span>
              <span><kbd className="bg-gray-100 dark:bg-gray-800 px-1 rounded">↵</kbd> 选择</span>
            </div>
            <span>知识库</span>
          </div>
        </div>
      </div>
    </>
  );
}