import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAIStore } from '../stores/aiStore';
import { useJournalStore } from '../stores/journalStore';
import { useSettingsStore } from '../stores/settingsStore';
import { MODEL_MAP, type ProviderName } from '../lib/ai/providers';
import type { ChatMessage } from '../lib/ai/client';
import {
  retrieve,
  formatContextForPrompt,
  buildRAGSystemPrompt,
  type KnowledgeScope,
  type RetrievedChunk,
  rewriteQuery,
  type RAGAnswerMode,
} from '../lib/ai/retrieval';
import { answerGroundedQuestion } from '../lib/ai/groundedAnswer';
import { getConversations, getConversation, upsertConversation, deleteConversation } from '../lib/db/queries';
import { useSyncStore } from '../stores/syncStore';
import { useViewModeStore } from '../stores/viewModeStore';
import type { AIConversation } from '../lib/db/schema';
import CitationList from '../components/CitationList';
import MarkdownContent from '../components/MarkdownContent';
import { Save, Plus, Trash2, PanelLeft, Bot, Database, SlidersHorizontal, Send, Sparkles } from 'lucide-react';
import { searchWeb, formatWebResults } from '../lib/ai/webSearch';
import Agent from './Agent';

const GREETING: ChatMessage = { role: 'assistant', content: '👋 你好！我是你的 AI 学习助手。\n\n可以在输入框上方选择「自己的文档」「zero2Agent」或「全部知识库」，回答会附带可定位的来源。\n点击左侧「+ 新建对话」开始新聊天，历史对话自动保存。' };

function parseScope(s: string): KnowledgeScope {
  if (s === 'none') return { kind: 'none' };
  if (s === 'zero2agent') return { kind: 'zero2agent' };
  if (s === 'zero2agent-interview') return { kind: 'zero2agent', pathPrefix: 'learn-agent-interview/' };
  if (s === 'all') return { kind: 'combined' };
  if (s === 'personal' || !s) return { kind: 'personal' };
  if (s.startsWith('subject:')) return { kind: 'subject', subject: decodeURIComponent(s.slice(8)) };
  if (s.startsWith('tag:')) return { kind: 'tag', tag: decodeURIComponent(s.slice(4)) };
  if (s.startsWith('doc:')) return { kind: 'doc', journalId: s.slice(4) };
  return { kind: 'all' };
}

export default function AIChat() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isProcessing, error, chat: aiChat, callDirect, streamingContent } = useAIStore();
  const { entries, create } = useJournalStore();
  const { settings } = useSettingsStore();
  const { isMobile } = useViewModeStore();
  const { doSync } = useSyncStore();
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [scopeStr, setScopeStr] = useState<string>(() => localStorage.getItem('ai-knowledge-scope') || 'personal');
  const [ragMode, setRagMode] = useState<RAGAnswerMode>(() => (localStorage.getItem('ai-rag-mode') as RAGAnswerMode) || 'strict');
  const [modelChoice, setModelChoice] = useState<string>('auto');
  const [citations, setCitations] = useState<RetrievedChunk[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => localStorage.getItem('ai-sidebar') !== '0');
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => { const s = Number(localStorage.getItem('ai-sidebar-width')); return Number.isFinite(s) && s > 0 ? Math.max(200, Math.min(320, s)) : 248; });
  const [webSearch, setWebSearch] = useState(false);
  const [showAnswerSettings, setShowAnswerSettings] = useState(false);
  const [retrievalMeta, setRetrievalMeta] = useState<{ ms: number; query: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const streamBufferRef = useRef('');
  const streamFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 移动端默认把历史栏收起，避免挤压聊天内容；用户仍可通过标题栏按钮打开抽屉。
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // 知识范围下拉选项：全部/不使用 + 按分类 + 按标签 + 指定文档
  const { subjects, tags, recentDocs } = useMemo(() => {
    const subs = Array.from(new Set(entries.map((e) => e.subject).filter(Boolean))) as string[];
    const tg = Array.from(new Set(entries.flatMap((e) => e.tags ?? [])));
    const docs = [...entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
    return { subjects: subs, tags: tg, recentDocs: docs };
  }, [entries]);

  const refreshConversations = useCallback(async () => {
    const list = await getConversations();
    list.sort((a, b) => b.createdAt - a.createdAt);
    setConversations(list);
  }, []);
  useEffect(() => { refreshConversations(); }, [refreshConversations]);
  useEffect(() => () => { if (streamFlushRef.current) clearTimeout(streamFlushRef.current); }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, citations]);

  const toggleSidebar = () => setSidebarOpen((o) => { const n = !o; localStorage.setItem('ai-sidebar', n ? '1' : '0'); return n; });
  const changeScope = (value: string) => { setScopeStr(value); localStorage.setItem('ai-knowledge-scope', value); };
  const changeRagMode = (value: RAGAnswerMode) => { setRagMode(value); localStorage.setItem('ai-rag-mode', value); };
  const handleNew = () => { setCurrentId(null); setMessages([GREETING]); setCitations([]); setInput(''); };
  const handleSelect = async (id: string) => {
    const conv = await getConversation(id);
    if (conv) { setCurrentId(id); setMessages(conv.messages as ChatMessage[]); setCitations(conv.citations ?? []); }
  };
  const handleDeleteConv = async (id: string) => {
    if (!window.confirm('删除此对话？')) return;
    await deleteConversation(id);
    if (currentId === id) handleNew();
    refreshConversations();
    // 已启用云同步时立即同步,使远端(data.json + conversations/*.md)也删除该对话
    if (settings?.sync?.enabled && settings.sync.token) {
      try { await doSync(); } catch { /* 忽略同步错误,本地删除已完成 */ }
    }
  };
  const titleOf = (conv: AIConversation) => {
    const u = conv.messages.find((m) => m.role === 'user');
    return (u?.content || '新对话').replace(/\s+/g, ' ').slice(0, 24);
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const userText = input.trim();
    setInput('');
    const scope = parseScope(scopeStr);
    let newCitations: RetrievedChunk[] = [];
    let sysPrefix: string | null = null;
    if (scope.kind !== 'none') {
      const retrievalStartedAt = performance.now();
      try { newCitations = await retrieve(userText, scope, 8); } catch { newCitations = []; }
      setRetrievalMeta({ ms: Math.round(performance.now() - retrievalStartedAt), query: rewriteQuery(userText) });
      sysPrefix = buildRAGSystemPrompt(formatContextForPrompt(newCitations), newCitations.length > 0, ragMode);
    }
    // 联网搜索（维基百科，CORS 友好）
    if (webSearch && scope.kind !== 'zero2agent') {
      try {
        const wr = await searchWeb(userText, 5);
        const wf = formatWebResults(wr);
        newCitations = [...newCitations, ...wr.map((r, i) => ({ source: 'web' as const, sourceId: r.url, chunkId: `web:${r.url}:${i}`, title: r.title, content: r.snippet, score: 1, sourceUrl: r.url }))];
        if (wf) sysPrefix = (sysPrefix ? sysPrefix + '\n\n' : '') + '以下是来自网络搜索（DuckDuckGo + 维基百科）的参考信息，可结合回答。注意：这些信息可能不是最新的实时数据。如果用户询问的是实时信息（如天气、新闻、股价），请说明数据来源的时效性并建议用户通过专业渠道核实：\n' + wf;
      } catch { /* ignore */ }
    }
    const userMsg: ChatMessage = { role: 'user', content: userText };
    setCitations([]);
    const baseMsgs = messages.filter((m) => m.role !== 'system');
    const timeSys = `当前时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）。`;
    const callMsgs: ChatMessage[] = [{ role: 'system', content: sysPrefix ? timeSys + '\n\n' + sysPrefix : timeSys }, ...baseMsgs, userMsg];
    setMessages((prev) => [...prev, userMsg]);
    try {
      let finalContent = '';
      if (scope.kind === 'zero2agent') {
        // 课程知识库始终走结构化、可校验的严格回答，不允许联网或混合常识。
        const grounded = await answerGroundedQuestion(userText, newCitations);
        finalContent = grounded.answer;
        newCitations = grounded.citations;
      } else {
      const onToken = (token: string) => {
        streamBufferRef.current += token;
        if (!streamFlushRef.current) {
          streamFlushRef.current = setTimeout(() => {
            useAIStore.setState({ streamingContent: useAIStore.getState().streamingContent + streamBufferRef.current });
            streamBufferRef.current = '';
            streamFlushRef.current = null;
          }, 50);
        }
      };
      if (modelChoice !== 'auto') {
        const bare = modelChoice.includes('/') ? modelChoice.split('/').slice(1).join('/') : modelChoice;
        const entry = MODEL_MAP[bare] ?? MODEL_MAP[modelChoice];
        const ap = settings?.aiProviders;
        const enabled = ap ? (Object.keys(ap) as ProviderName[]).filter((k) => ap[k].enabled && ap[k].apiKey) : [];
        const isKnownLocalModel = !!settings?.availableModels?.local?.includes(bare);
        const provider = entry?.provider ?? (modelChoice.includes('/') ? (modelChoice.split('/')[0] as ProviderName) : isKnownLocalModel ? 'local' : enabled[0]);
        const model = entry?.model ?? bare;
        if (provider && model) await callDirect(provider, model, callMsgs, onToken);
        else await aiChat(callMsgs, onToken);
      } else { await aiChat(callMsgs, onToken); }
      // flush 剩余缓冲的 token
      if (streamFlushRef.current) { clearTimeout(streamFlushRef.current); streamFlushRef.current = null; }
      if (streamBufferRef.current) { useAIStore.setState({ streamingContent: useAIStore.getState().streamingContent + streamBufferRef.current }); streamBufferRef.current = ''; }
      finalContent = useAIStore.getState().streamingContent || '(空回复)';
      useAIStore.setState({ streamingContent: '' });
      }
      const assistantMsg: ChatMessage = { role: 'assistant', content: finalContent };
      const storedMsgs = [...baseMsgs, userMsg, assistantMsg].filter((m) => m.role !== 'system');
      setMessages((prev) => [...prev, assistantMsg]);
      setCitations(newCitations);
      const existing = currentId ? conversations.find((c) => c.id === currentId) : undefined;
      const conv: AIConversation = { id: currentId ?? crypto.randomUUID(), model: modelChoice, messages: storedMsgs, citations: newCitations, tokensInput: 0, tokensOutput: 0, costUsd: 0, createdAt: existing?.createdAt ?? Date.now() };
      await upsertConversation(conv);
      setCurrentId(conv.id);
      refreshConversations();
    } catch { useAIStore.setState({ streamingContent: '' }); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // 把最近一条 AI 回答保存为新文档（绝不静默修改已有文档）
  const handleSaveAsDoc = async () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
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

  const selectedModels = settings?.selectedModels ?? [];
  const modelOptions = useMemo(() => Array.from(new Set(['auto', ...selectedModels])), [selectedModels]);

  // AI 与 Agent 共用一个入口，模式通过 URL 状态切换，保留各自的安全执行流程。
  if (searchParams.get('mode') === 'agent') return <Agent />;

  return (
    <div className="relative flex h-full min-h-0">
      {/* 左侧对话列表（可隐藏） */}
      {isMobile && sidebarOpen && (
        <button
          className="fixed inset-0 z-20 bg-black/25"
          onClick={toggleSidebar}
          aria-label="关闭对话列表"
          type="button"
        />
      )}
      {sidebarOpen && (
        <aside
          className={`relative shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col ${
            isMobile ? 'absolute inset-y-0 left-0 z-30 w-[84vw] max-w-[280px] shadow-xl' : ''
          }`}
          style={isMobile ? undefined : { width: sidebarWidth }}
        >
          <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">对话历史</span>
            <button className="btn-ghost p-1" onClick={toggleSidebar} title="隐藏列表"><PanelLeft className="h-4 w-4" /></button>
          </div>
          <button className="m-2 btn-primary text-xs flex items-center justify-center gap-1" onClick={handleNew}>
            <Plus className="h-3.5 w-3.5" /> 新建对话
          </button>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {conversations.length === 0 && <p className="text-xs text-[var(--color-text-tertiary)] px-2 py-3">还没有对话</p>}
            {conversations.map((c) => (
              <div key={c.id} className={`group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer text-xs transition-colors ${currentId === c.id ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium' : 'hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]'}`} onClick={() => handleSelect(c.id)}>
                <span className="truncate flex-1">{titleOf(c)}</span>
                <button className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] p-0.5" onClick={(e) => { e.stopPropagation(); handleDeleteConv(c.id); }} title="删除"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              const sx = e.clientX; const sw = sidebarWidth;
              const mv = (ev: MouseEvent) => setSidebarWidth(Math.max(200, Math.min(320, sw + (ev.clientX - sx))));
              const up = () => { setSidebarWidth(w => { localStorage.setItem('ai-sidebar-width', String(w)); return w; }); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
              document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
              document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
            }}
            className="absolute right-0 top-0 bottom-0 z-20 w-1.5 cursor-col-resize hover:bg-[var(--color-primary)]/40 transition-colors"
            title="拖动调整宽度"
          />
        </aside>
      )}
      {/* 主聊天区 */}
      <div className="ai-doubao-shell flex flex-col flex-1 min-w-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)]">
        {!sidebarOpen && <button className="btn-ghost p-1" onClick={toggleSidebar} title="显示对话列表"><PanelLeft className="h-4 w-4" /></button>}
        <h1 className="flex items-center gap-2 text-base font-semibold"><span className="ai-brand-mark"><Sparkles className="h-3.5 w-3.5" /></span>知屿 AI</h1>
        <div className="ml-auto flex items-center gap-1">
          <button
            className="btn-ghost text-xs px-2.5 py-1 flex items-center gap-1 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
            onClick={() => navigate('/ai?mode=agent')}
            title="切换到 Agent 模式：可新建/编辑/追加文档"
          >
            <Bot className="h-3.5 w-3.5" /> Agent
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="ai-doubao-messages flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.filter((m) => m.role !== 'system').map((msg, i) => (
          <div key={i} className={`ai-message-row mx-auto flex w-full max-w-4xl cv-auto ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`text-sm leading-7 ${
              msg.role === 'user'
                ? 'ai-user-bubble max-w-[82%] rounded-2xl px-4 py-2.5 text-[var(--color-text)]'
                : 'ai-assistant-content max-w-full text-[var(--color-text)]'
            }`}>
              <MarkdownContent>{msg.content}</MarkdownContent>
            </div>
          </div>
        ))}
        {isProcessing && streamingContent && (
          <div className="flex justify-start">
          <div className="ai-assistant-content mx-auto w-full max-w-4xl rounded-xl px-1 py-2 text-sm leading-7 text-[var(--color-text)]">
              <MarkdownContent>{streamingContent}</MarkdownContent>
              <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse ml-1" />
            </div>
          </div>
        )}
        {isProcessing && !streamingContent && (
          <div className="flex justify-start">
            <div className="ai-assistant-content mx-auto w-full max-w-4xl rounded-xl px-1 py-2 bg-transparent">
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
            <div className="mx-auto w-full max-w-4xl">
              <CitationList citations={citations} onNavigate={(citation) => {
                if (citation.source === 'zero2agent') navigate(citation.localUrl || `/source/zero2agent?chunkId=${encodeURIComponent(citation.chunkId)}`);
                else if (citation.source === 'web' && citation.sourceUrl) window.open(citation.sourceUrl, '_blank', 'noopener,noreferrer');
                else if (citation.journalId) navigate(`/edit/${citation.journalId}${citation.offset ? `?offset=${citation.offset.start}` : ''}`);
              }} />
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

      {/* Input + controls */}
      <div className="ai-composer-wrap px-4 pb-4 pt-3">
        <div className={`ai-composer mx-auto w-full max-w-4xl ${showAnswerSettings ? 'ai-composer-settings-open' : ''}`}>
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 flex-wrap">
          <button className="ai-setting-trigger btn-ghost p-1.5 md:hidden" onClick={() => setShowAnswerSettings((v) => !v)} title="回答设置" aria-label="回答设置" type="button">
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <div className={`${showAnswerSettings ? 'flex' : 'hidden md:flex'} items-center gap-2 flex-wrap w-full md:w-auto`}>
          <div className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-[var(--color-primary)]" aria-label="知识库来源" />
          <select
            className="input-field text-xs py-1 max-w-[180px]"
            value={scopeStr}
            onChange={(e) => changeScope(e.target.value)}
            title="选择 AI 回答时参考的知识库范围"
          >
            <option value="personal">📘 自己的文档</option>
            <option value="zero2agent-interview">🎯 Agent 面试通关</option>
            <option value="zero2agent">🧠 zero2Agent</option>
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
          <select
            aria-label="选择知识库回答模式"
            className={`${showAnswerSettings ? 'block' : 'hidden md:block'} input-field text-xs py-1 max-w-[150px]`}
            value={ragMode}
            onChange={(e) => changeRagMode(e.target.value as RAGAnswerMode)}
            disabled={scopeStr === 'zero2agent' || scopeStr === 'zero2agent-interview'}
            title="严格模式只使用知识库；混合模式允许补充常识"
          >
            <option value="strict">🔒 仅知识库</option>
            <option value="hybrid">💡 知识库 + 常识</option>
          </select>
          </div>
          <select
            aria-label="选择回答用的模型"
            className={`${showAnswerSettings ? 'block' : 'hidden md:block'} input-field text-xs py-1 max-w-[160px]`}
            value={modelChoice}
            onChange={(e) => setModelChoice(e.target.value)}
            title="选择回答用的模型（auto=自动路由）"
          >
            {modelOptions.map((m) => (
              <option key={m} value={m}>{m === 'auto' ? '🤖 自动路由' : m}</option>
            ))}
          </select>
          <label className={`${showAnswerSettings ? 'flex' : 'hidden md:flex'} items-center gap-1 text-xs cursor-pointer shrink-0`}>
            <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} />
            <span>🌐 联网</span>
          </label>
        </div>
        </div>
        <div className="flex items-end gap-2 px-3 pb-2.5">
          <textarea
            className="ai-composer-input input-field flex-1 resize-none min-h-[44px] max-h-32 text-sm"
            placeholder="输入你的问题..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="ai-send-button btn-primary h-10 w-10 shrink-0 p-0" onClick={handleSend} disabled={isProcessing || !input.trim()} title="发送" aria-label="发送">
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-between px-3 pb-2 text-[11px] text-[var(--color-text-tertiary)]">
          <span>{modelChoice === 'auto' ? '自动选择模型' : modelChoice}{retrievalMeta ? ` · 检索 ${retrievalMeta.ms}ms · ${citations.length} 条来源` : ''}</span>
          <button className="hover:text-indigo-500" onClick={handleNew}>
            新建对话
          </button>
        </div>
        </div>
      </div>
      </div>
    </div>
  );
}
