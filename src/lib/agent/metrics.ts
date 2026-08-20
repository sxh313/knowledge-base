/**
 * 本地 Agent 使用指标：只保存计数和耗时，不保存问题正文、文档正文或 API Key。
 * 用于验证成功率、取消率和响应速度，数据不会进入云同步。
 */
export type AgentMetricEvent =
  | 'plan_generated'
  | 'plan_rejected'
  | 'run_success'
  | 'run_partial'
  | 'run_failed'
  | 'run_cancelled';

export interface AgentMetricSummary {
  counts: Record<AgentMetricEvent, number>;
  totalDurationMs: number;
  completedRuns: number;
  updatedAt: number;
}

const KEY = 'zhiyu-agent-metrics-v1';
const EVENTS: AgentMetricEvent[] = ['plan_generated', 'plan_rejected', 'run_success', 'run_partial', 'run_failed', 'run_cancelled'];

function emptySummary(): AgentMetricSummary {
  return {
    counts: Object.fromEntries(EVENTS.map((event) => [event, 0])) as Record<AgentMetricEvent, number>,
    totalDurationMs: 0,
    completedRuns: 0,
    updatedAt: 0,
  };
}

function readSummary(): AgentMetricSummary {
  if (typeof localStorage === 'undefined') return emptySummary();
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<AgentMetricSummary>;
    const base = emptySummary();
    return {
      counts: { ...base.counts, ...(parsed.counts ?? {}) },
      totalDurationMs: Number(parsed.totalDurationMs) || 0,
      completedRuns: Number(parsed.completedRuns) || 0,
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return emptySummary();
  }
}

function writeSummary(summary: AgentMetricSummary): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(summary));
}

export function recordAgentMetric(event: AgentMetricEvent, data?: { durationMs?: number }): AgentMetricSummary {
  const summary = readSummary();
  summary.counts[event] += 1;
  if (data?.durationMs && Number.isFinite(data.durationMs)) {
    summary.totalDurationMs += Math.max(0, data.durationMs);
    summary.completedRuns += 1;
  }
  summary.updatedAt = Date.now();
  writeSummary(summary);
  return summary;
}

export function getAgentMetricSummary(): AgentMetricSummary {
  return readSummary();
}

export function resetAgentMetrics(): void {
  writeSummary(emptySummary());
}
