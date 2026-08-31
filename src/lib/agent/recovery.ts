export type AgentFailureKind = 'timeout' | 'document_changed' | 'permission' | 'conflict' | 'service' | 'unknown';

export interface AgentRecoveryAdvice {
  kind: AgentFailureKind;
  label: string;
  hint: string;
  retryLabel: string;
  replanLabel: string;
}

/** 将模型/工具错误归一化为用户能理解的恢复路径。 */
export function classifyAgentFailure(message?: string): AgentRecoveryAdvice {
  const text = (message ?? '').toLowerCase();
  if (/timeout|timed out|超时|时间限制/.test(text)) {
    return { kind: 'timeout', label: '模型响应超时', hint: '可以直接重试；如果文档很多，建议拆成较小任务。', retryLabel: '直接重试', replanLabel: '缩小范围后重规划' };
  }
  if (/hash|changed|修改|已变化|不存在|not found|找不到/.test(text)) {
    return { kind: 'document_changed', label: '目标文档已变化', hint: '原计划基于旧内容生成，需要重新读取文档后再规划。', retryLabel: '重新读取并重试', replanLabel: '重新规划' };
  }
  if (/permission|forbidden|权限|禁止|unauthoriz|未授权/.test(text)) {
    return { kind: 'permission', label: '权限不足', hint: '请检查当前会话的操作权限或目标服务凭据。', retryLabel: '调整权限后重试', replanLabel: '按可用权限重新规划' };
  }
  if (/conflict|冲突|concurrent|并发/.test(text)) {
    return { kind: 'conflict', label: '操作发生冲突', hint: '目标可能被其他操作同时修改，建议重新预览受影响项目。', retryLabel: '移除冲突项后重试', replanLabel: '重新规划' };
  }
  if (/network|service|fetch|连接|服务|cors|500|503|unavailable/.test(text)) {
    return { kind: 'service', label: '模型或服务不可用', hint: '任务已保留；确认服务恢复后再重试，不会绕过审批。', retryLabel: '稍后重试', replanLabel: '切换服务后重规划' };
  }
  return { kind: 'unknown', label: '任务执行失败', hint: '可以先查看详情，再决定重试还是重新规划。', retryLabel: '重试上个任务', replanLabel: '重新规划' };
}
