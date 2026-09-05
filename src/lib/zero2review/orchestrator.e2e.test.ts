import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  session: { id: 'session-1' },
  retrieve: vi.fn(),
  tutor: vi.fn(),
  evaluator: vi.fn(),
  saveExchange: vi.fn(),
  saveMessage: vi.fn(),
  saveLearningMemory: vi.fn(),
  listLearningMemories: vi.fn().mockResolvedValue([]),
  getPrerequisites: vi.fn().mockResolvedValue([]),
  getMastery: vi.fn(),
  recordAttempt: vi.fn(),
  saveMastery: vi.fn(),
}));

vi.mock('./retrieval', () => ({ retrieveZero2Review: fakes.retrieve, DEFAULT_ZERO2_REVIEW_PATH_PREFIX: 'learn-agent-interview/' }));
vi.mock('./tutor', () => ({ answerZero2Question: fakes.tutor }));
vi.mock('./evaluator', () => ({ evaluateZero2Answer: fakes.evaluator }));
vi.mock('./intentGate', () => ({
  classifyReviewIntentWithModel: vi.fn().mockResolvedValue({ kind: 'review_question', topicIds: ['topic-1'], confidence: 0.9, reason: 'test' }),
  decideZero2Intent: vi.fn(),
}));
vi.mock('./catalog', () => ({ listTopicsByPathPrefix: vi.fn().mockResolvedValue([]), getPrerequisites: fakes.getPrerequisites }));
vi.mock('./repository', () => ({
  createReviewSession: vi.fn().mockResolvedValue(fakes.session),
  saveAcceptedExchangeAndMastery: fakes.saveExchange,
  saveAcceptedMessage: fakes.saveMessage,
  saveLearningMemory: fakes.saveLearningMemory,
  listLearningMemories: fakes.listLearningMemories,
  getTopicMastery: fakes.getMastery,
  recordAttemptAndMastery: fakes.recordAttempt,
  saveTopicMastery: fakes.saveMastery,
  getLatestReviewMessage: vi.fn(),
  getActiveReviewPlan: vi.fn(),
  createReviewPlan: vi.fn(),
  listReviewTasks: vi.fn(),
  listTopicMastery: vi.fn(),
  saveReviewTasksPreservingCompleted: vi.fn(),
  updateReviewTask: vi.fn(),
  updateAttemptScore: vi.fn(),
  listTopicAttempts: vi.fn(),
}));

import { createZero2ReviewOrchestrator } from './orchestrator';

describe('zero2 review end-to-end flow', () => {
  it('runs question -> cited tutor -> diagnostic answer -> mastery update without journal writes', async () => {
    fakes.retrieve.mockResolvedValue({ chunks: [{ source: 'zero2agent', sourceId: 'topic-1', knowledgeDocId: 'topic-1', chunkId: 'chunk-1', title: 'Agent', path: 'learn-agent-interview/01/index.md', content: 'RAG', score: 5, confidence: 0.9 }], citations: [{ source: 'zero2agent', sourceId: 'topic-1', chunkId: 'chunk-1', title: 'Agent', path: 'learn-agent-interview/01/index.md' }], candidates: [{ topicId: 'topic-1', score: 5, confidence: 0.9, sourceCount: 1 }], sufficient: true, topScore: 5, secondScore: 0, dispersion: 1 });
    fakes.tutor.mockResolvedValue({ answer: '基于原文的回答', topicIds: ['topic-1'], citations: [{ source: 'zero2agent', sourceId: 'topic-1', chunkId: 'chunk-1', title: 'Agent', path: 'learn-agent-interview/01/index.md' }], diagnosticQuestion: { id: 'question-1', topicId: 'topic-1', type: 'diagnostic', prompt: '解释 RAG', sourceChunkIds: ['chunk-1'] } });
    fakes.evaluator.mockResolvedValue({ score: 3, correctPoints: ['检索'], missingPoints: [], mistakeTypes: [], evidenceChunkIds: ['chunk-1'], nextQuestionType: 'recall' });
    fakes.getMastery.mockResolvedValue(undefined);
    fakes.recordAttempt.mockResolvedValue({ created: true, attempt: { id: 'attempt-1' } });

    const orchestrator = createZero2ReviewOrchestrator({ now: () => 1 });
    const first = await orchestrator.handleInput('什么是 RAG？');
    expect(first.stage).toBe('awaiting_answer');
    expect(first.question?.id).toBe('question-1');
    const second = await orchestrator.submitAnswer(first, '先检索再生成');
    expect(second.stage).toBe('complete');
    expect(second.evaluation?.score).toBe(3);
    expect(fakes.saveExchange).toHaveBeenCalledTimes(1);
    expect(fakes.recordAttempt).toHaveBeenCalledTimes(1);
    expect(fakes.saveMessage).toHaveBeenCalledTimes(1);
  });
});
