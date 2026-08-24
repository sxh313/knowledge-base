import type { ChatMessage } from '../ai/client';

export interface ContextBudgetResult {
  messages: ChatMessage[];
  summary: string;
  summarizedCount: number;
  estimatedTokens: number;
}

/** 保守的跨模型估算：中文约一字一 token，英文约四字符一 token。 */
export function estimateTokens(text: string): number {
  const chinese = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const rest = text.length - chinese;
  return Math.ceil(chinese + rest / 4);
}

export function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + 4 + estimateTokens(message.content), 0);
}

function isToolResult(message: ChatMessage): boolean {
  return message.role === 'user' && message.content.startsWith('以下是只读工具（read/search）返回的结果');
}

/**
 * 将 assistant 的只读工具计划和随后的结果视作不可拆分的一组，避免压缩后
 * 留下无法解释的工具结果。最终保留完整的最近组，其余转为确定性摘要。
 */
function groupsOf(history: ChatMessage[]): ChatMessage[][] {
  const groups: ChatMessage[][] = [];
  for (const message of history) {
    if (isToolResult(message) && groups.length > 0) groups[groups.length - 1].push(message);
    else groups.push([message]);
  }
  return groups;
}

function summarize(messages: ChatMessage[], priorSummary: string): string {
  const lines = messages.map((message) => {
    const label = message.role === 'user' ? '用户' : message.role === 'assistant' ? '助手' : '系统';
    return `- ${label}：${message.content.replace(/\s+/g, ' ').slice(0, 240)}`;
  });
  return [priorSummary.trim(), ...lines].filter(Boolean).join('\n').slice(-6000);
}

export function applyContextBudget(
  history: ChatMessage[],
  options: { system: ChatMessage; current: ChatMessage; priorSummary?: string; maxInputTokens?: number; reservedOutputTokens?: number },
): ContextBudgetResult {
  const maxInput = options.maxInputTokens ?? 12000;
  const reserved = options.reservedOutputTokens ?? 1800;
  const budget = Math.max(1500, maxInput - reserved);
  const groups = groupsOf(history);
  const kept: ChatMessage[][] = [];
  let currentTokens = estimateMessageTokens([options.system, options.current]);
  if (options.priorSummary) currentTokens += estimateTokens(options.priorSummary) + 8;
  for (let i = groups.length - 1; i >= 0; i--) {
    const groupTokens = estimateMessageTokens(groups[i]);
    if (currentTokens + groupTokens > budget) break;
    kept.unshift(groups[i]);
    currentTokens += groupTokens;
  }
  const summarizedGroups = groups.slice(0, Math.max(0, groups.length - kept.length));
  const summarized = summarizedGroups.flat();
  const summary = summarized.length ? summarize(summarized, options.priorSummary ?? '') : (options.priorSummary ?? '');
  const summaryMessage: ChatMessage[] = summary ? [{ role: 'system', content: `以下是本会话已压缩的可靠上下文：\n${summary}` }] : [];
  const messages = [options.system, ...summaryMessage, ...kept.flat(), options.current];
  return { messages, summary, summarizedCount: summarized.length, estimatedTokens: estimateMessageTokens(messages) };
}
