// ──── Agent 会话持久化（Phase 3）────
// 将 Agent 会话、消息、运行记录持久化到 IndexedDB（Dexie），
// 支持页面刷新后恢复会话与待确认计划，并提供运行历史与一键撤销。

import { db } from '../db/schema';
import type {
  AgentSession,
  AgentMessageRecord,
  AgentRun,
  AgentAuditLog,
  AgentRunEvent,
  AgentRunStatus,
} from '../db/schema';
import { getAgentState } from './state';
import type { AgentPlan, AgentExecutionResult } from './tools';

// ──── 会话 ────

/** 创建新会话 */
export async function createAgentSession(title = '新会话'): Promise<AgentSession> {
  const now = Date.now();
  const session: AgentSession = {
    id: crypto.randomUUID(),
    title,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await db.agentSessions.add(session);
  await getAgentState(session.id);
  return session;
}

/** 获取所有未删除会话（按更新时间倒序） */
export async function listAgentSessions(): Promise<AgentSession[]> {
  return db.agentSessions
    .filter((s) => !s.deletedAt)
    .sortBy('updatedAt')
    .then((arr) => arr.reverse());
}

/** 获取单个会话 */
export async function getAgentSession(id: string): Promise<AgentSession | undefined> {
  return db.agentSessions.get(id);
}

/** 更新会话标题 */
export async function renameAgentSession(id: string, title: string): Promise<void> {
  await db.agentSessions.update(id, { title, updatedAt: Date.now() });
}

/** 归档 / 恢复会话 */
export async function setAgentSessionStatus(
  id: string,
  status: AgentSession['status'],
): Promise<void> {
  await db.agentSessions.update(id, { status, updatedAt: Date.now() });
}

/** 删除会话（软删除墓碑，参与云同步） */
export async function deleteAgentSession(id: string): Promise<void> {
  await db.agentSessions.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
}

// ──── 消息 ────

/** 追加一条消息 */
export async function addAgentMessage(
  sessionId: string,
  msg: { role: AgentMessageRecord['role']; content: string; planId?: string; runId?: string },
): Promise<AgentMessageRecord> {
  const record: AgentMessageRecord = {
    id: crypto.randomUUID(),
    sessionId,
    role: msg.role,
    content: msg.content,
    planId: msg.planId,
    runId: msg.runId,
    createdAt: Date.now(),
  };
  await db.agentMessages.add(record);
  await db.agentSessions.update(sessionId, { updatedAt: Date.now() });
  return record;
}

/** 获取会话的全部消息（按时间正序） */
export async function listAgentMessages(sessionId: string): Promise<AgentMessageRecord[]> {
  return db.agentMessages
    .where('sessionId')
    .equals(sessionId)
    .sortBy('createdAt');
}

// ──── 运行记录 ────

/** 创建运行记录；校验/权限阶段被拒绝的计划可用 status:'failed' + error 记录失败原因 */
export async function createAgentRun(input: {
  sessionId: string;
  plan: AgentPlan;
  risk: AgentRun['risk'];
  model?: string;
  provider?: string;
  status?: AgentRunStatus;
  error?: string;
}): Promise<AgentRun> {
  const now = Date.now();
  const run: AgentRun = {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    planId: input.plan.planId ?? crypto.randomUUID(),
    status: input.status ?? 'planned',
    risk: input.risk,
    summary: input.plan.summary,
    operations: input.plan.ops as unknown[],
    model: input.model,
    provider: input.provider,
    error: input.error,
    finishedAt: input.status && input.status !== 'planned' ? now : undefined,
    createdAt: now,
    updatedAt: now,
  };
  await db.agentRuns.add(run);
  return run;
}

/** 更新运行状态与结果 */
export async function updateAgentRun(
  runId: string,
  patch: Partial<
    Pick<
      AgentRun,
      | 'status'
      | 'results'
      | 'durationMs'
      | 'tokensInput'
      | 'tokensOutput'
      | 'error'
      | 'statusReason'
      | 'finishedAt'
      | 'undo'
    >
  >,
): Promise<void> {
  await db.agentRuns.update(runId, { ...patch, updatedAt: Date.now() });
}

const RUN_TRANSITIONS: Record<AgentRunStatus, readonly AgentRunStatus[]> = {
  planned: ['approved', 'cancelled', 'failed', 'interrupted'],
  approved: ['running', 'cancelled', 'failed', 'interrupted'],
  running: ['success', 'partial', 'failed', 'cancelled', 'interrupted'],
  success: ['rolled_back'],
  partial: ['rolled_back'],
  failed: [],
  cancelled: [],
  interrupted: ['planned', 'cancelled'],
  rolled_back: [],
};

/**
 * 受限的运行状态迁移。与普通 patch 分开，防止 UI 或恢复逻辑跳过批准阶段。
 * Dexie 单线程事务读取后更新，足以避免同一浏览器上下文中的陈旧状态覆盖。
 */
export async function transitionAgentRun(
  runId: string,
  nextStatus: AgentRunStatus,
  options: { reason?: string; expected?: AgentRunStatus | AgentRunStatus[]; patch?: Omit<Parameters<typeof updateAgentRun>[1], 'status' | 'statusReason'> } = {},
): Promise<AgentRun> {
  return db.transaction('rw', db.agentRuns, async () => {
    const run = await db.agentRuns.get(runId);
    if (!run) throw new Error('运行记录不存在');
    const expected = options.expected ? (Array.isArray(options.expected) ? options.expected : [options.expected]) : undefined;
    if (expected && !expected.includes(run.status)) throw new Error(`运行状态已变化：期望 ${expected.join('/')}，实际 ${run.status}`);
    if (!RUN_TRANSITIONS[run.status].includes(nextStatus)) throw new Error(`不允许的运行状态转换：${run.status} → ${nextStatus}`);
    const now = Date.now();
    const patch = {
      ...options.patch,
      status: nextStatus,
      statusReason: options.reason,
      updatedAt: now,
      ...(nextStatus === 'success' || nextStatus === 'partial' || nextStatus === 'failed' || nextStatus === 'cancelled' || nextStatus === 'interrupted' || nextStatus === 'rolled_back' ? { finishedAt: now } : {}),
    };
    await db.agentRuns.update(runId, patch);
    // 状态转换也进入审计流，便于诊断“恢复后为何不能继续/为何被取消”。
    await db.agentAuditLogs.add({
      id: crypto.randomUUID(),
      runId,
      operation: `state:${run.status}->${nextStatus}${options.reason ? ` (${options.reason})` : ''}`,
      result: 'success',
      createdAt: now,
    });
    return { ...run, ...patch };
  });
}

/** 获取会话的运行记录（按时间倒序） */
export async function listAgentRuns(sessionId: string): Promise<AgentRun[]> {
  return db.agentRuns
    .where('sessionId')
    .equals(sessionId)
    .sortBy('createdAt')
    .then((arr) => arr.reverse());
}

/**
 * 页面/应用异常关闭后，不会盲目重放已经批准或正在执行的写计划。将它们
 * 标为 interrupted，保留审计信息，让用户重新检查后再生成计划。
 */
export async function recoverInterruptedAgentRuns(sessionId: string): Promise<void> {
  const runs = await db.agentRuns.where('sessionId').equals(sessionId).filter((run) => run.status === 'approved' || run.status === 'running').toArray();
  await Promise.all(runs.map((run) => transitionAgentRun(run.id, 'interrupted', {
    expected: run.status,
    reason: '检测到应用重启，未自动重放可能产生副作用的运行',
  })));
}

/** 获取单个运行记录 */
export async function getAgentRun(runId: string): Promise<AgentRun | undefined> {
  return db.agentRuns.get(runId);
}

// ──── 审计日志 ────

/** 追加审计日志 */
export async function addAgentAuditLog(
  log: Omit<AgentAuditLog, 'id' | 'createdAt'>,
): Promise<void> {
  await db.agentAuditLogs.add({
    ...log,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  });
}

/** 获取某次运行的审计日志 */
export async function listAgentAuditLogs(runId: string): Promise<AgentAuditLog[]> {
  return db.agentAuditLogs.where('runId').equals(runId).sortBy('createdAt');
}

// ──── 运行时间线事件（Phase 1 可观测性）────

/** 事件摘要最大长度：超长截断，防止误存附件原文或完整思维链 */
const MAX_EVENT_SUMMARY_LENGTH = 200;

/** 对事件摘要脱敏：截断超长内容，避免持久化大段原文 */
function sanitizeEventSummary(summary: string): string {
  const trimmed = (summary || '').replace(/\s+/g, ' ').trim();
  return trimmed.length > MAX_EVENT_SUMMARY_LENGTH
    ? `${trimmed.slice(0, MAX_EVENT_SUMMARY_LENGTH)}…`
    : trimmed;
}

/** 追加单条运行时间线事件 */
export async function addAgentRunEvent(
  runId: string,
  event: Omit<AgentRunEvent, 'id' | 'runId' | 'createdAt'>,
): Promise<AgentRunEvent> {
  const record: AgentRunEvent = {
    ...event,
    summary: sanitizeEventSummary(event.summary),
    id: crypto.randomUUID(),
    runId,
    createdAt: Date.now(),
  };
  await db.agentRunEvents.add(record);
  return record;
}

/** 批量写入运行时间线事件（运行记录创建前暂存在内存中的事件） */
export async function addAgentRunEvents(
  runId: string,
  events: Array<Omit<AgentRunEvent, 'id' | 'runId' | 'createdAt'>>,
): Promise<void> {
  if (!events.length) return;
  const now = Date.now();
  await db.agentRunEvents.bulkAdd(
    events.map((event, i) => ({
      ...event,
      summary: sanitizeEventSummary(event.summary),
      id: crypto.randomUUID(),
      runId,
      createdAt: now + i,
    })),
  );
}

/** 获取某次运行的时间线事件（按时间正序） */
export async function listAgentRunEvents(runId: string): Promise<AgentRunEvent[]> {
  return db.agentRunEvents.where('runId').equals(runId).sortBy('createdAt');
}

// ──── 序列化辅助（供 UI 恢复待确认计划）────

/** 把持久化的运行记录还原为可展示的计划与结果 */
export function deserializeRun(run: AgentRun): {
  plan: AgentPlan;
  results?: AgentExecutionResult;
} {
  const plan: AgentPlan = {
    planId: run.planId,
    summary: run.summary || '',
    ops: (run.operations ?? []) as AgentPlan['ops'],
  };
  const results = run.results
    ? ({ results: run.results, hasError: run.status === 'failed' || run.status === 'partial' } as AgentExecutionResult)
    : undefined;
  return { plan, results };
}
