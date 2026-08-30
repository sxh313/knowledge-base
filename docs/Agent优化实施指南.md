# Agent 优化实施指南

本文只覆盖当前本地 Agent 可直接落地的优化，不包含 AgentScope 或服务端多 Agent 编排。

## 现状与目标

当前 Agent 已具备完整的安全写入闭环：

```text
用户输入
  → 检索相关笔记
  → 模型生成操作计划
  → 校验 / 风险分级
  → diff 预览
  → 用户确认
  → Dexie 事务写入
  → 审计 / 撤销
```

核心实现位置：

- `src/stores/agentStore.ts`：会话、检索、模型调用与计划编排。
- `src/lib/agent/tools.ts`：操作计划类型、解析与校验。
- `src/lib/agent/executor.ts`：预览、事务执行、回滚与撤销。
- `src/lib/agent/permissions.ts`：会话权限判断。
- `src/lib/agent/context.ts`：上下文预算与摘要。
- `src/pages/Agent.tsx`：计划预览、确认和运行历史 UI。

推荐按本文顺序实施：先提升可观测性和请求分流，再提升检索、计划与权限；原生工具调用最后实施，并保留 JSON 计划作为兼容降级方案。

---

## 1. 运行时间线与调试信息

### 目标

让用户和开发者能回答以下问题：检索了什么、模型调用了几轮、为什么计划被拒绝、哪一步写入失败、耗时和 token 花在哪里。

### 实施步骤

1. 在 `src/lib/db/schema.ts` 新增 `agentRunEvents` 表，并增加版本迁移。

   ```ts
   export interface AgentRunEvent {
     id: string;
     runId: string;
     type: 'retrieval' | 'model_call' | 'tool_call' | 'plan_created' | 'plan_rejected' | 'approval' | 'execution';
     status: 'started' | 'success' | 'failed';
     summary: string;
     durationMs?: number;
     inputTokens?: number;
     outputTokens?: number;
     createdAt: number;
   }
   ```

2. 在 `src/lib/agent/persistence.ts` 新增 `addAgentRunEvent(runId, event)` 和 `listAgentRunEvents(runId)`。
3. 在 `agentStore.ts` 的下列节点写入事件：

   - `retrieve()` 成功或失败后；
   - 每次 `routeAI()` 调用前后；
   - 每轮只读工具闭环后；
   - 计划解析、校验、权限拒绝后；
   - 用户确认、取消后；
   - `applyPlan()` 的开始和结束后。

4. 为每个 `AgentRun` 关联事件。运行记录尚未创建前，可暂存在内存中，并在创建运行记录后批量写入。
5. 在 `Agent.tsx` 的运行历史增加“运行详情”抽屉：默认展示时间线摘要；启用“调试详情”时展示模型、耗时、token、检索命中标题和失败原因。
6. 严禁写入 API Key、同步 Token、完整附件原文或模型完整思维链；工具结果仅存摘要或已脱敏内容。

### 验收标准

- 单次运行可以看见检索、模型、工具、审批、执行的顺序与结果。
- 失败时能定位为检索、模型、校验、权限或数据库写入问题。
- UI 默认简洁，调试信息按需展开。

---

## 2. 请求意图分流

### 目标

普通问答不进入完整 Agent 写入闭环，降低响应时间和 token 成本；草稿生成不会被误认为写入任务。

### 实施步骤

1. 新建 `src/lib/agent/intent.ts`：

   ```ts
   export type AgentIntent = 'chat' | 'search' | 'draft' | 'plan' | 'execute' | 'batch';

   export function classifyAgentIntent(input: string): AgentIntent {
     // 先使用可解释的关键词规则；后续可替换为轻量模型分类。
   }
   ```

2. 初版规则建议：

   | 意图 | 关键词示例 | 行为 |
   | --- | --- | --- |
   | `chat` | 是什么、为什么、解释 | RAG 问答，不创建计划 |
   | `search` | 找、搜索、哪篇笔记 | 返回结果与引用 |
   | `draft` | 写一份、生成草稿、帮我总结 | 生成内容，不写入 |
   | `plan` | 整理、添加标签、移动、删除、修改 | 创建待确认计划 |
   | `execute` | 执行、确认、应用 | 仅执行已有待确认计划 |
   | `batch` | 全部、批量、每篇 | 分批计划与更严格权限 |

3. 在 `agentStore.ts` 的 `run()` 开头完成分类，并将分类结果保存到用户消息或运行记录。
4. `chat` 走现有 AI 问答和引用能力；`search` 直接返回检索结果；`draft` 只生成 Markdown，不调用 `applyPlan()`。
5. `plan`、`execute`、`batch` 继续沿用现有计划、预览和人工确认流程。
6. 在 `Agent.tsx` 显示当前模式，例如“生成草稿：不会修改笔记”，并允许用户手动切换，避免规则误判。
7. 为 `intent.ts` 添加单测，覆盖中文常见表达与冲突关键词。

### 验收标准

- “解释 useEffect”不会产生待确认写入计划。
- “为 React 笔记加标签”会进入计划模式。
- “写一份 React 总结”只返回草稿，除非用户明确要求保存。
- 批量任务默认限定数量并需要额外确认。

---

## 3. 检索、证据与上下文质量

### 目标

让 Agent 根据可追溯的笔记片段行动，减少无关上下文、幻觉和误修改。

### 实施步骤

1. 在 `src/lib/ai/retrieval.ts` 确保每个检索结果都保留：

   ```ts
   type EvidenceChunk = {
     journalId: string;
     chunkId?: string;
     title: string;
     content: string;
     score: number;
   };
   ```

2. 第一阶段召回 20 个候选片段；第二阶段在本地重排序，只保留 5 到 8 个片段。
3. 重排序初版可不增加模型调用：标题精确命中、关键词命中、用户指定文档和较高向量分数均加分；过短或低分片段淘汰。
4. 新建 `toEvidenceRef()`，只把命中段落、标题、文档 ID 和定位信息注入 Agent 上下文，避免把整篇笔记塞进 prompt。
5. 扩展 `AgentOp`：

   ```ts
   evidence?: {
     journalId: string;
     chunkId?: string;
     reason: string;
   }[];
   ```

6. 修改 `prompt.ts`：要求修改已有笔记时说明引用来源；缺少可靠证据时只能提出建议或提问，不能生成写入操作。
7. 修改 `validateAgentPlan()`：`edit`、`delete`、`patchJournal` 等高影响操作必须携带有效 evidence；目标文档必须与证据文档一致，或在 `reason` 中明确说明跨文档关系。
8. 在计划预览卡片中展示“依据：文档标题 + 片段原因”，不直接展示大段原文。

### 验收标准

- 每个高影响写操作都能显示修改依据。
- 没有命中可靠笔记时，Agent 不会静默修改文档。
- 同类任务注入的上下文更短且相关性更高。

---

## 4. 多步骤计划的依赖、进度和恢复

### 目标

复杂任务中清楚表达步骤依赖；前置步骤失败时阻止危险的后续写入；执行过程可见、可恢复。

### 实施步骤

1. 扩展 `src/lib/agent/tools.ts` 中的 `AgentOp`：

   ```ts
   dependsOn?: string[];
   preconditions?: {
     journalExists?: boolean;
     expectedHash?: string;
   }[];
   ```

2. 在 `assignPlanIds()` 后保证每个操作都有唯一 `opId`。
3. 在 `validateAgentPlan()` 中新增：

   - 依赖 ID 必须存在；
   - 不允许依赖自己；
   - 不允许循环依赖；
   - 限制单计划操作数，例如最多 20 个；
   - 删除操作不能被后续写操作作为可用前置条件。

4. 在 `executor.ts` 实现拓扑排序，执行顺序不再完全依赖模型返回数组。
5. 定义运行时状态：

   ```ts
   type OpStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';
   ```

6. 前置依赖失败时，后续操作标为 `skipped` 并显示“前置操作失败”。
7. 默认继续保持整批事务回滚，保证安全；若未来要支持“允许部分成功”，必须单独提供模式开关，并在 UI 中明确说明不可整体撤销的边界。
8. 在 `Agent.tsx` 显示每个操作的状态、耗时、错误原因和依赖关系。
9. 为拓扑排序、循环依赖、失败跳过、撤销建立单测。

### 验收标准

- 创建笔记失败后，后续的加标签操作自动跳过。
- 循环依赖计划在预览前被拒绝。
- 用户能看到任务执行到第几步和每一步结果。

---

## 5. 风险确认升级为细粒度会话权限

### 目标

让用户定义本次会话可修改的数据范围，而不只依赖“低、中、高风险”标签。

### 实施步骤

1. 在 `src/lib/agent/permissions.ts` 扩展权限结构：

   ```ts
   export type AgentPermissionPolicy = {
     allowedOperations: AgentOp['type'][];
     allowedJournalIds?: string[];
     allowedSubjects?: string[];
     allowDelete: boolean;
     expiresAt?: number;
   };
   ```

2. 在会话状态或 `agentState` 中保存权限策略，并为旧数据提供默认值。
3. 新会话的保守默认策略：

   - 允许读取、搜索、分析和生成建议；
   - 创建、修改仍需逐项确认；
   - 删除、批量移动、同步冲突写入默认禁止；
   - 未设置范围时，不因“低风险”自动获得写入范围。

4. 在 `checkPlanPermission()` 中按顺序判断：

   ```text
   操作类型 → 删除许可 → 指定文档范围 → 分类范围 → 过期时间 → 风险确认
   ```

5. 在 `Agent.tsx` 加入会话权限面板，例如：

   ```text
   本会话允许：
   ✓ 读取所有笔记
   ✓ 修改“前端”分类
   ✗ 删除笔记
   ✗ 修改其他分类
   ```

6. 允许用户将权限设置为“仅本次计划”或“本会话有效”；权限不应默认永久保存。
7. 在拒绝计划时展示精确原因，例如“目标笔记不属于本会话允许的前端分类”。

### 验收标准

- 授权整理“前端”后，Agent 无法修改其他分类笔记。
- 删除操作即使通过模型校验，也会被权限层阻止。
- 权限的范围和到期时间对用户可见。

---

## 6. 使用模型原生工具调用，替代纯 JSON 计划

### 目标

减少模型输出 Markdown、解释文字或不完整 JSON 时的解析失败；保持不支持工具调用的 Provider 可用。

### 实施步骤

1. 新建 `src/lib/agent/toolDefinitions.ts`，把可用操作转换为 Provider 无关的工具定义。先接入 `search`、`read` 等只读工具，再逐步加入写操作。

   ```ts
   export const agentToolDefinitions = [
     {
       type: 'function',
       function: {
         name: 'search_journals',
         description: '在用户知识库中搜索笔记。',
         parameters: {
           type: 'object',
           properties: { query: { type: 'string' } },
           required: ['query'],
         },
       },
     },
   ];
   ```

2. 扩展 `src/lib/ai/providers.ts`、`router.ts` 与相关客户端类型，让 `routeAI()` 可选接收 `tools` 并返回标准化的 `toolCalls`。
3. 各 Provider 适配层负责把自身格式统一成：

   ```ts
   type NormalizedToolCall = {
     id: string;
     name: string;
     arguments: Record<string, unknown>;
   };
   ```

4. 在 `agentStore.ts` 中将 `toolCalls` 映射为现有 `AgentOp`。映射后的操作仍必须经过：

   ```text
   validateAgentPlan()
   → checkPlanPermission()
   → previewPlan()
   → 用户确认
   → applyPlan()
   ```

5. 不支持 tool calling 的 Provider 保留原有 `parseAgentPlan()` JSON 方案；路由器根据模型能力自动选择。
6. 每种 Provider 增加适配测试，覆盖：工具参数成功、参数缺失、未知工具、模型拒绝工具调用和 JSON 降级。
7. 不把模型工具调用等同于写入授权。模型只能“请求操作”，最终仍由本地校验和用户批准决定。

### 验收标准

- 支持 tools 的模型不再因输出额外解释文字导致计划解析失败。
- 不支持 tools 的模型不受影响。
- 任意写入操作仍经过预览、权限和人工确认。

---

## 推荐实施顺序与发布检查

### 实施顺序

1. 运行时间线与调试信息。
2. 请求意图分流。
3. 检索、证据与上下文质量。
4. 多步骤计划依赖与执行进度。
5. 细粒度会话权限。
6. 模型原生工具调用。

每完成一项，应先增加对应单测，再接入 UI；不要同时改变计划格式、数据库 schema 和执行器事务语义。

### 每次发布前检查

```powershell
npm test
npm run build
```

还应手动验证：

- 普通问答不会触发写入计划；
- 草稿生成不会修改笔记；
- 高风险操作有证据、diff 和确认；
- 刷新页面后会话、待确认计划和运行记录正常恢复；
- 拒绝、取消和失败后，不会留下未预期的本地写入；
- API Key、同步 Token、附件原文不会出现在调试日志或运行历史中。
