# Agent 面试通关学习产品架构

## 目标

本产品以 `learn-agent-interview` Markdown 课程为唯一事实来源，提供两条隔离链路：

1. **严格问答**：只能根据召回的原文总结；没有证据时拒答；每条回答附可点击 Citation。
2. **复习教练**：根据用户问题识别主题，生成诊断题，评价作答，再由本地确定性算法安排复习。

LLM 只负责总结、出题和评价建议；来源校验、掌握度写入和复习计划不交给模型决定。

## 模型依赖与可选项

### 必需：一个支持中文和 JSON 输出的指令模型

同一个模型可以承担三类任务：

- 严格问答：根据 6～8 个 Markdown chunk 生成原文总结。
- 诊断题生成：根据当前主题和来源生成一道回忆/对比/边界/应用题。
- 作答评价：根据题目、用户答案和原文给出 0～4 分及遗漏点。

模型不需要 Agent Tool Calling，也不需要自主规划工具，因为本产品的检索、引用校验、掌握度和计划由本地代码控制。最低配置只需要一个能稳定遵守 JSON 格式的模型；当前设置页的“高质量任务（总结/问答）”就是这一路模型，路由会优先使用该选择。

### 可选：快速模型

如果希望降低成本，可以把标签、普通总结等任务放到“快速任务”模型；zero2Agent 的严格问答、诊断题和评价仍建议使用高质量模型。

### 可选：Embedding / dsv4 Reranker

Embedding 和 Reranker 不是运行前提，但设置页已经提供“模型中心与角色绑定”：

- `BAAI/bge-small-zh-v1.5` 绑定向量召回，向量索引通过 `scripts/generate-zero2agent-embeddings.mjs` 生成。
- `dsv4` 可以绑定检索重排，对关键词/向量召回的前 30 个候选进行 JSON 排序。
- dsv4 不参与初始向量召回；Embedding 服务或向量索引不可用时自动退回关键词检索。
- 重排超时或 JSON 不合法时保留原始检索结果，不阻塞问答和复习。

```text
Embedding 模型：语义召回
Reranker 模型：候选精排
```

这两个模型只影响检索质量，不参与最终掌握度计算。模型中心还可以分别绑定严格回答、复习辅导、复习评分和计划角色，同一个 dsv4 配置可以被多个角色复用。

## 内容管线

```text
Markdown 原文
  → frontmatter 过滤
  → H1-H6 标题栈
  → headingPath 章节路径
  → 问题/答案语义单元
  → 长段落按 900 字符边界切分
  → knowledge chunk + offset + anchor
```

每个 chunk 必须包含 `docId`、`topicId`、`headingPath`、`content`、`startOffset`、`sourceUrl` 和稳定 `chunkId`。问题标题和答案正文尽量保持在同一个章节单元内；长章节只在段落或句号边界切分，不跨越标题。

构建产物是 `public/zero2agent-kb.json`，原始 Markdown 复制到 `public/zero2agent/`，因此可以离线查看和定位。

## 严格问答链路

```text
用户问题
  → scope=learn-agent-interview
  → 查询重写（可选）
  → 关键词 + 向量混合召回（向量不可用时自动降级）
  → dsv4 候选重排（可选）
  → 标题/章节加权、每文档最多两个 chunk
  → Top-K
  → JSON Tutor Prompt
  → citationChunkIds 白名单校验
  → 答案 + 来源卡片
```

问答 Agent 不允许使用 Web 或个人文档。模型输出必须是：

```json
{
  "answer": "基于原文的总结",
  "citationChunkIds": ["真实存在的 chunkId"],
  "insufficient": false
}
```

如果模型输出不是合法 JSON、没有合法引用或模型服务失败，系统显示原文摘录，不回退到模型常识。

来源有两种入口：

- 应用内 `/source/zero2agent?chunkId=...`：加载索引、滚动并高亮对应片段。
- 原始网页 URL：作为外部查看入口，附章节 anchor（若页面提供稳定 anchor）。

## 复习教练链路

```text
问题
  → 本地范围闸门
  → 课程主题召回
  → Tutor 讲解 + 诊断题
  → 用户作答
  → Evaluator 基于原文评分
  → 记录 attempt
  → 更新 topic mastery
  → FSRS 调度与每日计划
```

提问只增加兴趣证据，不直接提高掌握度。只有带有合法原文证据的作答评价才可以更新掌握度。

当前复习默认只使用 `learn-agent-interview/`，计划优先考虑：掌握度薄弱、复习到期、前置主题缺口、连续错误和证据不足。

## 数据边界

问答对话使用 `aiConversations`；复习使用独立的 `zero2ReviewSessions`、`zero2ReviewMessages`、`zero2ReviewAttempts`、`zero2Mastery`、`zero2ReviewPlans` 和 `zero2ReviewTasks`，不写入个人文档和通用卡片。

## 后续升级顺序

1. 保持关键词召回作为稳定降级路径。
2. 运行 `npm run generate:zero2agent-embeddings` 生成 Embedding 索引并启用混合检索。
3. 根据评测集调节关键词/向量权重，再决定是否开启 dsv4 重排。
4. 增加模拟面试、追问、计时和公司偏好筛选。
5. 用固定评测集验证回答准确率、引用命中率、拒答率和复习计划完成率。
