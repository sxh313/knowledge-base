import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sxh313.knowledgebase',
  appName: '知识库',
  webDir: 'dist',
  // 应用使用 HashRouter,无需 deep link 配置
  android: {
    // 允许 WebView 访问外部的 AI/搜索 API
    allowMixedContent: true,
  },
  // 应用内访问外部 API(搜索、AI)不受 CORS 限制(WebView 无同源策略)
  server: {
    androidScheme: 'https',
  },
};

export default config;
