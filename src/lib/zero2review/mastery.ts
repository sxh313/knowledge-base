import type { Zero2EvaluationDraft } from './types';
import type { Zero2Mastery } from '../db/schema';
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
