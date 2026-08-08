# 知识库 · Knowledge Base

一个**本地优先**的 AI 增强型学习笔记 / 知识管理工具。所有数据存储在浏览器本地（IndexedDB），API Key 加密保存在本地，不上传任何服务器。

> 界面与交互参考字节跳动飞书（Lark）的设计风格，面向个人知识管理场景。

> 🌐 **本地访问**：`npm run dev` 启动后打开 **http://localhost:5173**

## ✨ 功能

- **文档管理** —— 富文本 + Markdown 双模式编辑，自动保存，支持分类、标签、难度、学习时长
- **知识卡片 & 间隔复习** —— 基于 FSRS 算法安排复习，4 级评分（忘了/困难/良好/轻松）
- **AI 助手** —— 智能总结、自动生成知识卡片、代码审查、代码解释、自由对话
- **多 AI 入口** —— 支持胜算云、中转站、硅基流动、智谱 GLM、DeepSeek，自动故障转移
- **☁️ 云同步** —— GitHub 私有仓库跨设备同步，免费、带版本历史，保存即上传（编辑停顿自动同步）
- **↩️ 撤销 / 重做** —— 富文本编辑器原生撤销重做（Ctrl+Z / Ctrl+Y）
- **知识图谱** —— 概念之间的关联关系可视化（前置依赖 / 关联 / 扩展 / 示例）
- **统计面板** —— 文档/卡片/知识点数量、近 30 天活动热力图、分类分布
- **数据管理** —— 一键导入 / 导出全部数据（JSON）
- **命令面板** —— `Ctrl+K`（Mac 用 `⌘K`）全局搜索与快捷操作
- **置顶 / 最近 / 回收站** —— 侧栏管理常用文档，软删除可恢复
- **主题切换** —— 白天 / 夜晚 / 跟随系统

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
│   ├── search/     # 全文搜索（Fuse）
│   ├── services/   # 导入导出
│   └── sync/       # GitHub 云同步引擎
└── styles/         # 全局样式与设计系统
```

## 📦 部署

本项目为纯前端应用，`npm run build` 后可将 `dist/` 部署到任意静态托管（Vercel、Netlify、GitHub Pages、Nginx 等）。

`deploy.sh` / `deploy.ps1` 提供一键提交并推送到 GitHub 的脚本。

## 🤖 开发说明

本项目在开发过程中使用了 Claude 等 AI agent 协助代码编写、重构与审查；核心逻辑（FSRS 复习调度、AI 多入口故障转移、云同步合并、加解密）均经过人工校验，并配有单元测试覆盖（`npm test`）。

## 📄 License

Private
