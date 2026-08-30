import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAgentStore } from '../stores/agentStore';
import { useJournalStore } from '../stores/journalStore';
import { useViewModeStore } from '../stores/viewModeStore';
import MarkdownContent from '../components/MarkdownContent';
import {
  Send, Paperclip, Check, X, FileText, Plus, Pencil, ArrowDownToLine,
  ArrowUpFromLine, CornerDownRight, Search, Loader2, Trash2, ExternalLink, MessageSquare,
  Tag, FolderInput, Layers, Undo2, ShieldAlert, ShieldCheck, Shield, Wrench, Network, Link2, PanelLeft, Bot,
  Activity, GitBranch, BookOpen, SlidersHorizontal,
} from 'lucide-react';
import type { AgentOp, AgentOpResult } from '../lib/agent/tools';
import { INTENT_META, type AgentIntent } from '../lib/agent/intent';
import type { EvidenceRef } from '../lib/agent/evidence';
import { listAgentRunEvents } from '../lib/agent/persistence';
import { getAgentState, updateAgentState } from '../lib/agent/state';
import { DEFAULT_AGENT_PERMISSION_POLICY } from '../lib/agent/permissions';
import type { AgentRun, AgentRunEvent, AgentPermissionPolicy } from '../lib/db/schema';
import { diffLines } from '../lib/agent/diff';
import { getSkillRegistryState } from '../lib/agent/skills';
import { DEFAULT_AGENT_PREFERENCES, getAgentPreferences, resetAgentPreferences, saveAgentPreferences, type AgentPreferences } from '../lib/agent/preferences';
import Select from '../components/ui/Select';
import Disclosure from '../components/ui/Disclosure';
import DropdownMenu from '../components/ui/DropdownMenu';

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
  patchJournal: { label: '精确修复', icon: Pencil, color: 'text-cyan-600' },
  updateMetadata: { label: '更新元数据', icon: Tag, color: 'text-teal-600' },
  read: { label: '读取文档', icon: FileText, color: 'text-gray-500' },
  search: { label: '搜索', icon: Search, color: 'text-gray-500' },
  rename: { label: '重命名', icon: Pencil, color: 'text-amber-600' },
  delete: { label: '删除文档', icon: Trash2, color: 'text-red-600' },
  move: { label: '移动分类', icon: FolderInput, color: 'text-orange-600' },
  addTags: { label: '添加标签', icon: Tag, color: 'text-teal-600' },
  removeTags: { label: '移除标签', icon: Tag, color: 'text-slate-500' },
  findDuplicates: { label: '查重', icon: Search, color: 'text-gray-500' },
  reviewQuality: { label: '质量检查', icon: ShieldCheck, color: 'text-gray-500' },
  createStudyPlan: { label: '学习计划', icon: Layers, color: 'text-gray-500' },
  suggestQualityFixes: { label: '一键修复建议', icon: Wrench, color: 'text-gray-500' },
  analyzeJournalImpact: { label: '影响分析', icon: Network, color: 'text-gray-500' },
  repairDocumentLinks: { label: '链接修复计划', icon: Link2, color: 'text-gray-500' },
  analyzeKnowledgeGaps: { label: '知识缺口', icon: Search, color: 'text-gray-500' },
  suggestJournalMetadata: { label: '元数据建议', icon: Tag, color: 'text-gray-500' },
  findRelatedJournals: { label: '相关文档', icon: Network, color: 'text-gray-500' },
  explainSyncConflict: { label: '解释同步冲突', icon: ShieldAlert, color: 'text-gray-500' },
  prepareConflictMerge: { label: '生成合并草案', icon: ShieldCheck, color: 'text-gray-500' },
  applyConflictMerge: { label: '写入合并结果', icon: ShieldAlert, color: 'text-red-600' },
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
    <span className={`risk-badge-${risk ?? 'low'} inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium border ${meta.badge}`}>
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
      <div className="px-2 py-1 text-[11px] text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] border-b border-[var(--color-border)]">
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
          <div className="px-2 py-1 text-[11px] text-[var(--color-text-tertiary)]">
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
  if (result.beforeSummary !== undefined && result.afterSummary !== undefined && result.beforeSummary !== result.afterSummary) {
    changes.push(`摘要：${result.beforeSummary || '（空）'} → ${result.afterSummary || '（空）'}`);
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
          <X className="h-3 w-3" /> 已跳过{result.skippedReason ? `（${result.skippedReason}）` : '（未批准）'}
          {result.durationMs != null && <span>· {(result.durationMs / 1000).toFixed(2)}s</span>}
        </span>
      </div>
    );
  }
  return (
    <div className={`mt-1.5 pl-5 text-xs ${result.ok ? 'text-emerald-600' : 'text-red-500'}`}>
      {result.ok ? (
        <span className="flex items-center gap-1">
          <Check className="h-3 w-3" /> 已{OP_META[result.op.type]?.label ?? '完成'}
          {result.durationMs != null && <span className="text-[var(--color-text-tertiary)]">· {(result.durationMs / 1000).toFixed(2)}s</span>}
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
        <span>✕ {result.error}{result.durationMs != null ? ` · ${(result.durationMs / 1000).toFixed(2)}s` : ''}</span>
      )}
      {result.ok && result.content && (
        <div className="mt-1 whitespace-pre-wrap text-[var(--color-text-tertiary)]">
          {result.content}
        </div>
      )}
    </div>
  );
}

/** 运行时间线事件类型元信息 */
const EVENT_TYPE_META: Record<string, { label: string; icon: typeof Activity }> = {
  retrieval: { label: '检索', icon: Search },
  model_call: { label: '模型调用', icon: Bot },
  tool_call: { label: '工具调用', icon: Wrench },
  plan_created: { label: '计划生成', icon: Layers },
  plan_rejected: { label: '计划拒绝', icon: ShieldAlert },
  approval: { label: '审批', icon: ShieldCheck },
  execution: { label: '执行', icon: Check },
};

/** 运行详情抽屉：展示一次运行的时间线事件与调试信息（耗时/token） */
function RunDetailDrawer({ run, onClose }: { run: AgentRun; onClose: () => void }) {
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listAgentRunEvents(run.id)
      .then((rows) => { if (alive) setEvents(rows); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [run.id]);

  const statusColor = (status: AgentRunEvent['status']) =>
    status === 'success' ? 'text-emerald-600' : status === 'failed' ? 'text-red-500' : 'text-blue-600';

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/25" onClick={onClose}>
      <div
        className="flex h-full w-[min(420px,92vw)] flex-col border-l border-[var(--color-border)] bg-[var(--color-bg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">运行详情</div>
            <div className="truncate text-xs text-[var(--color-text-tertiary)]">
              {run.model ? `${run.provider ?? ''} / ${run.model} · ` : ''}{new Date(run.createdAt).toLocaleString('zh-CN')}
            </div>
          </div>
          <button className="btn-ghost p-1" onClick={onClose} type="button" aria-label="关闭运行详情">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5">
          <span className="text-xs text-[var(--color-text-secondary)]">时间线（{events.length} 个事件）</span>
          <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)]">
            <input type="checkbox" checked={showDebug} onChange={(e) => setShowDebug(e.target.checked)} />
            调试详情
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && <div className="text-xs text-[var(--color-text-tertiary)] text-center py-6">加载中…</div>}
          {!loading && events.length === 0 && (
            <div className="text-xs text-[var(--color-text-tertiary)] text-center py-6">
              暂无时间线事件（该运行可能由旧版本创建）
            </div>
          )}
          {events.map((ev) => {
            const meta = EVENT_TYPE_META[ev.type] ?? EVENT_TYPE_META.execution;
            const Icon = meta.icon;
            return (
              <div key={ev.id} className="rounded-md border border-[var(--color-border)] p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 font-medium">
                    <Icon className="h-3 w-3 text-[var(--color-primary)]" /> {meta.label}
                  </span>
                  <span className={`flex items-center gap-1 ${statusColor(ev.status)}`}>
                    {ev.status === 'success' ? <Check className="h-3 w-3" /> : ev.status === 'failed' ? <X className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                    {ev.status === 'success' ? '成功' : ev.status === 'failed' ? '失败' : '进行中'}
                    <span className="text-[var(--color-text-tertiary)]">
                      {new Date(ev.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}
                    </span>
                  </span>
                </div>
                <div className="mt-1 text-[var(--color-text-secondary)]">{ev.summary}</div>
                {showDebug && (
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                    {ev.durationMs != null && <span>耗时 {ev.durationMs}ms</span>}
                    {ev.inputTokens != null && <span>输入 {ev.inputTokens} tokens</span>}
                    {ev.outputTokens != null && <span>输出 {ev.outputTokens} tokens</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 计划依据（证据片段）展示：可折叠列出命中的笔记片段 */
function EvidenceBlock({ evidence }: { evidence?: EvidenceRef[] }) {
  const [open, setOpen] = useState(false);
  if (!evidence?.length) return null;
  return (
    <Disclosure className="mt-2 rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-800/50 dark:bg-amber-900/15" open={open} onToggle={() => setOpen(value => !value)} icon={<BookOpen className="h-3.5 w-3.5 text-amber-600" />} label={<span className="font-medium">依据（{evidence.length} 个笔记片段）</span>} contentClassName="mt-1.5 space-y-1.5">
          {evidence.map((r, i) => (
            <div key={i} className="pl-5 text-[var(--color-text-secondary)]">
              <span className="font-medium">《{r.title}》</span>
              {r.heading && <span className="text-[var(--color-text-tertiary)]">「{r.heading}」</span>}
              <div className="text-[11px] text-[var(--color-text-tertiary)] line-clamp-2">{r.snippet.replace(/\s+/g, ' ')}</div>
            </div>
          ))}
    </Disclosure>
  );
}

/** 权限面板可配置的写入操作类型（与 OP_META 标签对应） */
const PERMISSION_OP_TYPES = [
  'create', 'edit', 'append', 'prepend', 'insertAfter', 'patchJournal',
  'updateMetadata', 'rename', 'move', 'addTags', 'removeTags', 'delete', 'applyConflictMerge',
];

/** 会话权限面板：细粒度配置允许的操作类型 / 删除许可 / 授权范围 */
function PermissionPanel({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const [policy, setPolicy] = useState<AgentPermissionPolicy>({ ...DEFAULT_AGENT_PERMISSION_POLICY });
  const [scope, setScope] = useState<'session' | 'once'>('session');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    getAgentState(sessionId)
      .then((state) => {
        if (state.permissions?.policy) {
          setPolicy(state.permissions.policy);
          setScope(state.permissions.policy.expiresAt ? 'once' : 'session');
        }
      })
      .catch(() => {});
  }, [sessionId]);

  const toggleOp = (type: string) => {
    setPolicy((prev) => {
      const has = prev.allowedOperations.includes(type);
      const next = has ? prev.allowedOperations.filter((t) => t !== type) : [...prev.allowedOperations, type];
      return { ...prev, allowedOperations: next };
    });
  };

  const save = async () => {
    if (!sessionId) return;
    setSaving(true);
    try {
      const state = await getAgentState(sessionId);
      await updateAgentState(sessionId, {
        permissions: {
          ...state.permissions,
          policy: {
            ...policy,
            // 「仅下一次计划」：30 分钟兜底过期（执行后也会自动恢复默认）；「本会话有效」：不设过期
            expiresAt: scope === 'once' ? Date.now() + 30 * 60 * 1000 : undefined,
          },
        },
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/25" onClick={onClose}>
      <div className="flex h-full w-[min(420px,92vw)] flex-col border-l border-[var(--color-border)] bg-[var(--color-bg)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-3">
          <div>
            <div className="text-sm font-medium">会话权限</div>
            <div className="text-xs text-[var(--color-text-tertiary)]">所有写操作仍需在计划预览中逐项确认</div>
          </div>
          <button className="btn-ghost p-1" onClick={onClose} type="button" aria-label="关闭权限面板">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          {!sessionId && <div className="text-[var(--color-text-tertiary)]">暂无活动会话</div>}
          {sessionId && (
            <>
              <div>
                <div className="mb-1.5 font-medium text-[var(--color-text-secondary)]">允许的操作类型</div>
                <div className="grid grid-cols-2 gap-1">
                  {PERMISSION_OP_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={policy.allowedOperations.includes(type)}
                        onChange={() => toggleOp(type)}
                      />
                      <span>{OP_META[type]?.label ?? type}</span>
                    </label>
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-1.5 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={policy.allowDelete}
                    onChange={(e) => setPolicy((prev) => ({ ...prev, allowDelete: e.target.checked }))}
                  />
                  <ShieldAlert className="h-3 w-3 text-red-500" />
                  <span>允许删除笔记（默认禁止，高风险）</span>
                </label>
              </div>
              <div>
                <div className="mb-1.5 font-medium text-[var(--color-text-secondary)]">授权范围</div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={`flex-1 rounded-md border px-2 py-1.5 ${scope === 'session' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}
                    onClick={() => setScope('session')}
                  >
                    本会话有效
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-md border px-2 py-1.5 ${scope === 'once' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}
                    onClick={() => setScope('once')}
                  >
                    仅下一次计划
                  </button>
                </div>
                {scope === 'once' && (
                  <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                    授权在计划执行后自动失效，最长 30 分钟
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button className="btn-primary text-xs px-3 py-1.5" onClick={save} disabled={saving} type="button">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} 保存
                </button>
                <button
                  className="btn-ghost text-xs px-3 py-1.5 rounded-md border border-[var(--color-border)]"
                  onClick={() => setPolicy({ ...DEFAULT_AGENT_PERMISSION_POLICY })}
                  disabled={saving}
                  type="button"
                >
                  恢复默认
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export default function Agent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { messages, isProcessing, error, run, applyPending, cancelPending, undoLast, undoRunById, clear,
    sessionId, sessions, runs, initialized, init, newSession, loadSession, renameSession, setSessionStatus, deleteSession } = useAgentStore();
  const { loadAll } = useJournalStore();
  const { isMobile } = useViewModeStore();
  const [input, setInput] = useState('');
  const [attached, setAttached] = useState<{ name: string; content: string } | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  // Agent 的会话历史是辅助信息；首次进入时优先让用户看到任务入口和输入区。
  const [showSessions, setShowSessions] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showComposerSettings, setShowComposerSettings] = useState(false);
  const [detailRun, setDetailRun] = useState<AgentRun | null>(null);
  // 意图模式：auto 为自动分类，其余为手动指定
  const [intentMode, setIntentMode] = useState<'auto' | AgentIntent>('auto');
  const [preferences, setPreferences] = useState<AgentPreferences>(DEFAULT_AGENT_PREFERENCES);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 移动端默认隐藏会话栏，避免主聊天区被压缩成窄列。
  useEffect(() => {
    if (isMobile) setShowSessions(false);
  }, [isMobile]);

  const toggleSessions = () => setShowSessions((current) => !current);

  // 初始化：从 IndexedDB 恢复会话
  useEffect(() => {
    if (!initialized) init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  useEffect(() => {
    getAgentPreferences().then(setPreferences).catch(() => {});
  }, []);

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
    await run(text, attach?.content, intentMode === 'auto' ? undefined : intentMode);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.altKey) {
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
    cancelled: { label: '已取消', color: 'text-gray-500' },
    interrupted: { label: '已中断', color: 'text-orange-600' },
    rolled_back: { label: '已撤销', color: 'text-gray-500' },
  };
  const skillState = getSkillRegistryState();
  const updatePreference = async (patch: Partial<AgentPreferences>) => setPreferences(await saveAgentPreferences(patch));

  return (
    <div className="relative flex h-full min-h-0">
      {/* 左侧会话栏 */}
      {isMobile && showSessions && (
        <button
          className="fixed inset-0 z-20 bg-black/25"
          onClick={() => setShowSessions(false)}
          aria-label="关闭会话列表"
          type="button"
        />
      )}
      <aside className={`${isMobile ? 'absolute inset-y-0 left-0 z-30 w-[84vw] max-w-[280px] shadow-xl' : 'w-64'} shrink-0 flex flex-col ${showSessions ? '' : 'hidden'} agent-workspace-sidebar`}>
        <div className="soft-divider flex items-center justify-between p-3">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">对话历史</span>
          <button className="btn-ghost p-1" onClick={toggleSessions} title="隐藏会话列表" aria-label="隐藏会话列表" type="button">
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>
        <button className="m-2 btn-primary text-xs flex items-center justify-center gap-1" onClick={handleNewSession} title="新建对话" type="button">
          <Plus className="h-3.5 w-3.5" /> 新建对话
        </button>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group rounded-md px-2 py-1.5 text-xs cursor-pointer flex items-center justify-between gap-1 ${
                s.id === sessionId ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium' : 'hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]'
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
        <div className="soft-divider p-2">
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
      <div className="soft-divider flex items-center justify-between gap-2 px-4 py-2">
        <div className="flex items-center gap-2">
          {!showSessions && <button className="btn-ghost p-1" onClick={toggleSessions} title="显示会话列表" aria-label="显示会话列表" type="button"><PanelLeft className="h-4 w-4" /></button>}
          <h1 className="flex items-center" title="Agent 工作区" aria-label="Agent 工作区"><Bot className="h-5 w-5 text-[var(--color-primary)]" /></h1>
        </div>
      </div>

      {showSkills && (
        <div className="soft-divider agent-skills-strip px-4 py-2">
          <div className="mx-auto flex max-w-4xl xl:max-w-6xl 2xl:max-w-[96rem] flex-wrap items-center gap-1.5">
            {skillState.skills.map((skill) => (
              <span key={skill.id} className="agent-skill-chip inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--color-text-secondary)]" title={skill.description}>
                <span className={`h-1.5 w-1.5 rounded-full ${skill.status === 'ready' ? 'bg-emerald-500' : skill.status === 'guarded' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                {skill.name}
              </span>
            ))}
            <span className="ml-auto text-[11px] text-[var(--color-text-tertiary)]" title={skillState.guard}>{skillState.checkpoint}</span>
          </div>
          <div className="soft-divider agent-skills-preferences mx-auto mt-2 flex max-w-4xl xl:max-w-6xl 2xl:max-w-[96rem] flex-wrap items-center gap-2 pt-2 text-[11px] text-[var(--color-text-secondary)]">
            <span>工作偏好</span>
            <Select className="w-24" size="compact" value={preferences.detail} onChange={(value) => updatePreference({ detail: value as AgentPreferences['detail'] })} ariaLabel="回答详细程度" options={[{ value: 'concise', label: '简洁' }, { value: 'balanced', label: '平衡' }, { value: 'detailed', label: '详细' }]} />
            <label className="flex items-center gap-1"><input type="checkbox" checked={preferences.defaultPlanOnly} onChange={(e) => updatePreference({ defaultPlanOnly: e.target.checked })} />默认只生成计划</label>
            <label className="flex items-center gap-1">最多卡片 <input className="input-field w-14 px-1 py-1 text-[11px]" type="number" min={1} max={50} value={preferences.maxCards} onChange={(e) => updatePreference({ maxCards: Number(e.target.value) })} /></label>
            <button className="btn-ghost px-1 py-0.5 text-[11px]" onClick={async () => setPreferences(await resetAgentPreferences())}>恢复默认</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="agent-empty mx-auto max-w-3xl text-sm text-[var(--color-text-tertiary)]">
          <Bot className="h-5 w-5 text-[var(--color-primary)]" />
            <p className="font-medium text-[var(--color-text)]">把重复整理交给我</p>
            <p className="max-w-xl text-xs">选择一个常用工作流，或直接描述你要处理的内容。</p>
            <div className="agent-starter-list">
              <button type="button" onClick={() => setInput('整理收集箱中的内容，并先给我查看计划')}><span>整理收集箱</span><small>扫描未分类内容，先生成整理建议</small></button>
              <button type="button" onClick={() => setInput('根据我最近的笔记生成学习计划')}><span>生成学习计划</span><small>根据近期笔记生成可调整的学习安排</small></button>
              <button type="button" onClick={() => setInput('检查没有标签的文档并提出补标签计划')}><span>批量补标签</span><small>检查缺失标签，先列出建议改动</small></button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`agent-message-row mx-auto flex w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[96rem] cv-auto ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 text-sm leading-7 ${
              msg.role === 'user'
                ? 'agent-user-bubble rounded-2xl'
                : 'agent-assistant-content'
            }`}>
              <MarkdownContent>{msg.content}</MarkdownContent>

              {/* 意图模式标签（自动分类或手动切换的结果） */}
              {msg.intent && (
                <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                  模式：{INTENT_META[msg.intent].label} · {INTENT_META[msg.intent].hint}
                </div>
              )}

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
                  <EvidenceBlock evidence={msg.evidence} />
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
                            {op.dependsOn?.length ? (
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)]">
                                <GitBranch className="h-3 w-3" /> 依赖：{op.dependsOn.join('、')}
                              </div>
                            ) : null}
                            {op.evidence?.length ? (
                              <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                                依据：{op.evidence.map((ev) => ev.reason).join('；')}
                              </div>
                            ) : null}
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
                  <div className="flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="h-3.5 w-3.5" /> 已执行：</div>
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
            <div className="agent-assistant-content mx-auto w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[96rem] px-1 py-2 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI 正在分析并生成操作计划…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-light)] px-3 py-2 text-sm text-[var(--color-danger)]"><ShieldAlert className="h-4 w-4 shrink-0" />{error}</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="soft-divider px-4 pb-4 pt-3 bg-[var(--color-bg)]">
        <div className="mx-auto mb-2 flex max-w-4xl xl:max-w-6xl 2xl:max-w-[96rem] justify-end">
          <button className="btn-ghost agent-settings-toggle h-7 gap-1 px-2 text-xs" onClick={() => setShowComposerSettings(value => !value)} type="button" aria-expanded={showComposerSettings}>
            <SlidersHorizontal className="h-3.5 w-3.5" />更多设置
          </button>
        </div>
        {showComposerSettings && (
          <div className="agent-composer-settings mx-auto mb-2 flex max-w-4xl xl:max-w-6xl 2xl:max-w-[96rem] flex-wrap items-center gap-2">
            <Select
              className="w-32"
              size="compact"
              value={intentMode}
              onChange={(value) => setIntentMode(value as 'auto' | AgentIntent)}
              ariaLabel="任务判断模式"
              options={[{ value: 'auto', label: '自动判断' }, ...(Object.keys(INTENT_META) as AgentIntent[]).map((key) => ({ value: key, label: INTENT_META[key].label, description: INTENT_META[key].hint }))]}
            />
            <DropdownMenu label="工作区工具" icon={<Wrench className="h-3.5 w-3.5" />} placement="up" align="left" items={[{ label: showSkills ? '隐藏 Skills' : '查看 Skills', icon: <Wrench className="h-3.5 w-3.5" />, onSelect: () => setShowSkills(value => !value) }, { label: '会话权限', icon: <Shield className="h-3.5 w-3.5" />, onSelect: () => setShowPermissions(true) }, { label: showRuns ? '隐藏运行历史' : '运行历史', icon: <Activity className="h-3.5 w-3.5" />, onSelect: () => setShowRuns(value => !value) }]} />
            <button className="btn-ghost flex h-8 items-center gap-1 px-2 text-xs" onClick={clear} title="清空本次对话" type="button"><Trash2 className="h-3.5 w-3.5" />清空对话</button>
            <button className="btn-ghost flex h-8 items-center gap-1 px-2 text-xs" onClick={() => navigate('/ai?mode=chat')} title="返回 AI 问答" type="button"><MessageSquare className="h-3.5 w-3.5" />AI 问答</button>
          </div>
        )}
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
        <div className="agent-composer flex gap-2 items-end px-3 py-2">
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
            placeholder="描述你要整理的内容…"
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
      </div>
      </div>

      {/* 运行历史面板 */}
      {showRuns && (
        <aside className="w-80 shrink-0 flex flex-col agent-workspace-runs">
          <div className="soft-divider p-2 flex items-center justify-between">
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
                <div key={r.id} className="agent-run-card rounded-md p-2 text-xs">
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
                  <button
                    className="agent-run-action mt-1.5 w-full btn-ghost text-xs flex items-center justify-center gap-1 rounded-md py-1"
                    onClick={() => setDetailRun(r)}
                    type="button"
                  >
                    <Activity className="h-3 w-3" /> 运行详情
                  </button>
                  {r.undo && (r.status === 'success' || r.status === 'partial') && (
                    <button
                      className="agent-run-action mt-2 w-full btn-ghost text-xs flex items-center justify-center gap-1 rounded-md py-1"
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

      {/* 运行详情抽屉（时间线 + 调试信息） */}
      {detailRun && <RunDetailDrawer run={detailRun} onClose={() => setDetailRun(null)} />}

      {/* 会话权限面板 */}
      {showPermissions && <PermissionPanel sessionId={sessionId} onClose={() => setShowPermissions(false)} />}
    </div>
  );
}
