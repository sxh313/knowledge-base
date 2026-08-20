import type { Zero2Mastery, Zero2ReviewTask } from '../db/schema';
import type { Zero2CatalogTopic } from './catalog';
import type { Zero2TopicPriority } from './types';

export interface PlanningInput { topics: Zero2CatalogTopic[]; mastery: Zero2Mastery[]; dailyMinutes: number; planId: string; date: string; now?: number; }

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

export function scoreTopic(topic: Zero2CatalogTopic, mastery: Zero2Mastery | undefined, now = Date.now(), allMastery?: Map<string, Zero2Mastery>): Zero2TopicPriority {
  const m = mastery;
  const weakness = m?.mastery == null ? 0.65 : 1 - m.mastery;
  const prerequisites = topic.prerequisiteIds ?? [];
  const prerequisiteGap = prerequisites.length === 0 ? 0 : clamp(prerequisites.filter((id) => {
    const prerequisite = allMastery?.get(id);
    return !prerequisite || prerequisite.mastery == null || prerequisite.mastery < 0.6;
  }).length / prerequisites.length);
  const overdue = m ? clamp((now - m.nextReviewAt) / (7 * 86400000)) : 0;
  const recentInterest = clamp(m?.interestScore ?? 0);
  const lowEvidence = clamp(1 - (m?.evidenceCount ?? 0) / 4);
  const goalRelevance = 0.5;
  const total = 0.30 * weakness + 0.20 * prerequisiteGap + 0.20 * goalRelevance + 0.15 * overdue + 0.10 * recentInterest + 0.05 * lowEvidence;
  const reasons = [weakness >= 0.6 ? '掌握度较弱或未知' : '', overdue > 0 ? '已到期' : '', lowEvidence > 0.5 ? '诊断证据不足' : ''].filter(Boolean);
  return { topicId: topic.id, total, weakness, prerequisiteGap, goalRelevance, overdue, recentInterest, lowEvidence, reasons };
}

export function buildDailyPlan(input: PlanningInput): Zero2ReviewTask[] {
  const mastery = new Map(input.mastery.map((item) => [item.topicId, item]));
  const now = input.now ?? Date.now();
  const priorities = input.topics.map((topic) => scoreTopic(topic, mastery.get(topic.id), now, mastery)).sort((a, b) => b.total - a.total || a.topicId.localeCompare(b.topicId));
  const budget = Math.max(1, Math.floor(input.dailyMinutes * 1.1));
  const tasks: Zero2ReviewTask[] = [];
  let used = 0;
  for (const priority of priorities) {
    if (used >= budget) break;
    const topic = input.topics.find((item) => item.id === priority.topicId)!;
    const minutes = Math.min(Math.max(5, topic.estimatedMinutes ?? 15), budget - used);
    if (minutes < 5) break;
    const m = mastery.get(topic.id);
    const prerequisitesReady = (topic.prerequisiteIds ?? []).every((id) => (mastery.get(id)?.mastery ?? 0) >= 0.6);
    if ((topic.prerequisiteIds ?? []).length > 0 && !prerequisitesReady && priority.prerequisiteGap > 0.5) continue;
    const type = m && m.nextReviewAt <= now ? 'review' : m?.mastery == null ? 'learn' : 'quiz';
    tasks.push({ id: `${input.planId}:${input.date}:${topic.id}:${type}`, planId: input.planId, topicId: topic.id, date: input.date, type, estimatedMinutes: minutes, sourceIds: [topic.id], status: 'todo', createdAt: 0, updatedAt: 0 });
    used += minutes;
  }
  return tasks;
}
