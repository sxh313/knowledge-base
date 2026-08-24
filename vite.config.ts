import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';
import type { ServerWebSearchProvider } from './src/lib/server/webSearchProviders';

// 桌面端(Electron)或安卓(Capacitor)构建:使用相对路径 base + 禁用 PWA
const isDesktopBuild = process.env.BUILD_TARGET === 'electron' || process.env.BUILD_TARGET === 'android';
const appVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version;

export default defineConfig({
  // 桌面/安卓端用相对路径,确保本地加载时 /assets 能正确解析
  base: isDesktopBuild ? './' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    // 桌面端(Electron)或安卓(Capacitor)构建:PWA 已禁用,这里为 virtual:pwa-register/react 提供桩模块
    isDesktopBuild && {
      name: 'pwa-register-stub',
      resolveId(id: string) {
        if (id === 'virtual:pwa-register/react' || id === 'virtual:pwa-register') return '\0' + id;
        return null;
      },
      load(id: string) {
        if (id === '\0virtual:pwa-register/react' || id === '\0virtual:pwa-register') {
          return [
            'const noop = () => {};',
            'export function useRegisterSW() {',
            '  return {',
            '    needRefresh: [false, noop],',
            '    offlineReady: [false, noop],',
            '    updateServiceWorker: async () => {},',
            '  };',
            '}',
          ].join('\n');
        }
        return null;
      },
    },
    // Web 搜索 dev 代理仅在开发模式生效,不影响打包
    {
      name: 'api-search-dev',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/search')) return next();
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', async () => {
            const url = new URL(req.url || '', 'http://localhost');
            let body: Record<string, unknown> = {};
            try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { body = {}; }
            const q = url.searchParams.get('q') || (typeof body.query === 'string' ? body.query : '');
            if (!q) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Missing q' })); return; }
            try {
              res.setHeader('Content-Type', 'application/json');
              if (req.method === 'POST' && body.fetch !== false) {
                const { searchAndFetchWeb } = await import('./src/lib/server/webSearchProviders');
                const provider = typeof body.provider === 'string' && ['tavily', 'open-websearch', 'duckduckgo'].includes(body.provider)
                  ? body.provider as ServerWebSearchProvider
                  : undefined;
                const pages = await searchAndFetchWeb(q, {
                  provider,
                  baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
                  apiKey: process.env.TAVILY_API_KEY || (typeof body.apiKey === 'string' ? body.apiKey : undefined),
                  limit: body.limit ?? url.searchParams.get('limit'),
                  fetchLimit: body.fetchLimit ?? url.searchParams.get('fetchLimit'),
                });
                res.end(JSON.stringify({ pages }));
                return;
              }
              const { doSearch } = await import('./src/lib/server/searchEngine');
              const results = await doSearch(q);
              res.end(JSON.stringify({ results }));
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Search failed' }));
            }
          });
        });
      },
    },
    // 桌面端/安卓构建跳过 PWA(Service Worker 在桌面/容器化 WebView 无意义)
    !isDesktopBuild && VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'favicon.ico'],
      manifest: {
        name: '知屿',
        short_name: '知屿',
        description: 'AI 增强型知识管理工具 — 记录、整理、复习、知识图谱',
        theme_color: '#1a1a2e',
        background_color: '#f8f9fa',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,ico,png,svg,woff2}'],
        // 限制预缓存体积，避免首次加载缓存过多非核心资源
        // zero2agent 的预计算索引约 7MB，需要纳入离线缓存；仍保留上限避免误把大型资源全部缓存。
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/zero2agent\/.*\.md$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'zero2agent-source',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https?:\/\/.*\/v1\/chat\/completions/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 按模块路径分包：把编辑器(tiptap/prosemirror)、markdown、react、data 拆成独立 chunk，
        // 配合路由级懒加载，首屏主 chunk 体积大幅下降
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-markdown') || id.includes('remark') || id.includes('rehype') || id.includes('lowlight') || id.includes('highlight.js') || id.includes('marked') || id.includes('turndown')) return 'markdown';
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
            // html2pdf.js 及其依赖（html2canvas/jspdf）体积大且仅在导出 PDF 时用到，
            // 单独拆成独立 chunk，通过动态 import 按需加载，避免拖大首屏 vendor
            if (id.includes('html2pdf.js') || id.includes('html2canvas') || id.includes('jspdf') || id.includes('dompurify')) return 'pdf-export';
            // 其余第三方依赖（react 核心、路由、状态、数据库等）合并为单个 vendor chunk，避免循环依赖
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
});
