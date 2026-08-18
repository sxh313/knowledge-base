// ──── Agent 会话持久化（Phase 3）────
// 将 Agent 会话、消息、运行记录持久化到 IndexedDB（Dexie），
// 支持页面刷新后恢复会话与待确认计划，并提供运行历史与一键撤销。

import { db } from '../db/schema';
import type {
  AgentSession,
  AgentMessageRecord,
  AgentRun,
  AgentAuditLog,
} from '../db/schema';
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

/** 创建运行记录 */
export async function createAgentRun(input: {
  sessionId: string;
  plan: AgentPlan;
  risk: AgentRun['risk'];
  model?: string;
  provider?: string;
}): Promise<AgentRun> {
  const now = Date.now();
  const run: AgentRun = {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    planId: input.plan.planId ?? crypto.randomUUID(),
    status: 'planned',
    risk: input.risk,
    summary: input.plan.summary,
    operations: input.plan.ops as unknown[],
    model: input.model,
    provider: input.provider,
    createdAt: now,
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
      | 'finishedAt'
      | 'undo'
    >
  >,
): Promise<void> {
  await db.agentRuns.update(runId, patch);
}

/** 获取会话的运行记录（按时间倒序） */
export async function listAgentRuns(sessionId: string): Promise<AgentRun[]> {
  return db.agentRuns
    .where('sessionId')
    .equals(sessionId)
    .sortBy('createdAt')
    .then((arr) => arr.reverse());
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
