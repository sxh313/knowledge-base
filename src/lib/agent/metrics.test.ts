import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgentMetricSummary, recordAgentMetric, resetAgentMetrics } from './metrics';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) });
  resetAgentMetrics();
});

describe('agent metrics', () => {
  it('只记录计数和耗时，不记录正文', () => {
    recordAgentMetric('run_success', { durationMs: 120 });
    recordAgentMetric('run_cancelled');
    const summary = getAgentMetricSummary();
    expect(summary.counts.run_success).toBe(1);
    expect(summary.counts.run_cancelled).toBe(1);
    expect(summary.totalDurationMs).toBe(120);
    expect(JSON.stringify(summary)).not.toContain('正文');
  });
});
