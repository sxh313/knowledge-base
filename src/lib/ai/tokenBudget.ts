/** 保守的跨模型估算：中文约一字一 token，英文约四字符一 token。 */
export function estimateTokens(text: string): number {
  const chinese = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const rest = text.length - chinese;
  return Math.ceil(chinese + rest / 4);
}

/** 以近似 token 预算截断文本，同时保留开头和结尾。 */
export function trimTextToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  if (estimateTokens(text) <= maxTokens) return text;
  const marker = '\n...[上下文已截断]...\n';
  let low = 0;
  let high = text.length;
  let best = '';
  while (low <= high) {
    const length = Math.floor((low + high) / 2);
    const headLength = Math.ceil(length * 0.65);
    const tailLength = Math.max(0, length - headLength);
    const candidate = `${text.slice(0, headLength)}${marker}${tailLength ? text.slice(-tailLength) : ''}`;
    if (estimateTokens(candidate) <= maxTokens) {
      best = candidate;
      low = length + 1;
    } else {
      high = length - 1;
    }
  }
  return best || text.slice(0, Math.max(1, maxTokens));
}
