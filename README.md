# 知屿 · ZhiYu

> 本地优先的 AI 学习笔记、知识整理与复习应用。一次代码库可构建为 Web/PWA、Windows 桌面应用和 Android 应用。

当前版本：**v1.6.27**

知屿将文档、卡片、复习进度、Agent 会话与同步元数据默认保存在当前设备的 IndexedDB。只有用户主动配置 AI 服务、联网搜索或 GitHub 同步时，相关请求才会离开设备。

## 核心能力

| 能力 | 具体做什么 |
| --- | --- |
| 文档与笔记 | 用富文本或 Markdown 编辑笔记；管理标签、分类、属性、别名、附件、模板、收集箱、回收站和版本历史。 |
| 知识关联 | 解析 `[[双向链接]]`，展示反链、未链接提及和文档关系；支持按标题、正文、标签与查询语法搜索。 |
| AI 问答 | 从个人笔记、内置 zero2Agent 课程资料和可选网页来源检索证据，再由用户配置的模型生成带来源的回答。 |
| 本地 Agent | 将自然语言请求转换为文档操作计划；展示风险、依据和 diff，用户确认后才通过本地事务写入，并支持审计与撤销。 |
| 复习系统 | 使用 FSRS 安排知识卡片复习；学习目标生成每日任务。zero2Agent 复习教练基于固定课程资料进行诊断、掌握度评估与复习计划；两类任务均可单独删除。 |
| 同步与导出 | 导出 JSON、HTML、PDF、Markdown ZIP；可选同步到自己的 GitHub 私有仓库，使用记录级合并、软删除传播与冲突处理。 |

## 运行形态

```text
                ┌────────────────────────────────┐
                │ React + TypeScript 业务前端     │
                │ 页面 / 状态 / 领域逻辑 / Dexie  │
                └───────────────┬────────────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
   Web / PWA                Electron                  Capacitor
 BrowserRouter             HashRouter                HashRouter
 Service Worker            Windows 更新              Android WebView
```

- **Web/PWA**：Vite 构建的单页应用，使用 Service Worker 缓存应用资源和内置课程 Markdown。
- **Windows**：Electron 加载同一份前端构建结果，通过 `electron-updater` 检查 GitHub Releases 更新。
- **Android**：Capacitor 将同一份前端构建结果封装到 Android WebView。
- `BUILD_TARGET=electron` 或 `android` 时使用相对资源路径并关闭 PWA；Web 默认启用 PWA。

## 快速开始

### 环境要求

- Node.js 24
- npm
- Windows 打包需要 Electron Builder 所需的 Windows 环境
- Android 构建需要 Android SDK、JDK 与 Gradle，详见[发布指南](docs/发布指南.md)

### 本地开发

```bash
npm install
npm run dev
```

开发服务器默认地址为 `http://localhost:5173`。

### 常用命令

| 命令 | 做什么 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器，并提供本地 `/api/search` 开发代理。 |
| `npm test` | 运行 Vitest 单元测试，覆盖 Agent、RAG、FSRS、同步和复习核心逻辑。 |
| `npm run typecheck` | 只执行 TypeScript 项目引用检查。 |
| `npm run check:release` | 核对版本、CHANGELOG、schema 和冒烟路由的一致性。 |
| `npm run report:build` | 输出构建体积、资源数量和预缓存候选体积。 |
| `npm run check` | 按发布顺序执行类型检查、测试和 Web 生产构建。 |
| `npm run build` | 类型检查并构建 Web/PWA 生产包到 `dist/`。 |
| `npm run electron:dev` | 同时启动 Vite 和 Electron，调试桌面端。 |
| `npm run electron:build` | 构建 Windows 安装包。 |
| `npm run electron:build:portable` | 构建 Windows 便携版。 |
| `npm run android:sync` | 构建前端并同步到 Capacitor Android 工程。 |
| `npm run android:build` | 构建并生成 Android Debug APK。 |
| `npm run generate:zero2agent` | 根据 `public/zero2agent/` 的课程 Markdown 生成内置知识库索引。 |
| `npm run generate:zero2agent-embeddings` | 为内置 zero2Agent 知识库生成预计算向量数据。 |

## 首次配置

### AI 服务与模型中心

在应用内进入“设置 → AI 服务配置”或“模型中心”，配置自己的 OpenAI-compatible 服务端点、模型名和 API Key。可使用云端 Provider，也可连接 Ollama、LM Studio、vLLM、LocalAI 等本地服务。

| 配置项 | 具体作用 |
| --- | --- |
| Provider 路由 | 根据任务类型与用户设置选择模型；优先模型不可用时，会在已配置 Provider 中尝试降级。 |
| 角色绑定 | 可分别为回答、Embedding、重排、查询改写、复习教练、评估器和计划器选择模型。 |
| Embedding | 可选。未配置时使用关键词检索；配置成功并完成索引后，可启用关键词与向量双路召回。 |
| 重排与查询改写 | 可选增强。重排提高召回片段相关性，查询改写提高口语化提问的检索命中率；服务超时会自动降级。 |

AI Key 保存在当前设备 IndexedDB，不进入普通 JSON 备份或 GitHub 同步。不要将真实密钥放进 `VITE_` 环境变量：它们会在 Web 构建时暴露给客户端代码。

### 联网搜索

Web 版调用同源 `/api/search`；本地开发由 Vite 中间件提供，Vercel 部署由 [api/search.ts](api/search.ts) 提供 Serverless Function。桌面端和 Android 需要在 `VITE_SEARCH_API_URL` 中设置可访问的搜索服务地址。

`.env.example` 只包含服务端 `TAVILY_API_KEY` 和公开搜索服务地址占位符，真实密钥不要提交。

### GitHub 同步

在“设置 → 云同步”填写自己的 GitHub 用户名或组织、私有仓库、分支、数据路径及 Fine-grained Token。建议 Token 只授予目标仓库的 Contents 读写权限。

- 同步文件默认是 `data.json`，单文件上限为 95 MB。
- 文档与多数业务实体采用 `updatedAt` 和 `deletedAt` 合并；删除会写入 tombstone，避免其他设备把已删数据复活。
- 并发修改不会静默覆盖，而是创建同步冲突供用户处理。
- Agent 运行记录和 zero2Agent 完整问答可能包含敏感内容，默认不同步，需在设置中显式开启。

## 架构与数据流

### 分层架构

| 层 | 目录 | 负责什么 |
| --- | --- | --- |
| 应用入口 | `src/main.tsx`、`src/App.tsx` | 初始化 React、路由和全局布局；按 Web、Electron、Android 选择路由基址。 |
| 页面层 | `src/pages/` | 组织路由级业务交互，例如编辑笔记、Agent 对话、设置、统计和复习。页面不直接处理底层事务。 |
| 组件层 | `src/components/` | 提供可复用 UI、富文本编辑器、Markdown 渲染、文档树、对话面板、设置面板与复习组件。 |
| 状态层 | `src/stores/` | 使用 Zustand 管理跨组件状态和异步操作；调用领域逻辑后更新 UI。 |
| 领域逻辑层 | `src/lib/` | 实现 AI、Agent、检索、复习、同步、导出与算法，保持与页面 UI 解耦。 |
| 数据层 | `src/lib/db/` | Dexie schema、迁移和按领域拆分的数据访问。 |
| 平台与服务端 | `electron/`、`android/`、`api/` | Electron 主进程/预加载、Capacitor Android 壳和网页搜索 API。 |

### 文档编辑数据流

```text
JournalEditor / RichTextEditor
  → journalStore
  → db/queries + db/attachments + db/categories
  → Dexie IndexedDB
  → indexing/documents 更新纯文本、分块、双链和内容哈希
  → JournalList / Search / AI Retrieval 使用更新后的索引
```

### AI 问答数据流

```text
用户提问
  → aiStore
  → 检索范围选择（个人文档 / zero2Agent / 网页）
  → ai/retrieval：关键词、向量、重排、查询改写（均可降级）
  → ai/prompts：组装问题、片段与回答约束
  → ai/router：选择模型并在失败时切换 Provider
  → ai/client：调用 OpenAI-compatible Chat Completions API
  → groundedAnswer：生成答案并校验/保存 Citation
  → AIChatPanel / CitationList：展示回答和来源
```

### 本地 Agent 数据流

```text
用户指令
  → intent：识别问答、搜索、草稿、计划、执行或批量模式
  → evidence：召回候选片段、本地重排序、限制上下文长度
  → context + memory：加载会话摘要、相关长期记忆和权限
  → router/client：调用模型；当前 Agent 使用 JSON 计划闭环，底层已提供原生 function calling 适配能力
  → tools：映射、解析、风险标注、证据和计划校验
  → permissions：检查操作、文档/分类范围、删除许可和授权过期时间
  → executor：生成预览和 diff；用户批准后在 Dexie transaction 中执行
  → persistence / metrics：保存会话、运行、事件、审计、撤销快照和指标
```

模型调用不拥有直接写数据库的权限。所有写操作都必须通过计划校验、证据检查、权限检查、预览、用户批准和本地事务。失败时事务回滚；成功后可通过版本快照和新建文档记录撤销本次运行。

### zero2Agent 复习数据流

```text
public/zero2agent/ 原始课程 Markdown
  → 生成知识库索引
  → zero2review/retrieval 仅检索 source=zero2agent 的固定来源
  → intentGate 判断是否属于课程复习范围
  → tutor / evaluator 生成教学与诊断
  → Citation 白名单校验
  → mastery + FSRS 更新掌握度与下次复习时间
  → planner / scheduler 生成学习计划与每日任务
```

无关或含糊问题不会写入 zero2Review 记录。用户提问只增加兴趣证据；只有带有效原文 Citation 的诊断作答才会更新掌握度。

## 目录说明

```text
.
├─ api/                       Vercel Serverless Function
│  └─ search.ts               网页搜索入口，复用 server 搜索 Provider
├─ electron/                  Windows 桌面端主进程与 preload 桥接
├─ android/                   Capacitor 生成的 Android 工程与资源
├─ public/
│  ├─ zero2agent/             内置 Agent 学习课程原始 Markdown
│  ├─ zero2agent-kb.json      由脚本生成的课程检索索引
│  └─ icons/                  PWA 和应用图标
├─ scripts/                   索引、向量、图标与构建辅助脚本
├─ docs/                      架构、发布、课程与 Agent 优化说明
├─ src/
│  ├─ components/             可复用 UI 与页面组合组件
│  ├─ pages/                  路由页面
│  ├─ stores/                 Zustand 状态与异步业务动作
│  ├─ styles/                 设计 token 与全局样式
│  └─ lib/                    可测试的领域逻辑
├─ vite.config.ts             Vite、PWA、开发搜索代理、分包策略
├─ capacitor.config.ts        Android 容器配置
└─ package.json               依赖、脚本和 Electron Builder 打包配置
```

### `src/pages/`：路由页面

| 页面 | 职责 |
| --- | --- |
| `JournalList.tsx`、`JournalEditor.tsx` | 笔记列表、分类浏览、创建与编辑、版本和附件相关交互。 |
| `Inbox.tsx`、`Trash.tsx`、`Tags.tsx` | 管理收集箱、软删除文档和标签视图。 |
| `SearchResultsPage.tsx` | 展示查询解析与全文搜索结果。 |
| `AIChat.tsx` | AI 问答入口，选择知识范围并展示引用。 |
| `Agent.tsx` | 本地 Agent 会话、计划预览、逐项批准、权限、技能、运行记录和撤销入口。 |
| `Zero2Review.tsx`、`Zero2Source.tsx` | zero2Agent 课程复习与原文溯源阅读。 |
| `LearningGoals.tsx`、`Stats.tsx` | 学习目标、每日任务、复习和知识统计。 |
| `SettingsPage.tsx` | AI、模型中心、检索、同步、备份、主题等设置。 |
| `Manual.tsx` | 应用内使用说明。 |

### `src/components/`：共享 UI

| 位置 | 负责什么 |
| --- | --- |
| `RichTextEditor.tsx`、`tiptap/` | TipTap 编辑器扩展：Wiki 链接、斜杠命令、代码块、折叠标题、提示块等。 |
| `MarkdownContent.tsx`、`SearchReplaceBar.tsx` | 渲染 Markdown、代码高亮、文内搜索与替换。 |
| `DocumentSidebar.tsx`、`DocTree.tsx`、`DocOutline.tsx` | 文档导航、层级树和标题大纲。 |
| `AIChatPanel.tsx`、`CitationList.tsx` | 对话流、联网状态和回答来源定位。 |
| `settings/` | AI 模型中心、同步设置与通用设置选择控件。 |
| `zero2review/` | 今日任务、对话、诊断题、掌握度、计划、来源证据和越界提示。 |
| `ui/`、`ToastViewport.tsx` | 通用按钮、弹窗、输入控件、提示和无障碍交互基础。 |

### `src/stores/`：状态与异步动作

| Store | 负责什么 |
| --- | --- |
| `journalStore.ts` | 文档列表、当前文档、保存、删除、分类与索引刷新。 |
| `aiStore.ts` | AI 对话、检索范围、流式回答、引用与会话状态。 |
| `agentStore.ts` | Agent 意图分流、检索、模型工具循环、计划、审批、执行、撤销、会话恢复与运行时间线。 |
| `zero2ReviewStore.ts` | 课程复习会话、诊断作答、计划、每日任务和掌握度视图。 |
| `settingsStore.ts`、`syncStore.ts` | 设备设置、模型配置、GitHub 同步和冲突状态。 |
| `pomodoroStore.ts`、`themeStore.ts`、`viewModeStore.ts`、`updateStore.ts` | 番茄钟、主题、响应式布局和桌面端更新提示。 |

### `src/lib/`：领域模块

| 目录 | 具体职责 |
| --- | --- |
| `agent/` | Agent 操作类型、JSON 计划解析、原生工具调用适配定义、意图识别、检索证据重排序、上下文压缩、长期记忆、权限、diff、事务执行、质量检查、影响分析、指标、持久化与测试。 |
| `ai/` | OpenAI-compatible 客户端、Provider 与模型路由、Embedding、分块、RAG、重排、查询改写、联网检索、回答引用校验与性能控制。 |
| `algorithms/` | FSRS 间隔重复算法和测试。 |
| `db/` | Dexie 数据模型、版本迁移、文档/卡片/附件/分类/偏好查询。 |
| `indexing/` | 文档纯文本、内容哈希、标题分块、双链、反链和索引重建。 |
| `search/` | 查询语法解析、Fuse 全文检索和文档搜索。 |
| `server/` | 服务端网页搜索 Provider、抓取和结果归一化；仅在 Vite 开发代理或 Vercel 函数中执行。 |
| `services/` | JSON 备份导入导出、HTML/PDF/Markdown ZIP 等内容导出。 |
| `sync/` | GitHub Contents API 同步、记录合并和冲突处理。 |
| `zero2review/` | 固定课程来源的检索、范围门控、Tutor、评估、掌握度、FSRS 调度、学习计划和仓储层。 |
| `ui/`、`utils/` | 焦点管理、Toast 与密钥包等通用能力。 |

## 本地数据模型

Dexie 数据库当前 schema 版本为 **14**。

| 数据域 | 表 | 保存什么 |
| --- | --- | --- |
| 笔记 | `journals`、`notes`、`journalVersions`、`attachments` | Markdown 正文、块级笔记、版本快照和附件元数据。 |
| 检索与关联 | `documentChunks`、`documentLinks`、`savedSearches`、`categories` | 文档分块、双链、保存搜索和分类。 |
| 学习 | `cards`、`learningGoals`、`learningTasks` | FSRS 卡片、目标和每日学习任务。 |
| AI | `aiConversations`、`settings` | AI 会话及设备级模型、检索、同步配置。 |
| Agent | `agentSessions`、`agentMessages`、`agentRuns`、`agentRunEvents`、`agentAuditLogs`、`agentStates`、`memoryItems` | 会话消息、计划运行、可观测事件、写入审计、上下文摘要、权限、任务缓存和长期记忆。 |
| 同步 | `syncConflicts` | 多设备并发修改时等待人工处理的冲突。 |
| zero2Review | `zero2ReviewSessions`、`zero2ReviewMessages`、`zero2Mastery`、`zero2ReviewPlans`、`zero2ReviewTasks`、`zero2ReviewAttempts` | 课程复习会话、掌握度、计划、任务和诊断作答。 |

除设备私密配置外，可同步实体均有 `updatedAt`；需要跨设备删除的实体还会保留 `deletedAt` 墓碑。

## 技术栈

| 技术 | 用在什么地方 |
| --- | --- |
| React 18 + TypeScript | 组件、页面、状态类型与领域逻辑。 |
| Vite 5 | 开发服务器、Web 构建、开发期网页搜索代理和生产分包。 |
| Tailwind CSS | 响应式样式、主题变量和界面实现。 |
| TipTap / ProseMirror | 富文本编辑器和可扩展 Markdown 写作体验。 |
| Dexie + IndexedDB | 浏览器/桌面 WebView 中的本地优先持久化、事务与 schema 迁移。 |
| Zustand | 轻量全局状态和异步业务编排。 |
| Fuse.js | 本地全文模糊搜索。 |
| React Router | Web 与容器平台的路由切换。 |
| React Markdown、Remark、Rehype、Lowlight | Markdown 渲染、GFM、代码高亮和内容转换。 |
| vite-plugin-pwa / Workbox | Web/PWA 安装、离线缓存和资源更新。 |
| Electron / electron-builder | Windows 桌面应用、自动更新与安装包构建。 |
| Capacitor | Android WebView 容器、资源同步和 APK 构建。 |
| Vitest | 单元与领域逻辑回归测试。 |
| GitHub Contents API | 用户自有仓库的可选数据同步。 |
| OpenAI-compatible APIs | 对话、工具调用、Embedding、重排和本地模型接入协议。 |

## 安全与数据边界

- 默认本地保存：笔记、卡片、Agent 会话、复习记录和索引不要求上传服务器。
- AI、网页搜索、GitHub 同步均由用户显式配置和触发。
- Agent 写入不信任模型输出：模型请求操作后仍须本地校验、权限判断、预览与用户确认。
- 普通备份和 GitHub 同步不包含 AI Key、GitHub Token 或完整设备设置；密钥迁移使用独立的、主密码保护的加密包。
- 同步 Agent 或 zero2Review 历史前，应确认其中不含不希望放入 GitHub 仓库的内容。
- 生产 Web 部署时，网页搜索密钥应只存在服务端环境变量中，不能使用 `VITE_` 前缀。

## 相关文档

- [架构说明](docs/架构说明.md)：当前实现的分层、数据边界和测试重点。
- [发布指南](docs/发布指南.md)：Web、Windows、Android 发布流程。
- [Agent 优化实施指南](docs/Agent优化实施指南.md)：本地 Agent 的可观测性、意图、证据、依赖、权限和原生工具调用设计。
- [CHANGELOG](CHANGELOG.md)：版本变更记录。

## License

Private
