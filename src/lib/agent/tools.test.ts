import { describe, it, expect } from 'vitest';
import {
  parseAgentPlan,
  assignPlanIds,
  validateAgentPlan,
  validateAgentOp,
  classifyRisk,
  MAX_OPS_PER_PLAN,
  MAX_CONTENT_LENGTH,
  MAX_EVIDENCE_PER_OP,
} from './tools';

describe('parseAgentPlan', () => {
  it('解析纯 JSON 对象', () => {
    const plan = parseAgentPlan('{"summary":"s","ops":[{"type":"create","newTitle":"t"}]}');
    expect(plan).not.toBeNull();
    expect(plan!.ops).toHaveLength(1);
    expect(plan!.ops[0].type).toBe('create');
  });

  it('解析带 markdown 围栏的 JSON', () => {
    const plan = parseAgentPlan('```json\n{"ops":[{"type":"read","journalId":"1"}]}\n```');
    expect(plan).not.toBeNull();
    expect(plan!.ops[0].journalId).toBe('1');
  });

  it('解析带前后说明文字的 JSON', () => {
    const plan = parseAgentPlan('好的，我来处理：\n{"ops":[{"type":"search","query":"x"}]}\n以上是计划');
    expect(plan).not.toBeNull();
    expect(plan!.ops[0].type).toBe('search');
  });

  it('非法 JSON 返回 null', () => {
    expect(parseAgentPlan('这不是 JSON')).toBeNull();
    expect(parseAgentPlan('{"ops": 不是数组}')).toBeNull();
    expect(parseAgentPlan('')).toBeNull();
  });

  it('缺少 ops 数组返回 null', () => {
    expect(parseAgentPlan('{"summary":"no ops"}')).toBeNull();
  });
});

describe('assignPlanIds', () => {
  it('为计划与每个操作生成唯一 id', () => {
    const plan = assignPlanIds({ ops: [{ type: 'create', newTitle: 't' }, { type: 'read', journalId: '1' }] });
    expect(plan.planId).toBeTruthy();
    expect(plan.ops[0].opId).toBeTruthy();
    expect(plan.ops[1].opId).toBeTruthy();
    expect(plan.ops[0].opId).not.toBe(plan.ops[1].opId);
  });

  it('保留已有 planId 并基于它生成 opId', () => {
    const plan = assignPlanIds({ planId: 'abc', ops: [{ type: 'read', journalId: '1' }] });
    expect(plan.planId).toBe('abc');
    expect(plan.ops[0].opId).toContain('abc');
  });
});

describe('validateAgentPlan', () => {
  it('空计划校验失败', () => {
    expect(validateAgentPlan(null).ok).toBe(false);
    expect(validateAgentPlan(undefined).ok).toBe(false);
    expect(validateAgentPlan({} as never).ok).toBe(false);
    expect(validateAgentPlan({ ops: [] }).ok).toBe(false);
  });

  it('操作数量超过上限校验失败', () => {
    const ops = Array.from({ length: MAX_OPS_PER_PLAN + 1 }, () => ({ type: 'read' as const, journalId: '1' }));
    const r = validateAgentPlan({ ops });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('操作数量过多'))).toBe(true);
  });

  it('未知操作类型校验失败', () => {
    const r = validateAgentPlan({ ops: [{ type: 'hack' as never }] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('未知操作类型'))).toBe(true);
  });

  it('缺少目标文档的操作校验失败', () => {
    const r = validateAgentPlan({ ops: [{ type: 'edit', content: 'x' }] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('缺少目标文档'))).toBe(true);
  });

  it('create 缺少 newTitle 校验失败', () => {
    const r = validateAgentPlan({ ops: [{ type: 'create', content: 'x' }] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('newTitle'))).toBe(true);
  });

  it('search 空查询校验失败（禁止全库搜索）', () => {
    const r = validateAgentPlan({ ops: [{ type: 'search', query: '  ' }] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('禁止全库搜索'))).toBe(true);
  });

  it('insertAfter 缺少 afterHeading 校验失败', () => {
    const r = validateAgentPlan({ ops: [{ type: 'insertAfter', journalId: '1', content: 'x' }] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('afterHeading'))).toBe(true);
  });

  it('内容超过长度上限校验失败', () => {
    const r = validateAgentPlan({
      ops: [{ type: 'create', newTitle: 't', content: 'x'.repeat(MAX_CONTENT_LENGTH + 1) }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('内容过长'))).toBe(true);
  });

  it('编辑类操作缺少 expectedHash 产生警告但不阻断', () => {
    const r = validateAgentPlan({ ops: [{ type: 'edit', journalId: '1', content: 'x', evidence: [{ journalId: '1', reason: '用户指定修改该文档' }] }] });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('expectedHash'))).toBe(true);
  });

  it('合法计划校验通过', () => {
    const r = validateAgentPlan({
      ops: [
        { type: 'create', newTitle: 't', content: 'x' },
        { type: 'edit', journalId: '1', content: 'y', expectedHash: 'abc', evidence: [{ journalId: '1', reason: '用户指定修改该文档' }] },
        { type: 'search', query: '关键词' },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('精确补丁和元数据更新需要明确字段', () => {
    expect(validateAgentPlan({ ops: [{ type: 'patchJournal', journalId: '1' }] }).ok).toBe(false);
    expect(validateAgentPlan({ ops: [{ type: 'updateMetadata', journalId: '1', metadata: { summary: '摘要' }, expectedHash: 'h', evidence: [{ journalId: '1', reason: '更新元数据' }] }] }).ok).toBe(true);
  });
});

describe('validateAgentOp', () => {
  it('非对象操作返回错误', () => {
    const r = validateAgentOp(null as never, 0);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('generateCards 无内容来源校验失败', () => {
    const r = validateAgentOp({ type: 'generateCards' }, 0);
    expect(r.errors.some((e) => e.includes('缺少内容来源'))).toBe(true);
  });

  it('generateCards 有 content 时校验通过', () => {
    const r = validateAgentOp({ type: 'generateCards', content: 'x' }, 0);
    expect(r.errors).toHaveLength(0);
  });
});

describe('classifyRisk 风险等级', () => {
  it('delete 与 edit 为 high', () => {
    expect(classifyRisk({ type: 'delete' })).toBe('high');
    expect(classifyRisk({ type: 'edit' })).toBe('high');
  });

  it('rename/move/create/append 为 medium', () => {
    expect(classifyRisk({ type: 'rename' })).toBe('medium');
    expect(classifyRisk({ type: 'move' })).toBe('medium');
    expect(classifyRisk({ type: 'create' })).toBe('medium');
    expect(classifyRisk({ type: 'append' })).toBe('medium');
  });

  it('read/search 为 low', () => {
    expect(classifyRisk({ type: 'read' })).toBe('low');
    expect(classifyRisk({ type: 'search' })).toBe('low');
  });

  it('冲突合并为 high，精确补丁为 medium', () => {
    expect(classifyRisk({ type: 'applyConflictMerge', conflictId: 'c' })).toBe('high');
    expect(classifyRisk({ type: 'patchJournal' })).toBe('medium');
  });
});

describe('证据（evidence）校验', () => {
  it('高影响写操作缺少 evidence 校验失败', () => {
    const r = validateAgentPlan({ ops: [{ type: 'edit', journalId: '1', content: 'x' }] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('缺少修改依据'))).toBe(true);
  });

  it('证据缺少 journalId 或 reason 校验失败', () => {
    const r = validateAgentPlan({ ops: [{ type: 'edit', journalId: '1', content: 'x', evidence: [{ reason: '修改说明' }] as never }] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('证据缺少 journalId'))).toBe(true);

    const r2 = validateAgentPlan({ ops: [{ type: 'edit', journalId: '1', content: 'x', evidence: [{ journalId: '1' }] as never }] });
    expect(r2.ok).toBe(false);
    expect(r2.errors.some((e) => e.includes('缺少 reason'))).toBe(true);
  });

  it('目标与证据文档不一致且未声明跨文档时校验失败', () => {
    const r = validateAgentPlan({
      ops: [{ type: 'edit', journalId: '1', content: 'x', evidence: [{ journalId: '2', reason: '参考另一篇笔记' }] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('不一致'))).toBe(true);
  });

  it('reason 声明跨文档关系时通过', () => {
    const r = validateAgentPlan({
      ops: [{ type: 'edit', journalId: '1', content: 'x', evidence: [{ journalId: '2', reason: '跨文档整理：合并两篇笔记内容' }] }],
    });
    expect(r.ok).toBe(true);
  });

  it('证据数量超过上限校验失败', () => {
    const evidence = Array.from({ length: MAX_EVIDENCE_PER_OP + 1 }, () => ({ journalId: '1', reason: '修改说明' }));
    const r = validateAgentPlan({ ops: [{ type: 'edit', journalId: '1', content: 'x', evidence }] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('证据数量过多'))).toBe(true);
  });
});

describe('依赖（dependsOn）校验', () => {
  it('依赖不存在的 opId 校验失败', () => {
    const r = validateAgentPlan({
      ops: [{ type: 'edit', journalId: '1', content: 'x', evidence: [{ journalId: '1', reason: '修改说明' }], dependsOn: ['ghost'] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('不存在'))).toBe(true);
  });

  it('不允许自依赖', () => {
    const withIds = assignPlanIds({ ops: [{ type: 'edit', journalId: '1', content: 'x', evidence: [{ journalId: '1', reason: '修改说明' }] }] });
    withIds.ops[0].dependsOn = [withIds.ops[0].opId!];
    const r = validateAgentPlan(withIds);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('不允许依赖自己'))).toBe(true);
  });

  it('删除操作不能作为前置条件', () => {
    const withIds = assignPlanIds({
      ops: [
        { type: 'delete', journalId: '1', evidence: [{ journalId: '1', reason: '删除重复笔记' }] },
        { type: 'create', newTitle: 't', content: 'x' },
      ],
    });
    withIds.ops[1].dependsOn = [withIds.ops[0].opId!];
    const r = validateAgentPlan(withIds);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('删除操作不能作为前置条件'))).toBe(true);
  });

  it('循环依赖校验失败', () => {
    const withIds = assignPlanIds({
      ops: [
        { type: 'edit', journalId: '1', content: 'x', evidence: [{ journalId: '1', reason: '修改说明' }] },
        { type: 'edit', journalId: '1', content: 'y', evidence: [{ journalId: '1', reason: '修改说明' }] },
      ],
    });
    withIds.ops[0].dependsOn = [withIds.ops[1].opId!];
    withIds.ops[1].dependsOn = [withIds.ops[0].opId!];
    const r = validateAgentPlan(withIds);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('循环依赖'))).toBe(true);
  });

  it('合法依赖校验通过', () => {
    const withIds = assignPlanIds({
      ops: [
        { type: 'create', newTitle: 't', content: 'x' },
        { type: 'edit', journalId: '1', content: 'y', evidence: [{ journalId: '1', reason: '修改说明' }] },
      ],
    });
    withIds.ops[1].dependsOn = [withIds.ops[0].opId!];
    const r = validateAgentPlan(withIds);
    expect(r.ok).toBe(true);
  });
});