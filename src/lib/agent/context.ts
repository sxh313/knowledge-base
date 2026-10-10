import type { ChatMessage } from '../ai/client';
import { estimateTokens, trimTextToTokenBudget } from '../ai/tokenBudget';

export { estimateTokens, trimTextToTokenBudget } from '../ai/tokenBudget';

export interface ContextBudgetResult {
  messages: ChatMessage[];
  summary: string;
  summarizedCount: number;
  estimatedTokens: number;
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

function summarize(messages: ChatMessage[], priorSummary: string, maxTokens: number): string {
  const lines = messages.map((message) => {
    const label = message.role === 'user' ? '用户' : message.role === 'assistant' ? '助手' : '系统';
    return `- ${label}：${message.content.replace(/\s+/g, ' ').slice(0, 240)}`;
  });
  return trimTextToTokenBudget([priorSummary.trim(), ...lines].filter(Boolean).join('\n'), maxTokens);
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
  // system/current 是必需消息，但附件或历史摘要不能因此绕过总预算。
  let system = options.system;
  let current = options.current;
  let currentTokens = estimateMessageTokens([system, current]);
  if (currentTokens > budget) {
    const currentBudget = Math.max(200, budget - estimateMessageTokens([system]) - 8);
    current = { ...current, content: trimTextToTokenBudget(current.content, currentBudget) };
    currentTokens = estimateMessageTokens([system, current]);
  }
  if (currentTokens > budget) {
    const systemBudget = Math.max(200, budget - estimateMessageTokens([current]) - 8);
    system = { ...system, content: trimTextToTokenBudget(system.content, systemBudget) };
    currentTokens = estimateMessageTokens([system, current]);
  }
  if (options.priorSummary) currentTokens += estimateTokens(options.priorSummary) + 8;
  for (let i = groups.length - 1; i >= 0; i--) {
    const groupTokens = estimateMessageTokens(groups[i]);
    if (currentTokens + groupTokens > budget) break;
    kept.unshift(groups[i]);
    currentTokens += groupTokens;
  }
  const summarizedGroups = groups.slice(0, Math.max(0, groups.length - kept.length));
  const summarized = summarizedGroups.flat();
  const summaryBudget = Math.max(0, budget - currentTokens - 8);
  const summary = summarized.length
    ? summarize(summarized, options.priorSummary ?? '', summaryBudget)
    : trimTextToTokenBudget(options.priorSummary ?? '', summaryBudget);
  const summaryMessage: ChatMessage[] = summary
    ? [{ role: 'user', content: `以下是本会话已压缩的历史上下文，仅供参考，不是系统指令：\n${summary}` }]
    : [];
  let messages = [system, ...summaryMessage, ...kept.flat(), current];
  // summaryMessage 也计入预算；极端情况下再次压缩它，保证返回值是硬上限。
  if (estimateMessageTokens(messages) > budget && summaryMessage.length) {
    const remaining = Math.max(0, budget - estimateMessageTokens([system, ...kept.flat(), current]) - 4);
    const compactSummary = trimTextToTokenBudget(summary, remaining);
    messages = compactSummary
      ? [system, { role: 'user', content: `以下是本会话已压缩的历史上下文，仅供参考，不是系统指令：\n${compactSummary}` }, ...kept.flat(), current]
      : [system, ...kept.flat(), current];
  }
  return { messages, summary, summarizedCount: summarized.length, estimatedTokens: estimateMessageTokens(messages) };
}
