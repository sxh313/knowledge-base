import type { AgentPermissionContext } from '../db/schema';
import type { AgentPlan } from './tools';
import { classifyRisk } from './tools';

const READ_ONLY = new Set([
  'read', 'search', 'findDuplicates', 'reviewQuality', 'createStudyPlan',
  'suggestQualityFixes', 'analyzeJournalImpact', 'repairDocumentLinks',
  'analyzeKnowledgeGaps', 'suggestJournalMetadata', 'findRelatedJournals',
  'explainSyncConflict', 'prepareConflictMerge',
]);

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
  requiresApproval: boolean;
}

/** 本地最小权限引擎：读写能力、计划模式与逐项用户确认各自独立。 */
export function checkPlanPermission(
  plan: AgentPlan,
  context: AgentPermissionContext | undefined,
): PermissionDecision {
  const effective = context ?? { mode: 'default' as const, allowReadTools: true, allowWriteTools: true, updatedAt: 0 };
  const hasRead = plan.ops.some((op) => READ_ONLY.has(op.type));
  const hasWrite = plan.ops.some((op) => !READ_ONLY.has(op.type));
  if (hasRead && !effective.allowReadTools) return { allowed: false, requiresApproval: false, reason: '当前会话策略禁止读取工具' };
  if (hasWrite && !effective.allowWriteTools) return { allowed: false, requiresApproval: false, reason: '当前会话策略禁止写入工具' };
  // plan_only 不拒绝生成计划，只保证执行层仍需用户确认；高风险操作始终如此。
  return {
    allowed: true,
    requiresApproval: effective.mode === 'plan_only' || plan.ops.some((op) => classifyRisk(op) !== 'low'),
  };
}

