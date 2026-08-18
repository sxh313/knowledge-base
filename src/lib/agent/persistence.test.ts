// ──── Agent 会话持久化单元测试 ────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockSessions: { add: vi.fn(), update: vi.fn(), filter: vi.fn(), get: vi.fn() },
  mockMessages: { add: vi.fn(), where: vi.fn() },
  mockRuns: { add: vi.fn(), update: vi.fn(), get: vi.fn(), where: vi.fn() },
  mockAudit: { add: vi.fn(), where: vi.fn() },
}));

vi.mock('../db/schema', () => ({
  db: {
    agentSessions: mocks.mockSessions,
    agentMessages: mocks.mockMessages,
    agentRuns: mocks.mockRuns,
    agentAuditLogs: mocks.mockAudit,
  },
}));

import {
  createAgentSession,
  listAgentSessions,
  renameAgentSession,
  setAgentSessionStatus,
  deleteAgentSession,
  addAgentMessage,
  listAgentMessages,
  createAgentRun,
  updateAgentRun,
  listAgentRuns,
  getAgentRun,
  addAgentAuditLog,
  listAgentAuditLogs,
  deserializeRun,
} from './persistence';
import type { AgentPlan } from './tools';

function makePlan(): AgentPlan {
  return {
    planId: 'plan-1',
    summary: '测试计划',
    ops: [{ type: 'create', newTitle: '新文档', content: '内容' } as any],
  };
}

describe('createAgentSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('创建会话并写入 IndexedDB', async () => {
    mocks.mockSessions.add.mockResolvedValue(undefined);
    const session = await createAgentSession('我的会话');
    expect(session.title).toBe('我的会话');
    expect(session.status).toBe('active');
    expect(session.id).toBeTruthy();
    expect(mocks.mockSessions.add).toHaveBeenCalledWith(session);
  });
});

describe('listAgentSessions', () => {
  it('过滤已删除会话并按更新时间倒序', async () => {
    const arr = [
      { id: '1', title: 'a', updatedAt: 100, deletedAt: undefined },
      { id: '2', title: 'b', updatedAt: 300, deletedAt: undefined },
      { id: '3', title: 'c', updatedAt: 200, deletedAt: 999 },
    ];
    // 模拟 Dexie filter（过滤 deletedAt）+ sortBy（按 updatedAt 升序）
    mocks.mockSessions.filter.mockReturnValue({
      sortBy: vi.fn().mockImplementation(async (key: string) =>
        arr.filter((s) => !s.deletedAt).sort((a, b) => (a as any)[key] - (b as any)[key]),
      ),
    });
    const sessions = await listAgentSessions();
    expect(sessions.map((s) => s.id)).toEqual(['2', '1']);
  });
});

describe('addAgentMessage', () => {
  it('写入消息并更新会话时间', async () => {
    mocks.mockMessages.add.mockResolvedValue(undefined);
    mocks.mockSessions.update.mockResolvedValue(1);
    const msg = await addAgentMessage('s1', { role: 'user', content: '你好' });
    expect(msg.sessionId).toBe('s1');
    expect(msg.role).toBe('user');
    expect(mocks.mockSessions.update).toHaveBeenCalledWith('s1', expect.objectContaining({ updatedAt: expect.any(Number) }));
  });
});

describe('createAgentRun', () => {
  it('创建运行记录（planned 状态）', async () => {
    mocks.mockRuns.add.mockResolvedValue(undefined);
    const run = await createAgentRun({ sessionId: 's1', plan: makePlan(), risk: 'medium' });
    expect(run.planId).toBe('plan-1');
    expect(run.status).toBe('planned');
    expect(run.risk).toBe('medium');
    expect(run.operations).toHaveLength(1);
  });
});

describe('updateAgentRun', () => {
  it('更新运行状态与结果', async () => {
    mocks.mockRuns.update.mockResolvedValue(1);
    await updateAgentRun('r1', { status: 'success', durationMs: 100 });
    expect(mocks.mockRuns.update).toHaveBeenCalledWith('r1', { status: 'success', durationMs: 100 });
  });
});

describe('deserializeRun', () => {
  it('还原计划与结果', () => {
    const run = {
      id: 'r1',
      sessionId: 's1',
      planId: 'plan-1',
      status: 'success' as const,
      risk: 'low' as const,
      summary: '测试',
      operations: [{ type: 'create', newTitle: 'x' }],
      results: [{ op: { type: 'create' }, ok: true }],
      createdAt: 1,
    };
    const { plan, results } = deserializeRun(run as any);
    expect(plan.planId).toBe('plan-1');
    expect(plan.ops).toHaveLength(1);
    expect(results?.hasError).toBe(false);
  });
});
