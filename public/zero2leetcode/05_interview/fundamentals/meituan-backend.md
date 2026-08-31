---
layout: default
title: 美团后台开发八股文
description: 美团2026暑期实习后台AI开发面试八股文汇总，含MySQL原子性持久性底层原理、InnoDB锁机制、分库分表、线程池ThreadLocal、RAG分段策略、Prompt工程
eyebrow: 八股文 / 美团后台
permalink: /05_interview/fundamentals/meituan-backend/
---

# 美团后台开发八股文

> 持续更新中。来源：2026 暑期实习真实面经。

---

## AI 工程化

### Q1：你的 AI 提示词是怎么搞的，具体有哪几部分？

> 来源：26暑期实习-后台AI开发一面

Prompt 工程的核心是给模型提供足够的**上下文**和**约束**，让输出可控且高质量。一个完整的 Prompt 通常包含以下几个部分：

| 组成部分 | 作用 | 示例 |
|----------|------|------|
| **System Prompt** | 定义角色、行为准则、输出格式 | "你是一名资深后端工程师，回答需要包含代码示例" |
| **上下文信息** | 提供任务所需的背景知识 | 检索到的文档片段、代码库结构、历史对话 |
| **任务指令** | 明确告诉模型要做什么 | "根据以下错误日志，分析根因并给出修复方案" |
| **输出约束** | 控制输出的格式和范围 | "用 JSON 格式返回，包含 cause 和 fix 两个字段" |
| **Few-shot 示例** | 通过示例引导输出风格 | 给出 1-3 个输入→输出的示例对 |

**实际项目中的结构**（以 RAG 系统为例）：

```
[System] 你是一个技术文档助手，基于检索到的文档回答问题。
         如果文档中没有相关信息，明确说"文档中未找到相关内容"。

[Context] 以下是检索到的相关文档片段：
          {retrieved_chunks}

[User]    {user_question}
```

**面试加分点**：提到 Prompt 的迭代优化过程——不是一次写好的，而是通过观察 bad case 不断调整约束条件。

---

### Q2：为什么采用滑动窗口？为什么三级滑动窗口？直接全部输入不行吗？

> 来源：26暑期实习-后台AI开发一面

**为什么不能全部输入**：

- LLM 有上下文窗口限制（如 GPT-4 Turbo 128K token、Claude 200K token）
- 即使窗口够大，注意力机制对长文本的关注度呈 U 型曲线——中间部分容易被忽略（Lost in the Middle 问题）
- Token 越多，推理成本越高（注意力计算 $O(n^2)$），延迟和费用线性增长

**滑动窗口的作用**：只保留与当前任务最相关的上下文，在信息量和成本之间取平衡。

**三级滑动窗口的设计思路**：

| 层级 | 内容 | 保留策略 | 作用 |
|------|------|----------|------|
| 短期窗口 | 最近几轮对话原文 | FIFO，满了淘汰最早的 | 保持对话连贯性 |
| 中期摘要 | 被淘汰对话的压缩摘要 | 定期用 LLM 生成摘要 | 保留关键决策和上下文 |
| 长期记忆 | 用户偏好、项目知识等 | 主动录入 + 持久化存储 | 跨会话记忆 |

"主动录入"指的是：通过用户显式触发（如"记住这个偏好"）或系统自动检测（如识别到重复出现的约束条件），将重要信息写入持久化的记忆存储（向量数据库/文件），下次会话时检索加载。

---

### Q3：分段策略是什么？文档中有代码块怎么处理？查询重写策略是什么？

> 来源：26暑期实习-后台AI开发一面

**分段策略（Chunking）**：将长文档切分为适合向量检索的小段。

| 策略 | 原理 | 优缺点 |
|------|------|--------|
| 固定长度切分 | 按 token 数或字符数等间隔切 | 简单但会截断语义 |
| 递归字符切分 | 按 `\n\n` → `\n` → `. ` → ` ` 逐级分割 | LangChain 默认方案，效果尚可 |
| 语义分段 | 用 Embedding 计算相邻句子的余弦相似度，相似度骤降处切分 | 语义完整性最好，但计算成本高 |

**代码块的特殊处理**：

代码块不能按自然语言的语义规则切分（一个函数被切成两半就失去了意义）。处理方式：

1. **识别代码块边界**：用正则匹配 Markdown 代码围栏（` ``` `）或 AST 解析
2. **整块保留**：将完整的代码块作为一个不可分割的 chunk（如果超过 chunk 大小上限，按函数/类级别拆分）
3. **附加元数据**：给代码 chunk 标注语言、函数名、所属文件路径，辅助检索

**查询重写（Query Rewriting）**：

用户的原始查询往往不适合直接用于向量检索（太短、指代不明、口语化），需要改写：

| 技术 | 做法 | 示例 |
|------|------|------|
| **HyDE** | 先让 LLM 生成一个假设性回答，用回答去检索 | 用户问"怎么优化"→ 生成一段优化方案 → 用方案的 embedding 检索 |
| **多查询扩展** | 将一个问题改写成多个不同角度的查询 | "Redis 为什么快" → ["Redis 单线程原理", "Redis IO多路复用", "Redis 数据结构优化"] |
| **指代消解** | 结合对话历史补全指代词 | "它怎么实现的" → "RocketMQ 的延迟消息怎么实现的" |

---

## MySQL

### Q4：MySQL 的原子性和持久性底层如何保证？undo log 存储的是什么？

> 来源：26暑期实习-后台AI开发一面

**原子性 — undo log 保证**：

事务中的每个写操作执行前，先将**修改前的数据**记入 undo log。如果事务需要回滚，MySQL 按 undo log 逆序执行恢复操作，撤销所有修改。

| 操作类型 | undo log 记录的内容 | 回滚时的动作 |
|----------|---------------------|-------------|
| INSERT | 新插入行的主键 | DELETE 该行 |
| DELETE | 被删除行的完整数据 | 重新 INSERT |
| UPDATE | 被修改列的旧值 | 用旧值 UPDATE 回去 |

undo log 还有另一个重要作用：**支持 MVCC**。其他事务通过 undo log 中的版本链读取到该行的历史版本，实现快照读。

**持久性 — redo log（WAL）保证**：

InnoDB 使用 Write-Ahead Logging 机制：事务提交时，先将修改操作写入 redo log 并刷盘，而数据页（Buffer Pool 中的脏页）可以延后异步刷盘。

```
事务提交流程：
1. 修改 Buffer Pool 中的数据页（内存中）
2. 将修改记录写入 redo log buffer
3. 事务提交时，redo log 刷盘（fsync）  ← 持久性的保证点
4. 后台线程异步将脏页刷回磁盘          ← 可以延后
```

即使宕机，只要 redo log 已刷盘，重启时重放 redo log 即可恢复。redo log 是物理日志（记录"哪个页面的哪个偏移量改成了什么值"），恢复速度比逻辑日志快。

---

### Q5：InnoDB 缓存池对持久性的影响？锁机制以及锁加在哪里？

> 来源：26暑期实习-后台AI开发一面

**Buffer Pool 对持久性的影响**：

Buffer Pool 是纯内存结构，宕机即丢失。如果只有 Buffer Pool 没有 redo log，修改后尚未刷盘的脏页数据会丢失——这就是为什么持久性**不依赖 Buffer Pool，而依赖 redo log**。

Buffer Pool 的作用是性能优化（减少磁盘 IO），不是持久性保障。

**InnoDB 锁机制**：

| 锁类型 | 粒度 | 说明 |
|--------|------|------|
| 行锁（Record Lock） | 锁定索引记录 | 最精确，并发度最高 |
| 间隙锁（Gap Lock） | 锁定索引记录之间的间隙 | 防止幻读，RR 级别下自动加 |
| 临键锁（Next-Key Lock） | Record Lock + Gap Lock | InnoDB 默认的行锁实现 |
| 表锁（Table Lock） | 整张表 | 并发度最低 |

**锁加在哪里**：锁加在**索引**上，不是加在数据行上。

- 走主键/唯一索引：精确锁定对应的索引记录（Record Lock）
- 走普通索引：锁定索引记录 + 间隙（Next-Key Lock）
- **不走索引**：因为没有索引记录可以锁，退化为**全表扫描 → 锁全表**

**锁全表的场景和效率**：

- 全表锁效率极低：所有其他写操作（甚至部分读操作）都被阻塞
- 触发场景：WHERE 条件没有命中索引（没建索引、类型不匹配导致索引失效、函数计算导致索引失效）；显式 `LOCK TABLES`；DDL（`ALTER TABLE`）

---

### Q6：事务中读→写→读，哪里加锁？什么时候解锁？为什么写完不能解锁？

> 来源：26暑期实习-后台AI开发一面

**加锁分析**（默认 RR 隔离级别）：

```
BEGIN;
SELECT ...;    -- ① 快照读（MVCC），不加锁
UPDATE ...;    -- ② 当前读，加排他锁（X锁）
SELECT ...;    -- ③ 快照读（MVCC），不加锁
COMMIT;        -- ④ 释放所有锁
```

**关键：写锁在事务提交/回滚时才释放，不是 UPDATE 执行完就释放。**

**为什么写完不能立即解锁**（两阶段锁协议 2PL）：

如果 UPDATE 执行完就释放写锁：

1. **脏读**：事务 B 读到事务 A 未提交的修改，若 A 回滚，B 读到的数据就是错的
2. **丢失更新**：事务 A 改了 `balance=100`，释放锁；事务 B 读到 100 并改成 200；事务 A 回滚→balance 应该恢复原值，但 B 的修改已经基于错误的中间状态
3. **破坏可串行化**：2PL 要求所有锁在加锁阶段获取、在解锁阶段释放，提前释放会导致事务交错执行产生不可串行化的调度

---

### Q7：varchar 和 char 什么时候用？

> 来源：26暑期实习-后台AI开发一面

| 类型 | 存储方式 | 适用场景 |
|------|----------|----------|
| `char(n)` | 固定 $n$ 字符，不足补空格 | 长度固定或变化极小的字段 |
| `varchar(n)` | 实际长度 + 1-2 字节长度前缀 | 长度不确定的字段 |

**场景判断**：

| 场景 | 选择 | 原因 |
|------|------|------|
| 手机号（11位） | `char(11)` | 长度固定，char 不需要存长度前缀，读取更快 |
| 身份证号（18位） | `char(18)` | 长度固定 |
| MD5 哈希（32位） | `char(32)` | 长度固定 |
| 用户昵称（1-20字符） | `varchar(20)` | 长度不确定 |
| 用户简介（0-500字符） | `varchar(500)` | 长度差异大 |
| 状态码（如 "ACTIVE"） | `varchar(20)` 或 `enum` | 虽然短但长度不一 |

**char 的隐藏坑**：`char` 在比较时会**忽略尾部空格**（`'abc' = 'abc   '`），如果业务依赖尾部空格需要用 `varchar`。

---

### Q8：text 字段的问题？1000-10000 字符如何选类型？分库分表的好处？

> 来源：26暑期实习-后台AI开发一面

**text 字段的问题**：

- **溢出页存储**：text 数据超过行内阈值（约 768 字节前缀）后存到溢出页（off-page），查询需要额外 IO
- **无法直接建索引**：只能建前缀索引 `INDEX(col(255))`
- **排序限制**：`ORDER BY text_col` 只能用磁盘临时表（Using filesort），无法用内存临时表
- **Buffer Pool 污染**：大字段挤占缓存空间，降低热数据命中率

**1000-10000 字符的选型**：

- `varchar(10000)` 最大支持约 16383 个 UTF-8 字符（65535 字节行大小限制），足够覆盖 10000 字符
- 优先用 `varchar(10000)` 而非 `text`——varchar 尽量在行内存储，查询更快
- 只有字段经常超过 varchar 上限或行内其他字段已占满时才用 `text`

**分库分表时机**：单表数据量超千万行 / 单库连接数不够 / 查询性能显著下降

**分库的好处**（除了连接数）：

1. **故障隔离**：一个库挂了不影响其他库的业务
2. **分散物理资源**：不同库部署在不同机器，分散磁盘 IO、CPU、内存压力
3. **独立扩容**：热点业务的库可以单独升配，不影响其他业务
4. **备份/迁移灵活**：可以按库粒度做备份和数据迁移

---

### Q9：DB QPS 突增怎么办？100 写 10000000 读的场景？

> 来源：26暑期实习-后台AI开发一面

**QPS 突增应对策略**（从快到慢）：

| 阶段 | 措施 | 效果 |
|------|------|------|
| **立即** | 限流降级（Sentinel/Hystrix） | 保护数据库不被打挂 |
| **短期** | 加 Redis 缓存热点数据 | 拦截 80%+ 读请求 |
| **中期** | 读写分离（主从复制） | 读请求分散到从库 |
| **长期** | 分库分表 / 弹性扩容 | 根本性解决容量问题 |

**100 写 10000000 读的场景**：

这是典型的**读远多于写**场景，核心策略是读写分离 + 缓存：

```
                    ┌─→ 从库1 ←─┐
写请求 → 主库 ──复制──→ 从库2 ←──── 读请求（负载均衡）
                    └─→ 从库3 ←─┘

热点数据 → Redis 缓存（拦截绝大多数读）
```

1. **Redis 缓存**：热点数据写入缓存，读请求先查缓存，命中率高时能拦截 90%+ 读流量
2. **一主多从**：写走主库，读走从库，通过增加从库数量线性扩展读能力
3. **如果从库还不够**：
   - 多级缓存：本地缓存（Caffeine）+ 分布式缓存（Redis）
   - 按业务分库：不同业务的读请求分散到不同数据库实例
   - CDN：静态资源和不常变化的内容走 CDN

**注意主从延迟问题**：写完主库后立即读从库可能读到旧数据。解决方案：关键业务读主库（强制走主）、使用半同步复制、延迟敏感场景用缓存。

---

## Java 并发

### Q10：线程池的好处？ThreadLocal？内存泄露原因？异步线程还有什么问题？

> 来源：26暑期实习-后台AI开发一面

**线程池的好处**：

| 好处 | 说明 |
|------|------|
| 降低创建/销毁开销 | 线程复用，避免频繁的系统调用（`pthread_create`） |
| 控制并发度 | 限制最大线程数，防止 OOM 和 CPU 过载 |
| 任务队列缓冲 | 请求峰值时排队等待，削峰填谷 |
| 统一管理 | 便于监控线程状态、设置超时策略、优雅关闭 |

**ThreadLocal 原理**：

每个 Thread 对象内部有一个 `ThreadLocalMap`，key 是 ThreadLocal 实例，value 是线程私有的变量副本。不同线程访问同一个 ThreadLocal 对象时，实际读写的是各自 ThreadLocalMap 中的不同 Entry。

```
Thread-1 → ThreadLocalMap: { tl1 → "用户A的上下文", tl2 → conn1 }
Thread-2 → ThreadLocalMap: { tl1 → "用户B的上下文", tl2 → conn2 }
```

**ThreadLocal 内存泄露原因**：

```
ThreadLocalMap.Entry 结构：
  key   = WeakReference<ThreadLocal>   ← 弱引用
  value = Object                       ← 强引用
```

1. ThreadLocal 对象被 GC 回收后，Entry 的 key 变成 `null`
2. 但 value 仍被 Entry 强引用，无法被 GC 回收
3. 在线程池中线程不会销毁 → ThreadLocalMap 一直存活 → `null` key 对应的 value 永远不会被回收

**解决方案**：用完后必须调用 `threadLocal.remove()`。

**异步线程除了 ThreadLocal 丢失，还有什么问题**：

| 问题 | 说明 |
|------|------|
| **事务上下文丢失** | Spring `@Transactional` 基于 ThreadLocal 绑定连接，异步线程不在同一个事务中 |
| **安全上下文丢失** | Spring Security 的 `SecurityContext` 存在 ThreadLocal 中，子线程获取不到当前用户信息 |
| **MDC 日志断裂** | SLF4J 的 MDC（链路追踪 traceId）存在 ThreadLocal 中，异步线程打印的日志丢失 traceId |
| **异常无法捕获** | 异步线程中抛出的异常不会传播到调用方，需要通过 `Future.get()` 或 `CompletableFuture` 的异常回调处理 |
| **资源竞争** | 主线程和异步线程共享的可变状态需要额外的同步机制 |

**解决思路**：在提交异步任务前手动捕获上下文，包装成 `Runnable` 传递给子线程。Spring 提供了 `DelegatingSecurityContextExecutor`、`TaskDecorator` 等工具类。

---

## Spring 框架

### Q11：Spring AOP 动态代理怎么实现的？

> 来源：26暑期实习-后台AI开发一面

Spring AOP 底层使用两种动态代理机制，根据目标类是否实现接口自动选择：

| 代理方式 | 条件 | 原理 |
|----------|------|------|
| **JDK 动态代理** | 目标类实现了接口 | 通过 `java.lang.reflect.Proxy` 生成一个实现相同接口的代理类，方法调用时先经过 `InvocationHandler` |
| **CGLIB 代理** | 目标类没有实现接口 | 通过字节码生成技术（ASM）创建目标类的子类，覆写方法插入增强逻辑 |

**执行流程**：

```
调用方 → 代理对象 → 前置通知(@Before)
                  → 目标方法执行
                  → 后置通知(@After / @AfterReturning / @AfterThrowing)
                  → 返回结果给调用方
```

**底层细节**：

- JDK 代理：`Proxy.newProxyInstance(classLoader, interfaces, handler)`，在 `InvocationHandler.invoke()` 中织入切面逻辑
- CGLIB 代理：继承目标类，使用 `MethodInterceptor` 拦截方法调用。因为是继承，所以 `final` 类和 `final` 方法无法被代理
- Spring Boot 2.0+ 默认使用 CGLIB（即使实现了接口也用 CGLIB），可通过 `spring.aop.proxy-target-class=false` 改回 JDK 代理

---

### Q12：介绍 ReentrantLock，可重入是怎么实现的？

> 来源：26暑期实习-后台AI开发一面

`ReentrantLock` 是 `java.util.concurrent.locks` 包下的可重入互斥锁，基于 AQS（AbstractQueuedSynchronizer）实现。

**可重入的实现**：

AQS 内部维护一个 `state` 计数器和一个 `exclusiveOwnerThread`（持锁线程）：

1. 线程首次获取锁：`state` 从 0 → 1，记录当前线程为持锁线程
2. 同一线程再次获取锁（重入）：发现持锁线程就是自己 → `state` 加 1（从 1 → 2）
3. 释放锁：`state` 减 1，当 `state` 回到 0 时真正释放锁，唤醒等待队列中的下一个线程

```java
// 简化的加锁逻辑
if (state == 0) {
    state = 1;
    owner = currentThread;  // 首次获取
} else if (owner == currentThread) {
    state++;                 // 可重入
} else {
    enqueue(currentThread);  // 排队等待
}
```

**公平锁 vs 非公平锁**：

- **非公平锁**（默认）：新线程直接尝试 CAS 抢锁，抢不到再排队。吞吐量更高（减少线程切换）
- **公平锁**：`new ReentrantLock(true)`，严格按等待队列顺序获取锁。不会饿死但吞吐量低

**与 synchronized 的对比**：

| 维度 | synchronized | ReentrantLock |
|------|-------------|---------------|
| 实现层面 | JVM 内置（monitorenter/monitorexit） | Java API（AQS） |
| 可重入 | 是 | 是 |
| 公平性 | 非公平 | 可选公平/非公平 |
| 可中断等待 | 不支持 | `lockInterruptibly()` |
| 超时获取 | 不支持 | `tryLock(timeout)` |
| 条件变量 | 只有一个 wait/notify | 可创建多个 `Condition` |
| 释放方式 | 自动（退出同步块） | 手动 `unlock()`（必须在 finally 中） |

---

### Q13：synchronized 关键字的实现？

> 来源：26暑期实习-后台AI开发一面

`synchronized` 底层依赖对象头中的 **Mark Word** 和 **Monitor（管程）** 实现，JVM 通过锁升级机制优化性能：

**锁升级过程**（JDK 6+，只升不降）：

```
无锁 → 偏向锁 → 轻量级锁 → 重量级锁
```

| 锁状态 | 场景 | 实现 | 性能 |
|--------|------|------|------|
| **偏向锁** | 只有一个线程访问 | Mark Word 记录线程 ID，后续同一线程直接进入（无 CAS） | 几乎无开销 |
| **轻量级锁** | 两个线程交替访问（无竞争） | 线程在栈帧中创建 Lock Record，CAS 尝试替换 Mark Word | 短暂自旋 |
| **重量级锁** | 多个线程同时竞争 | 膨胀为 Monitor 对象，未获锁线程进入等待队列（OS 级阻塞） | 线程切换开销大 |

**Monitor 结构**：

- `_owner`：当前持锁线程
- `_EntryList`：等待获取锁的线程队列（blocked 状态）
- `_WaitSet`：调用 `wait()` 后释放锁并等待的线程（waiting 状态）
- `_count`：重入计数（实现可重入）

---

## 操作系统

### Q14：操作系统 Page Cache 是什么？

> 来源：26暑期实习-后台AI开发一面

Page Cache 是操作系统在内核空间维护的**磁盘数据缓存**，以页（通常 4KB）为单位缓存最近访问过的文件数据。

**工作机制**：

```
应用层 read() → 内核检查 Page Cache
  ├─ 命中 → 直接从内存返回（微秒级）
  └─ 未命中 → 从磁盘读取 → 放入 Page Cache → 返回
```

**写操作**：

- `write()` 只写入 Page Cache（标记为脏页），立即返回
- 内核后台线程（`pdflush`/`kworker`）周期性将脏页刷回磁盘
- 调用 `fsync()` 可强制将脏页刷盘（MySQL 的 redo log 提交就用这个）

**为什么重要**：

- **Kafka 高性能的秘密**：Kafka 写消息直接写 Page Cache（顺序写），由 OS 异步刷盘；读消息也从 Page Cache 直接返回（配合 sendfile 零拷贝），避免了用户态/内核态的数据拷贝
- **MySQL 的 Buffer Pool vs Page Cache**：MySQL 用自己的 Buffer Pool 管理数据页（绕过 Page Cache 用 O_DIRECT），因为 MySQL 需要自己控制刷盘时机来保证事务持久性

---

## Java IO

### Q15：Java 的 NIO 是什么？

> 来源：26暑期实习-后台AI开发一面

NIO（New IO / Non-blocking IO）是 JDK 1.4 引入的 IO 模型，核心三大组件：

| 组件 | 作用 | 类比 |
|------|------|------|
| **Channel** | 双向数据通道（读/写） | 类似 Stream，但支持双向和非阻塞 |
| **Buffer** | 数据缓冲区，Channel 读写都经过 Buffer | 应用层和 Channel 之间的中转站 |
| **Selector** | IO 多路复用器，一个线程监听多个 Channel 的事件 | 类似 Linux 的 epoll |

**BIO vs NIO 对比**：

| 维度 | BIO | NIO |
|------|-----|-----|
| 模型 | 一个连接一个线程 | 一个线程管理多个连接 |
| 阻塞性 | 阻塞（read/write 会阻塞线程） | 非阻塞（配合 Selector 事件驱动） |
| 适用场景 | 连接少、长连接 | 连接多、短数据（如聊天服务器） |
| 吞吐量 | 低（线程数限制） | 高（少量线程处理大量连接） |

**Selector 工作流程**：

```java
Selector selector = Selector.open();
channel.register(selector, SelectionKey.OP_READ);

while (true) {
    selector.select();  // 阻塞直到有事件就绪
    Set<SelectionKey> keys = selector.selectedKeys();
    for (SelectionKey key : keys) {
        if (key.isReadable()) { /* 处理读事件 */ }
        if (key.isWritable()) { /* 处理写事件 */ }
    }
}
```

**面试加分**：Netty 是 NIO 的封装框架，解决了原生 NIO 的 API 复杂、空轮询 Bug 等问题，是 RocketMQ、Dubbo、gRPC 等中间件的网络层基础。

---

## 分布式

### Q16：分布式事务的实现？

> 来源：26暑期实习-后台AI开发一面

分布式事务要解决的问题：跨多个服务/数据库的操作要么全部成功，要么全部回滚。

| 方案 | 原理 | 一致性 | 性能 | 适用场景 |
|------|------|--------|------|----------|
| **2PC（两阶段提交）** | 协调者先问所有参与者能否提交（Prepare），全部同意后再通知提交（Commit） | 强一致 | 低（同步阻塞） | 数据库层面（XA 协议） |
| **3PC** | 在 2PC 基础上增加 CanCommit 阶段 + 超时机制，减少阻塞 | 强一致 | 中 | 理论为主，实际少用 |
| **TCC** | Try（预留资源）→ Confirm（确认）/ Cancel（回滚），每步都是本地事务 | 最终一致 | 高 | 资金、库存等需要精确控制的场景 |
| **本地消息表** | 业务操作 + 写消息表在同一个本地事务中，后台轮询消息表通知下游 | 最终一致 | 高 | 跨服务异步通知 |
| **事务消息（RocketMQ）** | 半消息 → 本地事务 → 确认/回滚，MQ 自带回查机制 | 最终一致 | 高 | 电商下单、订单状态流转 |
| **Saga** | 每个服务执行本地事务 + 定义补偿操作，失败时逐步回滚 | 最终一致 | 高 | 长流程业务编排 |

**2PC 详细流程**：

```
阶段一（Prepare）：
  协调者 → 参与者A：能提交吗？  → A：可以（写redo/undo log，锁定资源）
  协调者 → 参与者B：能提交吗？  → B：可以

阶段二（Commit）：
  协调者 → 全部参与者：提交！    → 各参与者提交事务，释放资源
  （如果有任何一个参与者Prepare阶段回复不行 → 协调者通知全部回滚）
```

**2PC 的问题**：同步阻塞（Prepare 到 Commit 之间资源一直被锁）、单点故障（协调者挂了全卡住）、数据不一致（Commit 阶段网络分区时部分参与者提交部分未提交）。

**面试常问跟进**：实际项目中最常用的是 **TCC + 事务消息**，强一致场景用 Seata AT 模式（自动生成 undo log）。

---

## 设计模式

### Q17：了解哪些设计模式？

> 来源：26暑期实习-后台AI开发一面

面试中重点掌握以下高频设计模式，能结合框架/项目举例：

| 模式 | 分类 | 一句话说明 | 框架中的应用 |
|------|------|-----------|-------------|
| **单例** | 创建型 | 全局只有一个实例 | Spring Bean 默认是单例 |
| **工厂方法** | 创建型 | 用工厂方法创建对象，调用方不关心具体类 | `BeanFactory`、`LoggerFactory` |
| **抽象工厂** | 创建型 | 创建一族相关对象 | `DriverManager.getConnection()` |
| **建造者** | 创建型 | 链式构建复杂对象 | `StringBuilder`、Lombok `@Builder` |
| **代理** | 结构型 | 控制对象访问，增加额外逻辑 | Spring AOP（动态代理） |
| **装饰器** | 结构型 | 动态给对象添加功能 | Java IO 流（`BufferedInputStream` 包装 `FileInputStream`） |
| **适配器** | 结构型 | 接口转换，让不兼容的类协作 | `HandlerAdapter`（Spring MVC） |
| **观察者** | 行为型 | 一对多通知机制 | Spring `ApplicationEvent` |
| **策略** | 行为型 | 封装算法族，运行时切换 | `Comparator`、Spring `Resource` |
| **模板方法** | 行为型 | 定义算法骨架，子类重写具体步骤 | `AbstractQueuedSynchronizer`、`JdbcTemplate` |
| **责任链** | 行为型 | 请求沿链传递，每个节点决定处理或转发 | Servlet Filter、Netty Pipeline |

---

## JVM

### Q18：类加载机制？

> 来源：26暑期实习-后台AI开发一面

**类的生命周期**：

```
加载(Loading) → 验证(Verification) → 准备(Preparation) → 解析(Resolution) → 初始化(Initialization)
              └──────── 连接(Linking) ────────┘
```

| 阶段 | 做什么 |
|------|--------|
| **加载** | 通过类的全限定名找到 `.class` 文件，读取字节码，在方法区创建 Class 对象 |
| **验证** | 检查字节码格式、语义合法性，防止恶意代码 |
| **准备** | 为静态变量分配内存并赋**零值**（`static int a = 10` → 此时 `a = 0`） |
| **解析** | 将符号引用替换为直接引用（方法名 → 内存地址） |
| **初始化** | 执行 `<clinit>` 方法（静态变量赋值 + 静态代码块），此时 `a = 10` |

**双亲委派模型**：

```
Bootstrap ClassLoader（加载 rt.jar 核心类）
       ↑ 委派
Extension ClassLoader（加载 ext 目录）
       ↑ 委派
Application ClassLoader（加载 classpath）
       ↑ 委派
自定义 ClassLoader
```

收到加载请求时先**向上委派**给父加载器，父加载器找不到才自己加载。

**为什么要双亲委派**：保证核心类（如 `java.lang.String`）只被 Bootstrap 加载一次，防止用户自定义同名类替换核心类（安全性）。

**打破双亲委派的场景**：SPI 机制（`ServiceLoader`）、Tomcat 每个 Web 应用独立类加载器、热部署/热替换。

---

## 面试算法题

### 合并两个有序链表（LeetCode 21）

> 来源：26暑期实习-后台AI开发一面

**思路**：使用哨兵头节点 + 双指针遍历两个链表，每次取较小的节点接到结果链表尾部。

```python
import sys
input = sys.stdin.readline

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def merge_two_lists(l1, l2):
    dummy = ListNode(0)
    cur = dummy
    while l1 and l2:
        if l1.val <= l2.val:
            cur.next = l1
            l1 = l1.next
        else:
            cur.next = l2
            l2 = l2.next
        cur = cur.next
    cur.next = l1 if l1 else l2
    return dummy.next

def build_list(arr):
    dummy = ListNode(0)
    cur = dummy
    for v in arr:
        cur.next = ListNode(v)
        cur = cur.next
    return dummy.next

def print_list(head):
    parts = []
    while head:
        parts.append(str(head.val))
        head = head.next
    print(' -> '.join(parts) if parts else 'empty')

# ACM 模式输入
a = list(map(int, input().split()))
b = list(map(int, input().split()))
result = merge_two_lists(build_list(a), build_list(b))
print_list(result)
```

**时间复杂度**：$O(m + n)$。**空间复杂度**：$O(1)$（只用了常数个指针）。

---

## 面经记录

| 日期 | 岗位 | 面次 | 来源 | 考察内容 |
|------|------|------|------|----------|
| 2026-04 | 后台AI开发 | 一面 | 牛客 | AI工程化(Prompt/RAG/分段策略) + MySQL(原子性/持久性/锁/分库分表/QPS) + Java并发(线程池/ThreadLocal) |
| 2026-04 | 后台AI开发 | 一面 | 牛客 | Spring(AOP/ReentrantLock/synchronized) + JVM(类加载) + OS(Page Cache) + NIO + 分布式事务 + 设计模式 + 算法(LC21) |
