import { classifyReviewIntentWithModel, decideZero2Intent } from './intentGate';
import { classifyLocalIntent } from './isolation';
import { retrieveZero2Review, DEFAULT_ZERO2_REVIEW_PATH_PREFIX, type Zero2ReviewRetrieval } from './retrieval';
import { answerZero2Question } from './tutor';
import { evaluateZero2Answer } from './evaluator';
import { createUnknownMastery, applyEvaluation, recordInterest, recomputeMasteryFromAttempts } from './mastery';
import { buildDailyPlan } from './planner';
import { getPrerequisites, listTopicsByPathPrefix } from './catalog';
import { createReviewPlan, createReviewSession, getActiveReviewPlan, getLatestReviewMessage, getTopicMastery, listLearningMemories, listReviewTasks, listTopicMastery, listTopicAttempts, recordAttemptAndMastery, saveAcceptedExchangeAndMastery, saveAcceptedMessage, saveLearningMemory, saveReviewTasksPreservingCompleted, saveTopicMastery, softDeleteReviewTask, updateAttemptScore, updateReviewTask } from './repository';
import type { Zero2AdaptivePolicy, Zero2EvaluationDraft, Zero2ReviewQuestion, Zero2ReviewStage, Zero2TutorResponse } from './types';
import { buildAdaptivePolicy } from './adaptivePolicy';
import type { Zero2ReviewTask } from '../db/schema';
import type { Zero2Mastery } from '../db/schema';

export interface OrchestratorState { sessionId: string; stage: Zero2ReviewStage; response?: Zero2TutorResponse; question?: Zero2ReviewQuestion; adaptivePolicy?: Zero2AdaptivePolicy; evaluation?: Zero2EvaluationDraft; attemptId?: string; clarification?: string; error?: string; }
export interface Zero2ReviewDependencies { retrieve: (question: string) => Promise<Zero2ReviewRetrieval>; tutor: typeof answerZero2Question; evaluator: typeof evaluateZero2Answer; now: () => number; }
export interface Zero2ReviewInputOptions { readOnly?: boolean; }
const defaults: Zero2ReviewDependencies = { retrieve: retrieveZero2Review, tutor: answerZero2Question, evaluator: evaluateZero2Answer, now: () => Date.now() };

export function createZero2ReviewOrchestrator(overrides: Partial<Zero2ReviewDependencies> = {}) {
  const deps = { ...defaults, ...overrides };
  async function handleInput(input: string, sessionId?: string, options: Zero2ReviewInputOptions = {}): Promise<OrchestratorState> {
    const text = input.trim();
    const local = classifyLocalIntent(text);
    if (local === 'out_of_scope') return { sessionId: sessionId ?? '', stage: 'rejected', clarification: '该问题不属于 zero2Agent 复习范围，也不会写入复习记录。' };
    if (local === 'review_command' || local === 'review_meta') return { sessionId: sessionId ?? '', stage: 'complete', clarification: '这是复习控制或帮助请求，不会改变掌握度。' };
    // 在问题通过来源闸门前不创建 Session，保证空问题/模糊问题不会写入学习数据。
    if (!text) return { sessionId: sessionId ?? '', stage: 'clarifying', clarification: '请说明你想复习的 zero2Agent 概念或章节。' };
    try {
      const retrieval = await deps.retrieve(text);
      // 本地检索先做硬闸门；有可靠候选时再让模型做结构化 topic 分类，
      // 模型失败或返回非法 ID 会自动回退到确定性的本地裁决。
      const decision = retrieval.sufficient
        ? await classifyReviewIntentWithModel(text, retrieval.candidates, retrieval.sufficient)
        : decideZero2Intent(text, retrieval.candidates, retrieval.sufficient);
      if (decision.kind === 'out_of_scope') return { sessionId: sessionId ?? '', stage: 'rejected', clarification: decision.reason };
      if (decision.kind === 'ambiguous') return { sessionId: sessionId ?? '', stage: 'clarifying', clarification: decision.clarification };
      if (decision.kind !== 'review_question') return { sessionId: sessionId ?? '', stage: 'complete', clarification: '这是复习控制或帮助请求，不会改变掌握度。' };
      if (retrieval.citations.length === 0) return { sessionId: sessionId ?? '', stage: 'clarifying', clarification: '没有可靠的 zero2Agent 来源，请换一个更具体的概念。' };
      const session = sessionId ? { id: sessionId } : await createReviewSession();
      const [masteryRecords, topicAttempts] = await Promise.all([
        Promise.all(decision.topicIds.map((topicId) => getTopicMastery(topicId))),
        Promise.all(decision.topicIds.map((topicId) => listTopicAttempts(topicId))),
      ]);
      const memories = await listLearningMemories();
      const adaptivePolicy = buildAdaptivePolicy(
        decision.topicIds.map((topicId, index) => ({ topicId, mastery: masteryRecords[index], attempts: topicAttempts[index] ?? [] })),
        deps.now(),
        memories,
      );
      const tutorResponse = await deps.tutor(text, decision.topicIds, retrieval.chunks, adaptivePolicy);
      const response = options.readOnly ? { ...tutorResponse, diagnosticQuestion: undefined } : tutorResponse;
      const interestMastery: Zero2Mastery[] = [];
      for (const topicId of decision.topicIds) {
        const current = await getTopicMastery(topicId) ?? createUnknownMastery(topicId, deps.now());
        interestMastery.push(recordInterest(current, 1, deps.now()));
      }
      await saveAcceptedExchangeAndMastery(
        { sessionId: session.id, role: 'user', intent: 'review_question', content: text, topicIds: decision.topicIds, citations: response.citations },
        { sessionId: session.id, role: 'assistant', intent: 'review_question', content: response.answer, topicIds: response.topicIds, citations: response.citations, diagnosticQuestion: response.diagnosticQuestion },
        interestMastery,
      );
      return { sessionId: session.id, stage: response.diagnosticQuestion ? 'awaiting_answer' : 'complete', response, question: response.diagnosticQuestion, adaptivePolicy };
    } catch (error) { return { sessionId: sessionId ?? '', stage: 'error', error: error instanceof Error ? error.message : '复习流程失败' }; }
  }
  async function submitAnswer(state: OrchestratorState, answer: string): Promise<OrchestratorState> {
    if (!state.question || !answer.trim()) return { ...state, stage: 'error', error: '请先提供答案。' };
    try {
      const retrieval = await deps.retrieve(state.question.prompt);
      const evaluation = await deps.evaluator(state.question.prompt, answer, retrieval.chunks);
      if (evaluation.evidenceChunkIds.length === 0) return { ...state, stage: 'error', error: '当前没有足够的 zero2Agent 证据，未更新掌握度。' };
      const current = await getTopicMastery(state.question.topicId) ?? createUnknownMastery(state.question.topicId, deps.now());
      const recorded = await recordAttemptAndMastery({ sessionId: state.sessionId, topicId: state.question.topicId, question: state.question.prompt, answer, score: evaluation.score, mistakeTypes: evaluation.mistakeTypes, evidenceChunkIds: evaluation.evidenceChunkIds }, applyEvaluation(current, evaluation, deps.now()), `${state.sessionId}:${state.question.id}`);
      if (recorded.created) {
        const coachMessage = await saveAcceptedMessage({
          sessionId: state.sessionId,
          role: 'coach',
          intent: 'review_question',
          content: `本次作答评分：${evaluation.score}/4。${evaluation.missingPoints.join('；')}`,
          topicIds: [state.question.topicId],
          citations: retrieval.citations.filter((citation) => evaluation.evidenceChunkIds.includes(citation.chunkId)),
        });
        const weakPoints = evaluation.missingPoints.length > 0
          ? evaluation.missingPoints
          : evaluation.mistakeTypes.map((mistake) => `需要加强${mistake}类型的理解`);
        for (const point of weakPoints.slice(0, 5)) {
          await saveLearningMemory({
            topicId: state.question.topicId,
            kind: 'weak_point',
            content: `待加强：${point}`,
            sourceMessageIds: [coachMessage.id],
            sourceAttemptIds: [recorded.attempt.id],
            confidence: Math.max(0.35, 1 - evaluation.score / 5),
          });
        }
        if (evaluation.score <= 1) {
          const prerequisites = await getPrerequisites(state.question.topicId);
          for (const prerequisite of prerequisites.slice(0, 3)) {
            await saveLearningMemory({
              topicId: prerequisite.id,
              kind: 'prerequisite',
              content: `可能需要先复习前置主题：${prerequisite.title}`,
              sourceMessageIds: [coachMessage.id],
              sourceAttemptIds: [recorded.attempt.id],
              confidence: 0.55,
            });
          }
        }
      }
      const adaptivePolicy = buildAdaptivePolicy([{ topicId: state.question.topicId, mastery: applyEvaluation(current, evaluation, deps.now()), attempts: [...((await listTopicAttempts(state.question.topicId)) ?? []), recorded.attempt] }], deps.now(), await listLearningMemories());
      return { ...state, stage: 'complete', question: undefined, evaluation, attemptId: recorded.attempt.id, adaptivePolicy, response: state.response ? { ...state.response, diagnosticQuestion: undefined } : undefined };
    } catch (error) { return { ...state, stage: 'error', error: error instanceof Error ? error.message : '评价失败' }; }
  }
  async function rebuildPlan(dailyMinutes: number, date: string, goalId?: string): Promise<Zero2ReviewTask[]> {
    const resolvedGoalId = goalId ?? 'learn-agent-interview';
    const plan = await getActiveReviewPlan(resolvedGoalId) ?? await createReviewPlan({ goalId: resolvedGoalId, title: 'Agent 面试通关每日复习', dailyMinutes, startDate: date, topicIds: [], status: 'active', version: 1 });
    const [topics, mastery] = await Promise.all([listTopicsByPathPrefix(DEFAULT_ZERO2_REVIEW_PATH_PREFIX), listTopicMastery()]);
    const existingTasks = await listReviewTasks(plan.id, date);
    const tasks = buildDailyPlan({ topics, mastery, dailyMinutes, planId: plan.id, date, now: deps.now(), existingTasks });
    await saveReviewTasksPreservingCompleted(tasks);
    return tasks;
  }
  async function startReview(): Promise<OrchestratorState> {
    const session = await createReviewSession('Agent 面试通关每日复习');
    return { sessionId: session.id, stage: 'idle' };
  }
  async function continueReview(sessionId: string): Promise<OrchestratorState | null> {
    return restoreZero2Session(sessionId);
  }
  return { handleInput, startReview, continueReview, submitAnswer, rebuildPlan, skipTask, finishTask };
}

const defaultOrchestrator = createZero2ReviewOrchestrator();
export const handleZero2Input = defaultOrchestrator.handleInput;
export const submitZero2Answer = defaultOrchestrator.submitAnswer;

export async function restoreZero2Session(sessionId: string): Promise<OrchestratorState | null> {
  const message = await getLatestReviewMessage(sessionId);
  if (!message) return null;
  return { sessionId, stage: message.diagnosticQuestion ? 'awaiting_answer' : 'complete', response: message.role === 'assistant' ? { answer: message.content, topicIds: message.topicIds, citations: message.citations.map((citation) => ({ ...citation, source: 'zero2agent' as const })), diagnosticQuestion: message.diagnosticQuestion } : undefined, question: message.diagnosticQuestion };
}
export async function skipTask(taskId: string): Promise<void> { await updateReviewTask(taskId, { status: 'skipped' }); }
export async function finishTask(taskId: string): Promise<void> { await updateReviewTask(taskId, { status: 'done' }); }
export async function deleteTask(taskId: string): Promise<void> { await softDeleteReviewTask(taskId); }

export async function correctAttemptScore(topicId: string, attemptId: string, score: 0 | 1 | 2 | 3 | 4): Promise<void> {
  await updateAttemptScore(attemptId, score);
  const attempts = await listTopicAttempts(topicId);
  await saveTopicMastery(recomputeMasteryFromAttempts(topicId, attempts));
}
