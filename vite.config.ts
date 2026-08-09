import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';

// 桌面端构建(Electron):使用相对路径 base,禁用 PWA Service Worker(桌面应用无需离线缓存)
const isElectronBuild = process.env.BUILD_TARGET === 'electron';
// 注入应用版本号(来自 package.json)供设置页显示
const appVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version;

export default defineConfig({
  // 桌面端用相对路径,确保 loadFile 时 /assets 能正确解析到 dist 下
  base: isElectronBuild ? './' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    // Electron 构建时 PWA 已禁用,这里为 virtual:pwa-register/react 提供桩模块(桌面端无 Service Worker)
    isElectronBuild && {
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
          const url = new URL(req.url, 'http://localhost');
          const q = url.searchParams.get('q');
          if (!q) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Missing q' })); return; }
          try {
            const { doSearch } = await import('./src/lib/server/searchEngine');
            const results = await doSearch(q);
            res.setHeader('Content-Type', 'application/json');
 res.end(JSON.stringify({ results }));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message || 'Search failed' }));
          }
        });
      },
    },
    // 桌面端构建跳过 PWA(Service Worker 在 Electron 无意义)
    !isElectronBuild && VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'favicon.ico'],
      manifest: {
        name: '知识库',
        short_name: '知识库',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // 限制预缓存体积，避免首次加载缓存过多非核心资源
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
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
            // 其余第三方依赖（react 核心、路由、状态、数据库等）合并为单个 vendor chunk，避免循环依赖
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
});