import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Star, PanelLeft, PanelRight, Maximize, Download, FileCode, ChevronDown, ChevronUp, History, Trash2, Copy, Check, X, Loader2, Bot } from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';
import { useAIStore } from '../stores/aiStore';
import { useViewModeStore } from '../stores/viewModeStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSyncStore } from '../stores/syncStore';
import { buildMessages } from '../lib/ai/prompts';
import { markdownToHtml } from '../lib/markdownUtils';
import { saveVersion, getVersions } from '../lib/db/queries';
import type { JournalVersion } from '../lib/db/schema';
import RichTextEditor from '../components/RichTextEditor';
import AIChatPanel from '../components/AIChatPanel';
import DocumentSidebar from '../components/DocumentSidebar';
import DocTree from '../components/DocTree';

type EditMode = 'rich' | 'markdown';
type SelectionAIAction = 'translate' | 'explain' | 'polish';

const selectionAILabels: Record<SelectionAIAction, string> = {
  translate: 'AI 翻译',
  explain: 'AI 解释',
  polish: 'AI 润色',
};

export default function JournalEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { entries, currentEntry, create, update, remove, loadOne, setCurrent, saveStatus, togglePin } = useJournalStore();
  const { callAI, isProcessing } = useAIStore();
  const { isMobile } = useViewModeStore();
  const { settings } = useSettingsStore();
  const { doSync } = useSyncStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  // 仅在切换到新文档时从 store 初始化，避免自动保存/同步更新 currentEntry 时覆盖正在编辑的光标。
  const initializedEntryIdRef = useRef<string | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const markdownRef = useRef<HTMLTextAreaElement>(null);
  // 标题允许多行显示；高度随内容增长，正文自然向下移动，避免长标题与正文重叠。
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);
  // 传给右侧文档侧栏（大纲/反链/提及）的 content：防抖延迟更新，避免每次按键都触发侧栏重算
  const [sidebarContent, setSidebarContent] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSidebarContent(content), 400);
    return () => clearTimeout(t);
  }, [content]);
  const [mode, setMode] = useState<EditMode>(isMobile ? 'markdown' : 'rich');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showDocList, setShowDocList] = useState(false);
  // 右侧文档侧栏（大纲/反链/提及）显示开关，持久化
  const [showSidebar, setShowSidebar] = useState<boolean>(() => {
    const saved = localStorage.getItem('editor-sidebar-visible');
    return saved === null ? true : saved === '1';
  });
  const toggleSidebar = () => setShowSidebar((s) => {
    const next = !s;
    localStorage.setItem('editor-sidebar-visible', next ? '1' : '0');
    return next;
  });
  const [saving, setSaving] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  // 顶部工具栏显示开关（持久化）
  const [showToolbar, setShowToolbar] = useState<boolean>(() => {
    const saved = localStorage.getItem('editor-toolbar-visible');
    return saved === null ? true : saved === '1';
  });
  const toggleToolbar = () => setShowToolbar((s) => {
    const next = !s;
    localStorage.setItem('editor-toolbar-visible', next ? '1' : '0');
    return next;
  });
  // 字数统计：useMemo 缓存，避免每次渲染都重复计算 content.replace
  const charCount = useMemo(() => content.replace(/\s+/g, '').length, [content]);
  // 稳定的导航回调：避免每次渲染都创建新引用，配合子组件 React.memo 减少重渲染
  const handleNavigate = useCallback((targetId: string) => navigate(`/edit/${targetId}`), [navigate]);
  const handleMarkdownOutlineJump = useCallback((line: number) => {
    const textarea = markdownRef.current;
    if (!textarea) return;
    const lines = content.split('\n');
    const safeLine = Math.max(0, Math.min(line, lines.length - 1));
    const start = lines.slice(0, safeLine).reduce((sum, value) => sum + value.length + 1, 0);
    const end = start + (lines[safeLine]?.length ?? 0);
    textarea.focus();
    textarea.setSelectionRange(start, end);
    const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 21;
    textarea.scrollTop = Math.max(0, safeLine * lineHeight - textarea.clientHeight * 0.25);
  }, [content]);
  const [selectionAI, setSelectionAI] = useState<{
    action: SelectionAIAction;
    source: string;
    result: string;
    status: 'loading' | 'done' | 'error';
    error?: string;
  } | null>(null);
  const [selectionAICopied, setSelectionAICopied] = useState(false);
  const selectionAIRequestRef = useRef(0);
  const exportRef = useRef<HTMLDivElement>(null);
  // 版本历史
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<JournalVersion[]>([]);
  const [previewVersion, setPreviewVersion] = useState<JournalVersion | null>(null);
  // 可拖拽调整编辑页文档列表侧栏宽度（持久化）
  const [docListWidth, setDocListWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('editor-doctree-width'));
    return Number.isFinite(saved) && saved > 0 ? Math.max(180, Math.min(340, saved)) : 232;
  });
  const startDocListResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = docListWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(180, Math.min(340, startW + (ev.clientX - startX)));
      setDocListWidth(w);
    };
    const onUp = () => {
      setDocListWidth(w => {
        localStorage.setItem('editor-doctree-width', String(w));
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
  }, [docListWidth]);

  const isNew = !id || id === 'new';

  useEffect(() => {
    if (id && id !== 'new') {
      initializedEntryIdRef.current = null;
      loadOne(id);
    } else {
      initializedEntryIdRef.current = null;
      setCurrent(null);
      setTitle(''); setContent(''); setMode(isMobile ? 'markdown' : 'rich');
    }
  }, [id]);
  useEffect(() => {
    if (currentEntry && currentEntry.id === id && initializedEntryIdRef.current !== currentEntry.id) {
      setTitle(currentEntry.title);
      setContent(currentEntry.content);
      initializedEntryIdRef.current = currentEntry.id;
    }
  }, [currentEntry, id]);

  // 引用定位：个人文档引用带 offset 时，打开编辑器后自动切到 Markdown 并选中原文范围。
  useEffect(() => {
    const raw = searchParams.get('offset');
    const start = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(start) || !content || !currentEntry || currentEntry.id !== id) return;
    setMode('markdown');
    const timer = window.setTimeout(() => {
      const textarea = markdownRef.current;
      if (!textarea) return;
      const safeStart = Math.max(0, Math.min(Math.floor(start), content.length));
      const safeEnd = Math.min(content.length, safeStart + 240);
      textarea.focus();
      textarea.setSelectionRange(safeStart, safeEnd);
      const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 21;
      textarea.scrollTop = Math.max(0, content.slice(0, safeStart).split('\n').length * lineHeight - textarea.clientHeight * 0.25);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [content, currentEntry, id, searchParams]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);

    const entryData = {
      title: title.trim(),
      content,
      contentPlain: content.replace(/[#*`[\]()>|~_ -]/g, '').replace(/\s+/g, ' ').trim(),
      tags: currentEntry?.tags ?? [],
      subject: currentEntry?.subject ?? '',
      sourceType: 'manual' as const,
    };

    if (isNew) {
      const entry = await create(entryData);
      setCurrent(entry);
      navigate(`/edit/${entry.id}`, { replace: true });
    } else if (id) {
      await update(id, entryData);
      // 记录版本快照（saveVersion 内部会去重，与最近一次相同则不存）
      saveVersion(id, title.trim(), content).catch(() => {});
    }
    setSaving(false);
    // 本地保存完成（编辑停顿约 3 秒自动存）。云同步独立：顶部☁️手动 / 编辑停顿 10s 自动
  }, [title, content, isNew, id, currentEntry]);

  // 编辑停顿 10s 后自动同步（仅当启用且开启 autoSync）
  useEffect(() => {
    const sync = settings?.sync;
    if (!sync?.enabled || !sync.autoSync || !sync.token) return;
    if (!title.trim() && !content.trim()) return;
    const timer = setTimeout(() => { doSync(); }, 10000);
    return () => clearTimeout(timer);
  }, [title, content, settings?.sync, doSync]);

  // 自动保存防抖（新文档 + 已有文档均自动保存）
  useEffect(() => {
    if (!title.trim() && !content.trim()) return;
    const timer = setTimeout(handleSave, 3000);
    return () => clearTimeout(timer);
  }, [title, content]);

  // 全局快捷键（Ctrl+S 保存）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 's') {
        e.preventDefault();
        if (title.trim()) handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [title, content]);

  const handleAIAction = async (action: 'summarize' | 'codeReview' | 'codeExplain') => {
    if (!content.trim()) return;
    setShowAIPanel(true);
    const messages = buildMessages(action, { content, title });
    try {
      await callAI(action, messages, (token) => {
        useAIStore.setState({ streamingContent: useAIStore.getState().streamingContent + token });
      });
    } catch (e) {
      // error state is set in store, displayed in AIChatPanel
    }
  };

  // 选中→AI 操作：结果只显示在独立浮层，不自动修改或替换原文。
  const handleSelectionAI = useCallback(async (action: SelectionAIAction, selectedText: string) => {
    const trimmed = selectedText.trim();
    if (!trimmed) {
      setSelectionAI({ action, source: '', result: '', status: 'error', error: '请先选择一段文字' });
      return;
    }
    if (trimmed.length > 50000) {
      setSelectionAI({ action, source: trimmed.slice(0, 500), result: '', status: 'error', error: '选中文本超过 50,000 字符，请分段处理' });
      return;
    }
    const requestId = ++selectionAIRequestRef.current;
    setSelectionAICopied(false);
    setSelectionAI({ action, source: selectedText, result: '', status: 'loading' });
    const sysMap: Record<string, string> = {
      translate: '你是一位专业翻译。把以下文本翻译成英文（若原文是英文则翻译成中文），只输出译文，不要任何解释或前后缀。',
      explain: '你是一位耐心的老师。用简洁通俗的中文解释以下内容，必要时举例，帮助读者快速理解。',
      polish: '你是一位中文写作助手。润色以下文字，使其更通顺、专业、地道，保留原意，只输出润色后的结果。',
    };
    const selectionOffset = content.indexOf(selectedText);
    const messages = [
      { role: 'system' as const, content: `${sysMap[action]}\n\n受限上下文：当前文档 id=${id || 'new'}，选中文本 offset=${Math.max(0, selectionOffset)}。只处理这段选中文本，不要修改文档。` },
      { role: 'user' as const, content: selectedText },
    ];
    try {
      const result = await callAI('explain', messages);
      if (selectionAIRequestRef.current !== requestId) return;
      setSelectionAI({ action, source: selectedText, result: result.trim(), status: 'done' });
      useAIStore.setState({ streamingContent: '' });
    } catch (error) {
      if (selectionAIRequestRef.current !== requestId) return;
      setSelectionAI({
        action,
        source: selectedText,
        result: '',
        status: 'error',
        error: (error as Error).message || 'AI 处理失败，请重试',
      });
      useAIStore.setState({ streamingContent: '' });
    }
  }, [callAI]);

  const closeSelectionAI = useCallback(() => {
    selectionAIRequestRef.current += 1;
    setSelectionAI(null);
    setSelectionAICopied(false);
  }, []);

  const copySelectionAIResult = useCallback(async () => {
    if (!selectionAI?.result) return;
    await navigator.clipboard.writeText(selectionAI.result);
    setSelectionAICopied(true);
    window.setTimeout(() => setSelectionAICopied(false), 1200);
  }, [selectionAI]);

  // 点击双向链接：跳转到目标文档
  const handleWikilinkClick = useCallback((target: string) => {
    const t = target.trim();
    const doc = entries.find(e => !e.deletedAt && (e.title || '无标题') === t);
    if (doc) { setCurrent(doc); navigate(`/edit/${doc.id}`); }
    else { window.alert(`未找到文档「${t}」，可能标题已更改或被删除`); }
  }, [entries, navigate]);

  // 打开版本历史
  const openHistory = async () => {
    if (!id || id === 'new') { window.alert('请先保存文档后再查看历史'); return; }
    const vs = await getVersions(id);
    setVersions(vs);
    setPreviewVersion(vs[0] ?? null);
    setShowHistory(true);
  };
  // 恢复到某个历史版本
  const handleRestore = async (v: JournalVersion) => {
    if (!window.confirm(`恢复到 ${new Date(v.createdAt).toLocaleString('zh-CN')} 的版本？当前内容会被覆盖（覆盖前的内容已自动存为最新版本，可在历史里找回）`)) return;
    if (!id) return;
    // 先把当前内容存一份快照，避免丢失
    await saveVersion(id, title, content).catch(() => {});
    const contentPlain = v.content.replace(/[#*`[\]()>|~_ -]/g, '').replace(/\s+/g, ' ').trim();
    setTitle(v.title);
    setContent(v.content);
    await update(id, { title: v.title, content: v.content, contentPlain });
    setShowHistory(false);
  };

  // 删除当前文档（软删除 → 回收站，可恢复）
  const handleDelete = async () => {
    if (!currentEntry?.id) return;
    if (!window.confirm(`删除文档「${currentEntry.title || '无标题'}」？\n（移到回收站，可在回收站恢复）`)) return;
    await remove(currentEntry.id);
    setCurrent(null);
    navigate('/');
  };

  const handleExportHTML = async () => {
    setShowExportMenu(false);
    const { exportJournalHTML } = await import('../lib/services/export');
    exportJournalHTML(title || '未命名', content);
  };
  const handleExportPDF = async () => {
    setShowExportMenu(false);
    const { exportJournalPDF } = await import('../lib/services/export');
    exportJournalPDF(title || '未命名', content);
  };

  // 点击外部关闭导出菜单
  useEffect(() => {
    if (!showExportMenu) return;
    const onDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showExportMenu]);

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* 工具栏（可隐藏） */}
      {showToolbar && (
      <div className="editor-toolbar glass relative z-30 flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--color-border)] flex-wrap">
        <button className="btn-ghost p-1.5" onClick={toggleToolbar} title="隐藏工具栏">
          <ChevronUp className="h-4 w-4" />
        </button>
        <button className="btn-ghost p-1.5" onClick={() => navigate('/')} title="返回">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button className={`btn-ghost p-1.5 ${showDocList ? 'text-[var(--color-primary)] bg-[var(--color-primary-light)]' : ''}`} onClick={() => setShowDocList(s => !s)} title="显示/隐藏文档列表">
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          className={`btn-ghost p-1.5 ${showSidebar ? 'text-[var(--color-primary)] bg-[var(--color-primary-light)]' : ''}`}
          onClick={toggleSidebar}
          title="显示/隐藏右侧文档面板（大纲/反链/提及）"
        >
          <PanelRight className="h-4 w-4" />
        </button>
        <button className="btn-ghost p-1.5" onClick={() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }} title="聚焦模式（全屏）">
          <Maximize className="h-4 w-4" />
        </button>

        {/* 编辑模式切换 */}
        <div className="flex items-center gap-0.5 ml-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 shadow-xs">
          <button
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${mode === 'rich' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'}`}
            onClick={() => setMode('rich')}
            title="所见即所得编辑"
          >
            富文本
          </button>
          <button
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${mode === 'markdown' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'}`}
            onClick={() => setMode('markdown')}
            title="Markdown 源码编辑"
          >
            Markdown
          </button>
        </div>

        {/* AI 快捷按钮 */}
        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-[var(--color-border)]">
          <button className="btn-ghost text-xs" onClick={() => handleAIAction('summarize')} disabled={!content.trim() || isProcessing} title="AI 总结">总结</button>
          <button className="btn-ghost text-xs" onClick={() => setShowAIPanel(!showAIPanel)} title="展开/收起 AI 面板">
            {showAIPanel ? '关闭 AI' : 'AI 助手'}
          </button>
          <button
            className="btn-ghost text-xs flex items-center gap-1"
            onClick={() => {
              // 发送当前文档到 Agent：先保存，再跳转并附带文档内容
              handleSave();
              const payload = encodeURIComponent(
                JSON.stringify({
                  journalId: currentEntry?.id,
                  title: title || currentEntry?.title || '',
                  content: content || '',
                }),
              );
              navigate(`/agent?doc=${payload}`);
            }}
            disabled={!content.trim()}
            title="发送当前文档到 Agent，让 AI 帮你编辑/扩展"
          >
            <Bot className="h-3.5 w-3.5" /> Agent
          </button>
        </div>

        {/* 导出 */}
        <div className="relative" ref={exportRef}>
          <button
            className="btn-ghost text-xs flex items-center gap-1"
            onClick={() => setShowExportMenu(s => !s)}
            disabled={!content.trim()}
            title="导出为 HTML / PDF"
          >
            <Download className="h-3.5 w-3.5" /> 导出 <ChevronDown className="h-3 w-3" />
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl z-50 py-1 animate-slide-down">
              <button onClick={handleExportHTML} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-2)]">
                <FileCode className="h-3.5 w-3.5" /> 导出 HTML
              </button>
              <button onClick={handleExportPDF} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-2)]">
                <FileCode className="h-3.5 w-3.5" /> 导出 PDF
              </button>
            </div>
          )}
        </div>

        {/* 版本历史 */}
        <button
          className="btn-ghost text-xs flex items-center gap-1"
          onClick={openHistory}
          disabled={!currentEntry?.id}
          title="版本历史（查看 / 恢复历史版本）"
        >
          <History className="h-3.5 w-3.5" /> 历史
        </button>

        <div className="flex-1" />
        {/* 置顶切换 */}
        {currentEntry?.id && (
          <button
            className={`btn-ghost text-xs ${currentEntry.pinned ? 'text-[var(--color-accent)]' : ''}`}
            onClick={() => togglePin(currentEntry.id)}
            title={currentEntry.pinned ? '取消置顶' : '置顶到侧栏'}
          >
            <Star className={`h-4 w-4 ${currentEntry.pinned ? 'fill-[var(--color-accent)]' : ''}`} />
            {currentEntry.pinned ? '已置顶' : '置顶'}
          </button>
        )}
        {currentEntry?.id && (
          <button
            className="btn-ghost p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
            onClick={handleDelete}
            title="删除（移到回收站）"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button className="btn-ghost p-1.5" onClick={() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }} title="聚焦模式（全屏）">
          <Maximize className="h-4 w-4" />
        </button>
        {/* 保存状态指示器 */}
        <span className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1">
          {saveStatus === 'saving' && <span key="saving" className="animate-fade-in text-[var(--color-accent)]">💾 保存中...</span>}
          {saveStatus === 'saved' && <span key="saved" className="animate-fade-in text-[var(--color-success)]">✅ 已保存</span>}
          {saveStatus === 'error' && <span key="error" className="animate-fade-in text-[var(--color-danger)]">⚠️ 保存失败</span>}
        </span>
        <button className="btn-primary text-sm" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
      )}

      {/* 工具栏隐藏时的展开按钮 */}
      {!showToolbar && (
        <div className="flex items-center px-2 py-1 border-b border-[var(--color-border)]">
          <button className="btn-ghost p-1.5" onClick={toggleToolbar} title="显示工具栏">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 文档主体 */}
      <div className="flex flex-1 overflow-hidden">
        {showDocList && (
          <div
            className="relative shrink-0 shadow-md"
            style={{ width: docListWidth }}
          >
            <aside className="h-full border-r border-[var(--color-border-strong)] bg-[var(--color-surface)] overflow-y-auto p-2 animate-slide-down">
              <DocTree />
            </aside>
            {/* 可拖拽调整宽度的把手 */}
            <div
              onMouseDown={startDocListResize}
              className="absolute right-0 top-0 bottom-0 z-20 w-1.5 cursor-col-resize hover:bg-[var(--color-primary)]/40 transition-colors"
              title="拖动调整宽度"
            />
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <div className="editor-reading-column mx-auto w-full max-w-[900px] px-4 py-5 sm:px-7 sm:py-7 lg:px-10">
            {/* 标题 */}
            <textarea
              ref={titleRef}
              rows={1}
              className="block w-full resize-none overflow-hidden bg-transparent border-none outline-none text-[1.8rem] sm:text-[2.15rem] font-bold placeholder:text-[var(--color-text-tertiary)] tracking-[-0.025em] leading-[1.18]"
              placeholder="无标题"
              value={title}
              onChange={e => setTitle(e.target.value.replace(/[\r\n]+/g, ' '))}
              onKeyDown={e => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              spellCheck={false}
              autoFocus={isNew}
            />

            {/* 元信息行（飞书式轻量信息条） */}
            <div className="mt-3 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] flex-wrap">
              {currentEntry?.createdAt && (
                <span>
                  {new Date(currentEntry.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {currentEntry?.subject && <span className="tag-accent">{currentEntry.subject}</span>}
              {content.trim() && <span key={charCount} className="animate-fade-in tabular-nums">· {charCount} 字</span>}
              {currentEntry?.summary && <span className="text-[var(--color-primary)]">· ✨ 已生成总结</span>}
            </div>

            <div className="divider my-4" />

            {/* 编辑器 */}
            {mode === 'rich' ? (
              <RichTextEditor
                value={content}
                onChange={setContent}
                autoFocus={isNew}
                onAIAction={handleSelectionAI}
                onWikilinkClick={handleWikilinkClick}
                journalId={currentEntry?.id}
              />
            ) : (
              <textarea
                ref={markdownRef}
                className="w-full min-h-[60vh] bg-transparent border-none outline-none resize-none font-mono text-sm leading-[1.5]"
                placeholder="# 在此输入 Markdown..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
              />
            )}

          </div>
        </div>

        {/* 文档侧栏：大纲 / 反向链接 / 未链接提及（非移动端且非 AI 面板且未手动隐藏时显示） */}
        {showSidebar && !showAIPanel && !isMobile && (
          <DocumentSidebar
            journalId={currentEntry?.id}
            title={title}
            aliases={currentEntry?.aliases}
            content={sidebarContent}
            onNavigate={handleNavigate}
            onOutlineJump={mode === 'markdown' ? handleMarkdownOutlineJump : undefined}
          />
        )}

        {/* AI 面板（移动端全屏覆盖，桌面端右侧固定宽度） */}
        {showAIPanel && (
          <div className={isMobile ? 'fixed inset-0 z-50 bg-[var(--color-bg)]' : undefined}>
            <AIChatPanel
              journalId={currentEntry?.id}
              onAction={(action) => handleAIAction(action as 'summarize' | 'codeReview' | 'codeExplain')}
              onClose={isMobile ? () => setShowAIPanel(false) : undefined}
              onAccept={(c) => {
                if (currentEntry?.id) update(currentEntry.id, { summary: c });
                useAIStore.setState({ streamingContent: '' });
                setShowAIPanel(false);
              }}
            />
          </div>
        )}
      </div>

      {/* 选区 AI 结果浮层：结果只供查看/复制，绝不自动写回正文。 */}
      {selectionAI && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4 animate-fade-in"
          onClick={closeSelectionAI}
          role="presentation"
        >
          <section
            className="flex max-h-[78vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={selectionAILabels[selectionAI.action]}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">{selectionAILabels[selectionAI.action]}</h2>
              <button type="button" className="btn-ghost h-8 w-8 p-0" onClick={closeSelectionAI} title="关闭">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <p className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">原文</p>
                <div className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                  {selectionAI.source}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">结果</p>
                {selectionAI.status === 'loading' && (
                  <div className="flex min-h-28 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] p-4 text-sm text-[var(--color-text-secondary)]">
                    <Loader2 className="h-4 w-4 animate-spin" /> 正在处理...
                  </div>
                )}
                {selectionAI.status === 'error' && (
                  <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                    <p className="text-sm text-[var(--color-text)]">{selectionAI.error}</p>
                    <button type="button" className="btn-ghost mt-2 text-xs" onClick={() => handleSelectionAI(selectionAI.action, selectionAI.source)}>重试</button>
                  </div>
                )}
                {selectionAI.status === 'done' && (
                  <div className="min-h-28 whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm leading-6 text-[var(--color-text)]">
                    {selectionAI.result || 'AI 未返回内容'}
                  </div>
                )}
              </div>
            </div>
            <footer className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3">
              <span className="text-xs text-[var(--color-text-tertiary)]">原文不会被修改</span>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-ghost text-sm" onClick={closeSelectionAI}>关闭</button>
                <button type="button" className="btn-primary flex items-center gap-1.5 text-sm" onClick={copySelectionAIResult} disabled={selectionAI.status !== 'done' || !selectionAI.result}>
                  {selectionAICopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {selectionAICopied ? '已复制' : '复制结果'}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {/* 版本历史模态 */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in" onClick={() => setShowHistory(false)}>
          <div className="flex w-full max-w-4xl h-[70vh] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* 左：版本列表 */}
            <div className="w-56 shrink-0 border-r border-[var(--color-border)] overflow-y-auto p-2">
              <p className="text-xs font-medium text-[var(--color-text-secondary)] px-2 py-1.5">版本历史（{versions.length}）</p>
              {versions.length === 0 ? (
                <p className="text-xs text-[var(--color-text-tertiary)] p-4 text-center">还没有历史版本<br/>（编辑后会自动记录）</p>
              ) : versions.map(v => (
                <button
                  key={v.id}
                  onClick={() => setPreviewVersion(v)}
                  className={`w-full text-left rounded-md px-2.5 py-2 text-xs transition-colors ${previewVersion?.id === v.id ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' : 'hover:bg-[var(--color-surface-2)]'}`}
                >
                  <p className="font-medium truncate">{v.title || '无标题'}</p>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">{new Date(v.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                </button>
              ))}
            </div>
            {/* 右：预览 */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
                <span className="text-sm font-medium text-[var(--color-text)]">
                  {previewVersion ? new Date(previewVersion.createdAt).toLocaleString('zh-CN') : '版本预览'}
                </span>
                <div className="flex gap-2">
                  {previewVersion && (
                    <button className="btn-primary text-xs" onClick={() => handleRestore(previewVersion)}>恢复此版本</button>
                  )}
                  <button className="btn-ghost text-xs" onClick={() => setShowHistory(false)}>关闭</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {previewVersion ? (
                  <div className="prose-custom text-sm" dangerouslySetInnerHTML={{ __html: markdownToHtml(previewVersion.content) }} />
                ) : (
                  <p className="text-center text-sm text-[var(--color-text-tertiary)] py-10">选择左侧版本查看内容</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
