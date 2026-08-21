import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
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
  type RAGAnswerMode,
} from '../lib/ai/retrieval';
import { answerGroundedQuestion } from '../lib/ai/groundedAnswer';
import { getConversations, getConversation, upsertConversation, deleteConversation } from '../lib/db/queries';
import { useSyncStore } from '../stores/syncStore';
import { useViewModeStore } from '../stores/viewModeStore';
import type { AIConversation } from '../lib/db/schema';
import CitationList from '../components/CitationList';
import MarkdownContent from '../components/MarkdownContent';
import { Save, Plus, Trash2, PanelLeft, Bot, SlidersHorizontal, Send, Sparkles, Copy, Download, ChevronDown, Check, BookOpen, Compass, FileText, Target, Globe2 } from 'lucide-react';
import { searchWeb, formatWebResults } from '../lib/ai/webSearch';
import Agent from './Agent';
import { formatSearchContextForPrompt, readSearchAIContext, searchContextToChunks, type SearchAIContext } from '../lib/ai/searchContext';
import { IconButton, Textarea } from '../components/ui';
import { useFocusTrap } from '../lib/ui/useFocusTrap';

const GREETING: ChatMessage = { role: 'assistant', content: '从你的笔记出发，问一个问题，或把今天的学习整理成下一步。' };

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

type ScopeMenuOption = { value: string; label: string; icon?: ReactNode; group?: string };

function ScopeMenu({ value, options, onChange }: { value: string; options: ScopeMenuOption[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const selected = options.find((option) => option.value === value) ?? options[0];
  return <div ref={rootRef} className="relative shrink-0">
    <button type="button" className="scope-menu-trigger input-field flex h-8 w-[120px] items-center gap-1.5 rounded-lg px-2.5 py-0 text-left text-xs" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
      <span className="flex min-w-0 items-center gap-1.5 truncate">{selected?.icon}{selected?.label}</span><ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="scope-menu-popover absolute bottom-[calc(100%+0.4rem)] left-0 z-[80] max-h-72 w-64 overflow-y-auto rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1.5 shadow-xl" role="listbox">
      {options.map((option, index) => <div key={`${option.value}-${index}`}>
        {option.group && (index === 0 || options[index - 1]?.group !== option.group) && <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{option.group}</div>}
        <button type="button" role="option" aria-selected={option.value === value} className={`scope-menu-option flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${option.value === value ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'}`} onClick={() => { onChange(option.value); setOpen(false); }}>
          <span className="flex w-4 justify-center text-[var(--color-text-tertiary)]">{option.icon}</span><span className="min-w-0 flex-1 truncate">{option.label}</span>{option.value === value && <Check className="h-3.5 w-3.5" />}
        </button>
      </div>)}
    </div>}
  </div>;
}

export default function AIChat() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isProcessing, error, chat: aiChat, callDirect, streamingContent, stop } = useAIStore();
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
  const [isGroundedStreaming, setIsGroundedStreaming] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const agentDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(agentOpen, agentDialogRef);
  const [showAnswerSettings, setShowAnswerSettings] = useState(false);
  const [lastQuestion, setLastQuestion] = useState('');
  const [searchContext, setSearchContext] = useState<SearchAIContext | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const streamBufferRef = useRef('');
  const streamFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const groundedCancelledRef = useRef(false);

  // 移动端默认把历史栏收起，避免挤压聊天内容；用户仍可通过标题栏按钮打开抽屉。
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);
  useEffect(() => {
    const context = searchParams.get('q');
    if (context) setInput(`请基于搜索关键词“${context}”帮我梳理相关知识：`);
    if (searchParams.get('from') === 'search') setSearchContext(readSearchAIContext());
  }, [searchParams]);

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
    if (shouldAutoScrollRef.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, citations]);

  // 输入框按内容自动增长：一行起步，最多五行，超出后在框内滚动。
  useEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 22;
    const minHeight = 40;
    const maxHeight = lineHeight * 5 + 20;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [input]);

  const toggleSidebar = () => setSidebarOpen((o) => { const n = !o; localStorage.setItem('ai-sidebar', n ? '1' : '0'); return n; });
  const changeScope = (value: string) => { setScopeStr(value); localStorage.setItem('ai-knowledge-scope', value); };
  const changeRagMode = (value: RAGAnswerMode) => { setRagMode(value); localStorage.setItem('ai-rag-mode', value); };
  const handleNew = () => { setCurrentId(null); setMessages([GREETING]); setCitations([]); setInput(''); setSearchContext(null); };
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
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant')?.content || '';
  const copyLatest = async () => { if (latestAssistant) await navigator.clipboard.writeText(latestAssistant); };
  const downloadLatest = () => { if (!latestAssistant) return; const blob = new Blob([latestAssistant], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'ai-answer.md'; a.click(); URL.revokeObjectURL(url); };

  const handleSend = async () => {
    if (!input.trim() || isProcessing || isGroundedStreaming) return;
    const userText = input.trim();
    groundedCancelledRef.current = false;
    setLastQuestion(userText);
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: userText };
    const baseMsgs = messages.filter((m) => m.role !== 'system');
    // 先把用户消息画出来，再执行检索和模型调用，避免点击后长时间无反馈。
    setMessages((prev) => [...prev, userMsg]);
    setCitations([]);
    const scope = parseScope(scopeStr);
    let newCitations: RetrievedChunk[] = searchContext ? searchContextToChunks(searchContext) : [];
    let sysPrefix: string | null = null;
    if (searchContext?.items.length) {
      sysPrefix = buildRAGSystemPrompt(formatSearchContextForPrompt(searchContext), true, ragMode);
    } else if (scope.kind !== 'none') {
      try { newCitations = await retrieve(userText, scope, 8); } catch { newCitations = []; }
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
    const timeSys = `当前时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）。`;
    const callMsgs: ChatMessage[] = [{ role: 'system', content: sysPrefix ? timeSys + '\n\n' + sysPrefix : timeSys }, ...baseMsgs, userMsg];
    try {
      let finalContent = '';
      if (scope.kind === 'zero2agent') {
        // 课程知识库始终走结构化、可校验的严格回答，不允许联网或混合常识。
        const grounded = await answerGroundedQuestion(userText, newCitations);
        finalContent = grounded.answer;
        newCitations = grounded.citations;
        // 严格回答接口需要先完成引用校验；校验完成后按小段推送，保持与 SSE 一致的实时体验。
        setIsGroundedStreaming(true);
        useAIStore.setState({ streamingContent: '' });
        for (let index = 0; index < finalContent.length; index += 3) {
          if (groundedCancelledRef.current) break;
          useAIStore.setState({ streamingContent: finalContent.slice(0, index + 3) });
          await new Promise((resolve) => window.setTimeout(resolve, 12));
        }
        useAIStore.setState({ streamingContent: '' });
        setIsGroundedStreaming(false);
        if (groundedCancelledRef.current) return;
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
      if (searchContext) {
        setSearchContext(null);
        try { sessionStorage.removeItem('knowledge-base-search-ai-context'); } catch { /* optional storage */ }
      }
      const existing = currentId ? conversations.find((c) => c.id === currentId) : undefined;
      const conv: AIConversation = { id: currentId ?? crypto.randomUUID(), model: modelChoice, messages: storedMsgs, citations: newCitations, tokensInput: 0, tokensOutput: 0, costUsd: 0, createdAt: existing?.createdAt ?? Date.now() };
      await upsertConversation(conv);
      setCurrentId(conv.id);
      refreshConversations();
    } catch { useAIStore.setState({ streamingContent: '' }); setIsGroundedStreaming(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };
  const handleStop = () => { groundedCancelledRef.current = true; setIsGroundedStreaming(false); stop(); };

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
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} onScroll={(event) => { const el = event.currentTarget; shouldAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }} className="ai-doubao-messages flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 1 && messages[0].role === 'assistant' && !currentId ? (
          <div className="ai-empty-state">
            <div className="ai-empty-mark"><Compass className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--color-primary)]">今天从哪里出发</p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--color-text)]">让知识开始连成航线</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">问你的笔记、练一道面试题，或把答案整理成可复习的文档。回答会保留可回看的原文依据。</p>
              <div className="ai-task-grid">
                <button className="ai-task-card" onClick={() => setInput('总结我最近的学习重点')} type="button"><BookOpen className="mb-2 h-4 w-4 text-[var(--color-primary)]" /><span className="block text-xs font-medium">梳理最近学习</span></button>
                <button className="ai-task-card" onClick={() => setInput('请出一道面试诊断题')} type="button"><Target className="mb-2 h-4 w-4 text-[var(--color-accent)]" /><span className="block text-xs font-medium">开始一次训练</span></button>
                <button className="ai-task-card" onClick={() => setInput('把我的笔记整理成复习提纲')} type="button"><FileText className="mb-2 h-4 w-4 text-[var(--color-success)]" /><span className="block text-xs font-medium">整理成文档</span></button>
              </div>
            </div>
          </div>
        ) : messages.filter((m) => m.role !== 'system').map((msg, i) => (
          <div key={i} className={`ai-message-row mx-auto flex w-full max-w-4xl cv-auto ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`text-sm leading-7 ${
              msg.role === 'user'
                ? 'ai-user-bubble max-w-[82%] rounded-2xl px-4 py-2.5 text-[var(--color-text)]'
                : 'ai-assistant-content max-w-full text-[var(--color-text)]'
            }`}>
              <MarkdownContent citationItems={msg.role === 'assistant' ? citations : undefined}>{msg.content}</MarkdownContent>
            </div>
          </div>
        ))}
        {(isProcessing || isGroundedStreaming) && streamingContent && (
          <div className="flex justify-start">
          <div className="ai-assistant-content mx-auto w-full max-w-4xl rounded-xl px-1 py-2 text-sm leading-7 text-[var(--color-text)]">
              <MarkdownContent citationItems={citations}>{streamingContent}</MarkdownContent>
              <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse ml-1" />
            </div>
          </div>
        )}
        {(isProcessing || isGroundedStreaming) && !streamingContent && (
          <div className="flex justify-start">
            <div className="ai-assistant-content mx-auto w-full max-w-4xl rounded-xl px-1 py-2 bg-transparent">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <span className="h-2 w-2 rounded-full bg-[var(--color-primary)] animate-pulse" />
                <span>检索 · 整理 · 生成</span>
              </div>
            </div>
          </div>
        )}

        {/* 本次回答的参考来源 + 保存为新文档 */}
        {!isProcessing && !isGroundedStreaming && citations.length > 0 && (
          <div className="flex justify-start">
            <div className="mx-auto w-full max-w-4xl">
              <CitationList citations={citations} />
              <div className="mt-2 flex flex-wrap items-center gap-2"><button className="btn-secondary text-xs" onClick={() => void copyLatest()} type="button"><Copy className="h-3 w-3" />复制回答</button><button className="btn-secondary text-xs" onClick={downloadLatest} type="button"><Download className="h-3 w-3" />导出 Markdown</button></div>
              <div className="mt-3 flex flex-wrap gap-2"><button className="btn-ghost text-xs" onClick={() => setInput('请举一个具体例子')}>举一个例子</button><button className="btn-ghost text-xs" onClick={() => setInput('请对比两个方案的区别')}>对比方案</button><button className="btn-ghost text-xs" onClick={() => setInput('请出一道面试诊断题')}>出一道面试题</button></div>
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
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-light)] px-3 py-2 text-sm text-[var(--color-danger)]"><span>回答生成失败：{error}。问题已保留。</span><button className="btn-secondary shrink-0 px-2 py-1 text-xs" onClick={() => setInput(lastQuestion)} type="button">重试</button></div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input + controls */}
      <div className="ai-composer-wrap px-4 pb-4 pt-3">
        <div className={`ai-composer mx-auto w-full max-w-4xl ${showAnswerSettings ? 'ai-composer-settings-open' : ''}`}>
        <div className="flex items-center gap-2 overflow-visible px-3 pt-2.5 pb-1.5">
          <button className="ai-setting-trigger btn-ghost p-1.5 md:hidden" onClick={() => setShowAnswerSettings((v) => !v)} title="回答设置" aria-label="回答设置" type="button">
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <div className={`${showAnswerSettings ? 'flex' : 'hidden md:flex'} min-w-0 items-center gap-2 whitespace-nowrap`}>
          <div className="flex shrink-0 items-center gap-1.5">
          <ScopeMenu
            value={scopeStr}
            onChange={changeScope}
            options={[
              { value: 'personal', label: '自己的文档', icon: <BookOpen className="h-3.5 w-3.5" /> },
              { value: 'zero2agent-interview', label: '面试题库', icon: <Target className="h-3.5 w-3.5" /> },
              { value: 'zero2agent', label: '完整课程', icon: <Compass className="h-3.5 w-3.5" /> },
              { value: 'all', label: '全部知识库', icon: <FileText className="h-3.5 w-3.5" /> },
              { value: 'none', label: '不使用知识库', icon: <Globe2 className="h-3.5 w-3.5" /> },
              ...subjects.map((s) => ({ value: `subject:${encodeURIComponent(s)}`, label: s, icon: <FileText className="h-3.5 w-3.5" />, group: '按分类' })),
              ...tags.map((t) => ({ value: `tag:${encodeURIComponent(t)}`, label: t, icon: <span className="text-xs">#</span>, group: '按标签' })),
              ...recentDocs.map((d) => ({ value: `doc:${d.id}`, label: d.title || '无标题', icon: <FileText className="h-3.5 w-3.5" />, group: '指定文档' })),
            ]}
          />
          {scopeStr !== 'zero2agent' && scopeStr !== 'zero2agent-interview' && (
            <select
              aria-label="选择知识库回答模式"
              className={`${showAnswerSettings ? 'block' : 'hidden md:block'} input-field h-8 w-[120px] shrink-0 py-0 text-xs`}
              value={ragMode}
              onChange={(e) => changeRagMode(e.target.value as RAGAnswerMode)}
              title="严格模式只使用知识库；混合模式允许补充常识"
            >
              <option value="strict">仅使用知识库</option>
              <option value="hybrid">知识库 + 常识</option>
            </select>
          )}
          </div>
          <div className={`${showAnswerSettings ? 'block' : 'hidden md:block'} shrink-0`}>
            <ScopeMenu
              value={modelChoice}
              onChange={setModelChoice}
              options={modelOptions.map((model) => ({ value: model, label: model === 'auto' ? '自动路由' : model, icon: <Bot className="h-3.5 w-3.5" /> }))}
            />
          </div>
          <label className={`${showAnswerSettings ? 'flex' : 'hidden md:flex'} h-8 w-[120px] shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-xs`}>
            <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} />
            <span>联网搜索</span>
          </label>
          <button
            className={`${showAnswerSettings ? 'flex' : 'hidden md:flex'} h-8 w-[120px] shrink-0 items-center justify-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]`}
            onClick={() => setAgentOpen(true)}
            title="切换到 Agent 模式：可新建、编辑或追加文档"
            type="button"
          >
            <Bot className="h-3.5 w-3.5" /> Agent 模式
          </button>
        </div>
        </div>
        <div className="flex items-center gap-2 px-3 pb-2">
          <Textarea
            ref={composerInputRef}
            className="ai-composer-input input-field flex-1 resize-none text-sm"
            placeholder="输入你的问题..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <IconButton className="ai-send-button" size="sm" variant="primary" label={isProcessing || isGroundedStreaming ? '停止生成' : '发送'} onClick={isProcessing || isGroundedStreaming ? handleStop : handleSend} disabled={!isProcessing && !isGroundedStreaming && !input.trim()}>
            {isProcessing || isGroundedStreaming ? <span className="h-3 w-3 rounded-sm bg-current" /> : <Send className="h-3.5 w-3.5" />}
          </IconButton>
        </div>
        </div>
      </div>
      {agentOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-3 backdrop-blur-[2px] animate-fade-in">
          <div ref={agentDialogRef} className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl animate-scale-in" role="dialog" aria-modal="true" aria-label="Agent 工作区">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold"><Bot className="h-4 w-4 text-[var(--color-primary)]" /> Agent 工作区</span>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setAgentOpen(false)} type="button">返回对话</button>
          </div>
          <div className="min-h-0 flex-1"><Agent /></div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
