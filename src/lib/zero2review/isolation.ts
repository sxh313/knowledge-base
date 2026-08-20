import type { RetrievedChunk } from '../ai/retrieval';
import type { PersistableReviewMessage, Zero2IntentDecision, Zero2ReviewContext, Zero2ReviewIntent, Zero2SourceReference, Zero2ReviewStage } from './types';

const CONTROL_PATTERNS = [
  /^(今天|现在|当前).{0,8}(复习|学习)/i,
  /^(开始|继续|暂停|结束).{0,8}(复习|学习)/i,
  /(掌握度|薄弱点|学习计划|复习计划|今日任务)/i,
];

const OUT_OF_SCOPE_PATTERNS = [
  /(改|修改|删除|重命名|移动|整理|写入|创建).{0,20}(简历|笔记|文档|知识库|卡片|会话)/i,
  /(天气|股票|新闻|价格|请假|邮件|祝福|翻译|普通写作|写一篇|润色|改写)/i,
  /(忽略|绕过|关闭|切换|调用).{0,20}(规则|确认|权限|安全|个人知识库|删除工具|工具)/i,
];

export function classifyLocalIntent(question: string): Zero2ReviewIntent | null {
  const text = question.trim();
  if (!text) return 'ambiguous';
  if (OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(text))) return 'out_of_scope';
  if (CONTROL_PATTERNS.some((pattern) => pattern.test(text))) return 'review_command';
  if (/^(你能做什么|怎么使用|帮助|使用说明)/i.test(text)) return 'review_meta';
  return null;
}

export function rejectOutOfScope(question: string): Zero2IntentDecision | null {
  if (classifyLocalIntent(question) !== 'out_of_scope') return null;
  return {
    kind: 'out_of_scope',
    topicIds: [],
    confidence: 1,
    reason: '该问题不属于 zero2Agent 复习范围，也不会写入复习记录。',
  };
}

export function assertZero2Sources(chunks: RetrievedChunk[]): void {
  if (chunks.some((chunk) => chunk.source !== 'zero2agent' || chunk.journalId || chunk.sourceUrl && !chunk.path)) {
    throw new Error('复习上下文包含非 zero2Agent 来源');
  }
}

export function assertValidTopicIds(topicIds: string[], validTopicIds: ReadonlySet<string>): void {
  if (topicIds.some((id) => !validTopicIds.has(id))) throw new Error('复习上下文包含非法 topicId');
}

export function sanitizeReviewContext(context: Zero2ReviewContext, validTopicIds: ReadonlySet<string>): Zero2ReviewContext {
  assertValidTopicIds(context.topicCandidates.map((candidate) => candidate.topicId), validTopicIds);
  const citations = context.citations.filter((citation) => citation.source === 'zero2agent');
  if (citations.length !== context.citations.length) throw new Error('复习上下文包含非法 Citation');
  return { ...context, question: context.question.trim(), citations };
}

export function filterPersistableMessages(messages: PersistableReviewMessage[]): PersistableReviewMessage[] {
  return messages.filter((message) => {
    if (!message.content.trim()) return false;
    return message.citations.every((citation) => citation.source === 'zero2agent');
  });
}

export function assertReviewIsolation(input: { context?: unknown; plan?: unknown; task?: unknown; stage?: Zero2ReviewStage }): void {
  const serialized = JSON.stringify(input);
  if (/journalId|personal|web/i.test(serialized)) throw new Error('复习数据包含个人文档或 Web 字段');
}

export function assertCitationAllowList(citations: Zero2SourceReference[], allowedChunkIds: Set<string>): Zero2SourceReference[] {
  return citations.filter((citation) => citation.source === 'zero2agent' && allowedChunkIds.has(citation.chunkId));
}

export function isLearningAffectingIntent(intent: Zero2ReviewIntent): boolean {
  return intent === 'review_question';
}

export function shouldPersistMessage(decision: Zero2IntentDecision): boolean {
  return decision.kind === 'review_question' || decision.kind === 'review_command' || decision.kind === 'review_meta';
}
