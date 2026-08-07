import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useJournalStore } from '../stores/journalStore';
import { useAIStore } from '../stores/aiStore';
import { buildMessages } from '../lib/ai/prompts';
import { useHistory } from '../lib/hooks/useHistory';
import MarkdownEditor from '../components/MarkdownEditor';
import TagInput from '../components/TagInput';
import AIChatPanel from '../components/AIChatPanel';
import DocOutline from '../components/DocOutline';

export default function JournalEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentEntry, create, update, loadOne, setCurrent, saveStatus } = useJournalStore();
  const { callAI, isProcessing, streamingContent } = useAIStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const contentHistory = useHistory(content, setContent);
  const [subject, setSubject] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [timeSpent, setTimeSpent] = useState<number>(0);
  const [difficulty, setDifficulty] = useState<number>(0);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [saving, setSaving] = useState(false);

  const isNew = !id || id === 'new';

  useEffect(() => {
    if (id && id !== 'new') {
      loadOne(id);
    } else {
      setCurrent(null);
      setTitle(''); setContent(''); setSubject(''); setTagsInput(''); setTimeSpent(0); setDifficulty(0);
    }
  }, [id]);
  useEffect(() => {
    if (currentEntry && currentEntry.id === id) {
      setTitle(currentEntry.title);
      setContent(currentEntry.content);
      setSubject(currentEntry.subject || '');
      setTagsInput(currentEntry.tags.join(', '));
      setTimeSpent(currentEntry.timeSpentMinutes || 0);
      setDifficulty(currentEntry.difficulty || 0);
    }
  }, [currentEntry, id]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);

    const entryData = {
      title: title.trim(),
      content,
      contentPlain: content.replace(/[#*`[\]()>|~_ -]/g, '').replace(/\s+/g, ' ').trim(),
      tags: tagsInput.split(/[,，]/).map(t => t.trim()).filter(Boolean),
      subject: subject.trim(),
      timeSpentMinutes: timeSpent || undefined,
      difficulty: difficulty || undefined,
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
  }, [title, content, subject, tagsInput, timeSpent, difficulty, isNew, id]);

  // 自动保存防抖（新文档 + 已有文档均自动保存）
  useEffect(() => {
    if (!title.trim() && !content.trim()) return;
    const timer = setTimeout(handleSave, 3000);
    return () => clearTimeout(timer);
  }, [title, content, subject, tagsInput, timeSpent, difficulty]);

  // 全局快捷键
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
  }, [title, content, subject, tagsInput, timeSpent, difficulty]);

  const handleAIAction = async (action: 'summarize' | 'generateCards' | 'codeReview' | 'codeExplain') => {
    if (!content.trim()) return;
    setShowAIPanel(true);
    const messages = buildMessages(action, { content, title, tags: tagsInput.split(/[,，]/).map(t => t.trim()), subject });
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
        <button className="btn-ghost text-sm" onClick={() => navigate('/')}>← 返回</button>

        {/* AI 快捷按钮 */}
        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-[var(--color-border)]">
          <button className="btn-ghost text-xs" onClick={() => handleAIAction('summarize')} disabled={!content.trim() || isProcessing} title="AI 总结">📝 总结</button>
          <button className="btn-ghost text-xs" onClick={() => handleAIAction('generateCards')} disabled={!content.trim() || isProcessing} title="生成知识卡片">🃏 卡片</button>
          <button className="btn-ghost text-xs" onClick={() => setShowAIPanel(!showAIPanel)} title="展开/收起 AI 面板">
            {showAIPanel ? '▶' : '🧠 AI'}
          </button>
        </div>

        <div className="flex-1" />
        {/* 保存状态指示器 */}
        <span className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1">
          {saveStatus === 'saving' && <span className="text-[var(--color-accent)]">💾 保存中...</span>}
          {saveStatus === 'saved' && <span className="text-[var(--color-success)]">✅ 已保存</span>}
          {saveStatus === 'error' && <span className="text-[var(--color-danger)]">⚠️ 保存失败</span>}
        </span>
        <button className="btn-primary text-sm" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? '保存中...' : '💾 保存'}
        </button>
      </div>

      {/* 元数据行 */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex-wrap">
        <input className="w-1/3 min-w-[120px] text-xl font-bold bg-transparent border-none outline-none placeholder:text-[var(--color-text-tertiary)]"
          placeholder="文档标题..." value={title} onChange={e => setTitle(e.target.value)} />
        <input className="input-field w-36 text-xs" placeholder="学科" value={subject} onChange={e => setSubject(e.target.value)} />
        <TagInput value={tagsInput} onChange={setTagsInput} placeholder="标签" />
        <input type="number" className="input-field w-20 text-xs" placeholder="分钟" value={timeSpent || ''} onChange={e => setTimeSpent(Number(e.target.value))} />
        <div className="flex items-center gap-1 text-sm">
          <span className="text-[var(--color-text-tertiary)]">难度：</span>
          {[1,2,3,4,5].map(n => (
            <span key={n} className={`cursor-pointer transition-transform hover:scale-125 ${n <= difficulty ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)]'}`}
              onClick={() => setDifficulty(n)}>★</span>
          ))}
        </div>
      </div>

      {/* 主体区域 */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <MarkdownEditor
            value={content}
            onChange={setContent}
            minHeight={600}
            onUndo={contentHistory.undo}
            onRedo={contentHistory.redo}
            canUndo={contentHistory.canUndo}
            canRedo={contentHistory.canRedo}
          />
        </div>

        {/* AI 面板 */}
        {showAIPanel && (
          <AIChatPanel
            journalId={currentEntry?.id}
            onAction={(action) => handleAIAction(action as 'summarize' | 'generateCards' | 'codeReview' | 'codeExplain')}
            onAccept={(c) => {
              if (currentEntry?.id) update(currentEntry.id, { summary: c });
              useAIStore.setState({ streamingContent: '' });
              setShowAIPanel(false);
            }}
          />
        )}
      </div>
    </div>
  );
}