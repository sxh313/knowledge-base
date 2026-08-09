import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, PanelLeft, Maximize, Download, FileCode, ChevronDown, History } from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';
import { useAIStore } from '../stores/aiStore';
import { useViewModeStore } from '../stores/viewModeStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSyncStore } from '../stores/syncStore';
import { buildMessages } from '../lib/ai/prompts';
import { extractWikilinks, markdownToHtml } from '../lib/markdownUtils';
import { saveVersion, getVersions, deleteVersion } from '../lib/db/queries';
import type { JournalVersion } from '../lib/db/schema';
import RichTextEditor from '../components/RichTextEditor';
import AIChatPanel from '../components/AIChatPanel';
import DocOutline from '../components/DocOutline';
import DocTree from '../components/DocTree';

type EditMode = 'rich' | 'markdown';

export default function JournalEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { entries, currentEntry, create, update, loadOne, setCurrent, saveStatus, togglePin } = useJournalStore();
  const { callAI, isProcessing, streamingContent } = useAIStore();
  const { isMobile } = useViewModeStore();
  const { settings } = useSettingsStore();
  const { doSync } = useSyncStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<EditMode>('rich');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showDocList, setShowDocList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  /** 选中→AI 操作：把 AI 处理结果通过 signal 注入回编辑器选区 */
  const [insertSignal, setInsertSignal] = useState<{ text: string; n: number } | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  // 版本历史
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<JournalVersion[]>([]);
  const [previewVersion, setPreviewVersion] = useState<JournalVersion | null>(null);
  // 可拖拽调整编辑页文档列表侧栏宽度（持久化）
  const [docListWidth, setDocListWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('editor-doctree-width'));
    return Number.isFinite(saved) && saved > 0 ? saved : 208;
  });
  const startDocListResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = docListWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(160, Math.min(420, startW + (ev.clientX - startX)));
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
      loadOne(id);
    } else {
      setCurrent(null);
      setTitle(''); setContent(''); setMode('rich');
    }
  }, [id]);
  useEffect(() => {
    if (currentEntry && currentEntry.id === id) {
      setTitle(currentEntry.title);
      setContent(currentEntry.content);
    }
  }, [currentEntry, id]);

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

  const handleAIAction = async (action: 'summarize' | 'generateCards' | 'codeReview' | 'codeExplain') => {
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

  // 选中→AI 操作（飞书式）：翻译/解释/润色，完成后把结果注入编辑器选区
  const handleSelectionAI = async (action: 'translate' | 'explain' | 'polish', selectedText: string) => {
    if (!selectedText.trim()) return;
    const sysMap: Record<string, string> = {
      translate: '你是一位专业翻译。把以下文本翻译成英文（若原文是英文则翻译成中文），只输出译文，不要任何解释或前后缀。',
      explain: '你是一位耐心的老师。用简洁通俗的中文解释以下内容，必要时举例，帮助读者快速理解。',
      polish: '你是一位中文写作助手。润色以下文字，使其更通顺、专业、地道，保留原意，只输出润色后的结果。',
    };
    const messages = [
      { role: 'system' as const, content: sysMap[action] },
      { role: 'user' as const, content: selectedText },
    ];
    try {
      const result = await callAI('explain', messages);
      setInsertSignal({ text: result.trim(), n: Date.now() });
      // 清空残留的 streamingContent（避免污染下次 AI 面板）
      useAIStore.setState({ streamingContent: '' });
    } catch {
      /* 错误已由 store 处理，AIChatPanel 未打开时静默 */
    }
  };

  // 点击双向链接：跳转到目标文档
  const handleWikilinkClick = (target: string) => {
    const t = target.trim();
    const doc = entries.find(e => !e.deletedAt && (e.title || '无标题') === t);
    if (doc) { setCurrent(doc); navigate(`/edit/${doc.id}`); }
    else { window.alert(`未找到文档「${t}」，可能标题已更改或被删除`); }
  };

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

  // 反向引用：哪些文档用 [[本文档标题]] 链接了本文档
  const myTitle = currentEntry?.title?.trim();
  const backlinks = myTitle
    ? entries.filter(e => !e.deletedAt && e.id !== currentEntry?.id && extractWikilinks(e.content).some(t => t.trim() === myTitle))
    : [];

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
      {/* 工具栏 */}
      <div className="glass flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] flex-wrap">
        <button className="btn-ghost text-sm" onClick={() => navigate('/')} title="返回">← 返回</button>
        <button className={`btn-ghost p-1.5 ${showDocList ? 'text-[var(--color-primary)] bg-[var(--color-primary-light)]' : ''}`} onClick={() => setShowDocList(s => !s)} title="显示/隐藏文档列表">
          <PanelLeft className="h-4 w-4" />
        </button>
        <button className="btn-ghost p-1.5" onClick={() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }} title="聚焦模式（全屏）">
          <Maximize className="h-4 w-4" />
        </button>

        {/* 编辑模式切换 */}
        <div className="flex items-center gap-0.5 ml-2 rounded-lg border border-[var(--color-border)] p-0.5">
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
          <button className="btn-ghost text-xs" onClick={() => handleAIAction('generateCards')} disabled={!content.trim() || isProcessing} title="AI 生成知识卡片">卡片</button>
          <button className="btn-ghost text-xs" onClick={() => setShowAIPanel(!showAIPanel)} title="展开/收起 AI 面板">
            {showAIPanel ? '关闭 AI' : 'AI 助手'}
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
                <FileCode className="h-3.5 w-3.5" /> 导出 PDF（打印）
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

      {/* 文档主体 */}
      <div className="flex flex-1 overflow-hidden gap-4">
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
          <div className="py-5">
            {/* 标题 */}
            <input
              className="w-full text-3xl sm:text-4xl font-bold bg-transparent border-none outline-none placeholder:text-[var(--color-text-tertiary)] tracking-tight leading-tight"
              placeholder="无标题"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus={isNew}
            />

            {/* 元信息行（飞书式轻量信息条） */}
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] flex-wrap">
              {currentEntry?.createdAt && (
                <span>
                  {new Date(currentEntry.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {currentEntry?.subject && <span className="tag-accent">{currentEntry.subject}</span>}
              {content.trim() && <span key={content.replace(/\s+/g, '').length} className="animate-fade-in tabular-nums">· {content.replace(/\s+/g, '').length} 字</span>}
              {currentEntry?.summary && <span className="text-[var(--color-primary)]">· ✨ 已生成总结</span>}
            </div>

            <div className="divider my-1" />

            {/* 编辑器 */}
            {mode === 'rich' ? (
              <RichTextEditor
                value={content}
                onChange={setContent}
                autoFocus={isNew}
                onAIAction={handleSelectionAI}
                insertSignal={insertSignal}
                onWikilinkClick={handleWikilinkClick}
              />
            ) : (
              <textarea
                className="w-full min-h-[60vh] bg-transparent border-none outline-none resize-none font-mono text-sm leading-[1.5]"
                placeholder="# 在此输入 Markdown..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
              />
            )}

            {/* 反向引用：哪些文档链接了本文档 */}
            {backlinks.length > 0 && (
              <div className="mt-6 rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
                <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">🔗 反向引用（{backlinks.length}）</p>
                <div className="space-y-1">
                  {backlinks.map(b => (
                    <button key={b.id} onClick={() => { setCurrent(b); navigate(`/edit/${b.id}`); }} className="block w-full text-left rounded-md p-2 hover:bg-[var(--color-surface-2)] transition-colors">
                      <p className="text-sm font-medium text-[var(--color-primary)] truncate">{b.title || '无标题'}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">{b.contentPlain?.slice(0, 80) || b.content?.slice(0, 80)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 文档大纲（仅富文本模式、非移动端且非 AI 面板时显示） */}
        {mode === 'rich' && !showAIPanel && !isMobile && content.trim() && (
          <DocOutline content={content} />
        )}

        {/* AI 面板（移动端全屏覆盖，桌面端右侧固定宽度） */}
        {showAIPanel && (
          <div className={isMobile ? 'fixed inset-0 z-50 bg-[var(--color-bg)]' : undefined}>
            <AIChatPanel
              journalId={currentEntry?.id}
              onAction={(action) => handleAIAction(action as 'summarize' | 'generateCards' | 'codeReview' | 'codeExplain')}
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