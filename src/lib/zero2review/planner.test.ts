import { describe, expect, it } from 'vitest';
import { buildDailyPlan } from './planner';

const topics = [
  { id: 'a', path: 'a', title: 'A', module: 'm', order: 1, estimatedMinutes: 10 },
  { id: 'b', path: 'b', title: 'B', module: 'm', order: 2, estimatedMinutes: 10 },
];

describe('zero2 deterministic planner', () => {
  it('is stable and respects the daily budget tolerance', () => {
    const input = { topics, mastery: [], dailyMinutes: 15, planId: 'p', date: '2026-08-20' };
    const first = buildDailyPlan(input);
    expect(buildDailyPlan(input)).toEqual(first);
    expect(first.reduce((sum, task) => sum + task.estimatedMinutes, 0)).toBeLessThanOrEqual(16);
    expect(new Set(first.map((task) => task.id)).size).toBe(first.length);
  });
  it('does not schedule advanced topics while prerequisites are unknown', () => {
    const input = { topics: [...topics, { id: 'advanced', path: 'advanced', title: 'Advanced', module: 'm', order: 3, prerequisiteIds: ['missing'], estimatedMinutes: 10 }], mastery: [], dailyMinutes: 40, planId: 'p', date: '2026-08-20', now: 0 };
    expect(buildDailyPlan(input).some((task) => task.topicId === 'advanced')).toBe(false);
  });
});
