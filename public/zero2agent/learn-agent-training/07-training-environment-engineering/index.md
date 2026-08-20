---
layout: default
title: "Agent 训练环境工程：从仿真沙箱到数据回流闭环"
description: "训练沙箱、评估门禁与轨迹回流的完整工程闭环"
eyebrow: "Agent 训练实战 / 07"
---

# Agent 训练环境工程：从仿真沙箱到数据回流闭环

前面几篇讲了 SFT、RL、GRPO/PPO、数据配比和 Agent 评测，但这些算法都有一个共同前提：系统能持续提供**可信的任务、可重置的环境、可验证的结果和可回放的轨迹**。

真实工程里，训练代码往往不是最先卡住的地方。更常见的情况是：沙箱启动太慢、同一任务两次初始状态不同、Agent 看到了 hidden test、失败轨迹没有回流、Reward 写了两次，或者训练集和最终评测集在数据管道里串了。

算法决定“怎样更新参数”，训练环境决定“模型能从什么经验里学习”。本篇补上这块经常被忽略的系统工程：如何把仿真交互沙箱、数据策略、评估闭环和数据回流通道连成一条可运行、可审计、可扩展的链路。

## 先看全链路：训练环境不是一个 Docker 容器

一个能启动容器、执行命令的 Demo，还不是训练环境平台。完整闭环至少有四个平面：

| 平面 | 解决的问题 | 事实源 |
| --- | --- | --- |
| 任务与数据策略 | 这轮训练抽什么任务、难度、seed 和数据版本 | Task Registry、Dataset Manifest、Sampling Policy |
| 环境与沙箱 | 怎样得到隔离、可重置、可执行的 episode | Environment Descriptor、Artifact Digest、Sandbox Lifecycle |
| Rollout 与验证 | 模型做了什么，结果是否正确，Reward 是否可信 | Action Trace、Isolated Verifier、Reward Contract |
| 评估与回流 | 哪些轨迹进入 SFT/RL、回归集、事故集或丢弃 | Eval Gate、Curation Policy、Versioned Dataset |

![Agent 训练环境工程闭环](training-environment-loop.drawio.png)

[下载可编辑的 draw.io 源文件](training-environment-loop.drawio)

图里最重要的不是组件名，而是两个方向相反的流：

```text
在线执行流：任务策略 -> 环境解析 -> 沙箱 episode -> rollout -> verifier
离线学习流：轨迹与 reward -> 评估门禁 -> 数据筛选 -> 版本化数据集 -> 新 checkpoint
```

只有在线执行流，没有离线学习流，系统只能不断产生日志；只有离线数据，没有环境与 verifier，模型学到的又可能是不可复现甚至被污染的“成功经验”。

## 1. 用环境契约描述 episode，而不是每题构建一个镜像

不同训练任务的差异不都属于镜像层。先拆清楚差异，才能避免构建和分发爆炸。

| 差异 | 例子 | 应放在哪里 |
| --- | --- | --- |
| 交互协议 | action、observation、工具、最大轮数 | Environment Contract |
| 运行依赖 | Python/Node 版本、系统库、lockfile | Base Image + Dependency Lock |
| 任务数据 | 题目、仓库 commit、dataset shard | Content-addressed Payload |
| 初始状态 | 数据库内容、文件快照、随机 seed | Reset Recipe / Snapshot |
| 验证逻辑 | 单测、规则、rubric、hidden tests | 独立 Verifier |
| 安全策略 | 网络、凭据、syscall、GPU、挂载 | Policy + Runtime Class |

如果只是题目、seed 或仓库 commit 不同，就不应生成新的完整镜像。只有语言运行时、系统依赖、隔离等级或主要工具契约发生变化，才值得形成新的环境类别。

一个最小的 episode 描述可以是：

```yaml
apiVersion: training.example.io/v1alpha1
kind: EnvironmentEpisode
spec:
  environmentClass: python-311-swe-v3
  baseImage: registry.example/base/python@sha256:...
  dependencyLock: cas://sha256/...
  taskPayload: cas://sha256/...
  datasetManifest: cas://sha256/...
  verifierImage: registry.example/verifier/swe@sha256:...
  policyDigest: cas://sha256/...
  seed: 184467
  limits:
    cpu: "2"
    memory: 4Gi
    timeoutSeconds: 900
```

再定义两个稳定标识：

```text
environment_class_id = hash(base_image + dependency_lock + runtime + policy + tool_contract)
episode_id = hash(environment_class_id + task_payload + dataset + verifier + seed)
```

这两个 ID 解决的是不同问题：

- `environment_class_id` 用来做缓存、Warm Pool 和容量规划。
- `episode_id` 用来做幂等、追踪、Reward 提交和结果回放。

环境契约可以参考 Gym 风格的 `reset / step / state`，也可以封装成工具调用或事件流。关键不在 API 长什么样，而在于同一 descriptor 和 seed 能重建相同的初始可观察状态。

## 2. 仿真交互沙箱要同时保证真实性和可控性

训练环境不是越“真实”越好。真实 API、真实浏览器和真实数据库能提高保真度，也会带来不稳定、成本、限流和安全风险。工程上通常需要分层：

| 环境层级 | 适合场景 | 优点 | 代价 |
| --- | --- | --- | --- |
| 确定性 Mock | 工具格式、基本路由、快速回归 | 快、便宜、可复现 | 覆盖不了探索路径和真实故障 |
| 状态机模拟器 | 客服、游戏、业务流程 | 可注入边界状态和长轨迹 | 模拟器本身需要维护 |
| 容器化真实工具 | 代码、数据库、文件系统任务 | 结果可由测试直接验证 | 启动、依赖和清理成本高 |
| 浏览器/GUI 环境 | Web Agent、Computer Use | 接近真实交互 | 非确定性强，资源消耗大 |
| 受控真实服务 | 上线前 shadow/canary | 最接近生产 | 必须限制副作用、凭据和流量 |

一个 episode 的生命周期至少应包含：

```text
Resolving
  -> Building / Artifact Ready
  -> Queued / Admitted
  -> Sandbox Allocated
  -> Task Injected
  -> First Command Succeeded
  -> Running
  -> Verifying
  -> Completed / Failed / Timed Out
  -> Cleaning
  -> Deleted
```

这里有四条容易被忽略的硬规则：

1. **Ready 不是 Pod Running。** 更可信的口径是第一条受控任务命令成功；调度、runtime、网络和 daemon ready 应分别记录。
2. **reset 不能暴露给被训练 Agent。** reset 属于编排面，否则 Agent 可以通过重置环境规避失败或试探答案。
3. **Verifier 必须和 Agent 隔离。** hidden tests、solution、Reward 代码和 verifier 身份不能挂进 Agent 的文件系统。
4. **Episode 用完销毁，不回池复用。** Warm Pool 预热的是干净的环境类别，不是把执行过未知代码的实例擦一擦再给下一个任务。

“一次领取、一次使用、彻底销毁”看起来浪费，实际上是在用明确成本换取训练数据的隔离性。如果复用策略无法证明进程、文件、网络、secret、缓存和 verifier 状态都已清空，就不应该复用。

## 3. 数据策略不只是配比，还决定“去哪里采经验”

[训练数据配比](../04-data-mix/index.html)解决的是一个数据集内部不同类型样本怎么混合；环境工程还要解决更上游的问题：下一批 episode 应该从哪里来。

### 任务池至少分成四类

```text
训练池       可以被采样、变异、生成 hard case
开发评估池   用于频繁调参，允许团队反复查看失败
冻结回归池   用于 checkpoint gate，不随训练数据更新
Blind Final  只在关键里程碑运行，防止长期过拟合评测
```

这四类数据不能只是目录名不同。它们需要独立 manifest、访问权限和 provenance；从开发评估池中挑出的失败样本如果进入训练池，原样本就不能继续冒充独立评测证据。

### Sampling Policy 需要动态更新

均匀抽样通常会浪费大量 rollout：模型已经稳定通过的简单任务仍被反复执行，真正有学习信号的边界任务却不够多。

更实用的采样策略会综合：

- 任务难度和历史成功率；
- 工具、语言、业务域和环境类别覆盖；
- 最近失败原因和不确定性；
- 安全、长轨迹、错误恢复等稀缺场景配额；
- 冷启动成本和可用资源预算；
- 与训练集、开发集和 blind set 的相似度。

例如，成功率长期接近 100% 的任务可以降采样；成功率在 30%-70%、多次运行结果不稳定的任务通常更有学习价值；始终为 0 的任务则要先判断是模型不会、环境坏了，还是 verifier 写错了。

### 故障注入也是数据策略

真实工具会超时、限流、返回脏数据或部分成功。环境平台应把故障变成显式、可版本化的策略，而不是临时在代码里 `random()`：

```yaml
faultPolicy:
  version: timeout-and-malformed-v2
  seed: 2718
  rules:
    - tool: search
      timeoutRate: 0.05
    - tool: database
      malformedResponseRate: 0.03
```

这样才能区分“模型在相同故障下变强了”和“这次只是运气更好”。

## 4. Verifier 决定 Reward 是否值得学习

Agent 最终输出一段看似合理的文本，不代表任务真的完成。代码要跑测试，数据库要检查最终状态，文件任务要检查内容和权限，开放式回答也要有明确 rubric。

一个成熟的 verifier 通常同时产生多层信号：

| 信号 | 回答的问题 | 用途 |
| --- | --- | --- |
| Outcome | 最终目标是否完成 | 主 Reward、Pass@1/Pass@k |
| Process | 工具选择、参数和步骤是否合理 | 过程监督、错误归因 |
| Safety | 是否越权、泄密或执行危险动作 | 硬门禁，不参与简单加权抵消 |
| Efficiency | 步骤、Token、延迟和资源成本 | 约束无效探索和线上成本 |
| Stability | 不同 seed/措辞/故障下是否稳定 | 防止一次成功掩盖高方差 |

不要把这些信号直接揉成一个总分后丢掉明细。一个完成率高但越权的 checkpoint，不应靠低延迟把安全问题“平均掉”；一个平均 Reward 上升但 P99 步骤数翻倍的模型，也未必更适合生产。

推荐的门禁顺序是：

```text
安全与权限硬门禁
  -> 任务完成率 / Pass@1
  -> 多 seed 稳定性与错误恢复
  -> 效率和成本预算
  -> 通用能力与分布外回归
  -> 才允许进入下一轮训练或灰度
```

Reward 提交必须幂等。`episode_id + verifier_digest` 应唯一标识一次评分，trainer 重试、消息重复投递或 verifier 重启都不能让同一条轨迹被计分两次。

## 5. 数据回流通道要保存“证据”，不只是保存 Reward

只把 `{prompt, response, reward}` 写进训练集，会丢掉最有价值的诊断信息。可回放的 episode 记录至少需要：

```json
{
  "episode_id": "sha256:...",
  "model_digest": "sha256:...",
  "environment_class_id": "sha256:...",
  "task_digest": "sha256:...",
  "dataset_manifest": "sha256:...",
  "verifier_digest": "sha256:...",
  "policy_digest": "sha256:...",
  "seed": 184467,
  "terminal_reason": "completed",
  "actions": [],
  "observations": [],
  "reward": {
    "outcome": 1.0,
    "safety": 1.0,
    "efficiency": 0.82
  },
  "timestamps": {}
}
```

一条可扩展的回流管道通常是：

```text
Sandbox / Rollout Worker
  -> 本地缓冲与批量上传
  -> Event Bus / Ingestion API
  -> 不可变轨迹与 Artifact 存储
  -> 在线质量与成本指标
  -> 离线校验、去重、脱敏和失败归因
  -> Versioned Dataset / Replay Buffer / Regression Set
  -> SFT 或 RL 更新
```

这条通道要处理真实的分布式系统问题：

- **背压**：存储或 verifier 变慢时，rollout 不能无限占用沙箱和 GPU。
- **部分失败**：动作已执行但 trace 上传失败时，要能补传，而不是把 episode 当成不存在。
- **去重**：同一 episode 的重试消息不能生成多份训练样本。
- **Schema 演进**：旧轨迹需要可读，新增字段要有版本和默认语义。
- **隐私与凭据**：工具返回、终端输出和浏览器 trace 在入库前必须脱敏。
- **高基数治理**：`episode_id` 放 trace/log；核心 metrics 只保留有界的任务类别、runtime、结果和失败原因。

### 不同轨迹应该流向不同目的地

| 轨迹类型 | 推荐去向 | 不应直接做什么 |
| --- | --- | --- |
| 高质量成功轨迹 | SFT 候选、策略蒸馏 | 不经过去重就重复放大 |
| 成功但步骤冗余 | 效率优化集、偏好对 | 不只看 Outcome 当满分样本 |
| 可恢复失败 | RL、错误恢复专项集 | 不和环境故障混为一类 |
| 环境/基础设施失败 | 平台回归与事故集 | 不给模型负 Reward |
| 安全违规轨迹 | 安全训练与红队回归 | 不暴露 hidden policy 细节给 Agent |
| Verifier 不确定 | 人工复核队列 | 不强行生成确定标签 |
| 与评测集高度相似 | 隔离或丢弃 | 不进入训练造成评测泄露 |

这里最关键的判断是：**失败不一定是模型失败。** DNS、镜像拉取、工具超时、沙箱污染、任务描述错误和 verifier bug 都可能产生 0 Reward。没有 producer-to-impact 的因果链，就把失败轨迹喂给 RL，会训练模型去适应平台故障而不是任务本身。

## 6. 容量、Artifact 和调度决定闭环能不能跑得动

当任务规模上升，瓶颈通常从模型算法转向“等待环境”。需要分开测量：

```text
accepted
  -> queued
  -> scheduled
  -> image resolved
  -> bytes pulled or mounted
  -> runtime created
  -> network ready
  -> task injected
  -> first command succeeded (TTFI)
  -> episode finished
  -> verifier finished
  -> cleanup confirmed
```

只报告“Pod 启动耗时”会掩盖真正瓶颈。镜像已经在节点缓存、Warm Pool 命中和 MicroVM snapshot restore 都不能与 true cold 混在一起比较。

### Warm Pool 只按头部环境类别建立

如果每道题都对应一个独有镜像，Warm Pool 会退化成“每道题常驻一份环境”，成本不可接受。更合理的方式是：

```text
有限 environment class
  + 公共 base/dependency layer
  + 领取后注入 task payload
  + fresh COW writable layer
  + episode 结束后销毁
```

### Artifact 平面要和任务数据解耦

基础镜像、dependency lock、任务 payload、dataset shard、verifier 和 policy 应分别按 digest 保存。OCI/CAS、构建缓存、lazy pull、chunk 去重或 P2P 分发可以减少重复搬运，但不能消除真正独有、首命令必须读取的字节。

### Kubernetes 只管慢状态

Kubernetes、Kueue 或 Volcano 适合管理 quota、admission、placement、gang 和 topology；每一步 action、observation 和 trace 应走沙箱数据面。让每个 Agent action 都写 Kubernetes API，会把高频交互放大成 API Server 和 etcd 压力。

GPU 角色也要拆开：rollout inference 可以是独立模型服务，环境内 GPU simulator 按任务申请，trainer update 则走训练队列。三者不应因为“都用 GPU”就塞进同一个 Pod 或同一个调度策略。

## 7. 安全边界直接影响训练数据可信度

训练沙箱运行的是模型生成的未知动作，默认应按不可信代码处理。

| 风险 | 典型失败 | 最小控制 |
| --- | --- | --- |
| 跨 episode 污染 | 读取上一轮文件、进程或 shell history | fresh COW、用完销毁、污染探针 |
| Verifier 泄漏 | Agent 读取 hidden tests 或 Reward 代码 | 独立镜像、身份和文件系统 |
| 凭据泄漏 | token 进入 snapshot、trace 或训练数据 | 短期身份、tmpfs、入库前脱敏 |
| 网络越权 | 访问 metadata、集群 API 或其他租户 | default-deny egress、禁用默认 SA token |
| 资源耗尽 | fork bomb、磁盘填满、GPU/IPC 滥用 | cgroup、pids、存储配额、timeout |
| Reward hacking | 修改测试、伪造结果、重复提交评分 | 外部 verifier、hidden final、幂等 Reward |

Runtime 应按风险选择，而不是按营销词选择：可信短任务可以使用受限容器；不可信代码可从 gVisor 一类更强边界起步；高风险多租户再评估 Kata 或 MicroVM。隔离增强会带来兼容性、启动和运维成本，必须通过目标 workload 验证。

## 8. 一条务实的落地路线

不要第一天就同时引入 Kubernetes、MicroVM、Warm Pool、lazy pull、P2P、GPU 队列和在线 RL。变量太多时，即使系统跑绿，也无法知道收益来自哪里。

### P0：本地合同闭环

- 选择 20 个任务、4 类环境差异。
- 跑通 descriptor、reset、step、trace、verifier、Reward 和 destroy。
- 加入文件、进程、网络、secret 和 hidden-test 污染测试。
- 证明同 descriptor/seed 可重建，失败可归因，资源可清理。

### P1：任务策略与评估门禁

- 分离训练、开发评估、冻结回归和 blind final manifest。
- 接入难度/失败原因/覆盖度驱动的 sampler。
- 建立 Outcome、Safety、Efficiency、Stability 分层指标。
- 让环境失败不进入模型 Reward。

### P2：Kubernetes 生命周期对照

- 保持任务和 descriptor 不变，只替换 provider。
- 分别测 cold、cached cold、warm claim 和 payload 注入。
- 验证 cancel、timeout、controller restart 和 orphan cleanup。

### P3：Artifact 与训练回流

- 先拆 base/lock/payload/verifier，再逐项引入 cache、lazy pull 或 P2P。
- 接入版本化 trajectory store、curation 和 replay buffer。
- 最后连接 trainer 和 rollout inference，测试 trainer 重启、重复 Reward、轨迹丢失和背压。

每一阶段都应保留固定 baseline 和分段指标。一次绿色运行只能证明“这次成功”，不能证明系统具备可复现性或根因已经解决。

## 9. 组件怎么选：按职责拼装，不按品牌站队

开源组件可以缩短起步时间，但没有一个项目包办全部闭环：

| 需求 | 可参考的项目 | 使用边界 |
| --- | --- | --- |
| 环境交互协议 | OpenEnv | 约束 `reset/step/state` 等语义，不等于生产隔离平台 |
| 任务与 verifier authoring | Verifiers、SWE 类任务框架 | 负责 task/rubric，不替代底层生命周期 |
| 沙箱执行 API | OpenSandbox | 统一 lifecycle/exec/file 等入口，provider 仍需验证 |
| Kubernetes 沙箱生命周期 | Agent Sandbox、BatchSandbox 等 | 管 Template/Claim/Pool/TTL，不承载每步 action |
| Artifact 优化 | OCI/CAS、Nydus、Dragonfly | 减少重复或延迟读取，不突破独有数据下界 |
| 批任务/GPU admission | Kueue 或 Volcano | 管 quota/queue/topology，不负责 reset 和 Reward |

第一期应优先选“最少组件也能证明合同正确”的组合。只有 benchmark 证明启动、分发、队列或隔离是当前瓶颈时，才增加对应系统。

## 小结

- Agent 训练环境不是容器启动器，而是任务策略、环境契约、沙箱生命周期、隔离 verifier、评估门禁和数据回流组成的闭环。
- 任务差异要拆成环境类别、依赖、payload、seed、policy 和 verifier；不要默认每任务一个完整镜像。
- 数据策略决定去哪里采经验，评估门禁决定哪些经验值得学习，回流通道负责保留可追溯证据。
- Reward 必须外部验证、分层记录和幂等提交；环境故障不能伪装成模型失败。
- Warm Pool、Kubernetes、MicroVM、lazy pull 和 GPU 调度都是按瓶颈引入的优化，不是训练环境的起点。
- 先在小任务集上证明 reset、隔离、验证、回放和清理，再扩大吞吐，才能避免把平台故障规模化。

## 延伸阅读

- [OpenEnv](https://github.com/huggingface/OpenEnv)：Agentic RL 环境交互接口参考。
- [Verifiers](https://github.com/PrimeIntellect-ai/verifiers)：环境、rubric 与评测 authoring 参考。
- [OpenSandbox](https://github.com/opensandbox-group/OpenSandbox)：沙箱生命周期和执行 API 参考。
- [Kubernetes Agent Sandbox](https://github.com/kubernetes-sigs/agent-sandbox)：Kubernetes 沙箱 Template、Claim 与 Pool 方向参考。
- [Kueue Concepts](https://kueue.sigs.k8s.io/docs/concepts/)：批任务 admission、quota 与 Resource Flavor。
- [Nydus](https://github.com/dragonflyoss/nydus) 与 [Dragonfly](https://github.com/dragonflyoss/dragonfly)：Artifact lazy loading、去重与分发方向参考。

下一篇建议继续看：

- [Agent 应用实战](../../learn-agent-practice/index.html)：把训练、评估和运行时能力落到真实开发工作流中
