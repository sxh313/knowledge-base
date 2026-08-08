import { describe, it, expect } from 'vitest';
import { scheduleFSRS, type CardState } from './fsrs';

function newCard(): CardState {
  return {
    stability: 1.0,
    difficulty: 5.0,
    nextReviewAt: Date.now(),
    repetitions: 0,
    state: 'new',
  };
}

describe('scheduleFSRS', () => {
  it('新卡评分后应正确进入初始状态', () => {
    const card = newCard();
    const fail = scheduleFSRS(card, 1);
    expect(fail.state).toBe('learning');
    const pass = scheduleFSRS(card, 4);
    expect(pass.state).toBe('review');
  });

  it('复习中答错(rating<3)应进入 relearning（修复前会错误停留在 review）', () => {
    const card: CardState = {
      stability: 5,
      difficulty: 5,
      nextReviewAt: Date.now(),
      repetitions: 3,
      state: 'review',
      lastReviewAt: Date.now() - 86400000,
    };
    expect(scheduleFSRS(card, 2).state).toBe('relearning');
  });

  it('复习中答对(rating>=3)应保持 review', () => {
    const card: CardState = {
      stability: 5,
      difficulty: 5,
      nextReviewAt: Date.now(),
      repetitions: 3,
      state: 'review',
      lastReviewAt: Date.now() - 86400000,
    };
    expect(scheduleFSRS(card, 4).state).toBe('review');
  });

  it('每次复习 repetitions 应 +1', () => {
    expect(scheduleFSRS(newCard(), 3).repetitions).toBe(1);
  });

  it('答对后下次复习时间应延后', () => {
    const card: CardState = {
      stability: 5,
      difficulty: 5,
      nextReviewAt: 1000,
      repetitions: 2,
      state: 'review',
      lastReviewAt: Date.now() - 86400000,
    };
    expect(scheduleFSRS(card, 4).nextReviewAt!).toBeGreaterThan(1000);
  });
});
