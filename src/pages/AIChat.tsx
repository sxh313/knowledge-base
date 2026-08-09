import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAIStore } from '../stores/aiStore';
import { useJournalStore } from '../stores/journalStore';
import type { ChatMessage } from '../lib/ai/client';
import {
  retrieve,
  formatContextForPrompt,
  buildRAGSystemPrompt,
  type KnowledgeScope,
  type RetrievedChunk,
} from '../lib/ai/retrieval';
import CitationList from '../components/CitationList';
import ReactMarkdown from 'react-markdown';
import { Save } from 'lucide-react';

function parseScope(s: string): KnowledgeScope {
  if (s === 'none') return { kind: 'none' };
  if (s === 'all' || !s) return { kind: 'all' };
  if (s.startsWith('subject:')) return { kind: 'subject', subject: decodeURIComponent(s.slice(8)) };
  if (s.startsWith('tag:')) return { kind: 'tag', tag: decodeURIComponent(s.slice(4)) };
  if (s.startsWith('doc:')) return { kind: 'doc', journalId: s.slice(4) };
  return { kind: 'all' };
}

export default function AIChat() {
  const navigate = useNavigate();
  const { isProcessing, error, conversation, setConversation, addMessage, chat: aiChat, streamingContent } = useAIStore();
  const { entries, create } = useJournalStore();
  const [input, setInput] = useState('');
  const [scopeStr, setScopeStr] = useState<string>('all');
  const [citations, setCitations] = useState<RetrievedChunk[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 知识范围下拉选项：全部/不使用 + 按分类 + 按标签 + 指定文档
  const { subjects, tags, recentDocs } = useMemo(() => {
    const subs = Array.from(new Set(entries.map((e) => e.subject).filter(Boolean))) as string[];
    const tg = Array.from(new Set(entries.flatMap((e) => e.tags ?? [])));
    const docs = [...entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
    return { subjects: subs, tags: tg, recentDocs: docs };
  }, [entries]);

  useEffect(() => {
    if (conversation.length === 0) {
      setConversation([
        { role: 'system', content: '你是一个基于用户个人知识库的学习助手。我会根据知识库内容回答问题、解释概念、提供学习建议。若知识库中没有相关记录，我会如实告知。' },
        { role: 'assistant', content: '👋 你好！我是你的 AI 学习助手。\n\n选择上方的「知识范围」，我会优先从你的笔记中检索相关内容来回答（带参考来源）。也可以选「不使用知识库」与我自由对话。' },
      ]);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, streamingContent, citations]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const scope = parseScope(scopeStr);
    let newCitations: RetrievedChunk[] = [];
    let sysPrefix: string | null = null;

    // 知识库检索（范围非 none 时）
    if (scope.kind !== 'none') {
      try {
        newCitations = await retrieve(input.trim(), scope, 8);
      } catch {
        newCitations = [];
      }
      const ctx = formatContextForPrompt(newCitations);
      sysPrefix = buildRAGSystemPrompt(ctx, newCitations.length > 0);
    }

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    setInput('');
    addMessage(userMsg);
    setCitations([]); // 清空旧的，回答完成后再回填本次的

    const messages = [...conversation.filter((m) => m.role !== 'system'), userMsg];
    if (sysPrefix) messages.unshift({ role: 'system', content: sysPrefix });

    try {
      await aiChat(messages, (token) => {
        const current = useAIStore.getState().streamingContent;
        useAIStore.setState({ streamingContent: current + token });
      });

      const finalContent = useAIStore.getState().streamingContent;
      if (finalContent) {
        addMessage({ role: 'assistant', content: finalContent });
        useAIStore.setState({ streamingContent: '' });
      }
      setCitations(newCitations);
    } catch {
      useAIStore.setState({ streamingContent: '' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // 把最近一条 AI 回答保存为新文档（绝不静默修改已有文档）
  const handleSaveAsDoc = async () => {
    const lastAssistant = [...conversation].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant?.content.trim()) return;
    const stamp = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const title = `AI 回答 · ${stamp}`;
    const entry = await create({
      title,
      content: lastAssistant.content,
      contentPlain: lastAssistant.content.replace(/[#*`[\]()>|~_ -]/g, '').replace(/\s+/g, ' ').trim(),
      tags: [],
      subject: 'AI问答',
      sourceType: 'manual',
    });
    navigate(`/edit/${entry.id}`);
  };

  const scopeLabel = parseScope(scopeStr);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--color-border)] flex-wrap">
        <h1 className="text-lg font-bold flex items-center gap-1.5">🧠 AI 助手</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-tertiary)]">知识范围</span>
          <select
            className="input-field text-xs py-1 max-w-[180px]"
            value={scopeStr}
            onChange={(e) => setScopeStr(e.target.value)}
            title="选择 AI 回答时参考的知识库范围"
          >
            <option value="all">📚 全部知识库</option>
            <option value="none">🚫 不使用知识库</option>
            {subjects.length > 0 && (
              <optgroup label="按分类">
                {subjects.map((s) => (
                  <option key={s} value={`subject:${encodeURIComponent(s)}`}>📂 {s}</option>
                ))}
              </optgroup>
            )}
            {tags.length > 0 && (
              <optgroup label="按标签">
                {tags.map((t) => (
                  <option key={t} value={`tag:${encodeURIComponent(t)}`}>#️⃣ {t}</option>
                ))}
              </optgroup>
            )}
            {recentDocs.length > 0 && (
              <optgroup label="指定文档">
                {recentDocs.map((d) => (
                  <option key={d.id} value={`doc:${d.id}`}>📄 {d.title || '无标题'}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {conversation.filter((m) => m.role !== 'system').map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-[var(--color-text)]'
            }`}>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {isProcessing && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-gray-100 dark:bg-gray-800">
              <ReactMarkdown>{streamingContent}</ReactMarkdown>
              <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse ml-1" />
            </div>
          </div>
        )}
        {isProcessing && !streamingContent && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
            </div>
          </div>
        )}

        {/* 本次回答的参考来源 + 保存为新文档 */}
        {!isProcessing && citations.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%] w-full">
              <CitationList citations={citations} onNavigate={(jid) => navigate(`/edit/${jid}`)} />
              <button
                className="mt-2 text-xs flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
                onClick={handleSaveAsDoc}
                title="把最近一条 AI 回答保存为一篇新文档"
              >
                <Save className="h-3 w-3" /> 保存回答为新文档
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center text-sm text-red-500 py-2">❌ {error}</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex gap-2">
          <textarea
            className="input-field flex-1 resize-none h-10 min-h-[40px] max-h-32 text-sm"
            placeholder={`输入你的问题...（${scopeLabel.kind === 'none' ? '当前不使用知识库' : '将检索知识库后作答'}，Shift+Enter 换行）`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="btn-primary px-4" onClick={handleSend} disabled={isProcessing || !input.trim()}>
            发送
          </button>
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>当前 AI：自动路由至最优模型</span>
          <button className="hover:text-indigo-500" onClick={() => { setConversation([{ role: 'assistant', content: '👋 你好！我是你的 AI 学习助手。' }]); setCitations([]); }}>
            清空对话
          </button>
        </div>
      </div>
    </div>
  );
}