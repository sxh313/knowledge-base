import { describe, expect, it } from 'vitest';
import { buildAdaptivePolicy } from './adaptivePolicy';
import type { Zero2LearningMemory, Zero2Mastery, Zero2ReviewAttempt } from '../db/schema';

const mastery = (value: number, nextReviewAt = 999999) => ({ mastery: value, nextReviewAt } as Zero2Mastery);
const attempt = (score: 0 | 1 | 2 | 3 | 4, mistakeTypes: Zero2ReviewAttempt['mistakeTypes'] = [], answeredAt = 1): Zero2ReviewAttempt => ({ id: crypto.randomUUID(), sessionId: 's', topicId: 'topic', question: 'q', answer: 'a', score, mistakeTypes, evidenceChunkIds: ['c'], answeredAt });

describe('zero2 adaptive policy', () => {
  it('starts with a diagnostic baseline when there is no evidence', () => {
    expect(buildAdaptivePolicy([{ topicId: 'topic', attempts: [] }])).toMatchObject({ mode: 'diagnose', questionType: 'diagnostic', difficulty: 2 });
  });
  it('targets the repeated mistake type when recent performance is weak', () => {
    const policy = buildAdaptivePolicy([{ topicId: 'topic', mastery: mastery(0.35), attempts: [attempt(1, ['boundary'], 3), attempt(2, ['boundary'], 2)] }]);
    expect(policy).toMatchObject({ mode: 'scaffold', questionType: 'boundary' });
    expect(policy.weakPoints).toContain('boundary');
  });
  it('raises the challenge after stable high scores', () => {
    const policy = buildAdaptivePolicy([{ topicId: 'topic', mastery: mastery(0.85), attempts: [attempt(4, [], 3), attempt(4, [], 2), attempt(3, [], 1)] }]);
    expect(policy.mode).toBe('challenge');
    expect(['application', 'comparison', 'boundary']).toContain(policy.questionType);
  });
  it('passes scoped learning memory into the next policy', () => {
    const memories: Zero2LearningMemory[] = [{ id: 'm1', topicId: 'topic', kind: 'preference', content: '学习偏好：先举例，再解释', sourceMessageIds: [], sourceAttemptIds: [], confidence: 1, userConfirmed: true, createdAt: 1, updatedAt: 1 }];
    expect(buildAdaptivePolicy([{ topicId: 'topic', attempts: [] }], 10, memories).learningContext).toMatchObject({ preferences: ['学习偏好：先举例，再解释'] });
  });
});
