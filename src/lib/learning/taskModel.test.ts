import { describe, expect, it } from 'vitest';
import type { UnifiedLearningTask } from './taskModel';
import { summarizeLearningTasks } from './taskModel';

const task = (id: string, date: string, status: UnifiedLearningTask['status'], minutes = 10): UnifiedLearningTask => ({
  id, date, status, estimatedMinutes: minutes, domain: 'learning-plan', ownerId: 'goal', title: id, sourceIds: [], kind: 'reading',
});

describe('unified learning task metrics', () => {
  it('uses one due, overdue and completion definition across both task domains', () => {
    const summary = summarizeLearningTasks([
      task('overdue', '2026-09-05', 'todo', 15),
      { ...task('due', '2026-09-06', 'todo', 20), domain: 'zero2-review' },
      task('future', '2026-09-07', 'todo'),
      task('done', '2026-09-05', 'done'),
      task('skipped', '2026-09-05', 'skipped'),
    ], '2026-09-06');

    expect(summary).toMatchObject({ total: 5, todo: 3, done: 1, skipped: 1, due: 2, overdue: 1, estimatedMinutesDue: 35 });
    expect(summary.completionRate).toBe(0.25);
  });
});
