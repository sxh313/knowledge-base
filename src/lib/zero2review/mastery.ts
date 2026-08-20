import type { Zero2EvaluationDraft } from './types';
import type { Zero2Mastery, Zero2ReviewAttempt } from '../db/schema';
import { scheduleZero2Mastery } from './scheduler';

const WEIGHTS = { recall: 1, comparison: 1.15, boundary: 1.1, application: 1.25, diagnostic: 1 } as const;

export function createUnknownMastery(topicId: string, now = Date.now()): Zero2Mastery {
  return { topicId, mastery: null, confidence: 0, evidenceCount: 0, questionCount: 0, correctCount: 0, interestScore: 0, stability: 0.1, difficulty: 5, nextReviewAt: now, repetitions: 0, state: 'new', updatedAt: now };
}

export function recordInterest(mastery: Zero2Mastery, amount = 1, now = Date.now()): Zero2Mastery {
  return { ...mastery, interestScore: Math.min(1, mastery.interestScore + amount * 0.1), updatedAt: now };
}

export function applyEvaluation(mastery: Zero2Mastery, evaluation: Zero2EvaluationDraft, now = Date.now()): Zero2Mastery {
  if (evaluation.evidenceChunkIds.length === 0) return mastery;
  const weight = WEIGHTS[evaluation.nextQuestionType] ?? 1;
  const evidenceCount = mastery.evidenceCount + weight;
  const answerQuality = evaluation.score / 4;
  const previous = mastery.mastery ?? 0;
  const masteryValue = Math.max(0, Math.min(1, (previous * mastery.evidenceCount + answerQuality * weight) / evidenceCount));
  const confidence = Math.min(1, (mastery.confidence * mastery.evidenceCount + Math.min(1, weight / 1.25) * weight) / evidenceCount);
  const scheduled = scheduleZero2Mastery({ ...mastery, mastery: masteryValue, evidenceCount, confidence, questionCount: mastery.questionCount + 1, correctCount: mastery.correctCount + (evaluation.score >= 3 ? 1 : 0) }, evaluation.score, now);
  return { ...scheduled, interestScore: mastery.interestScore };
}

export function explainMastery(mastery: Zero2Mastery): string {
  if (mastery.mastery === null) return '尚无诊断作答证据，掌握度未知。';
  return `掌握度 ${(mastery.mastery * 100).toFixed(0)}%，置信度 ${(mastery.confidence * 100).toFixed(0)}%，基于 ${mastery.evidenceCount.toFixed(1)} 个证据。`;
}

export function masteryStatus(mastery: Zero2Mastery, now = Date.now()): 'unknown' | 'evidence-insufficient' | 'learning' | 'due' | 'mastered' {
  if (mastery.mastery === null) return 'unknown';
  if (mastery.evidenceCount < 2) return 'evidence-insufficient';
  if (mastery.nextReviewAt <= now) return 'due';
  return mastery.mastery >= 0.8 && mastery.confidence >= 0.7 ? 'mastered' : 'learning';
}

export function explainMasteryWithAttempts(mastery: Zero2Mastery, attempts: Pick<Zero2ReviewAttempt, 'score' | 'answeredAt' | 'evidenceChunkIds'>[], now = Date.now()): string[] {
  const status = masteryStatus(mastery, now);
  const statusText: Record<typeof status, string> = {
    unknown: '尚无诊断作答证据',
    'evidence-insufficient': '已有作答，但证据数量不足以稳定判断',
    learning: '正在学习，仍需要继续练习',
    due: '已到复习时间',
    mastered: '近期掌握度和置信度均达到已掌握阈值',
  };
  const recent = [...attempts].sort((a, b) => b.answeredAt - a.answeredAt).slice(0, 3);
  return [
    statusText[status],
    `累计 ${attempts.length} 次作答、${mastery.evidenceCount.toFixed(1)} 个证据，最近一次评分 ${recent[0]?.score ?? '无'}`,
    ...recent.map((attempt) => `${new Date(attempt.answeredAt).toLocaleDateString('zh-CN')}：${attempt.score}/4，引用 ${attempt.evidenceChunkIds.length} 个来源`),
  ];
}

export function isWeakMastery(mastery: Pick<Zero2Mastery, 'mastery'>): boolean {
  return mastery.mastery === null || mastery.mastery < 0.6;
}

export function isLowEvidence(mastery: Pick<Zero2Mastery, 'evidenceCount'>, minimum = 2): boolean {
  return mastery.evidenceCount < minimum;
}

export function applyManualScore(mastery: Zero2Mastery, score: 0 | 1 | 2 | 3 | 4, now = Date.now()): Zero2Mastery {
  return applyEvaluation(mastery, { score, correctPoints: [], missingPoints: [], mistakeTypes: [], evidenceChunkIds: ['manual-correction'], nextQuestionType: 'diagnostic' }, now);
}

export function recomputeMasteryFromAttempts(topicId: string, attempts: Zero2ReviewAttempt[], now = Date.now()): Zero2Mastery {
  const ordered = attempts.filter((attempt) => attempt.topicId === topicId).sort((a, b) => a.answeredAt - b.answeredAt);
  let mastery = createUnknownMastery(topicId, now);
  for (const attempt of ordered) {
    // 重新计算时沿用原始作答时间，使 FSRS 间隔和历史排序可复现；
    // 最近证据的权重通过一次轻量衰减乘数体现，不会把旧掌握度直接清零。
    const ageDays = Math.max(0, (now - attempt.answeredAt) / 86400000);
    const decay = Math.max(0.35, Math.exp(-ageDays / 180));
    mastery = applyEvaluation(mastery, { score: attempt.score, correctPoints: [], missingPoints: [], mistakeTypes: attempt.mistakeTypes, evidenceChunkIds: attempt.evidenceChunkIds, nextQuestionType: 'diagnostic' }, attempt.answeredAt);
    mastery = { ...mastery, evidenceCount: mastery.evidenceCount * decay, confidence: mastery.confidence * (0.85 + 0.15 * decay) };
  }
  return { ...mastery, updatedAt: now };
}
