// ──── Agent 状态管理 ────
// 编排 Agent 流程：检索相关文档 → 调用 AI 生成操作计划 → 预览 → 应用。

import { create } from 'zustand';
import type { ChatMessage } from '../lib/ai/client';
import { routeAI } from '../lib/ai/router';
import { getJournal } from '../lib/db/queries';
import { retrieve } from '../lib/ai/retrieval';
import { buildAgentSystemPrompt } from '../lib/agent/prompt';
import { previewPlan, applyPlan, undoRun, type UndoInfo } from '../lib/agent/executor';
import {
  isReadOnlyPlan,
  formatToolResults,
  buildToolResultPrompt,
  MAX_TOOL_ROUNDS,
} from '../lib/agent/toolLoop';
import {
  parseAgentPlan,
  assignPlanIds,
  validateAgentPlan,
  toDocRef,
  type AgentPlan,
  type AgentExecutionResult,
  type AgentDocRef,
} from '../lib/agent/tools';
import type { JournalEntry } from '../lib/db/schema';
import { calculateContentHash } from '../lib/indexing/documents';
import {
  createAgentSession,
  listAgentSessions,
  renameAgentSession,
  setAgentSessionStatus,
  deleteAgentSession,
  addAgentMessage,
  listAgentMessages,
  createAgentRun,
  addAgentAuditLog,
  listAgentRuns,
  deserializeRun,
  transitionAgentRun,
  recoverInterruptedAgentRuns,
} from '../lib/agent/persistence';
import type { AgentSession, AgentRun } from '../lib/db/schema';
import { getAgentPreferences } from '../lib/agent/preferences';
import { recordAgentMetric } from '../lib/agent/metrics';
import { getAgentState, updateAgentState } from '../lib/agent/state';
import { searchMemories } from '../lib/agent/memory';
import { applyContextBudget } from '../lib/agent/context';
import { checkPlanPermission } from '../lib/agent/permissions';

async function restoreAgentMessages(sessionId: string, runs: AgentRun[]) {
  const records = await listAgentMessages(sessionId);
  const restored: AgentMessage[] = records.map((m) => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content, createdAt: m.createdAt }));
  // 页面刷新后恢复仍处于 planned 状态的计划，避免用户丢失待确认操作。
  const pendingRuns = runs.filter((run) => run.status === 'planned');
  for (const run of pendingRuns) {
    const { plan } = deserializeRun(run);
    const preview = await previewPlan(plan).catch(() => ({ results: [], hasError: true }));
    restored.push({ role: 'assistant', content: plan.summary || '恢复一个待确认的操作计划：', plan, preview });
  }
  return restored;
}

let latestRouteMeta: { model: string; provider: string; usage?: { promptTokens: number; completionTokens: number } } | undefined;

/**
 * 预览后为每个解析到目标文档的操作绑定 expectedHash。
 * 这样执行时能校验目标文档是否在预览后被修改，防止误执行旧计划。
 */
async function attachExpectedHashes(
  plan: AgentPlan,
  preview: AgentExecutionResult,
): Promise<AgentPlan> {
  const ops = await Promise.all(
    plan.ops.map(async (op, i) => {
      const result = preview.results[i];
      if (!result?.ok || !result.journalId) return op;
      try {
        const entry = await getJournal(result.journalId);
        if (!entry || entry.deletedAt) return op;
        const hash = await calculateContentHash({ title: entry.title, content: entry.content });
        return { ...op, expectedHash: hash };
      } catch {
        return op;
      }
    }),
  );
  return { ...plan, ops };
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
  /** 用户消息附带的操作计划（AI 生成，待确认） */
  plan?: AgentPlan;
  /** 预览结果 */
  preview?: AgentExecutionResult;
  /** 应用结果 */
  applied?: AgentExecutionResult;
  /** 本次运行产生的撤销信息（供「撤销本次运行」恢复） */
  undo?: UndoInfo;
  /** 是否已应用 */
  appliedAt?: number;
  /** 多轮工具循环日志（read/search 闭环记录） */
  toolLog?: string[];
}

interface AgentStore {
  isProcessing: boolean;
  error: string | null;
  messages: AgentMessage[];
  /** 当前待确认的计划 */
  pendingPlan: AgentPlan | null;
  /** 当前待确认计划的预览 */
  pendingPreview: AgentExecutionResult | null;
  /** 当前待确认计划对应的用户消息索引 */
  pendingMsgIndex: number | null;

  // ── 会话持久化（Phase 3）──
  /** 当前会话 id */
  sessionId: string | null;
  /** 会话列表 */
  sessions: AgentSession[];
  /** 当前会话的运行记录 */
  runs: AgentRun[];
  /** 是否已初始化（从 IndexedDB 恢复） */
  initialized: boolean;

  /** 初始化：加载会话列表，若无会话则新建 */
  init: () => Promise<void>;
  /** 新建会话 */
  newSession: () => Promise<void>;
  /** 加载指定会话的消息与运行记录 */
  loadSession: (id: string) => Promise<void>;
  /** 重命名会话 */
  renameSession: (id: string, title: string) => Promise<void>;
  /** 归档 / 恢复会话 */
  setSessionStatus: (id: string, status: AgentSession['status']) => Promise<void>;
  /** 删除会话 */
  deleteSession: (id: string) => Promise<void>;

  clear: () => void;
  /** 发送用户指令，触发 AI 生成计划并预览 */
  run: (instruction: string, attachedContent?: string) => Promise<void>;
  /** 应用当前待确认的计划（可只应用被批准的 opId） */
  applyPending: (approvedOpIds?: Set<string>) => Promise<void>;
  /** 取消当前待确认的计划 */
  cancelPending: () => Promise<void>;
  /** 撤销最近一次已应用的运行（恢复版本快照、删除新建文档） */
  undoLast: (msgIndex: number) => Promise<void>;
  /** 从运行历史一键撤销某次运行（基于持久化的 undo 快照） */
  undoRunById: (runId: string) => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  isProcessing: false,
  error: null,
  messages: [],
  pendingPlan: null,
  pendingPreview: null,
  pendingMsgIndex: null,
  sessionId: null,
  sessions: [],
  runs: [],
  initialized: false,

  init: async () => {
    try {
      const sessions = await listAgentSessions();
      if (sessions.length === 0) {
        const session = await createAgentSession();
        set({ sessions: [session], sessionId: session.id, initialized: true });
        return;
      }
      // 恢复最近活跃的会话
      const active = sessions.find((s) => s.status === 'active') ?? sessions[0];
      await recoverInterruptedAgentRuns(active.id);
      const runs = await listAgentRuns(active.id);
      const messages = await restoreAgentMessages(active.id, runs);
      const pending = [...messages].reverse().find((m) => m.plan && !m.applied);
      set({
        sessions,
        sessionId: active.id,
        messages,
        runs,
        pendingPlan: pending?.plan ?? null,
        pendingPreview: pending?.preview ?? null,
        pendingMsgIndex: pending ? messages.indexOf(pending) : null,
        initialized: true,
      });
    } catch (e) {
      set({ error: (e as Error).message, initialized: true });
    }
  },

  newSession: async () => {
    const session = await createAgentSession();
    set((s) => ({
      sessions: [session, ...s.sessions],
      sessionId: session.id,
      messages: [],
      runs: [],
      pendingPlan: null,
      pendingPreview: null,
      pendingMsgIndex: null,
    }));
  },

  loadSession: async (id) => {
    await recoverInterruptedAgentRuns(id);
    const runs = await listAgentRuns(id);
    const messages = await restoreAgentMessages(id, runs);
    const pending = [...messages].reverse().find((m) => m.plan && !m.applied);
    set({
      sessionId: id,
      messages,
      runs,
      pendingPlan: pending?.plan ?? null,
      pendingPreview: pending?.preview ?? null,
      pendingMsgIndex: pending ? messages.indexOf(pending) : null,
    });
  },

  renameSession: async (id, title) => {
    await renameAgentSession(id, title);
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)),
    }));
  },

  setSessionStatus: async (id, status) => {
    await setAgentSessionStatus(id, status);
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, status } : x)),
    }));
  },

  deleteSession: async (id) => {
    await deleteAgentSession(id);
    const sessions = await listAgentSessions();
    // 若删除的是当前会话，切换到第一个会话或新建
    if (get().sessionId === id) {
      if (sessions.length > 0) {
        await get().loadSession(sessions[0].id);
      } else {
        await get().newSession();
      }
    }
    set({ sessions });
  },

  clear: () => set({ messages: [], pendingPlan: null, pendingPreview: null, pendingMsgIndex: null, error: null }),

  run: async (instruction, attachedContent) => {
    const MAX_ATTACHED_CHARS = 50000;
    const boundedAttachment = attachedContent && attachedContent.length > MAX_ATTACHED_CHARS
      ? `${attachedContent.slice(0, MAX_ATTACHED_CHARS)}\n\n[附件已截断：原文超过 50,000 字符，请分段处理]`
      : attachedContent;
    const text = attachedContent
      ? `${instruction}\n\n【用户提供的文件内容】\n${boundedAttachment}`
      : instruction;
    const userMsg: AgentMessage = { role: 'user', content: text, createdAt: Date.now() };
    set((s) => ({ messages: [...s.messages, userMsg], isProcessing: true, error: null }));

    // 持久化用户消息
    const sessionId = get().sessionId;
    if (sessionId) {
      try {
        await addAgentMessage(sessionId, { role: 'user', content: text });
      } catch {
        // 持久化失败不阻塞主流程
      }
    }

    try {
      // 1. 检索相关文档作为上下文
      let docRefs: AgentDocRef[] = [];
      try {
        const chunks = await retrieve(instruction, { kind: 'all' }, 8);
        const ids = Array.from(new Set(chunks.map((c) => c.journalId).filter((id): id is string => !!id)));
        const entries: JournalEntry[] = [];
        for (const id of ids) {
          const entry = await getJournal(id);
          if (entry && !entry.deletedAt) entries.push(entry);
        }
        docRefs = entries.map((e) => toDocRef(e));
      } catch {
        docRefs = [];
      }

      // 2. 构造 system prompt 并调用 AI
      const timeStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      const prefs = await getAgentPreferences();
      const agentState = sessionId ? await getAgentState(sessionId) : null;
      const memories = sessionId ? await searchMemories(instruction, sessionId) : [];
      const memoryContext = memories.length
        ? `\n\n可用长期记忆（仅在与当前请求相关时使用；每条均可追溯）：\n${memories.map((item) => `- [${item.kind}] ${item.content}`).join('\n')}`
        : '';
      const sysPrompt = `${buildAgentSystemPrompt(docRefs, timeStr)}\n\n用户工作偏好（仅用于格式，不改变安全规则）：语言=${prefs.language}，详细程度=${prefs.detail}，默认策略=${prefs.defaultPlanOnly ? '只生成计划' : '允许在确认后执行'}，最多生成 ${prefs.maxCards} 张卡片，标签风格=${prefs.tagStyle}。${memoryContext}`;
      // 上下文按 token 预算构建；已总结的早期消息不会再次直接注入。
      const historyRecords = get()
        .messages.slice(0, -1) // 去掉刚加入的当前用户消息
        .filter((m) => !agentState?.summarizedThroughAt || !m.createdAt || m.createdAt > agentState.summarizedThroughAt);
      const history: ChatMessage[] = historyRecords.map((m) => ({ role: m.role, content: m.content }));
      const budgeted = applyContextBudget(history, {
        system: { role: 'system', content: sysPrompt },
        current: { role: 'user', content: text },
        priorSummary: agentState?.summary,
      });
      const baseMessages: ChatMessage[] = budgeted.messages;
      if (sessionId && budgeted.summarizedCount > 0) {
        // 只标记实际压缩的前缀，不能把仍保留在窗口中的近期消息一并跳过。
        const summarizedThroughAt = historyRecords.slice(0, budgeted.summarizedCount).reduce((latest, message) => Math.max(latest, message.createdAt ?? 0), agentState?.summarizedThroughAt ?? 0);
        await updateAgentState(sessionId, { summary: budgeted.summary, summarizedThroughAt });
      }

      // 3. 多轮工具循环：调用 AI → 解析计划 → 若只含 read/search 则执行并回传结果 → 再调用 AI
      //    最多循环 MAX_TOOL_ROUNDS 次，防止无限循环。
      let raw = '';
      let plan: AgentPlan | null = null;
      let toolRounds = 0     // 已执行的只读工具轮数
      let toolLog: string[] = []; // 记录每轮工具结果，供展示

      // 单次「调用 AI + 解析计划」的辅助函数（含一次格式纠正重试）
      const callAndParse = async (): Promise<AgentPlan | null> => {
        let p: AgentPlan | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await routeAI('qa', baseMessages);
          latestRouteMeta = { model: result.model, provider: result.provider, usage: result.usage };
          raw = result.content;
          p = parseAgentPlan(raw);
          if (p && p.ops.length > 0) return p;
          if (attempt === 0) {
            // 追加纠正提示，要求只输出 JSON
            baseMessages.push(
              { role: 'assistant', content: raw },
              {
                role: 'user',
                content:
                  '你刚才的输出不是有效的操作计划 JSON。请只输出一个 JSON 对象（不要 markdown 围栏、不要多余文字），格式为 {"summary":"...","ops":[...]}。',
              },
            );
          }
        }
        return p;
      };

      plan = await callAndParse();

      // 多轮工具闭环：只要计划只含只读操作，就执行工具并把结果回传 AI
      while (plan && plan.ops.length > 0 && isReadOnlyPlan(plan) && toolRounds < MAX_TOOL_ROUNDS) {
        // 执行只读工具（read/search 不写入，直接预览即可拿到结果）
        const toolPreview = await previewPlan(plan);
        const toolResults = formatToolResults(toolPreview);
        toolRounds++;
        toolLog.push(`第 ${toolRounds} 轮工具调用：${plan.ops.map((o) => o.type).join(', ')}`);
        // 把工具结果重新注入 AI，让它决定下一步
        baseMessages.push(
          { role: 'assistant', content: raw },
          { role: 'user', content: buildToolResultPrompt(toolResults) },
        );
        plan = await callAndParse();
      }

      if (!plan || plan.ops.length === 0) {
        // AI 没有生成可执行计划，当作普通回答展示
        const assistantMsg: AgentMessage = { role: 'assistant', content: raw, createdAt: Date.now() };
        set((s) => ({ messages: [...s.messages, assistantMsg], isProcessing: false }));
        return;
      }

      // 为计划与每个操作生成唯一 id（防重复执行与审计）
      plan = assignPlanIds(plan);

      // 校验计划：非法计划直接拒绝，不进入预览/执行
      const validation = validateAgentPlan(plan);
      if (!validation.ok) {
        recordAgentMetric('plan_rejected');
        const assistantMsg: AgentMessage = {
          role: 'assistant',
          content: `⚠️ AI 生成的操作计划未通过安全校验，已拒绝执行：\n\n${validation.errors.join('\n')}`,
        };
        set((s) => ({ messages: [...s.messages, assistantMsg], isProcessing: false }));
        return;
      }
      const permission = checkPlanPermission(plan, agentState?.permissions);
      if (!permission.allowed) {
        recordAgentMetric('plan_rejected');
        const assistantMsg: AgentMessage = { role: 'assistant', content: `⚠️ 操作计划被当前会话权限策略阻止：${permission.reason}`, createdAt: Date.now() };
        set((s) => ({ messages: [...s.messages, assistantMsg], isProcessing: false }));
        return;
      }
      recordAgentMetric('plan_generated');

      // 4. 预览计划（不写入）
      const preview = await previewPlan(plan);
      // 预览后为每个解析到目标文档的操作绑定 expectedHash，
      // 供执行时校验目标是否被修改（防止误执行旧计划）
      plan = await attachExpectedHashes(plan, preview);
      const msgIndex = get().messages.length;
      const assistantMsg: AgentMessage = {
        role: 'assistant',
        content: plan.summary || '我准备执行以下操作，请确认：',
        createdAt: Date.now(),
        plan,
        preview,
        toolLog: toolLog.length ? toolLog : undefined,
      };
      set((s) => ({
        messages: [...s.messages, assistantMsg],
        pendingPlan: plan,
        pendingPreview: preview,
        pendingMsgIndex: msgIndex,
        isProcessing: false,
      }));

      // 持久化 assistant 消息 + 创建运行记录（Phase 3）
      if (sessionId) {
        try {
          await addAgentMessage(sessionId, {
            role: 'assistant',
            content: assistantMsg.content,
            planId: plan.planId,
          });
          const risk = plan.ops.some((o) => o.risk === 'high')
            ? 'high'
            : plan.ops.some((o) => o.risk === 'medium')
              ? 'medium'
              : 'low';
          const run = await createAgentRun({
            sessionId,
            plan,
            risk,
            model: latestRouteMeta?.model,
            provider: latestRouteMeta?.provider,
          });
          set((s) => ({ runs: [run, ...s.runs] }));
        } catch {
          // 持久化失败不阻塞主流程
        }
      }
    } catch (e) {
      set({ isProcessing: false, error: (e as Error).message });
    }
  },

  applyPending: async (approvedOpIds) => {
    const { pendingPlan, pendingMsgIndex } = get();
    if (!pendingPlan) return;
    set({ isProcessing: true, error: null });
    const startedAt = Date.now();
    try {
      const pendingRun = get().runs.find((r) => r.planId === pendingPlan.planId);
      if (pendingRun) {
        const approvedRun = await transitionAgentRun(pendingRun.id, 'approved', { expected: 'planned', reason: '用户确认执行计划' });
        const runningRun = await transitionAgentRun(approvedRun.id, 'running', { expected: 'approved', reason: '开始执行已批准的计划' });
        set((s) => ({ runs: s.runs.map((r) => r.id === runningRun.id ? runningRun : r) }));
      }
      const applied = await applyPlan(pendingPlan, approvedOpIds);
      set((s) => ({
        messages: s.messages.map((m, i) =>
          i === pendingMsgIndex ? { ...m, applied, appliedAt: Date.now(), undo: applied.undo } : m,
        ),
        pendingPlan: null,
        pendingPreview: null,
        pendingMsgIndex: null,
        isProcessing: false,
      }));

      // 更新运行记录状态（Phase 3）
      const sessionId = get().sessionId;
      if (sessionId) {
        try {
          const run = get().runs.find((r) => r.planId === pendingPlan.planId);
          if (run) {
            const status = applied.hasError
              ? 'partial'
              : approvedOpIds && approvedOpIds.size < pendingPlan.ops.length
                ? 'partial'
                : 'success';
            const completedRun = await transitionAgentRun(run.id, status, {
              expected: 'running',
              reason: applied.hasError ? '执行出现错误' : '计划执行完成',
              patch: {
                results: applied.results as unknown[],
                durationMs: Date.now() - startedAt,
                tokensInput: latestRouteMeta?.usage?.promptTokens,
                tokensOutput: latestRouteMeta?.usage?.completionTokens,
                undo: applied.undo
                  ? {
                      versions: applied.undo.versions,
                      createdJournalIds: applied.undo.createdJournalIds,
                    }
                  : undefined,
              },
            });
            recordAgentMetric(status === 'success' ? 'run_success' : status === 'partial' ? 'run_partial' : 'run_failed', { durationMs: Date.now() - startedAt });
            await Promise.all(applied.results.map((result) => addAgentAuditLog({
              runId: run.id,
              operation: result.op.type,
              journalId: result.journalId,
              result: result.skipped ? 'skipped' : result.ok ? 'success' : 'failed',
            })));
            set((s) => ({
              runs: s.runs.map((r) =>
                r.id === run.id
                  ? {
                    ...completedRun,
                    }
                  : r,
              ),
            }));
          }
        } catch {
          // 持久化失败不阻塞主流程
        }
      }
      } catch (e) {
      set({ isProcessing: false, error: (e as Error).message });
    }
  },

  undoLast: async (msgIndex) => {
    const msg = get().messages[msgIndex];
    if (!msg?.undo) return;
    set({ isProcessing: true, error: null });
    try {
      await undoRun(msg.undo);
      set((s) => ({
        messages: s.messages.map((m, i) =>
          i === msgIndex ? { ...m, undo: undefined, applied: undefined, appliedAt: undefined } : m,
        ),
        isProcessing: false,
      }));

      // 撤销是一个独立终态，不能伪装成“取消”。
      const sessionId = get().sessionId;
      if (sessionId && msg.plan) {
        try {
          const run = get().runs.find((r) => r.planId === msg.plan!.planId);
          if (run) {
            const rolledBackRun = await transitionAgentRun(run.id, 'rolled_back', { expected: ['success', 'partial'], reason: '用户撤销已执行的运行' });
            set((s) => ({
              runs: s.runs.map((r) =>
                r.id === run.id ? rolledBackRun : r,
              ),
            }));
          }
        } catch {
          // 持久化失败不阻塞主流程
        }
      }
    } catch (e) {
      set({ isProcessing: false, error: (e as Error).message });
    }
  },

  cancelPending: async () => {
    const { pendingMsgIndex, pendingPlan } = get();
    const run = pendingPlan ? get().runs.find((item) => item.planId === pendingPlan.planId) : undefined;
    if (run) {
      const cancelledRun = await transitionAgentRun(run.id, 'cancelled', { expected: 'planned', reason: '用户取消待确认计划' });
      set((s) => ({ runs: s.runs.map((item) => item.id === cancelledRun.id ? cancelledRun : item) }));
    }
    set((s) => ({
      messages: s.messages.map((m, i) =>
        i === pendingMsgIndex ? { ...m, plan: undefined, preview: undefined } : m,
      ),
      pendingPlan: null,
      pendingPreview: null,
      pendingMsgIndex: null,
    }));
    recordAgentMetric('run_cancelled');
  },

  undoRunById: async (runId) => {
    const run = get().runs.find((r) => r.id === runId);
    if (!run?.undo) return;
    set({ isProcessing: true, error: null });
    try {
      await undoRun(run.undo);
      const rolledBackRun = await transitionAgentRun(runId, 'rolled_back', { expected: ['success', 'partial'], reason: '用户从运行历史撤销' });
      recordAgentMetric('run_cancelled');
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === runId ? rolledBackRun : r,
        ),
        isProcessing: false,
      }));
    } catch (e) {
      set({ isProcessing: false, error: (e as Error).message });
    }
  },
}));
