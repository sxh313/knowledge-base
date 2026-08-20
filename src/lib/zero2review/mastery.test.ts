import { describe, expect, it } from 'vitest';
import { applyEvaluation, createUnknownMastery, recordInterest } from './mastery';

describe('zero2 mastery isolation', () => {
  it('does not change mastery when the user only asks a question', () => {
    const before = createUnknownMastery('topic');
    expect(recordInterest(before).mastery).toBeNull();
    expect(recordInterest(before).evidenceCount).toBe(0);
  });
  it('updates mastery only with cited evaluation evidence', () => {
    const before = createUnknownMastery('topic');
    const noEvidence = applyEvaluation(before, { score: 4, correctPoints: [], missingPoints: [], mistakeTypes: [], evidenceChunkIds: [], nextQuestionType: 'recall' });
    expect(noEvidence).toEqual(before);
    const after = applyEvaluation(before, { score: 3, correctPoints: ['ok'], missingPoints: [], mistakeTypes: [], evidenceChunkIds: ['chunk-1'], nextQuestionType: 'application' });
    expect(after.mastery).toBeGreaterThan(0);
    expect(after.evidenceCount).toBeGreaterThan(0);
  });
});
