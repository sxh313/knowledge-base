import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useJournalStore } from '../stores/journalStore';
import { useAIStore } from '../stores/aiStore';
import { buildMessages } from '../lib/ai/prompts';
import MarkdownEditor from '../components/MarkdownEditor';
import TagInput from '../components/TagInput';
import AIChatPanel from '../components/AIChatPanel';

export default function JournalEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentEntry, create, update, loadOne, setCurrent } = useJournalStore();
  const { callAI, isProcessing, streamingContent } = useAIStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
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

  // 自动保存防抖（新日记 + 已有日记均自动保存）
  useEffect(() => {
    if (!title.trim() && !content.trim()) return;
    const timer = setTimeout(handleSave, 3000);
    return () => clearTimeout(timer);
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
      alert((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <button className="btn-ghost text-sm" onClick={() => navigate('/')}>← 返回</button>
        <div className="flex-1" />
        <button className="btn-primary text-sm" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? '保存中...' : '💾 保存'}
        </button>
      </div>

      {/* 元数据行 */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--color-border)] flex-wrap">
        <input className="w-1/3 min-w-[120px] text-xl font-bold bg-transparent border-none outline-none"
          placeholder="日记标题..." value={title} onChange={e => setTitle(e.target.value)} />
        <input className="input-field w-36 text-xs" placeholder="学科" value={subject} onChange={e => setSubject(e.target.value)} />
        <TagInput value={tagsInput} onChange={setTagsInput} placeholder="标签" />
        <input type="number" className="input-field w-20 text-xs" placeholder="分钟" value={timeSpent || ''} onChange={e => setTimeSpent(Number(e.target.value))} />
        <div className="flex items-center gap-1 text-sm text-gray-400">
          <span>难度：</span>
          {[1,2,3,4,5].map(n => (
            <span key={n} className={`cursor-pointer ${n <= difficulty ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-300'}`}
              onClick={() => setDifficulty(n)}>★</span>
          ))}
        </div>
      </div>

      {/* 主体区域 */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <MarkdownEditor value={content} onChange={setContent} minHeight={600} />
        </div>

        {/* AI 面板 */}
        {showAIPanel && (
          <AIChatPanel
            onAction={(action) => handleAIAction(action as 'summarize' | 'generateCards' | 'codeReview' | 'codeExplain')}
            onAccept={(c) => {
              if (currentEntry?.id) update(currentEntry.id, { summary: c });
              useAIStore.setState({ streamingContent: '' });
              setShowAIPanel(false);
            }}
          />
        )}
      </div>

      {/* AI 快捷按钮（不打开面板时显示） */}
      {!showAIPanel && (
        <div className="flex gap-2 px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <button className="btn-ghost text-xs" onClick={() => handleAIAction('summarize')}>📝 AI 总结</button>
          <button className="btn-ghost text-xs" onClick={() => handleAIAction('generateCards')}>🃏 生成卡片</button>
          <button className="btn-ghost text-xs" onClick={() => handleAIAction('codeReview')}>🔍 代码分析</button>
          <button className="btn-ghost text-xs" onClick={() => handleAIAction('codeExplain')}>📖 代码解释</button>
        </div>
      )}
    </div>
  );
}