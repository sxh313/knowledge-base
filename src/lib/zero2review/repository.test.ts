import { describe, expect, it, vi } from 'vitest';
import type { Zero2ReviewTask } from '../db/schema';

const state = vi.hoisted(() => ({ rows: [] as Zero2ReviewTask[] }));

vi.mock('../db/schema', () => ({
  db: {
    zero2ReviewTasks: {
    bulkGet: async (ids: string[]) => ids.map((id) => state.rows.find((task) => task.id === id)),
    bulkPut: async (rows: Zero2ReviewTask[]) => { state.rows = rows; },
    },
  },
}));

import { saveReviewTasksPreservingCompleted } from './repository';

const task = (patch: Partial<Zero2ReviewTask> = {}): Zero2ReviewTask => ({
  id: 'plan:topic:review', planId: 'plan', topicId: 'topic', date: '2026-09-06', type: 'review',
  estimatedMinutes: 10, sourceIds: ['source'], status: 'todo', createdAt: 1, updatedAt: 1, ...patch,
});

describe('review task persistence', () => {
  it('does not resurrect a soft-deleted task during replanning', async () => {
    state.rows = [task({ deletedAt: 10, updatedAt: 10 })];
    await saveReviewTasksPreservingCompleted([task({ date: '2026-09-07' })]);
    expect(state.rows[0]).toMatchObject({ deletedAt: 10, date: '2026-09-06' });
  });
});
