import type { Zero2TopicCandidate, Zero2IntentDecision } from './types';
import { classifyLocalIntent, rejectOutOfScope } from './isolation';

export function decideZero2Intent(
  question: string,
  candidates: Zero2TopicCandidate[],
  sufficient: boolean,
): Zero2IntentDecision {
  const local = classifyLocalIntent(question);
  if (local === 'out_of_scope') return rejectOutOfScope(question) as Zero2IntentDecision;
  if (local === 'review_command' || local === 'review_meta') {
    return { kind: local, topicIds: [], confidence: 1, reason: '本地复习控制命令' };
  }
  if (!question.trim() || !sufficient || candidates.length === 0) {
    return {
      kind: 'ambiguous',
      topicIds: [],
      confidence: 0,
      reason: '没有检索到足够的 zero2Agent 资料',
      clarification: '请说明你想复习 zero2Agent 的哪个概念、模块或章节。',
    };
  }
  const top = candidates[0];
  if (top.confidence < 0.08) {
    return {
      kind: 'ambiguous',
      topicIds: [],
      confidence: top.confidence,
      reason: '检索结果相关性不足',
      clarification: '这个问题和多个主题的关联都不够明确，请补充具体概念或章节。',
    };
  }
  return {
    kind: 'review_question',
    topicIds: candidates.slice(0, 3).map((candidate) => candidate.topicId),
    confidence: Math.min(0.99, Math.max(0.1, top.confidence)),
    reason: `命中 zero2Agent 主题，最高相关度 ${top.score.toFixed(2)}`,
  };
}
