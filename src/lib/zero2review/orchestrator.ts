import { decideZero2Intent } from './intentGate';
import { classifyLocalIntent } from './isolation';
import { retrieveZero2Review } from './retrieval';
import { answerZero2Question } from './tutor';
import { evaluateZero2Answer } from './evaluator';
import { createUnknownMastery, applyEvaluation, recordInterest } from './mastery';
import { createReviewSession, getLatestReviewMessage, getTopicMastery, recordAttempt, saveAcceptedMessage, saveTopicMastery } from './repository';
import type { Zero2ReviewQuestion, Zero2ReviewStage, Zero2TutorResponse } from './types';

export interface OrchestratorState { sessionId: string; stage: Zero2ReviewStage; response?: Zero2TutorResponse; question?: Zero2ReviewQuestion; clarification?: string; error?: string; }

export async function handleZero2Input(input: string, sessionId?: string): Promise<OrchestratorState> {
  const text = input.trim();
  const local = classifyLocalIntent(text);
  if (local === 'out_of_scope') return { sessionId: sessionId ?? '', stage: 'rejected', clarification: '该问题不属于 zero2Agent 复习范围，也不会写入复习记录。' };
  if (local === 'review_command' || local === 'review_meta') return { sessionId: sessionId ?? '', stage: 'complete', clarification: '这是复习控制或帮助请求，不会改变掌握度。' };
  const session = sessionId ? { id: sessionId } : await createReviewSession();
  if (!text) return { sessionId: session.id, stage: 'clarifying', clarification: '请说明你想复习的 zero2Agent 概念或章节。' };
  try {
    const retrieval = await retrieveZero2Review(text);
    const decision = decideZero2Intent(text, retrieval.candidates, retrieval.sufficient);
    if (decision.kind === 'out_of_scope') return { sessionId: session.id, stage: 'rejected', clarification: decision.reason };
    if (decision.kind === 'ambiguous') return { sessionId: session.id, stage: 'clarifying', clarification: decision.clarification };
    if (decision.kind !== 'review_question') return { sessionId: session.id, stage: 'complete', clarification: '这是复习控制或帮助请求，不会改变掌握度。' };
    if (retrieval.citations.length === 0) return { sessionId: session.id, stage: 'clarifying', clarification: '没有可靠的 zero2Agent 来源，请换一个更具体的概念。' };
    const response = await answerZero2Question(text, decision.topicIds, retrieval.chunks);
    await saveAcceptedMessage({ sessionId: session.id, role: 'user', intent: 'review_question', content: text, topicIds: decision.topicIds, citations: response.citations });
    await saveAcceptedMessage({ sessionId: session.id, role: 'assistant', intent: 'review_question', content: response.answer, topicIds: response.topicIds, citations: response.citations, diagnosticQuestion: response.diagnosticQuestion });
    for (const topicId of decision.topicIds) {
      const current = await getTopicMastery(topicId) ?? createUnknownMastery(topicId);
      await saveTopicMastery(recordInterest(current));
    }
    return { sessionId: session.id, stage: response.diagnosticQuestion ? 'awaiting_answer' : 'complete', response, question: response.diagnosticQuestion };
  } catch (error) { return { sessionId: session.id, stage: 'error', error: error instanceof Error ? error.message : '复习流程失败' }; }
}

export async function restoreZero2Session(sessionId: string): Promise<OrchestratorState | null> {
  const message = await getLatestReviewMessage(sessionId);
  if (!message) return null;
  return {
    sessionId,
    stage: message.diagnosticQuestion ? 'awaiting_answer' : 'complete',
    response: message.role === 'assistant' ? { answer: message.content, topicIds: message.topicIds, citations: message.citations.map((citation) => ({ ...citation, source: 'zero2agent' as const })), diagnosticQuestion: message.diagnosticQuestion } : undefined,
    question: message.diagnosticQuestion,
  };
}

export async function submitZero2Answer(state: OrchestratorState, answer: string): Promise<OrchestratorState> {
  if (!state.question || !answer.trim()) return { ...state, stage: 'error', error: '请先提供答案。' };
  try {
    const retrieval = await retrieveZero2Review(state.question.prompt);
    const evaluation = await evaluateZero2Answer(state.question.prompt, answer, retrieval.chunks);
    if (evaluation.evidenceChunkIds.length === 0) return { ...state, stage: 'error', error: '当前没有足够的 zero2Agent 证据，未更新掌握度。' };
    const current = await getTopicMastery(state.question.topicId) ?? createUnknownMastery(state.question.topicId);
    const recorded = await recordAttempt({ sessionId: state.sessionId, topicId: state.question.topicId, question: state.question.prompt, answer, score: evaluation.score, mistakeTypes: evaluation.mistakeTypes, evidenceChunkIds: evaluation.evidenceChunkIds }, `${state.sessionId}:${state.question.id}`);
    if (recorded.created) await saveTopicMastery(applyEvaluation(current, evaluation));
    return { ...state, stage: 'complete', question: undefined, response: state.response ? { ...state.response, diagnosticQuestion: undefined } : undefined };
  } catch (error) { return { ...state, stage: 'error', error: error instanceof Error ? error.message : '评价失败' }; }
}
