import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAgentStore } from '../stores/agentStore';
import { useJournalStore } from '../stores/journalStore';
import MarkdownContent from '../components/MarkdownContent';
import {
  Send, Paperclip, Check, X, FileText, Plus, Pencil, ArrowDownToLine,
  ArrowUpFromLine, CornerDownRight, Search, Loader2, Trash2, ExternalLink, MessageSquare,
  Tag, FolderInput, Layers, Undo2, ShieldAlert, ShieldCheck, Shield, Wrench, Network, Link2,
} from 'lucide-react';
import type { AgentOp, AgentOpResult } from '../lib/agent/tools';
import { diffLines } from '../lib/agent/diff';

const RISK_META: Record<string, { label: string; icon: typeof Shield; color: string; badge: string }> = {
  low: { label: '低风险', icon: Shield, color: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium: { label: '中风险', icon: ShieldCheck, color: 'text-amber-600', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  high: { label: '高风险', icon: ShieldAlert, color: 'text-red-600', badge: 'bg-red-50 text-red-700 border-red-200' },
};

const OP_META: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  create: { label: '新建文档', icon: Plus, color: 'text-emerald-600' },
  edit: { label: '编辑文档', icon: Pencil, color: 'text-indigo-600' },
  append: { label: '追加内容', icon: ArrowDownToLine, color: 'text-blue-600' },
  prepend: { label: '插入开头', icon: ArrowUpFromLine, color: 'text-purple-600' },
  insertAfter: { label: '标题后插入', icon: CornerDownRight, color: 'text-cyan-600' },
  read: { label: '读取文档', icon: FileText, color: 'text-gray-500' },
  search: { label: '搜索', icon: Search, color: 'text-gray-500' },
  rename: { label: '重命名', icon: Pencil, color: 'text-amber-600' },
  delete: { label: '删除文档', icon: Trash2, color: 'text-red-600' },
  move: { label: '移动分类', icon: FolderInput, color: 'text-orange-600' },
  addTags: { label: '添加标签', icon: Tag, color: 'text-teal-600' },
  removeTags: { label: '移除标签', icon: Tag, color: 'text-slate-500' },
  generateCards: { label: '生成知识卡片', icon: Layers, color: 'text-rose-600' },
  findDuplicates: { label: '查重', icon: Search, color: 'text-gray-500' },
  reviewQuality: { label: '质量检查', icon: ShieldCheck, color: 'text-gray-500' },
  createStudyPlan: { label: '学习计划', icon: Layers, color: 'text-gray-500' },
  suggestQualityFixes: { label: '一键修复建议', icon: Wrench, color: 'text-gray-500' },
  analyzeJournalImpact: { label: '影响分析', icon: Network, color: 'text-gray-500' },
  repairDocumentLinks: { label: '链接修复计划', icon: Link2, color: 'text-gray-500' },
};

function OpBadge({ op }: { op: AgentOp }) {
  const meta = OP_META[op.type] ?? OP_META.read;
  const Icon = meta.icon;
  const target = op.newTitle || op.title || (op.journalId ? `#${op.journalId.slice(0, 8)}` : '');
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${meta.color}`} />
      <div className="min-w-0">
        <span className="font-medium">{meta.label}</span>
        {target && <span className="text-[var(--color-text-secondary)]"> · {target}</span>}
        {op.afterHeading && <span className="text-[var(--color-text-tertiary)]"> · 在「{op.afterHeading}」后</span>}
        {op.query && <span className="text-[var(--color-text-tertiary)]"> · “{op.query}”</span>}
      </div>
    </div>
  );
}

function RiskBadge({ risk }: { risk?: AgentOp['risk'] }) {
  const meta = RISK_META[risk ?? 'low'];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${meta.badge}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

/** 展示真实内容 diff（新增/删除/未变） */
function DiffView({ before, after }: { before?: string; after?: string }) {
  if (before === undefined || after === undefined) return null;
  if (before === after) return null;
  const lines = diffLines(before, after);
  return (
    <div className="mt-1.5 rounded-md border border-[var(--color-border)] overflow-hidden">
      <div className="px-2 py-1 text-[10px] text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] border-b border-[var(--color-border)]">
        内容变更预览（+{lines.filter((l) => l.type === 'add').length} / -{lines.filter((l) => l.type === 'remove').length}）
      </div>
      <div className="max-h-48 overflow-y-auto text-[11px] font-mono leading-relaxed">
        {lines.slice(0, 200).map((l, i) => (
          <div
            key={i}
            className={`px-2 whitespace-pre-wrap ${
              l.type === 'add'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                : l.type === 'remove'
                ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 line-through'
                : 'text-[var(--color-text-secondary)]'
            }`}
          >
            {l.type === 'add' ? '+ ' : l.type === 'remove' ? '- ' : '  '}
            {l.text || ' '}
          </div>
        ))}
        {lines.length > 200 && (
          <div className="px-2 py-1 text-[10px] text-[var(--color-text-tertiary)]">
            …（共 {lines.length} 行，仅显示前 200 行）
          </div>
        )}
      </div>
    </div>
  );
}

/** 展示标题/分类/标签等元数据变更 */
function MetaDiff({ result }: { result?: AgentOpResult }) {
  if (!result) return null;
  const changes: string[] = [];
  if (result.beforeTitle !== undefined && result.afterTitle !== undefined && result.beforeTitle !== result.afterTitle) {
    changes.push(`标题：${result.beforeTitle} → ${result.afterTitle}`);
  }
  if (result.beforeSubject !== undefined && result.afterSubject !== undefined && result.beforeSubject !== result.afterSubject) {
    changes.push(`分类：${result.beforeSubject || '（无）'} → ${result.afterSubject || '（无）'}`);
  }
  if (result.beforeTags !== undefined && result.afterTags !== undefined) {
    const added = (result.afterTags ?? []).filter((t) => !(result.beforeTags ?? []).includes(t));
    const removed = (result.beforeTags ?? []).filter((t) => !(result.afterTags ?? []).includes(t));
    if (added.length || removed.length) {
      changes.push(
        `标签：${removed.map((t) => `-${t}`).join(' ')} ${added.map((t) => `+${t}`).join(' ')}`.trim(),
      );
    }
  }
  if (changes.length === 0) return null;
  return (
    <div className="mt-1.5 pl-5 text-[11px] text-[var(--color-text-secondary)] space-y-0.5">
      {changes.map((c, i) => (
        <div key={i}>↳ {c}</div>
      ))}
    </div>
  );
}

function OpResult({ result }: { result: AgentOpResult }) {
  const navigate = useNavigate();
  if (result.skipped) {
    return (
      <div className="mt-1.5 pl-5 text-xs text-[var(--color-text-tertiary)]">
        <span className="flex items-center gap-1">
          <X className="h-3 w-3" /> 已跳过（未批准）
        </span>
      </div>
    );
  }
  return (
    <div className={`mt-1.5 pl-5 text-xs ${result.ok ? 'text-emerald-600' : 'text-red-500'}`}>
      {result.ok ? (
        <span className="flex items-center gap-1">
          <Check className="h-3 w-3" /> 已{OP_META[result.op.type]?.label ?? '完成'}
          {result.journalId && (
            <button
              className="inline-flex items-center gap-0.5 text-indigo-500 hover:underline"
              onClick={() => navigate(`/edit/${result.journalId}`)}
            >
              <ExternalLink className="h-3 w-3" /> 打开
            </button>
          )}
        </span>
      ) : (
        <span>✕ {result.error}</span>
      )}
      {result.ok && result.content && (
        <div className="mt-1 whitespace-pre-wrap text-[var(--color-text-tertiary)]">
          {result.content}
        </div>
      )}
    </div>
  );
}

export default function Agent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { messages, isProcessing, error, run, applyPending, cancelPending, undoLast, undoRunById, clear,
    sessionId, sessions, runs, initialized, init, newSession, loadSession, renameSession, setSessionStatus, deleteSession } = useAgentStore();
  const { loadAll } = useJournalStore();
  const [input, setInput] = useState('');
  const [attached, setAttached] = useState<{ name: string; content: string } | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [showSessions, setShowSessions] = useState(true);
  const [showRuns, setShowRuns] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 初始化：从 IndexedDB 恢复会话
  useEffect(() => {
    if (!initialized) init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // 当出现新的待确认计划时，默认全部勾选（低/中风险默认勾选，高风险默认不勾选需手动确认）
  useEffect(() => {
    const pending = messages.find((m) => m.plan && !m.applied);
    if (pending?.plan) {
      const init = new Set<string>();
      for (const op of pending.plan.ops) {
        if (op.opId && op.risk !== 'high') init.add(op.opId);
      }
      setApproved(init);
    }
  }, [messages]);

  // 从编辑器「发送到 Agent」跳转过来时，读取 ?doc= 参数并预填输入框
  useEffect(() => {
    const docParam = searchParams.get('doc');
    if (docParam) {
      try {
        const doc = JSON.parse(decodeURIComponent(docParam));
        if (doc && doc.content) {
          setAttached({ name: doc.title || '当前文档', content: doc.content });
          setInput(`请帮我处理文档「${doc.title || '当前文档'}」`);
        }
      } catch {
        // 忽略解析失败
      }
      // 清除 URL 参数，避免刷新重复触发
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const text = input.trim();
    setInput('');
    const attach = attached;
    setAttached(null);
    await run(text, attach?.content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    setAttached({ name: file.name, content: text });
  };

  const handleApply = async () => {
    await applyPending(approved);
    // 应用后刷新文档列表，让新文档/修改立即可见
    loadAll();
  };

  const handleUndo = async (msgIndex: number) => {
    await undoLast(msgIndex);
    loadAll();
  };

  const toggleApproved = (opId?: string) => {
    if (!opId) return;
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFile(file);
          return;
        }
      }
    }
  };

  // ── 会话管理 ──
  const handleNewSession = async () => {
    await newSession();
    setApproved(new Set());
  };

  const handleSelectSession = async (id: string) => {
    await loadSession(id);
    setApproved(new Set());
  };

  const handleRenameSession = async (id: string) => {
    if (editingTitle.trim()) {
      await renameSession(id, editingTitle.trim());
    }
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const handleArchiveSession = async (id: string, status: 'active' | 'archived') => {
    await setSessionStatus(id, status);
  };

  const handleDeleteSession = async (id: string) => {
    if (confirm('确定删除该会话？此操作不可恢复。')) {
      await deleteSession(id);
      setApproved(new Set());
    }
  };

  const RUN_STATUS_META: Record<string, { label: string; color: string }> = {
    planned: { label: '待确认', color: 'text-amber-600' },
    approved: { label: '已批准', color: 'text-blue-600' },
    running: { label: '执行中', color: 'text-indigo-600' },
    success: { label: '成功', color: 'text-emerald-600' },
    partial: { label: '部分成功', color: 'text-amber-600' },
    failed: { label: '失败', color: 'text-red-600' },
    cancelled: { label: '已撤销', color: 'text-gray-500' },
  };

  return (
    <div className="flex h-[calc(100vh-6rem)]">
      {/* 左侧会话栏 */}
      <aside className={`w-60 shrink-0 border-r border-[var(--color-border)] flex flex-col ${showSessions ? '' : 'hidden'}`}>
        <div className="p-2 border-b border-[var(--color-border)] flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">会话</span>
          <button
            className="btn-ghost text-xs flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--color-surface-2)]"
            onClick={handleNewSession}
            title="新建会话"
          >
            <Plus className="h-3.5 w-3.5" /> 新建
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group rounded-md px-2 py-1.5 text-sm cursor-pointer flex items-center justify-between gap-1 ${
                s.id === sessionId ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'hover:bg-[var(--color-surface-2)]'
              }`}
              onClick={() => handleSelectSession(s.id)}
            >
              {editingSessionId === s.id ? (
                <input
                  autoFocus
                  className="flex-1 min-w-0 bg-transparent border border-[var(--color-border)] rounded px-1 text-xs"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => handleRenameSession(s.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSession(s.id); }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="flex-1 min-w-0 truncate">{s.title}</span>
                  <span className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      className="p-0.5 rounded hover:bg-[var(--color-surface-3)]"
                      title="重命名"
                      onClick={(e) => { e.stopPropagation(); setEditingSessionId(s.id); setEditingTitle(s.title); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      className="p-0.5 rounded hover:bg-[var(--color-surface-3)]"
                      title={s.status === 'active' ? '归档' : '恢复'}
                      onClick={(e) => { e.stopPropagation(); handleArchiveSession(s.id, s.status === 'active' ? 'archived' : 'active'); }}
                    >
                      {s.status === 'active' ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}
                    </button>
                    <button
                      className="p-0.5 rounded hover:bg-red-50 text-red-500"
                      title="删除"
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-xs text-[var(--color-text-tertiary)] text-center py-6">暂无会话</div>
          )}
        </div>
        <div className="p-2 border-t border-[var(--color-border)]">
          <button
            className="w-full btn-ghost text-xs flex items-center justify-center gap-1 py-1.5 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
            onClick={() => setShowRuns((v) => !v)}
          >
            <Layers className="h-3.5 w-3.5" /> 运行历史（{runs.length}）
          </button>
        </div>
      </aside>

      {/* 主聊天区 */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]">
        <h1 className="text-lg font-bold flex items-center gap-1.5">🤖 AI 助手（Agent）</h1>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost text-xs px-2.5 py-1 flex items-center gap-1 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
            onClick={() => navigate('/ai')}
            title="切换到普通 AI 对话"
          >
            <MessageSquare className="h-3.5 w-3.5" /> 普通对话
          </button>
          <span className="text-xs text-[var(--color-text-tertiary)] hidden sm:inline">
            可新建 / 编辑 / 追加文档，执行前会先预览确认
          </span>
          <button className="btn-ghost text-xs flex items-center gap-1" onClick={clear} title="清空对话">
            <Trash2 className="h-3.5 w-3.5" /> 清空
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-sm text-[var(--color-text-tertiary)] py-16 space-y-2">
            <div className="text-4xl">🤖</div>
            <p>我是你的知识库 AI 助手，可以帮你操作文档。</p>
            <p className="text-xs">例如：「把这段内容新建为一篇笔记」「在《React 笔记》末尾追加这段总结」「把下面内容整理后写入《算法笔记》」</p>
            <p className="text-xs">支持粘贴或上传 .md / .txt 文件作为素材。</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-[var(--color-text)]'
            }`}>
              <MarkdownContent>{msg.content}</MarkdownContent>

              {/* 多轮工具循环日志 */}
              {msg.toolLog && msg.toolLog.length > 0 && (
                <div className="mt-2 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                  <div className="font-medium mb-1">🔁 已自动检索知识库（{msg.toolLog.length} 轮）</div>
                  {msg.toolLog.map((line, k) => (
                    <div key={k} className="pl-2">{line}</div>
                  ))}
                </div>
              )}

              {/* 操作计划预览 */}
              {msg.plan && !msg.applied && (
                <div className="mt-3 border-t border-[var(--color-border)] pt-2 space-y-2">
                  <div className="text-xs font-medium text-[var(--color-text-secondary)]">📋 操作计划（待确认，可逐项勾选）：</div>
                  {msg.plan.ops.map((op, j) => {
                    const preview = msg.preview?.results[j];
                    const checked = !!op.opId && approved.has(op.opId);
                    return (
                      <div key={j} className="rounded-md border border-[var(--color-border)] p-2">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={() => toggleApproved(op.opId)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <OpBadge op={op} />
                              <RiskBadge risk={op.risk} />
                            </div>
                            {preview?.content && (
                              <div className="mt-1 pl-5 text-xs text-[var(--color-text-tertiary)] whitespace-pre-wrap">
                                {preview.content}
                              </div>
                            )}
                            <DiffView before={preview?.beforeContent} after={preview?.afterContent} />
                            <MetaDiff result={preview} />
                          </div>
                        </label>
                      </div>
                    );
                  })}
                  <div className="flex gap-2 pt-1">
                    <button
                      className="btn-primary text-xs px-3 py-1 flex items-center gap-1"
                      onClick={handleApply}
                      disabled={isProcessing || approved.size === 0}
                    >
                      {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      执行已勾选（{approved.size}）
                    </button>
                    <button
                      className="btn-ghost text-xs px-3 py-1 flex items-center gap-1"
                      onClick={cancelPending}
                      disabled={isProcessing}
                    >
                      <X className="h-3 w-3" /> 取消
                    </button>
                  </div>
                </div>
              )}

              {/* 执行结果 */}
              {msg.applied && (
                <div className="mt-3 border-t border-[var(--color-border)] pt-2 space-y-1">
                  <div className="text-xs font-medium text-emerald-600">✅ 已执行：</div>
                  {msg.applied.results.map((r, j) => (
                    <OpResult key={j} result={r} />
                  ))}
                  {msg.undo && (
                    <div className="pt-1">
                      <button
                        className="btn-ghost text-xs px-2.5 py-1 flex items-center gap-1 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
                        onClick={() => handleUndo(i)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                        撤销本次运行
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI 正在分析并生成操作计划…</span>
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
        {attached && (
          <div className="flex items-center gap-2 mb-2 text-xs bg-[var(--color-surface-2)] rounded-md px-3 py-1.5">
            <FileText className="h-3.5 w-3.5 text-indigo-500" />
            <span className="truncate flex-1">{attached.name}</span>
            <span className="text-[var(--color-text-tertiary)]">已附加</span>
            <button className="text-[var(--color-text-tertiary)] hover:text-red-500" onClick={() => setAttached(null)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <button
            className="btn-ghost p-2 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            title="附加文件（.md / .txt）"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.markdown,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          <textarea
            ref={textareaRef}
            className="input-field flex-1 resize-none h-10 min-h-[40px] max-h-32 text-sm"
            placeholder="输入指令，例如：把下面内容新建为《XX》笔记…（可粘贴文件）"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
          />
          <button
            className="btn-primary px-4 shrink-0 flex items-center gap-1"
            onClick={handleSend}
            disabled={isProcessing || !input.trim()}
          >
            <Send className="h-3.5 w-3.5" /> 发送
          </button>
        </div>
        <div className="flex justify-between mt-2 text-xs text-[var(--color-text-tertiary)]">
          <span>Enter 发送 · Shift+Enter 换行 · 可粘贴 .md/.txt 文件</span>
        </div>
      </div>
      </div>

      {/* 运行历史面板 */}
      {showRuns && (
        <aside className="w-72 shrink-0 border-l border-[var(--color-border)] flex flex-col">
          <div className="p-2 border-b border-[var(--color-border)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">运行历史</span>
            <button className="btn-ghost text-xs p-1 rounded hover:bg-[var(--color-surface-2)]" onClick={() => setShowRuns(false)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {runs.length === 0 && (
              <div className="text-xs text-[var(--color-text-tertiary)] text-center py-6">暂无运行记录</div>
            )}
            {runs.map((r) => {
              const meta = RUN_STATUS_META[r.status] ?? RUN_STATUS_META.planned;
              const opCount = (r.operations ?? []).length;
              return (
                <div key={r.id} className="rounded-md border border-[var(--color-border)] p-2 text-xs">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`font-medium ${meta.color}`}>{meta.label}</span>
                    <span className="text-[var(--color-text-tertiary)]">
                      {new Date(r.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="mt-1 text-[var(--color-text-secondary)] line-clamp-2">{r.summary || '（无摘要）'}</div>
                  <div className="mt-1 flex items-center gap-2 text-[var(--color-text-tertiary)]">
                    <span>{opCount} 个操作</span>
                    {r.durationMs != null && <span>· {(r.durationMs / 1000).toFixed(1)}s</span>}
                    {r.error && <span className="text-red-500">· {r.error}</span>}
                  </div>
                  {r.undo && (r.status === 'success' || r.status === 'partial') && (
                    <button
                      className="mt-2 w-full btn-ghost text-xs flex items-center justify-center gap-1 rounded-md border border-[var(--color-border)] py-1 hover:bg-[var(--color-surface-2)]"
                      onClick={() => undoRunById(r.id)}
                      disabled={isProcessing}
                    >
                      <Undo2 className="h-3 w-3" /> 撤销本次运行
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}
    </div>
  );
}
