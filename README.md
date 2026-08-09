# 知识库 · Knowledge Base

一个**本地优先**的 AI 增强型学习笔记 / 知识管理工具。所有数据存储在浏览器本地（IndexedDB），API Key 加密保存在本地，不上传任何服务器。

> 界面与交互参考字节跳动飞书（Lark）的设计风格，面向个人知识管理场景。

> 🌐 **本地访问**：`npm run dev` 启动后打开 **http://localhost:5173**

## ✨ 功能

### 文档与编辑
- **文档管理** —— 富文本 + Markdown 双模式编辑，自动保存，支持分类、标签、难度、学习时长
- **附件图片** —— 粘贴/拖拽截图自动压缩；已保存文档的图片以附件存储、正文用 `attachment://` 引用并随云同步
- **↩️ 撤销 / 重做 / 版本历史** —— 富文本原生撤销重做（Ctrl+Z/Y）；每次保存自动留快照，可预览/恢复

### 双向链接与知识图谱
- **双向链接 `[[文档]]`** —— 可点击 chip 跳转；右侧「大纲 / 反链 / 提及」三页签
- **反向链接 / 未链接提及** —— 列出引用本文的文档；发现提到本文但未建链的文档，一键转为 `[[双链]]`；失效链接可一键创建目标
- **知识图谱** —— 从双链实时派生，节点大小=入链数，支持搜索 / 分类过滤 / 孤立文档 / 聚焦一跳关系

### 搜索与收集
- **高级搜索** —— `tag:` `subject:` `after:` `before:` `is:inbox` `has:attachment` `link:` `"精确短语"` 等字段语法 + 关键词高亮 + 命中原因；可保存常用搜索（`Ctrl+K` → 高级搜索）
- **快速收集箱** —— `Ctrl+Shift+N` 快速捕捉想法 / 网页剪藏（标题粘贴网址自动识别为来源），稍后整理

### AI 与复习
- **全库 AI 问答（RAG）** —— 选择知识范围（全部 / 分类 / 标签 / 指定文档），自动检索知识库片段作答并附「参考来源」，可一键保存回答为新文档
- **知识卡片 & 间隔复习** —— 基于 FSRS 算法安排复习，4 级评分（忘了/困难/良好/轻松）
- **AI 助手** —— 智能总结、自动生成知识卡片、代码审查、代码解释
- **多 AI 入口** —— 支持胜算云、中转站、硅基流动、智谱 GLM、DeepSeek，自动故障转移

### 同步与数据
- **☁️ 云同步** —— GitHub 私有仓库跨设备同步，免费、带版本历史；同步范围覆盖文档/附件/卡片/保存的搜索/版本历史等
- **同步冲突解决** —— 基于 contentHash 的三方冲突检测，冲突文档保留本地并提示，可「保留本地 / 用远端覆盖 / 两者都保留」
- **数据管理** —— 一键导入 / 导出全部数据（JSON，附件 Blob 自动序列化）

### 交互
- **文档 ⋮ 菜单** —— 列表 / 文档树右键或点「⋮」：移动到分类、收藏置顶、复制、删除
- **命令面板** —— `Ctrl+K`（Mac 用 `⌘K`）全局搜索与快捷操作
- **统计面板** —— 文档/卡片/知识点数量、近 30 天活动热力图、分类分布
- **置顶 / 最近 / 回收站** —— 侧栏管理常用文档，软删除可恢复
- **主题切换** —— 白天 / 夜晚 / 跟随系统 · **PWA** 可离线安装

## 🚀 开始使用

```bash
# 安装依赖
npm install

# 启动开发服务器（热更新）
npm run dev

# 生产构建
npm run build

# 预览生产构建
npm run preview

# 运行单元测试
npm test
```

开发服务器默认运行在 `http://localhost:5173`。

### 配置 AI

在应用内「设置」页面配置 AI 入口，或参考根目录 `.env.example` 设置环境变量：

| 变量                          | 说明                           |
| ----------------------------- | ------------------------------ |
| `VITE_SHENGSUANYUN_API_KEY` | 胜算云 API Key（默认主力入口） |
| `VITE_RELAY_BASE_URL`       | 中转站基础地址（主力入口）     |
| `VITE_RELAY_API_KEY`        | 中转站 API Key                 |
| `VITE_SILICONFLOW_API_KEY`  | 硅基流动 API Key               |
| `VITE_ZHIPU_API_KEY`        | 智谱 GLM API Key               |
| `VITE_DEEPSEEK_API_KEY`     | DeepSeek API Key               |

> 所有 Key 仅存储在本地浏览器，不经过任何服务器。

### 配置云同步（GitHub）

跨设备同步数据到你的 GitHub 私有仓库（免费、带版本历史）：

1. 在 GitHub 创建一个**私有仓库**（如 `knowledge-base`）
2. 生成 Personal Access Token（Classic，勾选 `repo` 权限）
3. 应用「设置 → 云同步」填入用户名、仓库名、Token
4. 启用后，**保存即上传**；编辑停顿 10 秒也会自动同步

> 单次同步文件上限 **95MB**（GitHub 硬上限 100MB，预留余量）。Token 仅存本地浏览器。

## 🧩 技术栈

- **框架**：React 18 + TypeScript + Vite 5
- **编辑器**：TipTap（富文本）+ Markdown
- **存储**：Dexie（IndexedDB），本地优先
- **状态**：Zustand
- **样式**：Tailwind CSS + CSS 变量设计系统
- **搜索**：Fuse.js
- **复习算法**：FSRS
- **云同步**：GitHub Contents API
- **PWA**：vite-plugin-pwa，支持离线安装

## 📁 项目结构

```
src/
├── components/     # 通用组件（编辑器、文档树、命令面板、卡片等）
├── pages/          # 页面（文档、AI、复习、卡片、图谱、统计、设置、回收站）
├── stores/         # Zustand 状态管理
├── lib/
│   ├── ai/         # AI 客户端、路由、prompt、多 provider
│   ├── algorithms/ # FSRS 复习算法
│   ├── db/         # IndexedDB schema 与查询
│   ├── indexing/   # 文档索引管线（双链 / 分块 / 哈希 / 重建）
│   ├── search/     # 高级搜索（queryParser + Fuse）
│   ├── services/   # 导入导出
│   └── sync/       # GitHub 云同步引擎
└── styles/         # 全局样式与设计系统
```

## 📦 部署

本项目为纯前端应用，`npm run build` 后可将 `dist/` 部署到任意静态托管。以下是几种「放到 GitHub / 上线」的方式。

### 方式一：Vercel（推荐 · 自带 Web 搜索能力）

项目已带 `vercel.json`（SPA 回退）与 `api/search.ts`（Serverless 函数，提供免 Key 的 Web 搜索 / 天气）。Vercel 部署后 `/api/search` 自动可用，AI 助手的「联网搜索」才能在网页端工作。

1. 把代码推到 GitHub 仓库（如 `sxh313/knowledge-base`）
2. 打开 [vercel.com](https://vercel.com) → 「New Project」→ 导入该仓库
3. Framework Preset 选 **Vite**，Build Command 保持 `npm run build`，Output Directory 保持 `dist`
4. （可选）在「Environment Variables」填入 `.env.local` 里的变量（如 `VITE_SYNC_TOKEN` 等），让同步配置「点击填入」
5. 点 **Deploy**，几十秒后拿到 `https://你的项目.vercel.app`

> **Production Branch**：在 Vercel 项目设置里把 Production Branch 改成你的工作分支（如 `knowledge-base`），否则非 `main` 分支的推送不会触发正式部署。

之后每次 `git push` 到该分支，Vercel 自动重新构建部署。

### 方式二：GitHub Pages（纯静态 · 无 Serverless）

> 注意：GitHub Pages 不支持 Serverless 函数，AI 助手的「联网搜索」在 Pages 上不可用（其他功能正常）。

GitHub Pages 需要**子路径 base**（仓库部署在 `https://用户名.github.io/仓库名/`）。构建时设置 `base`：

```bash
# 仓库名为 knowledge-base 时
vite build --base=/knowledge-base/
```

或用 [peaceiris/actions-gh-pages](https://github.com/peaceiris/actions-gh-pages) Action 自动发布（新增 `.github/workflows/deploy.yml`）：

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [knowledge-base]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build -- --base=/仓库名/
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

在仓库 **Settings → Pages → Source** 选「GitHub Actions」即可。

### 方式三：Cloudflare Pages / Netlify

同样导入仓库，Build Command `npm run build`，Output Directory `dist`。Netlify 需加 `_redirects`（`/* /index.html 200`）做 SPA 回退；本项目 `vercel.json` 的 rewrites 仅对 Vercel 生效。

### 推送代码到 GitHub

`deploy.sh` / `deploy.ps1` 提供一键提交并推送到 GitHub 的脚本。手动推送：

```bash
git add -A
git commit -m "你的提交信息"
git push origin 你的分支名
```

> 国内若 `git push` 卡在 `port 22`，走 SSH over 443：
> `git -c url."ssh://git@ssh.github.com:443/".insteadOf="git@github.com:" push origin 你的分支`

## 🖥️ 桌面端（Windows .exe）

本项目可打包为 Windows 桌面应用（Electron，本地优先、数据仍在本地）：

```bash
# 先安装依赖（含 electron + electron-builder）
npm install

# 打包为 NSIS 安装包（release/ 知识库 Setup x.x.x.exe）
npm run electron:build

# 或打包为单文件便携版（release/知识库 x.x.x.exe）
npm run electron:build:portable
```

打包产物在 `release/` 目录。桌面端使用 HashRouter + `file://` 加载，云同步、AI 等功能与网页端一致（联网搜索需联网但无 Serverless，会回退为本地知识库作答）。

## 🤖 开发说明

本项目在开发过程中使用了 Claude 等 AI agent 协助代码编写、重构与审查；核心逻辑（FSRS 复习调度、AI 多入口故障转移、云同步合并、加解密）均经过人工校验，并配有单元测试覆盖（`npm test`）。

## 📄 License

Private
