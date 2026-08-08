import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';
import { useAIStore } from '../stores/aiStore';
import { useViewModeStore } from '../stores/viewModeStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSyncStore } from '../stores/syncStore';
import { buildMessages } from '../lib/ai/prompts';
import RichTextEditor from '../components/RichTextEditor';
import AIChatPanel from '../components/AIChatPanel';
import DocOutline from '../components/DocOutline';

type EditMode = 'rich' | 'markdown';

export default function JournalEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentEntry, create, update, loadOne, setCurrent, saveStatus, togglePin } = useJournalStore();
  const { callAI, isProcessing, streamingContent } = useAIStore();
  const { isMobile } = useViewModeStore();
  const { settings } = useSettingsStore();
  const { doSync } = useSyncStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<EditMode>('rich');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [saving, setSaving] = useState(false);

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
    }
    setSaving(false);
    // 保存成功后若启用云同步，则自动推送（保存即同步）
    const sync = useSettingsStore.getState().settings?.sync;
    if (sync?.enabled && sync.token && sync.owner && sync.repo) {
      doSync();
    }
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

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* 工具栏 */}
      <div className="glass flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] flex-wrap">
        <button className="btn-ghost text-sm" onClick={() => navigate('/')} title="返回">← 返回</button>

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
        {/* 保存状态指示器 */}
        <span className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1">
          {saveStatus === 'saving' && <span className="text-[var(--color-accent)]">💾 保存中...</span>}
          {saveStatus === 'saved' && <span className="text-[var(--color-success)]">✅ 已保存</span>}
          {saveStatus === 'error' && <span className="text-[var(--color-danger)]">⚠️ 保存失败</span>}
        </span>
        <button className="btn-primary text-sm" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {/* 文档主体：居中窄栏（飞书式阅读宽度，大屏两侧大量留白） */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 sm:px-10 py-5">
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
              {content.trim() && <span>· {content.replace(/\s+/g, '').length} 字</span>}
              {currentEntry?.summary && <span className="text-[var(--color-primary)]">· ✨ 已生成总结</span>}
            </div>

            <div className="divider my-1" />

            {/* 编辑器 */}
            {mode === 'rich' ? (
              <RichTextEditor value={content} onChange={setContent} autoFocus={isNew} />
            ) : (
              <textarea
                className="w-full min-h-[60vh] bg-transparent border-none outline-none resize-none font-mono text-sm leading-relaxed"
                placeholder="# 在此输入 Markdown..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
              />
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
    </div>
  );
}