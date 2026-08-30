import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';
import type { ServerWebSearchProvider } from './src/lib/server/webSearchProviders';

// 桌面端(Electron)或安卓(Capacitor)构建:使用相对路径 base + 禁用 PWA
const isDesktopBuild = process.env.BUILD_TARGET === 'electron' || process.env.BUILD_TARGET === 'android';
const appVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version;

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), 'VLM_');
  const localAIBase = (localEnv.VLM_OPENAI_API_BASE || '').trim().replace(/\/+$/, '');
  const localAIRoot = localAIBase.replace(/\/v1$/i, '');
  return {
  // 允许通过被 git 忽略的 .env.local 显式配置本机 OpenAI-compatible 模型。
  envPrefix: ['VITE_', 'VLM_'],
  // 桌面/安卓端用相对路径,确保本地加载时 /assets 能正确解析
  base: isDesktopBuild ? './' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    // 开发期同源代理：局域网推理服务通常没有浏览器 CORS，代理同时保留真实 401/5xx 状态。
    {
      name: 'local-ai-dev-proxy',
      configureServer(server) {
        server.middlewares.use('/api/local-ai', async (req, res) => {
          const suffix = req.url || '';
          if (!localAIRoot || !/^\/v1\/(models|chat\/completions|embeddings)(?:\?|$)/.test(suffix)) {
            res.statusCode = 404;
            res.end('Local AI proxy is not configured');
            return;
          }
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', async () => {
            try {
              const headers = { ...req.headers } as Record<string, string | string[] | undefined>;
              delete headers.host;
              delete headers.origin;
              delete headers.referer;
              delete headers.connection;
              const method = req.method || 'GET';
              const upstream = await fetch(`${localAIRoot}${suffix}`, {
                method,
                headers: headers as HeadersInit,
                body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
              });
              res.statusCode = upstream.status;
              const contentType = upstream.headers.get('content-type');
              if (contentType) res.setHeader('Content-Type', contentType);
              // 明确关闭代理/浏览器的响应缓冲，确保 SSE 首个 token 到达就能被前端读取。
              res.setHeader('Cache-Control', 'no-cache, no-transform');
              res.setHeader('X-Accel-Buffering', 'no');
              if (typeof res.flushHeaders === 'function') res.flushHeaders();
              // 不要用 arrayBuffer() 等待完整响应：chat/completions 的 SSE 必须边读边转发。
              // 否则上游虽然 stream=true，浏览器仍会等到模型生成结束才看到内容。
              if (upstream.body) {
                const reader = upstream.body.getReader();
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value?.length) res.write(Buffer.from(value));
                  }
                } finally {
                  reader.releaseLock();
                }
                res.end();
              } else {
                res.end();
              }
            } catch (error) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Local AI proxy failed' }));
            }
          });
        });
      },
    },
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
        theme_color: '#0d1020',
        background_color: '#f4f5fb',
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
        // Mermaid 渲染器约 3MB，仅在回答真的包含流程图时按需加载，不占用首次离线缓存。
        globIgnores: ['assets/mermaid-renderer-*.js'],
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
            // Mermaid 及其布局/图计算依赖只在回答包含流程图时动态加载，不能并入首屏 vendor。
            if (id.includes('/mermaid/') || id.includes('\\mermaid\\') || id.includes('@mermaid-js') || id.includes('cytoscape') || id.includes('dagre-d3') || id.includes('/elkjs/') || id.includes('\\elkjs\\') || id.includes('/khroma/') || id.includes('\\khroma\\') || id.includes('/roughjs/') || id.includes('\\roughjs\\') || /[\\/]node_modules[\\/]d3(?:-|[\\/])/.test(id)) return 'mermaid-renderer';
            if (id.includes('react-markdown') || id.includes('remark') || id.includes('rehype') || id.includes('lowlight') || id.includes('highlight.js') || id.includes('marked') || id.includes('turndown')) return 'markdown';
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
            // html2pdf.js 及其依赖（html2canvas/jspdf）体积大且仅在导出 PDF 时用到，
            // 单独拆成独立 chunk，通过动态 import 按需加载，避免拖大首屏 vendor
            if (id.includes('html2pdf.js') || id.includes('html2canvas') || id.includes('jspdf')) return 'pdf-export';
            // 其余第三方依赖（react 核心、路由、状态、数据库等）合并为单个 vendor chunk，避免循环依赖
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  };
});
