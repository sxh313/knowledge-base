import { db, type LearningGoal, type LearningTask } from '../db/schema';

export type { LearningGoal, LearningTask } from '../db/schema';

const LEGACY_GOALS_KEY = 'zhiyu-learning-goals';
const LEGACY_TASKS_KEY = 'zhiyu-learning-tasks';
let migrationPromise: Promise<void> | null = null;

async function migrateLegacyLearningData(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    if (typeof localStorage === 'undefined') return;
    const now = Date.now();
    try {
      if ((await db.learningGoals.count()) === 0) {
        const goals = JSON.parse(localStorage.getItem(LEGACY_GOALS_KEY) || '[]') as LearningGoal[];
        if (goals.length) await db.learningGoals.bulkPut(goals.map((goal) => ({ ...goal, updatedAt: goal.updatedAt ?? goal.createdAt ?? now })));
      }
      if ((await db.learningTasks.count()) === 0) {
        const tasks = JSON.parse(localStorage.getItem(LEGACY_TASKS_KEY) || '[]') as LearningTask[];
        if (tasks.length) await db.learningTasks.bulkPut(tasks.map((task) => ({ ...task, createdAt: task.createdAt ?? now, updatedAt: task.updatedAt ?? task.createdAt ?? now })));
      }
      localStorage.removeItem(LEGACY_GOALS_KEY);
      localStorage.removeItem(LEGACY_TASKS_KEY);
    } catch {
      migrationPromise = null;
    }
  })();
  return migrationPromise;
}

export async function listLearningGoals(): Promise<LearningGoal[]> {
  await migrateLegacyLearningData();
  const goals = await db.learningGoals.toArray();
  return goals.filter((goal) => !goal.deletedAt && goal.status !== 'completed').sort((a, b) => b.createdAt - a.createdAt);
}

export async function createLearningGoal(input: Pick<LearningGoal, 'title' | 'dailyMinutes' | 'deadline' | 'level'>): Promise<LearningGoal> {
  await migrateLegacyLearningData();
  const now = Date.now();
  const goal: LearningGoal = { id: crypto.randomUUID(), title: input.title.trim(), dailyMinutes: Math.max(10, input.dailyMinutes || 30), deadline: input.deadline, level: input.level, status: 'active', createdAt: now, updatedAt: now };
  await db.learningGoals.put(goal);
  return goal;
}

export async function updateLearningGoal(id: string, patch: Partial<Pick<LearningGoal, 'title' | 'dailyMinutes' | 'deadline' | 'level' | 'status'>>): Promise<LearningGoal | undefined> {
  const goal = await db.learningGoals.get(id);
  if (!goal || goal.deletedAt) return undefined;
  const updated = { ...goal, ...patch, updatedAt: Date.now() };
  await db.learningGoals.put(updated);
  return updated;
}

export function buildGoalTasks(goal: LearningGoal, sourceIds: string[], topics: string[]): LearningTask[] {
  const count = Math.max(1, Math.min(30, topics.length || 1));
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => ({ id: `${goal.id}:${index}`, goalId: goal.id, date: new Date(now + index * 86400000).toISOString().slice(0, 10), title: topics[index] || goal.title, minutes: goal.dailyMinutes, sourceIds, status: 'todo' as const, createdAt: now, updatedAt: now }));
}

export async function saveGoalTasks(tasks: LearningTask[]): Promise<LearningTask[]> {
  await migrateLegacyLearningData();
  const existing = await db.learningTasks.bulkGet(tasks.map((task) => task.id));
  const merged = tasks.map((task, index) => {
    const current = existing[index];
    return current ? { ...task, date: current.date, status: current.status, createdAt: current.createdAt, updatedAt: current.updatedAt } : task;
  });
  await db.learningTasks.bulkPut(merged);
  return merged.sort((a, b) => a.date.localeCompare(b.date));
}

export async function listLearningTasks(goalId?: string): Promise<LearningTask[]> {
  await migrateLegacyLearningData();
  const tasks = goalId ? await db.learningTasks.where('goalId').equals(goalId).toArray() : await db.learningTasks.toArray();
  return tasks.filter((task) => !task.deletedAt).sort((a, b) => a.date.localeCompare(b.date));
}

export async function updateLearningTask(id: string, patch: Partial<Pick<LearningTask, 'date' | 'title' | 'minutes' | 'status'>>): Promise<LearningTask | undefined> {
  const task = await db.learningTasks.get(id);
  if (!task || task.deletedAt) return undefined;
  const updated = { ...task, ...patch, updatedAt: Date.now() };
  await db.learningTasks.put(updated);
  return updated;
}

export async function createTasksForGoal(goal: LearningGoal, sourceIds: string[], topics: string[]): Promise<LearningTask[]> {
  return saveGoalTasks(buildGoalTasks(goal, sourceIds, topics));
}

export async function createTasksFromKnowledgeGaps(goal: LearningGoal, gaps: { concept: string; evidence?: string[] }[]): Promise<LearningTask[]> {
  const topics = gaps.slice(0, 12).map((gap) => `补足：${gap.concept}`);
  const sourceIds = gaps.flatMap((gap) => gap.evidence ?? []).slice(0, 20);
  return createTasksForGoal(goal, sourceIds, topics.length ? topics : [goal.title]);
}
