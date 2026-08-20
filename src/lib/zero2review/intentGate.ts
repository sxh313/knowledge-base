import type { Zero2TopicCandidate, Zero2IntentDecision } from './types';
import { classifyLocalIntent, rejectOutOfScope } from './isolation';
import { routeBoundAI } from '../ai/router';
import type { ChatMessage } from '../ai/client';

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

/** 可选的模型分类器：模型只能在本地召回候选中选择 topic，不能创造来源或改变边界。 */
export async function classifyReviewIntentWithModel(
  question: string,
  candidates: Zero2TopicCandidate[],
  sufficient: boolean,
): Promise<Zero2IntentDecision> {
  const local = classifyLocalIntent(question);
  if (local === 'out_of_scope') return rejectOutOfScope(question) as Zero2IntentDecision;
  if (local === 'review_command' || local === 'review_meta') return { kind: local, topicIds: [], confidence: 1, reason: '本地复习控制命令' };
  const fallback = decideZero2Intent(question, candidates, sufficient);
  if (!sufficient || candidates.length === 0) return fallback;
  const allowed = new Set(candidates.map((candidate) => candidate.topicId));
  const messages: ChatMessage[] = [
    { role: 'system', content: '你是复习范围分类器。只能从候选 topicId 中选择，不能编造 ID。只输出 JSON：{"kind":"review_question|ambiguous|out_of_scope","topicIds":[],"confidence":0,"reason":""}。' },
    { role: 'user', content: `问题：${question}\n候选：${JSON.stringify(candidates)}` },
  ];
  try {
    const result = await routeBoundAI('queryRewriteModelId', 'qa', messages);
    const raw = result.content.match(/\{[\s\S]*\}/)?.[0];
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : null;
    const kind = ['review_question', 'ambiguous', 'out_of_scope'].includes(String(parsed?.kind)) ? parsed?.kind as Zero2IntentDecision['kind'] : fallback.kind;
    const topicIds = Array.isArray(parsed?.topicIds) ? parsed.topicIds.filter((id): id is string => typeof id === 'string' && allowed.has(id)) : [];
    if (kind === 'review_question' && topicIds.length === 0) return fallback;
    if (kind === 'out_of_scope') return { kind, topicIds: [], confidence: 1, reason: '模型判断为复习范围外，且本地来源闸门未发现对应主题。' };
    if (kind === 'ambiguous') return { kind, topicIds: [], confidence: Math.max(0, Math.min(1, Number(parsed?.confidence) || 0)), reason: typeof parsed?.reason === 'string' ? parsed.reason : '模型无法确定主题', clarification: '请补充具体的 zero2Agent 概念或章节。' };
    return { kind, topicIds, confidence: Math.max(0, Math.min(1, Number(parsed?.confidence) || fallback.confidence)), reason: typeof parsed?.reason === 'string' ? parsed.reason : fallback.reason };
  } catch {
    return fallback;
  }
}
