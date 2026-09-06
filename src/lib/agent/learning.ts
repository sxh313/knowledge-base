import { db, type LearningGoal, type LearningTask } from '../db/schema';
import { buildAgentCourseTasks, loadAgentCourse } from './coursePlanner';

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

export async function createLearningGoal(input: Pick<LearningGoal, 'title' | 'dailyMinutes' | 'deadline' | 'level'> & Partial<Pick<LearningGoal, 'planKind' | 'reminderEnabled' | 'reminderTime'>>): Promise<LearningGoal> {
  await migrateLegacyLearningData();
  const now = Date.now();
  const goal: LearningGoal = { id: crypto.randomUUID(), title: input.title.trim(), dailyMinutes: Math.max(10, input.dailyMinutes || 30), deadline: input.deadline, level: input.level, planKind: input.planKind ?? 'custom', reminderEnabled: input.reminderEnabled ?? false, reminderTime: input.reminderTime ?? '09:00', status: 'active', createdAt: now, updatedAt: now };
  await db.learningGoals.put(goal);
  return goal;
}

export async function updateLearningGoal(id: string, patch: Partial<Pick<LearningGoal, 'title' | 'dailyMinutes' | 'deadline' | 'level' | 'status' | 'planKind' | 'totalTasks' | 'reminderEnabled' | 'reminderTime'>>): Promise<LearningGoal | undefined> {
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
    if (current?.deletedAt) return current;
    return current ? { ...task, date: current.date, status: current.status, createdAt: current.createdAt, updatedAt: current.updatedAt } : task;
  });
  await db.learningTasks.bulkPut(merged);
  return merged.filter((task) => !task.deletedAt).sort((a, b) => a.date.localeCompare(b.date));
}

export async function listLearningTasks(goalId?: string): Promise<LearningTask[]> {
  await migrateLegacyLearningData();
  const tasks = goalId ? await db.learningTasks.where('goalId').equals(goalId).toArray() : await db.learningTasks.toArray();
  return tasks.filter((task) => !task.deletedAt).sort((a, b) => a.date.localeCompare(b.date));
}

export async function updateLearningTask(id: string, patch: Partial<Pick<LearningTask, 'date' | 'title' | 'minutes' | 'status' | 'learningStage' | 'reflection' | 'quizAnswer'>>): Promise<LearningTask | undefined> {
  const task = await db.learningTasks.get(id);
  if (!task || task.deletedAt) return undefined;
  const updated = { ...task, ...patch, updatedAt: Date.now() };
  await db.learningTasks.put(updated);
  return updated;
}

export async function createTasksForGoal(goal: LearningGoal, sourceIds: string[], topics: string[]): Promise<LearningTask[]> {
  return saveGoalTasks(buildGoalTasks(goal, sourceIds, topics));
}

export async function deleteLearningTask(id: string): Promise<void> {
  const now = Date.now();
  await db.learningTasks.update(id, { deletedAt: now, updatedAt: now });
}

export async function replaceTasksForGoal(goalId: string, tasks: LearningTask[]): Promise<LearningTask[]> {
  await migrateLegacyLearningData();
  const existing = await db.learningTasks.where('goalId').equals(goalId).toArray();
  const now = Date.now();
  const replacementIds = new Set(tasks.map((task) => task.id));
  const retired = existing.filter((task) => !replacementIds.has(task.id) && task.status === 'todo').map((task) => ({ ...task, deletedAt: now, updatedAt: now }));
  if (retired.length) await db.learningTasks.bulkPut(retired);
  const existingById = new Map(existing.map((task) => [task.id, task]));
  const merged = tasks.map((task) => existingById.get(task.id)?.deletedAt ? existingById.get(task.id)! : task);
  await db.learningTasks.bulkPut(merged);
  return merged.filter((task) => !task.deletedAt).sort((a, b) => a.date.localeCompare(b.date));
}

export async function createAgentCourseGoal(input: Pick<LearningGoal, 'title' | 'dailyMinutes' | 'deadline' | 'level'>): Promise<{ goal: LearningGoal; tasks: LearningTask[] }> {
  const goal = await createLearningGoal({ ...input, planKind: 'agent-course', reminderEnabled: true, reminderTime: '09:00' });
  const tasks = buildAgentCourseTasks(goal, await loadAgentCourse());
  const plannedGoal = { ...goal, totalTasks: tasks.length, updatedAt: Date.now() };
  await db.learningGoals.put(plannedGoal);
  await replaceTasksForGoal(goal.id, tasks);
  return { goal: plannedGoal, tasks };
}

export async function regenerateAgentCoursePlan(goal: LearningGoal): Promise<LearningTask[]> {
  const tasks = buildAgentCourseTasks(goal, await loadAgentCourse());
  const updatedGoal = { ...goal, planKind: 'agent-course' as const, totalTasks: tasks.length, reminderEnabled: goal.reminderEnabled ?? true, reminderTime: goal.reminderTime ?? '09:00', updatedAt: Date.now() };
  await db.learningGoals.put(updatedGoal);
  return replaceTasksForGoal(goal.id, tasks);
}

/** 将历史中以 Agent 为目标的旧计时计划升级为课程计划；没有计划时创建默认计划。 */
export async function ensureAgentCoursePlan(): Promise<LearningGoal> {
  const goals = await listLearningGoals();
  const planned = goals.find((goal) => goal.planKind === 'agent-course');
  if (planned) return planned;
  const legacyAgentGoal = goals.find((goal) => /agent|智能体/i.test(goal.title));
  if (legacyAgentGoal) {
    await regenerateAgentCoursePlan(legacyAgentGoal);
    return (await db.learningGoals.get(legacyAgentGoal.id))!;
  }
  return (await createAgentCourseGoal({ title: 'Agent 系统学习与复习', dailyMinutes: 30, level: '系统规划' })).goal;
}

export async function createTasksFromKnowledgeGaps(goal: LearningGoal, gaps: { concept: string; evidence?: string[] }[]): Promise<LearningTask[]> {
  const topics = gaps.slice(0, 12).map((gap) => `补足：${gap.concept}`);
  const sourceIds = gaps.flatMap((gap) => gap.evidence ?? []).slice(0, 20);
  return createTasksForGoal(goal, sourceIds, topics.length ? topics : [goal.title]);
}
