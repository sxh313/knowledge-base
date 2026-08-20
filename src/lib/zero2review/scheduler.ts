import { scheduleFSRS, type CardState } from '../algorithms/fsrs';
import type { Zero2Mastery } from '../db/schema';

export type ReviewRating = 1 | 2 | 3 | 4;

export function ratingForScore(score: 0 | 1 | 2 | 3 | 4): ReviewRating {
  return score <= 1 ? 1 : score === 2 ? 2 : score === 3 ? 3 : 4;
}

export function scheduleZero2Mastery(mastery: Zero2Mastery, score: 0 | 1 | 2 | 3 | 4, now = Date.now()): Zero2Mastery {
  const card: CardState = {
    stability: mastery.stability,
    difficulty: mastery.difficulty,
    lastReviewAt: mastery.lastReviewAt,
    nextReviewAt: mastery.nextReviewAt,
    repetitions: mastery.repetitions,
    state: mastery.state,
  };
  const rating = ratingForScore(score);
  const scheduled = scheduleFSRS(card, rating, now);
  // 诊断题答错后给一个当天的短间隔重试点；FSRS 的长期间隔仍保留在
  // stability/repetitions 中，下一次答对后会自然回到 review 状态。
  const shortRetryAt = rating < 3 ? now + 10 * 60 * 1000 : undefined;
  return {
    ...mastery,
    ...scheduled,
    ...(shortRetryAt ? { nextReviewAt: Math.min(scheduled.nextReviewAt ?? shortRetryAt, shortRetryAt) } : {}),
    lastReviewAt: now,
    updatedAt: now,
  };
}

export function isDue(mastery: Pick<Zero2Mastery, 'nextReviewAt'>, now = Date.now()): boolean {
  return mastery.nextReviewAt <= now;
}
