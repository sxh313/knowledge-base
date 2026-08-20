# 知屿 · ZhiYu

知屿是一款本地优先的 AI 学习笔记与知识管理应用，支持 Web/PWA、Windows 和 Android。文档、卡片、学习目标等业务数据默认保存在当前设备的 IndexedDB；只有在用户主动启用 AI、联网搜索或 GitHub 同步时，相关内容才会发往所配置的第三方服务。

当前版本：**v1.6.0**

新增 zero2Agent 复习教练：复习页只检索 zero2Agent 原文，用户提问只记录兴趣证据，完成带来源的诊断题后才更新掌握度。无关问题不会进入复习数据；复习问答历史默认不同步。

## 核心能力

- 富文本与 Markdown 双模式编辑、自动保存、版本历史、附件图片、模板、收集箱和回收站。
- 双向链接、反链、未链接提及、高级搜索、标签和由文档双链派生的知识图谱。
- AI 问答与 Agent 共用一个入口，可切换只读问答和规划执行模式；回答支持个人文档、内置 zero2Agent 知识库和联网来源。
- Agent 在写入前展示计划、风险和真实 diff，支持逐项确认、事务回滚、审计记录与一键撤销。
- 基于 FSRS 的知识卡片复习，以及可持续调整的学习目标和每日任务。
- 使用用户自己的 GitHub 私有仓库进行可选同步，支持记录级合并、软删除传播和冲突处理。
- JSON 全量业务数据备份，以及 HTML、PDF、Markdown ZIP 等内容导出。

## 快速开始

要求 Node.js 24（与 CI 一致）。

```bash
npm install
npm run dev
```

开发服务器默认地址为 `http://localhost:5173`。

常用命令：

```bash
npm test                 # 单元测试
npm run build            # Web/PWA 生产构建
npm run electron:build   # Windows 安装包
npm run android:sync     # Android Web 构建并同步 Capacitor
```

Windows 和 Android 的环境要求、发布方式见 [发布指南](docs/发布指南.md)。内部模块和数据边界见 [架构说明](docs/架构说明.md)。版本变化见 [CHANGELOG](CHANGELOG.md)。

## 首次配置

### AI

在应用内“设置 → AI 服务配置”填写当前设备自己的 API 地址和 Key，也可以连接 Ollama、LM Studio、vLLM、LocalAI 等 OpenAI-compatible 本地服务。项目不会从 `VITE_*` 环境变量读取或向构建产物预置共享凭据。

API Key 保存在当前设备的 IndexedDB。它不会进入普通业务数据备份或 GitHub 同步；如需搬迁，可在设置页用主密码生成 AES-GCM 加密密钥包。浏览器存储本身不是密码保险箱，请使用受信任设备并保护系统账户。

### GitHub 同步

在“设置 → 云同步”填写自己的 GitHub 用户名或组织、私有仓库、分支、数据路径和 Fine-grained Token。建议仅授予目标仓库 Contents 读写权限。Token 只保存在当前设备，不进入安装包、业务数据备份或同步文件。

单个同步文件上限为 95 MB。同步 Agent 运行记录可能包含敏感内容，因此默认关闭。

### 数据备份

JSON 备份覆盖文档、卡片、附件、版本、保存的搜索、分类、冲突、AI/Agent 会话与审计记录、偏好、学习目标和任务。它不包含 AI Key、GitHub Token 和设备级设置。导入采用合并写入，并在完成后重建文档索引。

## 项目结构

```text
src/
├─ components/       UI、编辑器与设置组件
├─ pages/            路由页面
├─ stores/           Zustand 页面状态
└─ lib/
   ├─ agent/         Agent 工具循环、计划、diff、事务和审计
   ├─ ai/            Provider、路由、RAG 与联网搜索
   ├─ db/            Dexie schema 与按领域拆分的数据访问
   ├─ indexing/      文档分块、双链和索引重建
   ├─ review/        通用卡片复习会话
   ├─ zero2review/   zero2Agent 专属检索、Tutor、诊断、掌握度与计划
   ├─ search/        查询解析与全文检索
   ├─ services/      备份和内容导出
   └─ sync/          GitHub 同步与记录合并
```

`public/zero2agent/` 是应用内置知识库的原始 Markdown，不是项目说明文档；`npm run generate:zero2agent` 会据此生成 `public/zero2agent-kb.json`。

## 技术栈

React 18、TypeScript、Vite 5、TipTap、Dexie/IndexedDB、Zustand、Tailwind CSS、Vitest、Electron、Capacitor 和 GitHub Actions。

## 部署说明

Web 主体是静态前端，但联网搜索依赖 `/api/search` 服务端函数。Vercel 可直接运行该函数；纯静态托管仍可使用本地功能、AI 直连和知识库问答，但联网搜索不可用。

## License

Private
