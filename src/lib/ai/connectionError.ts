export function describeConnectionError(error: unknown, endpoint = ''): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const isFetchFailure = /failed to fetch|networkerror|load failed/i.test(message);
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isHttpEndpoint = /^http:\/\//i.test(endpoint.trim());
  if (isFetchFailure && isHttpsPage && isHttpEndpoint) {
    return '连接被浏览器拦截：HTTPS 网页不能直接访问 HTTP 模型服务。请给模型服务配置 HTTPS + CORS，或改用桌面版/安卓原生安装包。';
  }
  if (isFetchFailure) {
    return '连接失败：请确认服务地址可访问，并在模型服务端开启 CORS（允许当前网页地址）。';
  }
  return message || '连接失败，请检查服务地址和模型配置。';
}
