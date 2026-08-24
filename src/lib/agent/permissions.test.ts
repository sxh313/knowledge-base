import { describe, expect, it } from 'vitest';
import { checkPlanPermission } from './permissions';

describe('Agent permission policy', () => {
  it('blocks write plans when the persisted permission context disallows writes', () => {
    const decision = checkPlanPermission(
      { ops: [{ type: 'create', newTitle: 'x', content: 'y' }] },
      { mode: 'default', allowReadTools: true, allowWriteTools: false, updatedAt: 1 },
    );
    expect(decision.allowed).toBe(false);
  });

  it('allows read-only plans under a read-enabled plan-only policy', () => {
    const decision = checkPlanPermission(
      { ops: [{ type: 'search', query: 'React' }] },
      { mode: 'plan_only', allowReadTools: true, allowWriteTools: false, updatedAt: 1 },
    );
    expect(decision).toMatchObject({ allowed: true, requiresApproval: true });
  });
});
