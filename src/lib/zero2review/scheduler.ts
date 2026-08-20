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
  const scheduled = scheduleFSRS(card, ratingForScore(score));
  return { ...mastery, ...scheduled, lastReviewAt: now, updatedAt: now };
}

export function isDue(mastery: Pick<Zero2Mastery, 'nextReviewAt'>, now = Date.now()): boolean {
  return mastery.nextReviewAt <= now;
}
