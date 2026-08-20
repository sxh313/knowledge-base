# zero2Agent 复习 Agent 实施 TODO

目标版本：v1.6.0
状态：v1.6.0 本地实现已完成；Windows 安装器和 Android 签名属于发布环境门禁
原则：独立领域、固定知识源、先分类后检索、先证据后评分、确定性规划、无关问题零污染。
当前产品范围：默认以 `learn-agent-interview/`（Agent 面试通关）作为问答和复习课程；如需开放完整 zero2Agent，只需调整 `DEFAULT_ZERO2_REVIEW_PATH_PREFIX`。

## v1.6.0 执行结果

已完成并已验证：独立 `zero2review` 领域与 Dexie schema v10、zero2Agent-only 检索和来源闸门、无关问题隔离、课程索引元数据、Markdown 标题栈/问答单元切块、Tutor/评价结构化输出、诊断题、掌握度与 FSRS 调度、可解释的确定性每日计划、独立路由和页面、JSON v5 备份、受控 GitHub 同步、移动端样式、帮助文档与发布元数据。后续增量补充了可注入依赖的 Orchestrator、幂等作答/任务操作、确定性时间参数、课程前置依赖校验、目录模块/依赖查询、掌握度解释、评分纠正重算、原子消息写入、模型中心/Embedding 配置、关键词+向量混合检索、dsv4 候选重排、刷新恢复计划面板、计划暂停/恢复和来源隔离测试。`npm test`（23 个测试文件、142 个用例）、Web 构建、zero2Agent 索引重建和 Android Web 资源同步均已通过；Android Gradle 被本机缺少 Java/JAVA_HOME 阻塞，Electron-builder 在依赖扫描阶段超时，已保留 `win-unpacked`，未把未完成安装器视为成功。

本 TODO 中的历史细分 checkbox 没有逐项回写，但以上执行结果以当前代码和测试为准。剩余发布门禁主要是外部环境（Java、Windows 安装器签名、Android 签名、远端发布）。Embedding 服务属于可选增强：不部署时使用关键词检索；部署并启用后才生成向量索引并启用关键词+向量双路召回。

## v1.6.1 增量审计结果+

- [x] 模型中心支持分别填写 Chat、Embedding 端点，并将 dsv4 绑定到回答、重排、复习和评分角色。
- [x] Embedding 服务/索引不可用时自动退回关键词检索，dsv4 重排失败时不阻塞回答。
- [x] 页面刷新后恢复最近复习会话、活动计划、今日任务和掌握度。
- [x] 计划面板支持暂停、恢复和重新规划；掌握度面板支持展开查看作答证据解释。
- [x] 增加 zero2Agent 检索边界测试，验证个人/Web 来源拒绝、每文档两片段限制和 topic 聚合。
- [x] BGE Embedding 设计为可选增强：未配置时关键词检索正常工作；配置并启用后才运行 `npm run generate:zero2agent-embeddings`，启用关键词+向量双路召回。

## 一、最终验收目标

- [x] 复习 Agent 只检索 zero2Agent，不检索个人文档或 Web。
- [x] 无关问题不进入复习上下文、不写数据库、不影响掌握度和计划。
- [x] 模糊问题只要求澄清，澄清前不写学习数据。
- [x] 用户提出问题只增加兴趣证据，不直接改变掌握度。
- [x] 用户完成诊断题后才更新掌握度和 FSRS 调度。
- [x] 所有知识回答都带可验证的 zero2Agent 来源。
- [x] 模型只负责分类、讲解和评分建议，不能直接写数据库或决定最终计划。
- [x] 复习计划由本地确定性算法生成，并能解释推荐原因。
- [x] 刷新后可以恢复会话、诊断题、计划和进度。
- [x] 普通 AI、通用 Agent、个人文档和现有卡片复习不受影响。
- [x] 支持 JSON 备份，以及受控的可选同步。

---

## 二、P0：领域边界与绝对隔离

### ZR-001 定义领域类型

目标文件：`src/lib/zero2review/types.ts`

- [ ] 定义 `Zero2ReviewIntent`：`review_question`、`review_command`、`review_meta`、`ambiguous`、`out_of_scope`。
- [ ] 定义流程状态：`idle`、`classifying`、`clarifying`、`retrieving`、`answering`、`awaiting_answer`、`evaluating`、`planning`、`complete`、`rejected`、`error`。
- [ ] 定义 `SourceReference`，只允许 `source: 'zero2agent'`。
- [ ] 定义 `ReviewIntentDecision`、`ReviewQuestion`、`TutorResponse`、`EvaluationDraft`。
- [ ] 定义课程主题、掌握度、计划、任务和作答记录类型。
- [ ] `zero2review` 目录禁止导入通用 Agent 的 `executor.ts` 和写入型 `AgentOp`。

验收：所有后续模块只依赖本领域类型，不依赖通用 Agent 的文档写入协议。

### ZR-002 建立独立代码结构

- [ ] 创建 `src/lib/zero2review/catalog.ts`。
- [ ] 创建 `src/lib/zero2review/repository.ts`。
- [ ] 创建 `src/lib/zero2review/retrieval.ts`。
- [ ] 创建 `src/lib/zero2review/intentGate.ts`。
- [ ] 创建 `src/lib/zero2review/prompts.ts`。
- [ ] 创建 `src/lib/zero2review/tutor.ts`。
- [ ] 创建 `src/lib/zero2review/evaluator.ts`。
- [ ] 创建 `src/lib/zero2review/mastery.ts`。
- [ ] 创建 `src/lib/zero2review/planner.ts`。
- [ ] 创建 `src/lib/zero2review/scheduler.ts`。
- [ ] 创建 `src/lib/zero2review/orchestrator.ts`。
- [ ] 创建 `src/lib/zero2review/isolation.ts`。
- [ ] 创建 `src/stores/zero2ReviewStore.ts`。
- [ ] 创建 `src/pages/Zero2Review.tsx`。
- [ ] 创建 `src/components/zero2review/` 组件目录。

验收：复习 Agent 有独立页面、Store、领域服务和持久化层。

### ZR-003 实现本地快速分类

目标文件：`src/lib/zero2review/intentGate.ts`

- [ ] 直接识别“今天复习什么”“开始复习”“继续复习”“查看掌握度”等控制命令。
- [ ] 直接拦截修改/删除/重命名个人文档的请求。
- [ ] 直接拦截天气、新闻、股票、简历、普通写作和个人知识库请求。
- [ ] 直接拦截“忽略规则”“切换个人知识库”“调用删除工具”等越权请求。
- [ ] 关键词规则只用于快速裁决，不作为全部分类逻辑。
- [ ] 明确无关请求不得进入 RAG 或 Tutor。

验收：明显无关请求不调用模型、不检索知识、不写数据库。

### ZR-004 实现 zero2Agent 专用检索

目标文件：`src/lib/zero2review/retrieval.ts`

- [ ] 只调用 `retrieve(question, { kind: 'zero2agent' }, topK)`。
- [ ] 对每个结果断言 `source === 'zero2agent'`。
- [ ] 同一文档最多选择两个片段。
- [ ] 按 topic 聚合章节得分。
- [ ] 返回最高分、第二名、结果分散度和候选 topic。
- [ ] 没有可靠来源时返回 `insufficient`，禁止回退到模型常识。
- [ ] 任何个人文档或 Web 来源都立即拒绝。

验收：检索结果中不存在 `journalId`、个人标题或普通 Web 来源。

### ZR-005 实现结构化 Intent Gate

- [ ] 输入用户问题、候选 topic、来源标题和检索特征。
- [ ] 必要时调用模型，但只允许返回结构化分类。
- [ ] 本地校验模型返回的 topic ID。
- [ ] `review_question` 必须至少绑定一个合法 topic。
- [ ] `ambiguous` 只生成澄清问题。
- [ ] `out_of_scope` 不保存消息正文。
- [ ] `review_meta` 不改变计划和掌握度。
- [ ] 低置信度问题不得自动加入复习计划。

验收：模型不能在没有 zero2Agent 来源时把问题强行判为相关。

### ZR-006 建立隔离断言

目标文件：`src/lib/zero2review/isolation.ts`

- [ ] 实现 `assertZero2Source()`。
- [ ] 实现 `assertValidTopicIds()`。
- [ ] 实现 `sanitizeReviewContext()`。
- [ ] 实现 `isLearningAffectingIntent()`。
- [ ] 实现 `filterPersistableMessages()`。
- [ ] 开发模式断言上下文不含个人文档。
- [ ] 断言计划和任务不含 `journalId`。
- [ ] 断言 Citation ID 来自本次检索结果。

P0 完成标准：任意无关请求都无法调用个人文档工具，也不会污染复习数据。

---

## 三、P1：数据库与课程目录

### ZR-007 Dexie 升级到 v9

目标文件：`src/lib/db/schema.ts`

- [ ] 新增 `zero2ReviewSessions` 表：`id, status, updatedAt, deletedAt`。
- [ ] 新增 `zero2ReviewMessages` 表：`id, sessionId, intent, createdAt, [sessionId+createdAt]`。
- [ ] 新增 `zero2Mastery` 表：`topicId, state, nextReviewAt, updatedAt`。
- [ ] 新增 `zero2ReviewPlans` 表：`id, goalId, status, updatedAt, deletedAt`。
- [ ] 新增 `zero2ReviewTasks` 表：`id, planId, topicId, date, status, updatedAt, [planId+date]`。
- [ ] 新增 `zero2ReviewAttempts` 表：`id, sessionId, topicId, answeredAt, [topicId+answeredAt]`。
- [ ] 为可同步实体加入 `updatedAt/deletedAt`。
- [ ] 旧数据库升级不得修改个人文档和卡片。

### ZR-008 实现独立 Repository

目标文件：`src/lib/zero2review/repository.ts`

- [ ] 实现复习会话的创建、读取、归档和软删除。
- [ ] 只保存通过范围检查的有效消息。
- [ ] 实现 topic 掌握度读取与保存。
- [ ] 实现到期 topic 查询。
- [ ] 实现复习计划和每日任务增删改查。
- [ ] 实现作答记录保存和 topic 历史查询。
- [ ] 所有知识来源只接受 `topicId/sourceId/chunkId/path`。
- [ ] Repository 不导出 journals/cards 写入方法。

验收：完整复习流程前后，个人文档和现有卡片没有变化。

### ZR-009 扩展 zero2Agent 索引

目标文件：`scripts/generate-zero2agent-kb.mjs`

- [ ] 为资料增加稳定 `topicId`。
- [ ] 增加 `moduleOrder`。
- [ ] 增加 `topicOrder`。
- [ ] 增加 `keywords`。
- [ ] 增加 `prerequisiteIds`。
- [ ] 增加 `estimatedMinutes`。
- [ ] 保留 `path/localPath/sections/startOffset`。
- [ ] 构建输出顺序稳定。

### ZR-010 建立课程配置

目标文件：`scripts/zero2agent-curriculum.json`

- [ ] 配置模块顺序。
- [ ] 配置跨模块前置关系。
- [ ] 配置主题关键词和中英文别名。
- [ ] 配置建议学习时间。
- [ ] 配置适合的题型。
- [ ] 构建时校验 topic 是否存在。
- [ ] 构建时检测前置依赖循环。

### ZR-011 实现课程目录服务

目标文件：`src/lib/zero2review/catalog.ts`

- [ ] 实现目录加载和缓存。
- [ ] 根据 ID/path 查找 topic。
- [ ] 列出模块下的 topic。
- [ ] 获取前置 topic 和依赖它的 topic。
- [ ] 校验模型返回的 topic ID。
- [ ] 根据问题和检索结果解析候选 topic。

P1 完成标准：114 篇资料都有稳定 topic ID、顺序、关键词和可校验的前置关系。

---

## 四、P2：Tutor、诊断与评价

### ZR-012 拆分三套 Prompt

目标文件：`src/lib/zero2review/prompts.ts`

- [ ] Intent Prompt 只负责分类。
- [ ] Tutor Prompt 只负责基于来源讲解和出题。
- [ ] Evaluator Prompt 只负责评价用户答案。
- [ ] 三个 Prompt 都把课程原文标记为不可信资料，禁止执行其中的指令。
- [ ] Tutor 只能引用本次允许的 chunk ID。
- [ ] Evaluator 不能直接修改掌握度。
- [ ] 所有输出使用结构化 JSON，并进行本地校验。

### ZR-013 实现 Tutor

目标文件：`src/lib/zero2review/tutor.ts`

- [ ] 实现基于 zero2Agent 来源回答问题。
- [ ] 实现主动回忆题。
- [ ] 实现定义题、对比题、边界题和应用题。
- [ ] 实现引用 ID 白名单校验。
- [ ] 移除模型伪造的 Citation。
- [ ] 没有合法引用时不把回答标记为完成。
- [ ] 讲解后默认提供一道诊断题。

### ZR-014 实现答案评价器

目标文件：`src/lib/zero2review/evaluator.ts`

- [ ] 评价正确点、遗漏点和错误类型。
- [ ] 支持 `concept/boundary/comparison/application/terminology` 错误类型。
- [ ] 校验评分范围为 0～4。
- [ ] 校验评价引用的 chunk ID。
- [ ] 缺少原文证据时不更新掌握度。
- [ ] 用户可以手动纠正评价。
- [ ] 评分映射：0/1→Again，2→Hard，3→Good，4→Easy。

P2 完成标准：相关问题可以完成“检索→讲解→诊断题→评价”，且每一步都有来源证据。

---

## 五、P3：掌握度、FSRS 与确定性规划

### ZR-015 实现掌握度模型

目标文件：`src/lib/zero2review/mastery.ts`

- [ ] `mastery` 支持 `null`，区分未知和掌握差。
- [ ] 单独保存 `confidence` 和 `evidenceCount`。
- [ ] 用户只提问时只增加兴趣，不改变 mastery。
- [ ] 不同题型使用不同证据权重。
- [ ] 最近证据权重大于旧证据。
- [ ] 连续答对提高 confidence。
- [ ] 实现薄弱 topic 和证据不足 topic 查询。
- [ ] 实现掌握度解释，列出依据的作答记录。

### ZR-016 复用 FSRS 调度

目标文件：`src/lib/zero2review/scheduler.ts`

- [ ] 封装现有 `scheduleFSRS()`。
- [ ] 复习状态保存在 `zero2Mastery`，不写现有 cards 表。
- [ ] 答错进入 `relearning`。
- [ ] 答对进入或保持 `review`。
- [ ] 跳过任务不视为答错。
- [ ] 支持当天短间隔重试。
- [ ] 支持查询到期 topic。

### ZR-017 实现主题优先级

目标文件：`src/lib/zero2review/planner.ts`

- [ ] 实现薄弱程度分数。
- [ ] 实现前置知识缺口分数。
- [ ] 实现目标相关性分数。
- [ ] 实现到期程度分数。
- [ ] 实现近期提问兴趣分数。
- [ ] 实现证据不足分数。
- [ ] 使用固定权重计算总优先级。
- [ ] 保存各分项和推荐理由。
- [ ] 相同输入必须产生相同排序。

建议公式：

```text
priority =
0.30 × weakness
+ 0.20 × prerequisiteGap
+ 0.20 × goalRelevance
+ 0.15 × overdue
+ 0.10 × recentInterest
+ 0.05 × lowEvidence
```

### ZR-018 生成每日计划

- [ ] 40% 时间分配给到期复习。
- [ ] 30% 时间分配给薄弱知识。
- [ ] 20% 时间分配给新知识和前置知识。
- [ ] 10% 时间分配给自由提问和总结。
- [ ] 每日预计时间不得超过预算 10%。
- [ ] 同一 topic 每天最多两个主要任务。
- [ ] 前置知识未达标时限制高级主题。
- [ ] 已完成任务不得被重新规划删除。
- [ ] 只重排今天以后未完成任务。
- [ ] 重复规划不得产生重复任务。
- [ ] 每条任务保存 topic、来源、时长和推荐原因。

P3 完成标准：系统可以根据目标、作答证据、前置关系和 FSRS 生成可解释的每日计划。

---

## 六、P4：Orchestrator、Store 与 UI

### ZR-019 实现流程编排器

目标文件：`src/lib/zero2review/orchestrator.ts`

- [ ] 使用依赖注入创建编排器，便于测试模型、检索、时间和 Repository。
- [ ] 实现 `handleInput()`。
- [ ] 实现 `startReview()` 和 `continueReview()`。
- [ ] 实现 `submitAnswer()`。
- [ ] 实现 `skipTask()` 和 `finishTask()`。
- [ ] 实现 `rebuildPlan()`。
- [ ] 按“清洗→分类→检索→裁决→讲解→诊断→评价→掌握度→调度→规划”运行。
- [ ] 任一步失败都不能留下半写入数据。
- [ ] 为提交答案和重新规划增加幂等 ID。

### ZR-020 实现 Zustand Store

目标文件：`src/stores/zero2ReviewStore.ts`

- [ ] 管理当前 Session、计划、今日任务和当前 topic。
- [ ] 管理有效对话、诊断题、来源和状态机阶段。
- [ ] 管理掌握度概览和错误状态。
- [ ] Store 不直接访问 Dexie 表。
- [ ] 刷新后恢复会话和待回答问题。
- [ ] 切换普通 AI 时不携带复习上下文。

### ZR-021 新增独立路由和入口

目标文件：`src/App.tsx`、`src/pages/ReviewPage.tsx`、`src/pages/LearningGoals.tsx`

- [ ] 新增 `/zero2-review` 懒加载路由。
- [ ] 在复习页增加“zero2Agent 复习教练”入口。
- [ ] 在学习目标页增加“用 zero2Agent 制定计划”入口。
- [ ] 不与普通 AI 或通用 Agent 共用 Query 参数和会话。

### ZR-022 实现页面组件

- [ ] `ReviewHeader.tsx`：目标、状态、预计时间。
- [ ] `TodayTaskList.tsx`：到期、薄弱、新知识和完成进度。
- [ ] `ReviewConversation.tsx`：只显示有效复习对话。
- [ ] `DiagnosticQuestion.tsx`：答题、提交和手动纠正评分。
- [ ] `ReviewPlanPanel.tsx`：日期、任务、时长、理由、调整和暂停。
- [ ] `MasteryPanel.tsx`：未知、证据不足、学习中、待复习、已掌握。
- [ ] `SourceEvidence.tsx`：来源标题、章节和原文定位。
- [ ] `OutOfScopeNotice.tsx`：解释拒绝原因并提供普通 AI/Agent 入口。
- [ ] 无关问题不得自动转发到其他页面。
- [ ] 完成移动端布局和键盘操作。

P4 完成标准：用户能在独立页面完成“提问→讲解→测验→计划调整→查看掌握度”。

---

## 七、P5：备份、同步与隐私

### ZR-023 更新 JSON 备份

目标文件：`src/lib/services/export.ts`

- [ ] 备份版本由 4 升到 5。
- [ ] 导出全部 `zero2Review*` 业务数据。
- [ ] 老版本备份缺少这些字段时仍可导入。
- [ ] 导入使用合并写入，不覆盖无关数据。
- [ ] 导入后重建必要的复习派生状态。
- [ ] 不导出 AI Key 和 GitHub Token。

### ZR-024 更新同步边界

目标文件：`src/lib/sync/github.ts`、设置页面。

- [ ] 默认同步掌握度、计划、任务和会话基础信息。
- [ ] 默认不同步完整自由提问、用户答案和模型评价正文。
- [ ] 新增 `syncZero2ReviewHistory` 开关，默认关闭。
- [ ] 开启后才同步复习消息和 Attempt 正文。
- [ ] 支持 `updatedAt/deletedAt` 合并。
- [ ] 同步不得包含 zero2Agent 原始课程正文。

P5 完成标准：进度可以跨设备恢复，敏感问答默认不上传。

---

## 八、测试清单

### ZR-025 Intent Gate 测试

目标文件：`src/lib/zero2review/intentGate.test.ts`

- [ ] 至少 20 条明确相关问题。
- [ ] 至少 30 条明确无关问题。
- [ ] 至少 15 条模糊问题。
- [ ] 覆盖提示词攻击和越权请求。
- [ ] 无关问题拦截率必须为 100%。
- [ ] 无关问题数据库写入次数必须为 0。
- [ ] 模糊问题只能进入澄清状态。

### ZR-026 来源隔离测试

目标文件：`src/lib/zero2review/retrieval.test.ts`

- [ ] 所有来源均为 `zero2agent`。
- [ ] 不包含个人文档 ID。
- [ ] 不包含普通 Web 来源。
- [ ] 无来源时不调用 Tutor。
- [ ] 模型伪造 Citation 时会被过滤。

### ZR-027 数据零污染测试

- [ ] 记录执行前 journal 数量和 contentHash。
- [ ] 记录执行前 cards 和通用 Agent Session 数量。
- [ ] 完成完整复习流程。
- [ ] 验证 journals、hash、cards、agentSessions 均不变。
- [ ] 验证只有 `zero2Review*` 表变化。

### ZR-028 规划器测试

- [ ] 相同输入生成相同任务。
- [ ] 前置知识优先。
- [ ] 到期知识优先。
- [ ] 薄弱知识优先。
- [ ] 答错知识进入近期重学。
- [ ] 已完成任务不被删除。
- [ ] 每日任务不超过时间预算。
- [ ] 不产生重复任务。

### ZR-029 掌握度测试

- [ ] 只提问不改变 mastery。
- [ ] 答错降低掌握度并进入重学。
- [ ] 连续应用题答对提高 confidence。
- [ ] 很久未复习不会把掌握度清零。
- [ ] 缺少引用证据时不评分。
- [ ] 用户修正评分后重新计算。

### ZR-030 恢复与幂等测试

- [ ] 刷新后恢复 Session。
- [ ] 刷新后恢复待回答诊断题。
- [ ] 重复提交答案只生成一个 Attempt。
- [ ] 重复规划不生成重复 Task。
- [ ] 同步合并不重复累计 evidenceCount。

---

## 九、文档与发布

### ZR-031 更新文档和帮助

- [ ] 更新 `README.md`。
- [ ] 更新 `docs/架构说明.md`。
- [ ] 更新应用内 `Manual.tsx`。
- [ ] 更新 `CHANGELOG.md`。
- [ ] 明确复习 Agent 只使用 zero2Agent。
- [ ] 明确用户提问不等于掌握。
- [ ] 明确无关问题不进入复习数据。
- [ ] 明确问答历史默认不同步。

### ZR-032 发布门禁

- [ ] `npm ci` 成功。
- [ ] `npm test` 全部通过。
- [ ] `npm run build` 成功。
- [ ] `npm run electron:build` 成功。
- [ ] Android 目标 Vite 构建成功。
- [ ] zero2Agent 索引可重新生成。
- [ ] 课程依赖检查无环。
- [ ] 构建产物无 API Key 或 GitHub Token。
- [ ] Web、Electron、Android 路由正常。
- [ ] 390px 移动端无横向滚动。
- [ ] 离线状态仍能打开 zero2Agent 原文。

### ZR-033 发布 v1.6.0

- [ ] `package.json` 更新为 `1.6.0`。
- [ ] Android `versionCode` 从 23 增加到 24。
- [ ] Android `versionName` 更新为 `1.6.0`。
- [ ] CHANGELOG 写入完整变化。
- [ ] 提交全部代码和文档。
- [ ] rebase 远端同步产生的 `data.json` 提交，禁止强推覆盖。
- [ ] 创建并推送 `v1.6.0` 标签。
- [ ] 验证 Windows Build 成功。
- [ ] 验证 Android Build 成功。
- [ ] 验证 Release 包含安装器、blockmap、`latest.yml` 和签名 APK。

---

## 十、推荐提交顺序

- [ ] `feat(review-agent): add zero2 review domain types and schema`
- [ ] `feat(review-agent): build zero2 curriculum catalog`
- [ ] `feat(review-agent): add isolated intent and retrieval gates`
- [ ] `test(review-agent): verify out-of-scope zero pollution`
- [ ] `feat(review-agent): add tutor and answer evaluator`
- [ ] `feat(review-agent): add mastery and FSRS scheduling`
- [ ] `feat(review-agent): add deterministic review planner`
- [ ] `feat(review-agent): add orchestrator and persistence`
- [ ] `feat(review-agent): add review coach UI`
- [ ] `feat(review-agent): add backup and optional sync`
- [ ] `test(review-agent): cover recovery and planning`
- [ ] `docs: document zero2 review coach`
- [ ] `release: v1.6.0`

## 十一、强制停止条件

出现以下任一情况时停止后续开发，先修复隔离问题：

- [ ] 无关问题被保存到复习消息表。
- [ ] Tutor 收到个人文档内容。
- [ ] Citation 来源不是 zero2Agent。
- [ ] 复习流程修改了 journals、cards 或通用 Agent 数据。
- [ ] 用户只提问就提高了掌握度。
- [ ] 模型可以绕过本地规划器直接写计划或掌握度。
- [ ] 没有来源时模型仍然生成确定性知识答案。

只有 P0 隔离测试全部通过后，才能继续实现 Tutor、规划器、UI、同步和发布。
