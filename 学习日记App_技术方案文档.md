# 学习日记 App — 技术方案设计文档

> 版本：v2.0 · 2026-08-02（零部署版）
> 作者：Claude (方案设计)
> 状态：方案设计稿

---

## 目录

1. [产品概述](#1-产品概述)
2. [整体架构（零部署版）](#2-整体架构零部署版)
3. [技术栈选型](#3-技术栈选型)
4. [AI 后端方案（无需部署）](#4-ai-后端方案无需部署)
5. [第三方 API 集成清单](#5-第三方-api-集成清单)
6. [数据模型与存储](#6-数据模型与存储)
7. [模块设计](#7-模块设计)
8. [客户端架构设计](#8-客户端架构设计)
9. [开发路线图](#9-开发路线图)
10. [附录：参考资源](#10-附录参考资源)

---

## 1. 产品概述

### 1.1 产品定位

一款面向自学者的 **AI 增强型学习日记 App**，帮助用户记录学习过程、整理知识体系、生成复习材料，并通过多种 AI 模型实现智能问答、内容总结、代码分析等功能。

**核心原则：零部署！** 不需要购买服务器、不需要装 Docker、不需要跑数据库。所有功能都在 App 内完成，联网时直接调用第三方 AI API。

### 1.2 核心价值

| 能力 | 说明 |
|------|------|
| 📝 学习记录 | 支持文字、图片、代码片段、语音等多种形式记录学习内容 |
| 🧠 AI 辅助 | 接入多种 AI 模型（Claude / GPT / DeepSeek 等），实现智能总结、问答 |
| 🔗 知识关联 | 自动关联相关知识点，构建个人知识网络 |
| 📅 复习提醒 | 基于遗忘曲线安排复习计划 |
| 💾 全本地存储 | 数据全部存在你的设备本地，隐私安全 |

---

## 2. 整体架构（零部署版）

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                   学习日记 App (纯客户端)                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    UI 层                                 │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │   │
│  │  │ 日记  │ │ AI   │ │ 知识  │ │ 复习  │ │ 统计  │         │   │
│  │  │ 模块  │ │ 助手  │ │ 图谱  │ │ 模块  │ │ 模块  │         │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         │   │
│  └───────────────────────┬─────────────────────────────────┘   │
│                          │                                      │
│  ┌───────────────────────▼─────────────────────────────────┐   │
│  │               逻辑层 (State + Business Logic)             │   │
│  │  - Zustand 状态管理                                       │   │
│  │  - 本地数据 CRUD                                          │   │
│  │  - AI API 调用封装                                        │   │
│  │  - 知识图谱算法 (graphlib)                                │   │
│  │  - 间隔重复算法 (SM-2 / FSRS)                             │   │
│  │  - 全文搜索 (Fuse.js / Minisearch)                        │   │
│  └───────────────────────┬─────────────────────────────────┘   │
│                          │                                      │
│  ┌───────────────────────▼─────────────────────────────────┐   │
│  │               数据层 (全部本地)                           │   │
│  │  ┌──────────────┐  ┌──────────────┐                     │   │
│  │  │ IndexedDB    │  │ 本地文件系统  │                     │   │
│  │  │ (Dexie.js)   │  │ (图片/附件)   │                     │   │
│  │  │ 结构化数据    │  │              │                     │   │
│  │  └──────────────┘  └──────────────┘                     │   │
│  │  ┌──────────────┐  ┌──────────────┐                     │   │
│  │  │ Fuse.js 索引 │  │ 本地向量索引  │                     │   │
│  │  │ (全文搜索)    │  │ (Embedding)  │                     │   │
│  │  └──────────────┘  └──────────────┘                     │   │
│  └───────────────────────┬─────────────────────────────────┘   │
│                          │                                      │
│  ┌───────────────────────▼─────────────────────────────────┐   │
│  │           网络层 (直接调用外部 API)                       │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐        │   │
│  │  │ OpenRouter │  │ AI 供应商   │  │ 第三方 API  │        │   │
│  │  │ (统一入口)  │  │ (直连可选)  │  │ (搜索/翻译) │        │   │
│  │  └────────────┘  └────────────┘  └────────────┘        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

         ❌ 没有后端服务器
         ❌ 没有数据库服务器
         ❌ 没有 AI 中转服务器
         ✅ 只有 App + 外部 API
```

### 2.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **🏠 零部署** | 不需要任何服务器、VPS、Docker，App 即开即用 |
| **💾 全本地存储** | 所有数据存在设备本地（IndexedDB + 文件系统） |
| **🌐 直接调 API** | App 直接调用第三方 API（OpenRouter / AI 供应商） |
| **🔑 Key 自管理** | 用户自己配置 API Key，存储在本地，不上传任何地方 |
| **📱 跨平台** | PWA 为主，可用 Capacitor 打包成 iOS/Android 原生 App |
| **🛜 离线可用** | 核心功能（记录、复习、搜索）完全离线，仅 AI 功能需联网 |

### 2.3 为什么不部署服务器完全可行

| 原本"需要后端"的功能 | 零部署替代方案 | 效果 |
|---------------------|---------------|------|
| 用户认证 | **不需要** — 单用户本地 App，无需登录 | 更简单、更隐私 |
| 数据库 | **IndexedDB** (Dexie.js) — 浏览器内置数据库 | 零延迟、零成本 |
| AI 模型调用 | **OpenRouter** — 一个 Key 调用所有模型 | 无需自建代理 |
| 全文搜索 | **Fuse.js** / **Minisearch** — 纯前端搜索库 | 毫秒级搜索 |
| 语义搜索 | API 生成 Embedding → 本地计算 Cosine 相似度 | 效果等同服务端 |
| 知识图谱 | 前端图算法库（**graphlib** + **vis-network**） | 完全够用 |
| 复习排程 | 纯算法，客户端本地运行 SM-2 / FSRS | 零计算成本 |
| 文件/图片存储 | 浏览器 File System Access API / IndexedDB Blob | 本地即存储 |

---

## 3. 技术栈选型

### 3.1 客户端方案对比

| 方案 | 存储方式 | AI 调用 | 离线能力 | 打包原生 App | 推荐指数 |
|------|----------|---------|---------|-------------|---------|
| **PWA (React + Vite)** | IndexedDB | 浏览器 fetch | ✅ 完整 | ✅ PWA Builder | ⭐⭐⭐⭐⭐ |
| **Flutter Web** | SQLite (drift) | dart http | ✅ 完整 | ✅ Flutter 原生 | ⭐⭐⭐⭐ |
| **Tauri (桌面)** | SQLite + 文件 | Rust/JS fetch | ✅ 完整 | 仅桌面端 | ⭐⭐⭐ |
| **Electron** | SQLite + 文件 | JS fetch | ✅ 完整 | 跨平台桌面 | ⭐⭐⭐ |
| **React Native** | SQLite | JS fetch | ✅ 大部分 | ✅ iOS/Android | ⭐⭐⭐ |

### 3.2 推荐：PWA（React + Vite）

**为什么 PWA 是最佳选择？**

1. **真正零部署** — 打包成静态文件，放到 GitHub Pages / Vercel / Netlify（免费），甚至本地 `file://` 直接打开
2. **无需安装** — 手机/电脑浏览器访问即用，可"添加到主屏幕"变成 App
3. **完整离线** — Service Worker + Cache API + IndexedDB
4. **可打包原生** — 用 Capacitor / PWA Builder 打包成 Google Play / App Store 应用
5. **生态最丰富** — npm 上海量的 Markdown 编辑器、图表、搜索等库可直接用

### 3.3 前端库清单

| 用途 | 推荐库 | 说明 |
|------|--------|------|
| 框架 + 构建 | **React** + **Vite** | 最成熟的 PWA 方案 |
| 状态管理 | **Zustand** | 极简、无样板代码 |
| 路由 | **React Router** | 标准选择 |
| Markdown 编辑 | **MDXEditor** 或 **Milkdown** | 所见即所得 + 代码高亮 |
| 代码高亮 | **Shiki** 或 **Prism.js** | 代码块渲染 |
| 本地数据库 | **Dexie.js** (IndexedDB 封装) | 比 localStorage 更强大 |
| 全文搜索 | **Fuse.js** | 轻量级模糊搜索，纯前端 |
| 知识图谱可视化 | **vis-network** 或 **React Flow** | 交互式力导向图 |
| 图算法 | **graphlib** | 拓扑排序、最短路径等 |
| 间隔重复算法 | **fsrs.js** | FSRS 现代间隔重复算法 |
| 日历热力图 | **react-calendar-heatmap** | GitHub 风格贡献图 |
| UI 组件 | **shadcn/ui** + **Tailwind CSS** | 美观、可定制 |
| PWA 工具 | **vite-plugin-pwa** | 自动生成 Service Worker + Manifest |
| 本地 Embedding | **Transformers.js** | 浏览器内运行小模型生成向量 |
| 图标 | **lucide-react** | 简洁的图标库 |

---

## 4. AI 后端方案（基于你的已有 API）

你已经有 **中转站 + 硅基流动 + 智谱 + DeepSeek**，完全不需要额外注册任何 AI 服务。App 直接调用这些已有 API 即可。

### 4.1 方案总览

```
┌──────────────────────────────────────────────────────────┐
│                    学习日记 App (PWA)                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │          AI 调用管理器 (aiClient.ts)                 │  │
│  │                                                    │  │
│  │  用户的 API Key 和 Endpoint (存 IndexedDB 加密)      │  │
│  │                    │                                │  │
│  │    ┌───────────────┴───────────────┐                │  │
│  │    │      模型路由 & 故障转移       │                │  │
│  │    │  优先级: 中转站 > 硅基 > 直连  │                │  │
│  │    └───────────────┬───────────────┘                │  │
│  └────────────────────┼───────────────────────────────┘  │
│                       │                                  │
└───────────────────────┼──────────────────────────────────┘
                        │  HTTPS fetch（直接浏览器调用）
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │  🏆 中转站 │  │ 硅基流动  │  │ 智谱     │
    │ (统一入口) │  │ Silicon  │  │ Zhipu    │
    │           │  │ Flow     │  │ GLM      │
    │ 兼容OpenAI │  │ 兼容Ope- │  │ 兼容Ope- │
    │ 格式      │  │ nAI格式  │  │ nAI格式  │
    └─────┬─────┘  └─────┬────┘  └────┬─────┘
          │              │            │
          ▼              ▼            ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Claude   │  │ Qwen2.5 │  │ GLM-4    │
    │ GPT-4o   │  │ Yi      │  │ GLM-4V   │
    │ DeepSeek │  │ DeepSeek│  │          │
    │ 等等     │  │ Llama   │  │          │
    └──────────┘  └──────────┘  └──────────┘
```

### 4.2 你的四个 API 入口

```typescript
// 在 App 设置页面配置以下信息
// 所有 Key 和 URL 只会存在你自己的设备上

interface AIConfig {
  // === 1️⃣ 中转站（主力 — 统一入口） ===
  relay: {
    baseUrl: string;   // 例如: https://your-relay.com/v1
    apiKey: string;
  };

  // === 2️⃣ 硅基流动（备选） ===
  siliconflow: {
    baseUrl: string;   // https://api.siliconflow.cn/v1
    apiKey: string;
  };

  // === 3️⃣ 智谱 GLM（可选） ===
  zhipu: {
    baseUrl: string;   // https://open.bigmodel.cn/api/paas/v4
    apiKey: string;
  };

  // === 4️⃣ DeepSeek（可选 — 代码专用） ===
  deepseek: {
    baseUrl: string;   // https://api.deepseek.com/v1
    apiKey: string;
  };
}
```

### 4.3 核心优势

| 你的 API | 优势 | 推荐用途 |
|----------|------|---------|
| **中转站** | 一个入口调所有模型，价格通常最优 | ✅ **主力** — 所有 AI 功能默认走这里 |
| **硅基流动** | 模型丰富（Qwen / Yi / DeepSeek / Llama 等） | ✅ **备选** — 中转站挂了自动切这里 |
| **智谱 GLM** | 中文理解能力强、多模态（GLM-4V 看图） | ✅ **可选** — 中文理解和图片分析场景 |
| **DeepSeek** | 代码场景性价比极高 | ✅ **代码专用** — 代码解释/审查/优化 |

### 4.4 调用方式（所有入口兼容 OpenAI API 格式）

好消息是：你的 **中转站、硅基流动、智谱、DeepSeek 全都兼容 OpenAI API 格式**。App 只需要一套调用代码。

```typescript
// src/lib/ai/client.ts — 一套代码，四个入口

interface AIProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
}

// 统一调用函数
async function chatCompletion(
  provider: AIProvider,
  model: string,
  messages: { role: string; content: string }[],
  options?: { stream?: boolean; onToken?: (token: string) => void }
) {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: options?.stream ?? false,
    }),
  });

  if (!response.ok) {
    throw new Error(`${provider.name} 调用失败: ${response.status}`);
  }

  // 流式处理
  if (options?.stream && options.onToken && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          const token = json.choices?.[0]?.delta?.content;
          if (token) options.onToken(token);
        } catch { /* 跳过不完整行 */ }
      }
    }
  }
}
```

### 4.5 模型路由策略

```typescript
// src/lib/ai/router.ts — 根据任务自动选择最优模型和入口

// 可用的模型列表（用户可在设置中自定义）
const AVAILABLE_MODELS = {
  // 通过中转站可调的模型（取决于你的中转站支持哪些）
  'claude-sonnet':     { provider: 'relay', model: 'claude-3.5-sonnet' },
  'claude-haiku':     { provider: 'relay', model: 'claude-3.5-haiku' },
  'gpt-4o':           { provider: 'relay', model: 'gpt-4o' },
  'deepseek-chat':    { provider: 'relay', model: 'deepseek-chat' },

  // 硅基流动上的模型
  'qwen-max':         { provider: 'siliconflow', model: 'Qwen/Qwen2.5-72B-Instruct' },
  'yi-large':         { provider: 'siliconflow', model: '01-ai/Yi-1.5-34B-Chat' },
  'deepseek-v2':      { provider: 'siliconflow', model: 'deepseek-ai/DeepSeek-V2.5' },

  // 智谱
  'glm-4':            { provider: 'zhipu', model: 'glm-4' },
  'glm-4v':           { provider: 'zhipu', model: 'glm-4v' },  // 多模态（图片识别）

  // DeepSeek 官方
  'deepseek-official': { provider: 'deepseek', model: 'deepseek-chat' },
};

// 任务 → 模型映射（用户可自定义）
const TASK_MODEL_MAP = {
  summarize:      ['claude-sonnet', 'qwen-max'],       // 智能总结
  explain:        ['claude-sonnet', 'glm-4'],           // 概念解释
  generateCards:  ['claude-sonnet', 'deepseek-chat'],   // 生成知识卡片
  codeReview:     ['deepseek-official', 'deepseek-v2'], // 代码审查
  codeExplain:    ['deepseek-official', 'deepseek-v2'], // 代码解释
  tagSuggest:     ['deepseek-chat', 'yi-large'],        // 自动打标签
  qa:             ['claude-sonnet', 'qwen-max'],        // 智能问答
  sentiment:      ['deepseek-chat'],                    // 情绪分析
  imageAnalysis:  ['glm-4v'],                           // 图片分析（需智谱）
  embedding:      ['deepseek-chat'],                    // 文本向量化
};

// 自动路由 + 故障转移
async function callAI(task: string, messages: any[], onToken?: (t: string) => void) {
  const settings = await getSettings();  // 从 IndexedDB 读取配置
  const models = TASK_MODEL_MAP[task] || ['deepseek-chat'];

  for (const modelId of models) {
    const { provider: providerName, model: modelName } = resolveModel(modelId, settings);
    if (!providerName || !modelName) continue;

    const provider = settings.aiProviders[providerName];
    if (!provider?.apiKey) continue;

    try {
      return await chatCompletion(provider, modelName, messages, { stream: true, onToken });
    } catch (e) {
      console.warn(`${providerName}/${modelName} 失败，尝试下一个...`, e);
      continue;  // 自动切换到下一个备用模型
    }
  }

  throw new Error('所有 AI 入口均不可用，请检查 API Key 配置');
}
```

### 4.6 AI 功能与模型推荐

| AI 功能 | 推荐首选 | 推荐备选 | 说明 |
|---------|---------|---------|------|
| **智能总结** | 中转站 → Claude Sonnet | 硅基 → Qwen2.5-72B | 长篇笔记自动生成摘要 |
| **概念解释** | 中转站 → Claude Sonnet | 智谱 → GLM-4 | 复杂概念用通俗语言解释 |
| **生成知识卡片** | 中转站 → Claude Sonnet | 硅基 → DeepSeek V2.5 | 从笔记生成 Anki 卡片 |
| **代码分析/审查** | DeepSeek 官方 | 硅基 → DeepSeek V2.5 | 性价比最高 |
| **代码解释** | DeepSeek 官方 | 硅基 → DeepSeek V2.5 | 逐行解释代码 |
| **自动打标签** | 中转站 → DeepSeek Chat | 硅基 → Yi-1.5 | 便宜快速 |
| **智能问答** | 中转站 → Claude Sonnet | 智谱 → GLM-4 | 基于笔记内容回答 |
| **图片分析** | 智谱 → GLM-4V | — | 识别笔记中的截图/图表 |
| **语义搜索** | 中转站 → 任一模型 | — | 用自然语言搜笔记 |

### 4.7 一句话总结

> **App 里配置好你的中转站地址和 Key → 所有 AI 功能自动可用 → 遇到问题自动切换到硅基流动 → 代码分析走 DeepSeek → 图片分析走智谱 GLM-4V → 全部不需要部署任何服务器。**

---

## 5. 第三方 API 集成清单

### 5.1 AI / LLM 类（你已有的）

| API | 入口地址 | 调用方式 | 使用场景 |
|-----|---------|---------|---------|
| **中转站** | `你的中转站URL/v1` | App 直接 fetch | ✅ **主力入口** — 所有 AI 功能 |
| **硅基流动** | `https://api.siliconflow.cn/v1` | App 直接 fetch | ✅ **备选** — 中转站不可用时自动切换 |
| **智谱 GLM** | `https://open.bigmodel.cn/api/paas/v4` | App 直接 fetch | ✅ **中文 & 图片** — 理解中文、分析图片 |
| **DeepSeek** | `https://api.deepseek.com/v1` | App 直接 fetch | ✅ **代码专用** — 代码分析解释 |

### 5.2 增强能力类（需要额外注册）

以下为可选集成。每个都有免费额度，你可以按需注册：

| API | 用途 | 免费额度 | 是否推荐 |
|-----|------|---------|---------|
| **Jina AI Reader** | 粘贴网页链接 → 自动抓取转 Markdown → 保存为日记 | 1000 次/月 | ✅ 推荐 |
| **Tavily Search** | AI 联网搜索（查资料时自动搜索补充信息） | 1000 次/月 | ✅ 推荐 |
| **DeepL API** | 翻译（外语学习场景） | 50 万字符/月 | 可选 |
| **Whisper (通过中转站)** | 语音转文字（语音笔记） | 看你中转站是否支持 | ✅ 推荐 |

### 5.3 数据备份方案（无需部署）

| 方案 | 操作方式 | 是否需要服务器 |
|------|---------|--------------|
| **JSON 导出/导入** | 一键下载 JSON 文件，一键恢复 | ❌ |
| **WebDAV 同步** | 同步到坚果云 / NextCloud（你如果有的话） | ❌ 用已有服务 |
| **iCloud / Google Drive** | 平台内置文件同步 | ❌ 平台自带 |
| **手动复制** | 直接复制 IndexedDB 文件 | ❌ |

### 5.4 API 集成架构（更新版）

```
                    ┌──────────────────────────────┐
                    │      学习日记 App (PWA)        │
                    │                              │
                    │  ┌────────────────────────┐  │
                    │  │  API Key & URL 配置     │  │
                    │  │  (IndexedDB 加密存储)    │  │
                    │  │  ├─ 中转站 URL + Key    │  │
                    │  │  ├─ 硅基流动 Key         │  │
                    │  │  ├─ 智谱 API Key         │  │
                    │  │  └─ DeepSeek Key         │  │
                    │  └───────────┬────────────┘  │
                    │              │                │
                    │  ┌───────────▼────────────┐  │
                    │  │  AI 调用路由器          │  │
                    │  │  (自动选择 + 故障转移)  │  │
                    │  └───┬───┬───┬─────┬──────┘  │
                    └──────┼───┼───┼─────┼─────────┘
                           │   │   │     │
              ┌────────────┘   │   │     └────────────┐
              │                │   │                  │
              ▼                ▼   ▼                  ▼
    ┌─────────────────┐  ┌──────────┐  ┌──────────────────┐
    │  中转站 (主力)    │  │ 硅基流动  │  │ Jina AI Reader   │
    │  Claude / GPT    │  │ Qwen/Yi  │  │ (网页抓取)       │
    │  DeepSeek / ...  │  │ DeepSeek │  │                  │
    └─────────────────┘  │ Llama    │  │ HTTPS fetch      │
              │          └──────────┘  └──────────────────┘
              │                │
              ▼                ▼
    ┌─────────────────┐  ┌──────────┐
    │  智谱 GLM-4     │  │ DeepSeek │
    │  (中文/图片)     │  │ (代码)   │
    └─────────────────┘  └──────────┘
```

---

## 6. 数据模型与存储

### 6.1 本地数据库 Schema (Dexie.js / IndexedDB)

```typescript
// src/lib/db/schema.ts
import Dexie, { Table } from 'dexie';

export interface JournalEntry {
  id: string;
  title: string;
  content: string;           // Markdown
  contentPlain: string;      // 纯文本（搜索用）
  summary?: string;          // AI 生成的摘要
  tags: string[];
  subject: string;           // 学科分类
  difficulty?: number;       // 1-5
  timeSpentMinutes?: number; // 学习时长
  sourceType: string;        // manual / voice / import
  sourceRef?: object;        // { url, book, course }
  createdAt: number;         // timestamp
  updatedAt: number;
  deletedAt?: number;
}

export interface Note {
  id: string;
  journalId: string;
  parentId?: string;
  content: string;
  noteType: 'text' | 'code' | 'image' | 'question' | 'highlight';
  position: number;
  metadata?: object;         // { language, imageUrl, ... }
  createdAt: number;
}

export interface KnowledgeCard {
  id: string;
  journalId?: string;
  front: string;             // 问题/概念
  back: string;              // 答案/解释
  cardType: 'basic' | 'cloze' | 'image';
  tags: string[];
  // FSRS 间隔重复参数
  stability: number;
  difficulty: number;
  lastReviewAt?: number;
  nextReviewAt: number;
  repetitions: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
  createdAt: number;
}

export interface KnowledgeNode {
  id: string;
  label: string;
  description?: string;
  entryIds: string[];
  embedding?: number[];      // 向量嵌入
  createdAt: number;
}

export interface KnowledgeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: 'prerequisite' | 'related' | 'extends' | 'example';
  weight: number;
}

export interface AIConversation {
  id: string;
  journalId?: string;
  model: string;
  messages: object[];
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  createdAt: number;
}

export interface Settings {
  id: string;               // 'global'
  aiProvider: 'openrouter' | 'direct' | 'ollama';
  apiKeys: {
    openrouter?: string;
    anthropic?: string;
    deepseek?: string;
    openai?: string;
  };
  preferredModels: {
    highQuality: string;    // 默认 claude-sonnet-5
    codeTask: string;       // 默认 deepseek-coder
    fastTask: string;       // 默认 gpt-4o-mini
  };
  theme: 'light' | 'dark' | 'auto';
  // ...
}

export class StudyJournalDB extends Dexie {
  journals!: Table<JournalEntry>;
  notes!: Table<Note>;
  cards!: Table<KnowledgeCard>;
  graphNodes!: Table<KnowledgeNode>;
  graphEdges!: Table<KnowledgeEdge>;
  aiConversations!: Table<AIConversation>;
  settings!: Table<Settings>;

  constructor() {
    super('StudyJournalDB');
    this.version(1).stores({
      journals: 'id, createdAt, updatedAt, subject, *tags',
      notes: 'id, journalId, parentId, position',
      cards: 'id, journalId, nextReviewAt, state, *tags',
      graphNodes: 'id, label, *entryIds',
      graphEdges: 'id, sourceId, targetId, relationType',
      aiConversations: 'id, journalId, createdAt',
      settings: 'id'
    });
  }
}

export const db = new StudyJournalDB();
```

### 6.2 存储容量

| 数据类型 | IndexedDB 容量 | 预估可存储 |
|---------|---------------|----------|
| 文字日记 | ~50MB / 1000 篇 | 几乎无限（浏览器通常允许 GB 级） |
| 图片附件 | Blob 存储 | 取决于浏览器（Chrome 通常允许磁盘空间的 60%） |
| 向量嵌入 | 1536 维 float32 ≈ 6KB/条 | 10 万条约 600MB |
| AI 对话历史 | JSON | 可定期清理 |

### 6.3 数据备份与迁移

```typescript
// 一键导出全部数据为 JSON 文件
async function exportAllData() {
  const data = {
    version: 1,
    exportedAt: Date.now(),
    journals: await db.journals.toArray(),
    notes: await db.notes.toArray(),
    cards: await db.cards.toArray(),
    graphNodes: await db.graphNodes.toArray(),
    graphEdges: await db.graphEdges.toArray(),
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  // 触发下载
  const a = document.createElement('a');
  a.href = url;
  a.download = `study-journal-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
}

// 从 JSON 文件恢复
async function importData(file: File) {
  const data = JSON.parse(await file.text());
  await db.transaction('rw', db.journals, db.notes, db.cards, async () => {
    await db.journals.bulkPut(data.journals);
    await db.notes.bulkPut(data.notes);
    await db.cards.bulkPut(data.cards);
  });
}
```

---

## 7. 模块设计

### 7.1 功能模块树

```
📱 学习日记 App
├── 📝 日记模块
│   ├── 新建日记（Markdown 编辑器 + 代码块 + 图片）
│   ├── 日记列表（按日期 / 标签 / 学科分类）
│   ├── 日记详情 & 编辑
│   ├── AI 一键总结
│   └── 日记导出（Markdown / PDF / 图片）
│
├── 🧠 AI 助手模块
│   ├── 智能问答（基于你的笔记内容回答问题）
│   ├── 自动生成知识卡片
│   ├── 代码分析 & 优化建议
│   ├── 概念解释（用通俗语言解释复杂概念）
│   ├── 学习建议（根据学习进度推荐下一步）
│   └── 多模型切换（Claude / GPT / DeepSeek / 本地模型）
│
├── 🔗 知识图谱
│   ├── 自动提取概念 & 关联
│   ├── 可视化图谱（力导向图）
│   ├── 知识缺口分析（哪些前置概念没学）
│   └── 学习路径推荐
│
├── 📅 复习计划
│   ├── 间隔重复（FSRS 算法）
│   ├── 每日复习提醒（浏览器通知）
│   ├── 知识卡片模式（翻牌）
│   └── 复习统计
│
├── 🔍 搜索
│   ├── 全文搜索（Fuse.js）
│   ├── 语义搜索（Embedding + Cosine 相似度）
│   └── 代码搜索（按语言/函数名）
│
├── 📊 统计面板
│   ├── 学习日历（GitHub 风格热力图）
│   ├── 各学科时间分布
│   ├── 学习连续性 & 趋势
│   └── AI 用量 & 费用统计
│
├── ⚙️ 设置
│   ├── AI 模型配置 & API Key 输入
│   ├── 数据导出 / 导入
│   ├── 外观主题（亮色 / 暗色 / 跟随系统）
│   └── 隐私 & 安全
│
└── 📎 第三方集成
    ├── Web 收藏（粘贴 URL → Jina AI 抓取 → 自动保存为日记）
    ├── 翻译助手（DeepL 集成）
    └── 语音笔记（Whisper 语音转文字）
```

### 7.2 AI 助手交互流程

```
用户写完笔记 → 点击 "AI 总结"
         │
         ▼
  App 从 IndexedDB 读取笔记内容
         │
         ▼
  组装 Prompt:
  "请总结以下学习笔记的要点：
   ---
   [笔记内容]
   ---"
         │
         ▼
  AI 路由器选择模型 → 中转站 → Claude / Qwen / GLM 等
         │
         ▼
  流式接收响应 → 实时显示在 UI 上
         │
         ▼
  用户确认 → 保存到 IndexedDB (journal.summary)
```

### 7.3 知识卡片生成流程

```
用户选中笔记文本 → 点击 "生成知识卡片"
         │
         ▼
  Prompt:
  "将以下内容转换为 Anki 风格的知识卡片。
   每个重要概念生成一张卡片，包含 front（问题）和 back（答案）。
   输出 JSON 数组格式：
   [{ ""front"": ""..."" , ""back"": ""..."" }, ...]
   ---
   [选中文本]
   ---"
         │
         ▼
  AI 返回结构化 JSON
         │
         ▼
  解析 → 弹出预览卡片列表
         │
         ▼
  用户编辑/确认 → 批量存入 IndexedDB (cards 表)
         │
         ▼
  自动安排首次复习时间 (FSRS 算法)
```

---

## 8. 客户端架构设计

### 8.1 项目目录结构

```
study-journal/
├── public/
│   ├── manifest.json          # PWA Manifest
│   ├── icons/                 # App 图标
│   └── sw.js                  # Service Worker (自动生成)
│
├── src/
│   ├── main.tsx               # 入口
│   ├── App.tsx                # 根组件 + 路由
│   │
│   ├── components/            # 通用组件
│   │   ├── MarkdownEditor.tsx
│   │   ├── CodeBlock.tsx
│   │   ├── TagInput.tsx
│   │   ├── CardFlip.tsx       # 知识卡片翻转动画
│   │   ├── KnowledgeGraph.tsx # 图谱可视化
│   │   ├── Heatmap.tsx        # 学习日历热力图
│   │   └── AIChatPanel.tsx    # AI 对话面板
│   │
│   ├── pages/                 # 页面
│   │   ├── JournalList.tsx    # 日记列表
│   │   ├── JournalEdit.tsx    # 日记编辑
│   │   ├── Review.tsx         # 复习页面
│   │   ├── KnowledgeMap.tsx   # 知识图谱
│   │   ├── Stats.tsx          # 统计面板
│   │   └── Settings.tsx       # 设置页面
│   │
│   ├── lib/                   # 核心逻辑
│   │   ├── db/                # 数据库层
│   │   │   ├── schema.ts      # Dexie.js schema
│   │   │   └── queries.ts     # 查询封装
│   │   │
│   │   ├── ai/                # AI 调用层（适配你的 API）
│   │   │   ├── router.ts      # 模型路由（中转站/硅基/智谱/DeepSeek）
│   │   │   ├── client.ts      # 统一 AI 客户端（OpenAI 兼容格式）
│   │   │   ├── providers.ts   # 各 Provider 配置信息
│   │   │   └── prompts.ts     # Prompt 模板
│   │   │
│   │   ├── search/            # 搜索
│   │   │   ├── fuse.ts        # 全文搜索 (Fuse.js)
│   │   │   └── semantic.ts    # 语义搜索
│   │   │
│   │   ├── algorithms/        # 算法
│   │   │   ├── fsrs.ts        # 间隔重复算法
│   │   │   └── graph.ts       # 图算法
│   │   │
│   │   └── utils/             # 工具函数
│   │       ├── crypto.ts      # 本地加密
│   │       ├── export.ts      # 数据导出
│   │       └── notification.ts # 通知
│   │
│   ├── stores/                # Zustand 状态
│   │   ├── journalStore.ts
│   │   ├── aiStore.ts
│   │   └── settingsStore.ts
│   │
│   └── styles/
│       └── globals.css        # Tailwind 全局样式
│
├── package.json
├── vite.config.ts             # Vite + PWA 插件配置
├── tailwind.config.ts
└── tsconfig.json
```

### 8.2 AI 调用封装（核心代码示例 — 基于你的现有 API）

```typescript
// src/lib/ai/client.ts — 统一 AI 调用客户端
// 支持：中转站(主力) / 硅基流动(备选) / 智谱(中文/图片) / DeepSeek(代码)

import { getSettings } from '../db/queries';

// 从 IndexedDB 读取你的 API 配置
interface AIProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
}

async function chatCompletion(
  provider: AIProviderConfig,
  model: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; stream?: boolean; onToken?: (token: string) => void }
) {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      stream: options?.stream ?? false,
    }),
  });

  if (!response.ok) {
    throw new Error(`${provider.name} 调用失败: ${response.status}`);
  }

  // 流式输出处理
  if (options?.stream && options.onToken && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data);
          const token = json.choices?.[0]?.delta?.content;
          if (token) options.onToken(token);
        } catch { /* 跳过不完整行 */ }
      }
    }
  }

  return response;
}

// 便捷调用：按任务类型自动选择模型和入口
async function aiChat(
  taskType: 'summarize' | 'explain' | 'codeReview' | 'qa' | 'tagSuggest' | 'imageAnalysis',
  messages: { role: string; content: string }[],
  options?: { onToken?: (token: string) => void }
) {
  const settings = await getSettings();
  const modelConfig = TASK_MODEL_MAP[taskType];

  // 获取对应的 Provider 配置
  const provider = settings.aiProviders[modelConfig.provider];
  if (!provider?.apiKey) {
    throw new Error(`请先在设置中配置 ${modelConfig.provider} 的 API Key`);
  }

  return chatCompletion(provider, modelConfig.model, messages, {
    temperature: 0.7,
    stream: true,
    onToken: options?.onToken,
  });
}
```

### 8.3 间隔重复算法（FSRS）

```typescript
// src/lib/algorithms/fsrs.ts
// 基于 FSRS (Free Spaced Repetition Scheduler) 算法

interface CardState {
  stability: number;
  difficulty: number;
  lastReviewAt: number;
  repetitions: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
}

type Rating = 1 | 2 | 3 | 4; // again / hard / good / easy

const PARAMS = {
  requestRetention: 0.9,  // 目标记忆保留率 90%
  maximumInterval: 36500, // 最大间隔（天）
  w: [0.4, 0.6, 2.4, 5.8, ...], // FSRS 参数（可调优）
};

export function schedule(card: CardState, rating: Rating): CardState {
  const now = Date.now();
  const elapsedDays = card.lastReviewAt
    ? Math.floor((now - card.lastReviewAt) / 86400000)
    : 0;

  let { stability, difficulty, state, repetitions } = card;

  // 根据评分更新参数
  if (state === 'new') {
    stability = initStability(rating);
    difficulty = initDifficulty(rating);
    state = 'review';
  } else {
    const preDifficulty = difficulty;
    const preStability = stability;

    difficulty = nextDifficulty(preDifficulty, rating);
    stability = nextStability(
      preStability, preDifficulty, rating, elapsedDays, state
    );
  }

  const interval = Math.max(1, Math.round(stability * Math.log(PARAMS.requestRetention) / Math.log(0.9)));
  repetitions += 1;

  return {
    stability,
    difficulty,
    lastReviewAt: now,
    repetitions,
    state,
    nextReviewAt: now + interval * 86400000,
  } as CardState;
}
```

---

## 9. 开发路线图

### Phase 1 — MVP 基础版（2-3 周）

- [ ] 项目脚手架（React + Vite + Tailwind + PWA 配置）
- [ ] IndexedDB 数据层（Dexie.js schema + CRUD）
- [ ] 日记模块（新建、编辑、列表、删除）
- [ ] Markdown 编辑器集成（MDXEditor）
- [ ] AI 设置页面（API Key 配置界面）
- [ ] AI 智能总结（调用 OpenRouter → Claude）
- [ ] PWA 离线支持（Service Worker）
- [ ] 部署到 Vercel / GitHub Pages（免费静态托管）

### Phase 2 — AI 增强（2-3 周）

- [ ] AI 对话助手（流式输出）
- [ ] 自动生成知识卡片
- [ ] 代码分析功能
- [ ] 概念解释功能
- [ ] 多模型切换 UI
- [ ] AI 用量统计

### Phase 3 — 知识管理（3-4 周）

- [ ] 全文搜索（Fuse.js）
- [ ] 语义搜索（Embedding + Cosine）
- [ ] 知识图谱可视化（vis-network）
- [ ] 知识关联建议（AI）
- [ ] 学习路径推荐

### Phase 4 — 复习系统（2 周）

- [ ] FSRS 间隔重复算法
- [ ] 知识卡片复习界面（翻牌动画）
- [ ] 复习提醒通知
- [ ] 复习统计

### Phase 5 — 增强 & 生态（持续）

- [ ] 统计面板（热力图、学科分布、趋势图）
- [ ] Web 收藏功能（Jina AI 集成）
- [ ] 语音笔记（Whisper 集成）
- [ ] 翻译助手（DeepL）
- [ ] 数据导出（JSON / Markdown / Anki 格式）
- [ ] Capacitor 打包 iOS/Android 原生 App

---

## 10. 附录：参考资源

### API 文档（你已有的）

| 服务 | 文档地址 | 说明 |
|------|---------|------|
| **你的中转站** | 由你的中转站提供 | 主力入口，所有模型通用 |
| **硅基流动** | https://docs.siliconflow.cn/docs | Qwen / Yi / DeepSeek / Llama 等 |
| **智谱开放平台** | https://open.bigmodel.cn/dev/api | GLM-4 / GLM-4V（多模态） |
| **DeepSeek** | https://platform.deepseek.com/api-docs | DeepSeek Chat / Coder |

### 可选增强 API

| 服务 | 文档 | 免费额度 |
|------|------|---------|
| Jina AI Reader | https://jina.ai/reader | 1000 次/月 |
| Tavily Search | https://tavily.com/api | 1000 次/月 |
| DeepL | https://www.deepl.com/zh/pro-api | 50 万字符/月 |

### 开源项目参考

| 项目 | 参考价值 |
|------|---------|
| Logseq (https://github.com/logseq/logseq) | 本地优先 + 知识图谱架构 |
| SiYuan Note (https://github.com/siyuan-note/siyuan) | 数据模型设计 |
| fsrs4anki (https://github.com/open-spaced-repetition/fsrs4anki) | 间隔重复算法 |
| Obsidian（参考概念） | 双向链接、知识管理理念 |

### 零成本托管方案

| 平台 | 说明 | 限制 |
|------|------|------|
| **Vercel** | 一键部署 React PWA，自动 HTTPS | 免费版 100GB 带宽/月 |
| **GitHub Pages** | 免费静态托管 | 公开仓库，1GB 空间 |
| **Cloudflare Pages** | 免费静态托管，全球 CDN | 500 构建/月 |

### 费用估算

| 项目 | 费用 |
|------|------|
| App 托管 (Vercel / GitHub Pages) | **免费** |
| 你的中转站 / 硅基流动 / 智谱 / DeepSeek | 你已有，只需消耗额度 |
| Jina AI Reader（可选） | 免费 1000 次/月 |
| DeepL（可选） | 免费 50 万字符/月 |
| 域名（可选） | ~$10/年 |
| **总成本** | **约 ¥0**（如果你已有的 API 额度够用） |
