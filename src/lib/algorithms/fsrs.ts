export interface CardState {
  stability: number;
  difficulty: number;
  lastReviewAt?: number;
  nextReviewAt: number;
  repetitions: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
}

type Rating = 1 | 2 | 3 | 4;

const W = [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 0.05, 0.34, 1.26, 0.29, 2.61];

function initStability(r: Rating): number {
  return Math.max(0.1, W[r - 1]);
}
function initDifficulty(r: Rating): number {
  return Math.min(10, Math.max(1, W[4] - (r - 1) * W[5]));
}
function nextDifficulty(d: number, r: Rating): number {
  return Math.min(10, Math.max(1, d + (-W[6] * (r - 1) + W[7])));
}
function nextStability(s: number, d: number, r: Rating, elapsed: number): number {
  if (r < 3) return Math.min(s / Math.exp(W[8] * (r === 1 ? 1 : 2)), W[9]);
  return s * (1 + W[10] * Math.exp(W[11] * (10 - d)) * Math.pow(elapsed, -W[12]) * (1 + (r === 4 ? W[15] : 1)));
}

export function scheduleFSRS(card: CardState, rating: Rating, now = Date.now()): Partial<CardState> {
  const elapsed = card.lastReviewAt
    ? Math.max(1, Math.floor((now - card.lastReviewAt) / 86400000))
    : 1;

  let { stability, difficulty, state, repetitions } = card;

  if (state === 'new') {
    stability = initStability(rating);
    difficulty = initDifficulty(rating);
    state = rating < 3 ? 'learning' : 'review';
  } else {
    const ps = stability, pd = difficulty;
    difficulty = nextDifficulty(pd, rating);
    stability = nextStability(ps, pd, rating, elapsed);
    // 根据评分迁移状态：答错（rating<3）进入重学，答对（rating>=3）进入/保持复习
    state = rating < 3 ? 'relearning' : 'review';
  }

  // FSRS power forgetting curve: R(t) = (1 + t/(9*S))^(-1)
  // Solve for t when R = 0.9 (target retention 90%):
  //   0.9 = (1 + t/(9*S))^(-1)  =>  t = S
  // So the optimal interval (in days) equals stability.
  const safeStability = Math.max(0.1, stability);
  const interval = Math.max(1, Math.round(safeStability));

  repetitions += 1;

  return {
    stability,
    difficulty,
    lastReviewAt: now,
    nextReviewAt: now + interval * 86400000,
    repetitions,
    state,
  };
}
