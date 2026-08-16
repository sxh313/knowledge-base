import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAgentStore } from '../stores/agentStore';
import { useJournalStore } from '../stores/journalStore';
import MarkdownContent from '../components/MarkdownContent';
import {
  Send, Paperclip, Check, X, FileText, Plus, Pencil, ArrowDownToLine,
  ArrowUpFromLine, CornerDownRight, Search, Loader2, Trash2, ExternalLink, MessageSquare,
  Tag, FolderInput, Layers,
} from 'lucide-react';
import type { AgentOp, AgentOpResult } from '../lib/agent/tools';

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

function OpResult({ result }: { result: AgentOpResult }) {
  const navigate = useNavigate();
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
    </div>
  );
}

export default function Agent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { messages, isProcessing, error, run, applyPending, cancelPending, clear } = useAgentStore();
  const { loadAll } = useJournalStore();
  const [input, setInput] = useState('');
  const [attached, setAttached] = useState<{ name: string; content: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

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
    await applyPending();
    // 应用后刷新文档列表，让新文档/修改立即可见
    loadAll();
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

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
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

              {/* 操作计划预览 */}
              {msg.plan && !msg.applied && (
                <div className="mt-3 border-t border-[var(--color-border)] pt-2 space-y-1.5">
                  <div className="text-xs font-medium text-[var(--color-text-secondary)]">📋 操作计划（待确认）：</div>
                  {msg.plan.ops.map((op, j) => (
                    <OpBadge key={j} op={op} />
                  ))}
                  {msg.preview?.results.map((r, j) => (
                    <div key={`p${j}`} className="pl-5 text-xs text-[var(--color-text-tertiary)] whitespace-pre-wrap">
                      {r.content}
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button
                      className="btn-primary text-xs px-3 py-1 flex items-center gap-1"
                      onClick={handleApply}
                      disabled={isProcessing}
                    >
                      {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      确认执行
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
  );
}
