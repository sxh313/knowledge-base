import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  goals: new Map<string, Record<string, unknown>>(),
  tasks: new Map<string, Record<string, unknown>>(),
}));

function table(store: Map<string, Record<string, unknown>>) {
  return {
    count: async () => store.size,
    put: async (row: Record<string, unknown>) => { store.set(String(row.id), row); },
    bulkPut: async (rows: Record<string, unknown>[]) => { rows.forEach((row) => store.set(String(row.id), row)); },
    get: async (id: string) => store.get(id),
    bulkGet: async (ids: string[]) => ids.map((id) => store.get(id)),
    toArray: async () => [...store.values()],
    where: (field: string) => ({ equals: (value: unknown) => ({ toArray: async () => [...store.values()].filter((row) => row[field] === value) }) }),
  };
}

vi.mock('../db/schema', () => ({
  db: {
    learningGoals: table(mocks.goals),
    learningTasks: table(mocks.tasks),
  },
}));

import { createLearningGoal, createTasksForGoal, listLearningTasks, updateLearningTask } from './learning';

beforeEach(() => {
  mocks.goals.clear();
  mocks.tasks.clear();
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});

describe('learning task persistence', () => {
  it('persists editable tasks and preserves status changes', async () => {
    const goal = await createLearningGoal({ title: 'RAG', dailyMinutes: 30, deadline: undefined, level: '初学者' });
    const tasks = await createTasksForGoal(goal, [], ['检索', '生成']);
    expect(await listLearningTasks(goal.id)).toHaveLength(2);
    await updateLearningTask(tasks[0].id, { status: 'done', date: '2030-01-02' });
    expect((await listLearningTasks(goal.id)).find((task) => task.id === tasks[0].id)).toMatchObject({ status: 'done', date: '2030-01-02' });
  });
});
