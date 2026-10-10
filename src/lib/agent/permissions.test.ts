import { describe, expect, it } from 'vitest';
import { checkPlanPermission, DEFAULT_AGENT_PERMISSION_POLICY } from './permissions';
import type { AgentPermissionContext } from '../db/schema';

// 构造带策略的权限上下文（默认策略：禁止 delete 与 applyConflictMerge）
function contextWithPolicy(patch: Partial<AgentPermissionContext['policy']>): AgentPermissionContext {
  return {
    mode: 'default',
    allowReadTools: true,
    allowWriteTools: true,
    policy: { ...DEFAULT_AGENT_PERMISSION_POLICY, ...patch },
    updatedAt: 1,
  };
}

describe('Agent permission policy', () => {
  it('blocks write plans when the persisted permission context disallows writes', async () => {
    const decision = await checkPlanPermission(
      { ops: [{ type: 'create', newTitle: 'x', content: 'y' }] },
      { mode: 'default', allowReadTools: true, allowWriteTools: false, updatedAt: 1 },
    );
    expect(decision.allowed).toBe(false);
  });

  it('allows read-only plans under a read-enabled plan-only policy', async () => {
    const decision = await checkPlanPermission(
      { ops: [{ type: 'search', query: 'React' }] },
      { mode: 'plan_only', allowReadTools: true, allowWriteTools: false, updatedAt: 1 },
    );
    expect(decision).toMatchObject({ allowed: true, requiresApproval: true });
  });

  it('rejects operations outside the allowed operation whitelist', async () => {
    const decision = await checkPlanPermission(
      { ops: [{ type: 'edit', journalId: 'j1', content: 'new content' }] },
      contextWithPolicy({ allowedOperations: ['create', 'append'] }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('edit');
  });

  it('blocks delete unless explicitly allowed', async () => {
    const blocked = await checkPlanPermission(
      { ops: [{ type: 'delete', journalId: 'j1' }] },
      contextWithPolicy({ allowDelete: false }),
    );
    expect(blocked.allowed).toBe(false);

    const allowed = await checkPlanPermission(
      { ops: [{ type: 'delete', journalId: 'j1' }] },
      contextWithPolicy({ allowDelete: true, allowedOperations: ['delete'] }),
    );
    expect(allowed.allowed).toBe(true);
  });

  it('enforces the journal whitelist through resolveJournal', async () => {
    const resolveJournal = async (op: { journalId?: string }) =>
      op.journalId === 'j1' ? ({ id: 'j1', title: '笔记', subject: '学习' } as never) : null;
    const decision = await checkPlanPermission(
      { ops: [{ type: 'edit', journalId: 'j2', content: 'new content' }] },
      contextWithPolicy({ allowedJournalIds: ['j1'] }),
      { resolveJournal: resolveJournal as never },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('文档范围');
  });

  it('enforces the subject whitelist through resolveJournal', async () => {
    const resolveJournal = async () => ({ id: 'j1', title: '笔记', subject: '工作' } as never);
    const decision = await checkPlanPermission(
      { ops: [{ type: 'edit', journalId: 'j1', content: 'new content' }] },
      contextWithPolicy({ allowedSubjects: ['学习'] }),
      { resolveJournal: resolveJournal as never },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('分类');
  });

  it('rejects plans after the policy expires', async () => {
    const decision = await checkPlanPermission(
      { ops: [{ type: 'create', newTitle: 'x', content: 'y' }] },
      contextWithPolicy({ expiresAt: 1000 }),
      { now: 2000 },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('过期');
  });

  it('allows expired-bound plans before the deadline', async () => {
    const decision = await checkPlanPermission(
      { ops: [{ type: 'create', newTitle: 'x', content: 'y' }] },
      contextWithPolicy({ expiresAt: 5000 }),
      { now: 4000 },
    );
    expect(decision.allowed).toBe(true);
  });

  it('enforces the subject whitelist for create and destination changes', async () => {
    const createOutside = await checkPlanPermission(
      { ops: [{ type: 'create', newTitle: 'x', content: 'y', subject: '工作' }] },
      contextWithPolicy({ allowedSubjects: ['学习'] }),
    );
    expect(createOutside.allowed).toBe(false);

    const moveOutside = await checkPlanPermission(
      { ops: [{ type: 'move', journalId: 'j1', newSubject: '工作' }] },
      contextWithPolicy({ allowedSubjects: ['学习'] }),
      { resolveJournal: async () => ({ id: 'j1', title: '笔记', subject: '学习' } as never) },
    );
    expect(moveOutside.allowed).toBe(false);

    const metadataOutside = await checkPlanPermission(
      { ops: [{ type: 'updateMetadata', journalId: 'j1', metadata: { subject: '工作' } }] },
      contextWithPolicy({ allowedSubjects: ['学习'] }),
      { resolveJournal: async () => ({ id: 'j1', title: '笔记', subject: '学习' } as never) },
    );
    expect(metadataOutside.allowed).toBe(false);
  });

  it('fails closed when a restricted write target cannot be resolved', async () => {
    const decision = await checkPlanPermission(
      { ops: [{ type: 'edit', journalId: 'missing', content: 'new' }] },
      contextWithPolicy({ allowedSubjects: ['学习'] }),
      { resolveJournal: async () => null },
    );
    expect(decision.allowed).toBe(false);
  });
});
