import type { AgentPermissionContext, AgentPermissionPolicy, JournalEntry } from '../db/schema';
import type { AgentOp, AgentOpType, AgentPlan } from './tools';
import { classifyRisk, ALL_AGENT_OP_TYPES } from './tools';

const READ_ONLY = new Set([
  'read', 'search', 'findDuplicates', 'reviewQuality', 'createStudyPlan',
  'suggestQualityFixes', 'analyzeJournalImpact', 'repairDocumentLinks',
  'analyzeKnowledgeGaps', 'suggestJournalMetadata', 'findRelatedJournals',
  'explainSyncConflict', 'prepareConflictMerge',
]);

const EXISTING_TARGET_WRITES = new Set<AgentOpType>([
  'edit', 'append', 'prepend', 'insertAfter', 'patchJournal', 'updateMetadata',
  'rename', 'delete', 'move', 'addTags', 'removeTags', 'generateCards',
]);

function requestedSubject(op: AgentOp, target: JournalEntry | null): string | undefined {
  if (op.type === 'create') return op.subject?.trim();
  if (op.type === 'move') return op.newSubject?.trim();
  if (op.type === 'updateMetadata' && op.metadata?.subject !== undefined) return op.metadata.subject.trim();
  return target?.subject?.trim();
}

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
  requiresApproval: boolean;
}

/**
 * 新会话的保守默认策略：
 * - 允许读取、搜索、分析和生成建议（全部只读操作）；
 * - 创建、修改类操作仍允许生成计划，但必须逐项确认；
 * - 删除与同步冲突写入默认禁止。
 */
export const DEFAULT_AGENT_PERMISSION_POLICY: AgentPermissionPolicy = {
  allowedOperations: ALL_AGENT_OP_TYPES.filter((t) => t !== 'delete' && t !== 'applyConflictMerge'),
  allowDelete: false,
};

/** 判断操作是否为只读（不影响权限范围检查） */
export function isReadOnlyOpType(type: AgentOpType): boolean {
  return READ_ONLY.has(type);
}

/**
 * 本地最小权限引擎。
 * 检查顺序：操作类型 → 删除许可 → 指定文档范围 → 分类范围 → 过期时间 → 风险确认。
 * 读写总开关（allowReadTools/allowWriteTools）兼容旧数据，优先级最高。
 */
export async function checkPlanPermission(
  plan: AgentPlan,
  context: AgentPermissionContext | undefined,
  options: {
    /** 解析操作目标文档（用于文档/分类范围检查）；未提供时跳过范围校验 */
    resolveJournal?: (op: AgentOp) => Promise<JournalEntry | null>;
    now?: number;
  } = {},
): Promise<PermissionDecision> {
  const effective = context ?? { mode: 'default' as const, allowReadTools: true, allowWriteTools: true, updatedAt: 0 };
  // 旧数据没有 policy 时按保守默认策略处理
  const policy = effective.policy ?? DEFAULT_AGENT_PERMISSION_POLICY;
  const now = options.now ?? Date.now();

  // 0) 读写总开关（保留旧版行为）
  const hasRead = plan.ops.some((op) => READ_ONLY.has(op.type));
  const hasWrite = plan.ops.some((op) => !READ_ONLY.has(op.type));
  if (hasRead && !effective.allowReadTools) return { allowed: false, requiresApproval: false, reason: '当前会话策略禁止读取工具' };
  if (hasWrite && !effective.allowWriteTools) return { allowed: false, requiresApproval: false, reason: '当前会话策略禁止写入工具' };

  // 1) 逐操作检查：操作类型 → 删除许可 → 文档范围 → 分类范围
  for (const op of plan.ops) {
    const readOnly = READ_ONLY.has(op.type);
    if (!readOnly && policy.allowedOperations.length > 0 && !policy.allowedOperations.includes(op.type)) {
      return { allowed: false, requiresApproval: false, reason: `当前会话权限不允许「${op.type}」操作` };
    }
    if (op.type === 'delete' && !policy.allowDelete) {
      return { allowed: false, requiresApproval: false, reason: '当前会话权限禁止删除笔记；如需删除请在会话权限面板中开启' };
    }
    if (!readOnly && (policy.allowedJournalIds?.length || policy.allowedSubjects?.length)) {
      // journalId 可直接比对白名单，无需解析文档（解析失败时也能拦截越权目标）
      if (policy.allowedJournalIds?.length && op.journalId && !policy.allowedJournalIds.includes(op.journalId)) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: '目标笔记不在本会话允许修改的文档范围内',
        };
      }
      const target = options.resolveJournal ? await options.resolveJournal(op) : null;
      if (policy.allowedSubjects?.length && EXISTING_TARGET_WRITES.has(op.type) && op.type !== 'create' && !target) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: '无法确认目标笔记所属分类，已拒绝在受限分类范围外执行',
        };
      }
      if (target) {
        if (policy.allowedJournalIds?.length && !policy.allowedJournalIds.includes(target.id)) {
          return {
            allowed: false,
            requiresApproval: false,
            reason: '目标笔记不在本会话允许修改的文档范围内',
          };
        }
        if (policy.allowedSubjects?.length && !policy.allowedSubjects.includes(target.subject)) {
          return {
            allowed: false,
            requiresApproval: false,
            reason: `目标笔记不属于本会话允许的分类（允许：${policy.allowedSubjects.join('、')}）`,
          };
        }
      }
      if (policy.allowedSubjects?.length && (op.type === 'create' || op.type === 'move' || op.type === 'updateMetadata')) {
        const subject = requestedSubject(op, target);
        if (!subject || !policy.allowedSubjects.includes(subject)) {
          return {
            allowed: false,
            requiresApproval: false,
            reason: `目标分类不在本会话允许范围内（允许：${policy.allowedSubjects.join('、')}）`,
          };
        }
      }
    }
  }

  // 2) 过期时间
  if (policy.expiresAt && now > policy.expiresAt) {
    return { allowed: false, requiresApproval: false, reason: '会话权限已过期，请在权限面板重新授权' };
  }

  // 3) 风险确认：plan_only 不拒绝生成计划，只保证执行层仍需用户确认；高风险操作始终如此。
  return {
    allowed: true,
    requiresApproval: effective.mode === 'plan_only' || plan.ops.some((op) => classifyRisk(op) !== 'low'),
  };
}
