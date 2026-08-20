import type { Zero2Mastery, Zero2ReviewTask } from '../db/schema';
import type { Zero2CatalogTopic } from './catalog';
import type { Zero2TopicPriority } from './types';

export interface PlanningInput {
  topics: Zero2CatalogTopic[];
  mastery: Zero2Mastery[];
  dailyMinutes: number;
  planId: string;
  date: string;
  now?: number;
  existingTasks?: Zero2ReviewTask[];
  goalRelevance?: Record<string, number>;
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

export function scoreTopic(
  topic: Zero2CatalogTopic,
  mastery: Zero2Mastery | undefined,
  now = Date.now(),
  allMastery?: Map<string, Zero2Mastery>,
  goalRelevance = 0.5,
): Zero2TopicPriority {
  const weakness = mastery?.mastery == null ? 0.65 : 1 - mastery.mastery;
  const prerequisites = topic.prerequisiteIds ?? [];
  const prerequisiteGap = prerequisites.length === 0 ? 0 : clamp(prerequisites.filter((id) => {
    const prerequisite = allMastery?.get(id);
    return !prerequisite || prerequisite.mastery == null || prerequisite.mastery < 0.6;
  }).length / prerequisites.length);
  const overdue = mastery ? clamp((now - mastery.nextReviewAt) / (7 * 86400000)) : 0;
  const recentInterest = clamp(mastery?.interestScore ?? 0);
  const lowEvidence = clamp(1 - (mastery?.evidenceCount ?? 0) / 4);
  const total = 0.30 * weakness + 0.20 * prerequisiteGap + 0.20 * clamp(goalRelevance) + 0.15 * overdue + 0.10 * recentInterest + 0.05 * lowEvidence;
  const reasons = [
    weakness >= 0.6 ? '掌握度较弱或未知' : '',
    overdue > 0 ? '已到期' : '',
    prerequisiteGap > 0 ? '前置知识存在缺口' : '',
    lowEvidence > 0.5 ? '诊断证据不足' : '',
    recentInterest > 0.3 ? '近期主动提问过' : '',
  ].filter(Boolean);
  return { topicId: topic.id, total, weakness, prerequisiteGap, goalRelevance: clamp(goalRelevance), overdue, recentInterest, lowEvidence, reasons };
}

function taskType(mastery: Zero2Mastery | undefined, now: number): Zero2ReviewTask['type'] {
  if (mastery && mastery.nextReviewAt <= now) return 'review';
  if (!mastery || mastery.mastery == null) return 'learn';
  return 'quiz';
}

function canSchedule(topic: Zero2CatalogTopic, mastery: Map<string, Zero2Mastery>): boolean {
  return (topic.prerequisiteIds ?? []).every((id) => (mastery.get(id)?.mastery ?? 0) >= 0.6);
}

function makeTask(input: PlanningInput, priority: Zero2TopicPriority, topic: Zero2CatalogTopic, m: Zero2Mastery | undefined, minutes: number, now: number): Zero2ReviewTask {
  const type = taskType(m, now);
  return {
    id: `${input.planId}:${input.date}:${topic.id}:${type}`,
    planId: input.planId,
    topicId: topic.id,
    date: input.date,
    type,
    estimatedMinutes: minutes,
    sourceIds: [topic.id],
    status: 'todo',
    createdAt: 0,
    updatedAt: 0,
    recommendationReason: priority.reasons.join('；') || '按主题优先级安排',
    priority: {
      total: priority.total,
      weakness: priority.weakness,
      prerequisiteGap: priority.prerequisiteGap,
      overdue: priority.overdue,
      recentInterest: priority.recentInterest,
      lowEvidence: priority.lowEvidence,
    },
  };
}

/**
 * 生成可解释、可重复的每日计划。预算上限是 dailyMinutes 的 110%；
 * 候选桶按 40% 到期、30% 薄弱、20% 新知识、10% 自由提问排序，桶不足时
 * 再按总优先级补齐。existingTasks 中已完成/跳过的任务始终原样保留。
 */
export function buildDailyPlan(input: PlanningInput): Zero2ReviewTask[] {
  const mastery = new Map(input.mastery.map((item) => [item.topicId, item]));
  const now = input.now ?? Date.now();
  const priorities = input.topics
    .map((topic) => scoreTopic(topic, mastery.get(topic.id), now, mastery, input.goalRelevance?.[topic.id] ?? 0.5))
    .sort((a, b) => b.total - a.total || a.topicId.localeCompare(b.topicId));
  const budget = Math.max(1, Math.floor(input.dailyMinutes * 1.1));
  const existing = (input.existingTasks ?? []).filter((task) => task.date === input.date);
  const tasks = existing.filter((task) => task.status !== 'todo');
  const existingIds = new Set(existing.map((task) => task.id));
  const existingTopics = new Set(existing.map((task) => task.topicId));
  let used = existing.reduce((sum, task) => sum + task.estimatedMinutes, 0);

  const due = priorities.filter((item) => item.overdue > 0);
  const weak = priorities.filter((item) => item.weakness >= 0.6 && !due.includes(item));
  const fresh = priorities.filter((item) => !mastery.get(item.topicId)?.evidenceCount && !due.includes(item) && !weak.includes(item));
  const free = priorities.filter((item) => !due.includes(item) && !weak.includes(item) && !fresh.includes(item));
  const buckets = [due, weak, fresh, free];
  const targets = [0.4, 0.3, 0.2, 0.1].map((ratio) => Math.max(5, Math.floor(input.dailyMinutes * ratio)));
  const bucketUsed = [0, 0, 0, 0];

  const schedule = (priority: Zero2TopicPriority, bucketIndex: number): boolean => {
    if (used >= budget || bucketUsed[bucketIndex] >= targets[bucketIndex]) return false;
    const topic = input.topics.find((item) => item.id === priority.topicId);
    if (!topic || existingTopics.has(topic.id) || !canSchedule(topic, mastery)) return false;
    const minutes = Math.min(Math.max(5, topic.estimatedMinutes ?? 15), budget - used, Math.max(5, targets[bucketIndex] - bucketUsed[bucketIndex]));
    if (minutes < 5) return false;
    const task = makeTask(input, priority, topic, mastery.get(topic.id), minutes, now);
    if (existingIds.has(task.id)) return false;
    tasks.push(task);
    existingIds.add(task.id);
    existingTopics.add(topic.id);
    used += minutes;
    bucketUsed[bucketIndex] += minutes;
    return true;
  };

  buckets.forEach((bucket, index) => bucket.forEach((priority) => { schedule(priority, index); }));
  for (const priority of priorities) {
    if (used >= budget) break;
    schedule(priority, 3);
  }
  return tasks;
}
