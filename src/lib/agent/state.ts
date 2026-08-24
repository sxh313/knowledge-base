import { db } from '../db/schema';
import type {
  AgentPermissionContext,
  AgentStateRecord,
  AgentTask,
  AgentToolCacheEntry,
} from '../db/schema';

export const DEFAULT_AGENT_PERMISSIONS: AgentPermissionContext = {
  mode: 'default',
  allowReadTools: true,
  allowWriteTools: true,
  updatedAt: 0,
};

function defaultState(sessionId: string): AgentStateRecord {
  return {
    sessionId,
    summary: '',
    tasks: [],
    toolCache: [],
    permissions: { ...DEFAULT_AGENT_PERMISSIONS, updatedAt: Date.now() },
    updatedAt: Date.now(),
  };
}

/** 获取或初始化会话状态；状态与完整消息历史分开存储。 */
export async function getAgentState(sessionId: string): Promise<AgentStateRecord> {
  const existing = await db.agentStates.get(sessionId);
  if (existing) return existing;
  const state = defaultState(sessionId);
  await db.agentStates.put(state);
  return state;
}

export async function updateAgentState(
  sessionId: string,
  patch: Partial<Pick<AgentStateRecord, 'summary' | 'summarizedThroughAt' | 'tasks' | 'toolCache' | 'permissions'>>,
): Promise<AgentStateRecord> {
  const current = await getAgentState(sessionId);
  const next: AgentStateRecord = {
    ...current,
    ...patch,
    permissions: patch.permissions ? { ...patch.permissions, updatedAt: Date.now() } : current.permissions,
    updatedAt: Date.now(),
  };
  await db.agentStates.put(next);
  return next;
}

export async function replaceAgentTasks(sessionId: string, tasks: AgentTask[]): Promise<AgentStateRecord> {
  return updateAgentState(sessionId, { tasks });
}

export async function setToolCache(sessionId: string, entries: AgentToolCacheEntry[]): Promise<AgentStateRecord> {
  const now = Date.now();
  return updateAgentState(sessionId, { toolCache: entries.filter((entry) => entry.expiresAt > now).slice(-100) });
}

