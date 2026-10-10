import type { LearningTask, Zero2ReviewTask } from '../db/schema';
import { listActiveLearningTaskRecords, listActiveReviewTaskRecords } from '../db/repositories/learning';

export type UnifiedLearningTaskStatus = 'todo' | 'done' | 'skipped';

export interface UnifiedLearningTask {
  id: string;
  domain: 'learning-plan' | 'zero2-review';
  ownerId: string;
  date: string;
  title: string;
  estimatedMinutes: number;
  sourceIds: string[];
  status: UnifiedLearningTaskStatus;
  kind: string;
}

export interface LearningTaskSummary {
  total: number;
  todo: number;
  done: number;
  skipped: number;
  due: number;
  overdue: number;
  estimatedMinutesDue: number;
  completionRate: number;
}

export function fromLearningTask(task: LearningTask): UnifiedLearningTask {
  return {
    id: task.id,
    domain: 'learning-plan',
    ownerId: task.goalId,
    date: task.date,
    title: task.title,
    estimatedMinutes: task.minutes,
    sourceIds: task.sourceIds,
    status: task.status,
    kind: task.learningStage ?? 'reading',
  };
}

export function fromReviewTask(task: Zero2ReviewTask): UnifiedLearningTask {
  return {
    id: task.id,
    domain: 'zero2-review',
    ownerId: task.planId,
    date: task.date,
    title: task.topicId,
    estimatedMinutes: task.estimatedMinutes,
    sourceIds: task.sourceIds,
    status: task.status,
    kind: task.type,
  };
}

export function summarizeLearningTasks(tasks: UnifiedLearningTask[], today: string): LearningTaskSummary {
  const todo = tasks.filter((task) => task.status === 'todo');
  const done = tasks.filter((task) => task.status === 'done').length;
  const skipped = tasks.filter((task) => task.status === 'skipped').length;
  const dueTasks = todo.filter((task) => task.date <= today);
  const actionable = todo.length + done;
  return {
    total: tasks.length,
    todo: todo.length,
    done,
    skipped,
    due: dueTasks.length,
    overdue: dueTasks.filter((task) => task.date < today).length,
    estimatedMinutesDue: dueTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
    completionRate: actionable ? done / actionable : 0,
  };
}

export async function listUnifiedLearningTasks(): Promise<UnifiedLearningTask[]> {
  const [learningTasks, reviewTasks] = await Promise.all([
    listActiveLearningTaskRecords(),
    listActiveReviewTaskRecords(),
  ]);
  return [...learningTasks.map(fromLearningTask), ...reviewTasks.map(fromReviewTask)];
}
