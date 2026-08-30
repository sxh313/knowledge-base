/** 开发环境用同源代理访问显式配置的局域网模型，避免 CORS 隐藏真实 HTTP 错误。 */
export function resolveAIBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  const configured = (import.meta.env.VLM_OPENAI_API_BASE || '').trim().replace(/\/+$/, '');
  if (import.meta.env.DEV && configured && normalized === configured) return '/api/local-ai/v1';
  return normalized;
}
