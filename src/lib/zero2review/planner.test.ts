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
});
