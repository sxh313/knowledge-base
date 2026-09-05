import type { Zero2LearningMemory, Zero2Mastery, Zero2ReviewAttempt } from '../db/schema';
import type { Zero2AdaptivePolicy, Zero2LearningContext, Zero2MistakeType, Zero2ReviewQuestion } from './types';

interface AdaptiveTopicInput {
  topicId: string;
  mastery?: Zero2Mastery;
  attempts: Zero2ReviewAttempt[];
}

const MISTAKE_TO_QUESTION: Record<Zero2MistakeType, Zero2ReviewQuestion['type']> = {
  concept: 'recall', boundary: 'boundary', comparison: 'comparison', application: 'application', terminology: 'recall',
};

function clampDifficulty(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
}

function buildLearningContext(memories: Zero2LearningMemory[], topicIds: string[], attempts: Zero2ReviewAttempt[]): Zero2LearningContext {
  const relevant = memories.filter((memory) => !memory.deletedAt && (!memory.topicId || topicIds.includes(memory.topicId)));
  const values = (kind: Zero2LearningMemory['kind']) => relevant.filter((memory) => memory.kind === kind).slice(0, 5).map((memory) => memory.content);
  const lastReviewedAt = attempts.reduce<number | undefined>((latest, attempt) => {
    const answeredAt = attempt.answeredAt ?? 0;
    return latest === undefined || answeredAt > latest ? answeredAt : latest;
  }, undefined);
  return {
    weakPoints: values('weak_point'),
    preferences: values('preference'),
    prerequisites: values('prerequisite'),
    confirmedMastery: values('mastery'),
    lastReviewedAt: lastReviewedAt && lastReviewedAt > 0 ? lastReviewedAt : undefined,
  };
}

export function buildAdaptivePolicy(topics: AdaptiveTopicInput[], now = Date.now(), memories: Zero2LearningMemory[] = []): Zero2AdaptivePolicy {
  const attempts = topics.flatMap((topic) => topic.attempts).sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0));
  const recent = attempts.slice(0, 5);
  const recentScores: number[] = recent.map((attempt) => attempt.score);
  const mistakeCounts = new Map<Zero2MistakeType, number>();
  recent.forEach((attempt) => (attempt.mistakeTypes ?? []).forEach((mistake) => mistakeCounts.set(mistake, (mistakeCounts.get(mistake) ?? 0) + 1)));
  const weakPoints = [...mistakeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([mistake]) => mistake).slice(0, 2);
  const average = recent.length ? recentScores.reduce((sum, score) => sum + score, 0) / recent.length : 0;
  const masteryValues = topics.map(({ mastery }) => mastery?.mastery).filter((value): value is number => typeof value === 'number');
  const mastery = masteryValues.length ? masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length : null;
  const due = topics.some(({ mastery: item }) => item && item.nextReviewAt <= now);
  const learningContext = buildLearningContext(memories, topics.map((topic) => topic.topicId), attempts);
  const withContext = (policy: Zero2AdaptivePolicy): Zero2AdaptivePolicy => ({ ...policy, learningContext });

  if (!recent.length || mastery === null) return withContext({ mode: 'diagnose', questionType: 'diagnostic', difficulty: 2, rationale: '当前主题缺少稳定作答证据，先通过诊断题建立基线。', weakPoints, recentScores });
  if (average < 2 || (weakPoints.length > 0 && average < 3)) {
    const questionType = weakPoints.length ? MISTAKE_TO_QUESTION[weakPoints[0]] : 'recall';
    return withContext({ mode: 'scaffold', questionType, difficulty: clampDifficulty((mastery ?? 0.4) * 4), rationale: due ? '最近表现偏弱且已到复习时间，先补薄弱点再提高难度。' : '最近作答暴露出薄弱点，先降低难度并针对错误类型练习。', weakPoints, recentScores });
  }
  if (average >= 3.5 && (mastery ?? 0) >= 0.7) return withContext({ mode: 'challenge', questionType: weakPoints[0] ? MISTAKE_TO_QUESTION[weakPoints[0]] : 'application', difficulty: clampDifficulty(3 + (mastery ?? 0) * 2), rationale: '最近作答稳定且掌握度较高，切换到迁移和边界题检验真正理解。', weakPoints, recentScores });
  return withContext({ mode: 'reinforce', questionType: weakPoints[0] ? MISTAKE_TO_QUESTION[weakPoints[0]] : 'comparison', difficulty: clampDifficulty(2 + (mastery ?? 0) * 2), rationale: due ? '主题已到复习时间，使用对比题巩固并检查遗忘。' : '继续巩固当前主题，并逐步增加题目复杂度。', weakPoints, recentScores });
}
