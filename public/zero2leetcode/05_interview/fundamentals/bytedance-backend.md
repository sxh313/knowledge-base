---
layout: default
title: 字节跳动后端八股文
description: 字节跳动后端开发面试高频八股文汇总，涵盖MySQL、Redis、计算机网络、操作系统、消息队列、Java基础、系统设计、手撕算法八大类，来源59篇真实面经
eyebrow: 八股文 / 字节后端
permalink: /05_interview/fundamentals/bytedance-backend/
---

# 字节跳动后端八股文

> 来源：59 篇牛客网字节跳动后端真实面经（2024-2026）。按考察维度分类，标注出现频次。

---

## 一、数据库 (MySQL)

### 索引

1. MySQL 索引的数据结构是什么？为什么用 B+ 树而不是 B 树？B+ 树为什么更矮胖？
> B+ 树。非叶节点只存 key 不存数据→扇出更大→树更矮→磁盘 IO 少。叶节点双向链表→范围查询顺序扫描。B 树每个节点都存数据，扇出小，树更高。

2. 聚簇索引和非聚簇索引分别存储什么数据？各自优缺点？
> 聚簇索引：叶节点存完整行数据（InnoDB 主键索引）。非聚簇索引（二级索引）：叶节点存主键值。聚簇索引查询快不用回表，但插入慢（可能页分裂）；二级索引灵活但需回表。

3. 什么是回表查询？什么时候会回表？
> 通过二级索引找到主键后，再去聚簇索引取完整行。当 SELECT 的列不全在二级索引中时就会回表。

4. 索引覆盖是什么？什么情况下能用到？
> 查询所需列全部包含在索引中，无需回表。联合索引 (A,B,C) 只 SELECT A,B 就是覆盖索引。

5. 联合索引的最左前缀原则？联合索引 (A, B, C)，各种查询条件能否命中索引？
> 必须从最左列开始连续匹配。WHERE A=1 AND B=2 ✓，WHERE B=2 ✗，WHERE A=1 AND C=3 只用到 A。

6. 索引失效的场景有哪些？为什么会失效？
> 对列函数运算、LIKE '%xx'、隐式类型转换、OR 连接非索引列、NOT IN/!=、联合索引跳列。本质：破坏了有序性，无法走 B+ 树二分查找。

7. 什么时候发生叶分裂？
> 插入数据时目标叶子页已满。页分裂把一半数据挪到新页→性能下降。自增主键可减少分裂。

8. 为什么二级索引存主键 ID 而不直接存数据位置？
> 数据页可能因为分裂/更新移动位置，存物理地址会失效。存主键值逻辑稳定，代价是多一次回表。

9. 添加索引时有什么注意事项？索引建太多的缺点？影响读还是写效率？
> 索引多→写入慢（INSERT/UPDATE/DELETE 都要维护索引）、占磁盘。建索引选高区分度列、避免冗余索引。

10. InnoDB 叶子节点单向还是双向链表？一次读多少？B+ 树一般多少层？
> 双向链表。一次读一页 16KB。3 层 B+ 树约可存 2000 万行（假设主键 bigint + 指针 ≈ 14B，一页扇出约 1170）。

### 事务与锁

11. 事务的四个特性 ACID 及其实现原理？
> A 原子性→undo log 回滚；C 一致性→约束+应用逻辑；I 隔离性→锁+MVCC；D 持久性→redo log 刷盘。

12. 事务隔离级别有哪些？分别解决什么问题？
> 读未提交（啥都没解决）→ 读已提交（解决脏读）→ 可重复读（解决不可重复读，InnoDB 默认）→ 串行化（解决幻读）。

13. 可重复读如何解决幻读？快照读和当前读？
> 快照读：MVCC ReadView 保证同一事务看到一致快照。当前读：Next-Key Lock（行锁+间隙锁）锁住范围防止插入。

14. 可重复读可以解决不一致为什么还需要串行化？
> RR 下当前读可能仍有幻读边界情况（如先快照读再当前读）。串行化强制事务排队，完全无并发问题，但性能最差。

15. 什么场景下企业会把隔离级别从可重复读降到读提交？
> 高并发 OLTP、对间隙锁死锁敏感的场景（如阿里）。RC 间隙锁少→死锁少→吞吐高，代价是可能不可重复读。

16. MVCC 实现原理？在哪几种隔离级别中用到？
> 每行有隐藏的 trx_id 和 roll_pointer。ReadView 记录活跃事务列表，判断版本可见性。RC 每次 SELECT 生成新 ReadView；RR 只在第一次 SELECT 生成。

17. MySQL 有哪些锁？update where id>5 会用什么锁？临键锁怎么锁？
> 行锁、间隙锁、临键锁（Next-Key = 行锁+左开右闭间隙锁）、表锁、意向锁。`UPDATE WHERE id>5` 加临键锁锁住 (5, +∞)。

18. 数据库的并发控制手段？
> 锁（悲观）、MVCC（乐观读）、时间戳排序、OCC（乐观并发控制：读-验证-写）。

### 日志与复制

19. MySQL 有哪些常见的日志？分别有什么作用？
> redo log（崩溃恢复/持久性）、undo log（回滚/MVCC）、binlog（主从复制/数据恢复）、slow query log（慢查询分析）、error log。

20. binlog 主从复制原理？从库是拉取还是主库推送？
> 主库写 binlog → 从库 IO 线程拉取（pull）写入 relay log → 从库 SQL 线程回放。半同步复制：主库等从库 ACK 后才返回客户端。

21. 为什么用 redo log 写会快？
> 顺序写（追加写 WAL），而数据页是随机写。先写 redo log 再异步刷脏页，将随机 IO 转为顺序 IO。

22. binlog 和 redo log 的二阶段提交？谁先提交？
> redo log prepare → 写 binlog → redo log commit。binlog 先落盘。目的：保证 binlog 和 redo log 一致，崩溃恢复时若 binlog 完整则提交，否则回滚。

23. 数据库宕机恢复后怎么保证数据不丢？
> WAL 机制：事务提交前 redo log 必须刷盘（innodb_flush_log_at_trx_commit=1）。恢复时重放 redo log 恢复已提交事务，用 undo log 回滚未提交事务。配合二阶段提交保证 binlog 一致。

### 架构与优化

22. MySQL 的架构介绍一下？为什么要做分层架构？server 层和存储引擎层为什么要分开？
> 连接器→查询缓存→解析器→优化器→执行器（server 层）\| 存储引擎层（InnoDB/MyISAM）。分开→可插拔引擎，不同场景选不同引擎。

23. 一条 SQL 语句执行的大体流程？
> 连接鉴权→（查询缓存 8.0 已删）→词法/语法解析→优化器选执行计划→执行器调存储引擎接口→返回结果。

24. 存储引擎有哪些？InnoDB 引擎有什么优点？
> InnoDB（支持事务/行锁/外键/MVCC，默认）、MyISAM（不支持事务，表锁，全文索引快）、Memory。

25. 慢查询如何排查与优化？EXPLAIN 会显示哪些东西？
> 开启 slow_query_log → EXPLAIN 看 type（ALL/index/range/ref/const）、key（用了哪个索引）、rows（扫描行数）、Extra（Using filesort/Using temporary）。优化：加索引、改写 SQL、避免 SELECT *。

26. limit 10 offset 10000 的深度分页问题怎么解决？
> ①延迟关联：子查询先走覆盖索引取主键，再 JOIN 取数据。②游标分页：WHERE id > last_id LIMIT 10。③业务限制最大页数。

27. 分库分表如何处理？水平分表后如何计算 count？
> 分库（按业务/用户ID hash）、分表（按时间/ID 取模）。count：①各分表 count 求和；②维护独立计数表；③定期异步统计。

28. MySQL 有哪些巧妙的优化来提高吞吐量？
> Buffer Pool（减少磁盘读）、Change Buffer（合并二级索引写）、自适应哈希索引、WAL+顺序写、预读（read-ahead）、MRR（Multi-Range Read 排序回表）、ICP（Index Condition Pushdown 减少回表）。

29. 慢 SQL 优化的目标是什么？为什么要优化？
> 目标：减少扫描行数、降低锁持有时间、减少临时表/排序。原因：慢 SQL 占连接池→其他请求排队→流量上涨时 DB 连接耗尽→雪崩。除索引外：读写分离、缓存前置、异步化、分库分表。

### SQL 题

28. 写一个查询平均分大于 80 的学生姓名
> `SELECT name FROM student JOIN score ON ... GROUP BY name HAVING AVG(score) > 80`

29. 写一个查询每门科目都不低于 80 分的学生姓名
> `SELECT name FROM score GROUP BY name HAVING MIN(score) >= 80`

---

## 二、Redis

### 基础

1. Redis 为什么这么快？（**高频 Top3**）
> ①纯内存操作；②单线程避免锁竞争和上下文切换；③IO 多路复用（epoll）处理大量连接；④高效数据结构（SDS/ziplist/跳表）。

2. Redis 常用的数据类型有哪些？底层结构分别是什么？
> String（SDS）、List（quicklist=ziplist+链表）、Hash（ziplist/hashtable）、Set（intset/hashtable）、ZSet（ziplist/跳表+hashtable）。扩展：HyperLogLog、Bitmap、Stream。

3. zset 底层结构？跳表时间复杂度？为什么用跳表不用红黑树？
> 跳表+哈希表。跳表查找/插入/删除均 O(log n)。跳表优势：实现简单、范围查询天然有序（直接遍历底层链表）、并发友好（局部锁）。红黑树范围查询需中序遍历。

4. Redis 线程模型？IO 多路复用有哪几种模型？
> 6.0 前单线程处理命令（事件循环 + epoll）。6.0 后多线程只用于网络 IO 读写，命令执行仍单线程。多路复用：select（fd 上限 1024）、poll（无上限但轮询）、epoll（回调通知，O(1)就绪事件获取）。

### 持久化与集群

5. Redis 持久化方式有哪些？AOF 和 RDB 的区别？
> RDB：定时快照，体积小恢复快，但可能丢最后一次快照后的数据。AOF：追加写每条命令，数据更安全但文件大、恢复慢。可混合使用：RDB 做基础 + AOF 增量。

6. Redis 集群如何实现？哈希槽数量？请求如何映射到具体节点？
> 16384 个哈希槽分配给各节点。CRC16(key) % 16384 → 槽号 → 对应节点。客户端收到 MOVED 重定向到正确节点。

7. 集群节点之间通信使用什么协议？心跳检测和新节点发现？
> Gossip 协议（PING/PONG/MEET/FAIL）。每个节点周期性随机选节点 PING，交换集群状态信息。新节点通过 CLUSTER MEET 加入。

8. 一致性哈希算法？
> 哈希环 0~2^32-1，节点和 key 都映射到环上，key 顺时针找到第一个节点。增删节点只影响相邻区间。虚拟节点解决数据倾斜。

### 缓存策略

9. 缓存与数据库一致性如何保证？先删缓存还是先更新数据库？延迟双删？（**高频 Top3**）
> 推荐 Cache Aside：读→先查缓存，miss 则查 DB 写缓存；写→先更新 DB，再删缓存。延迟双删：删缓存→更新 DB→sleep→再删缓存（应对并发读写不一致）。最终一致：订阅 binlog 异步删缓存。

10. 缓存三大问题：击穿、穿透、雪崩及解决方案？
> 击穿：热点 key 过期→互斥锁/永不过期+异步更新。穿透：查不存在的数据→布隆过滤器/缓存空值。雪崩：大量 key 同时过期→随机过期时间/多级缓存/限流降级。

11. 布隆过滤器原理？有什么缺点？
> 位数组 + 多个哈希函数。插入时多个位置置 1，查询时全为 1 则"可能存在"。缺点：有误判（假阳性）、不能删除（可用 Counting BF）。

12. Redis 内存快溢出时怎么清除？过期策略有哪些？
> 过期策略：惰性删除（访问时检查）+ 定期删除（周期性随机抽查）。淘汰策略：noeviction/allkeys-lru/volatile-lru/allkeys-random/volatile-ttl/allkeys-lfu。

### 分布式锁

13. Redisson 分布式锁是怎么实现的？
> Lua 脚本原子执行 SET key uuid NX PX 30000。看门狗机制：后台线程每 10s 续期（默认 30s 过期）。解锁时验证 uuid 防误删。可重入：hash 结构记录重入次数。

14. 如果分布式锁的 Key 成为热点 Key（高并发抢同一把锁）怎么优化？
> ①分段锁：key 拆成 key_1~key_N，随机抢其中一个；②本地锁先过滤（JVM 级别先竞争再去 Redis）；③队列化串行处理。

15. Lua 脚本怎么保证原子性？使用时需要注意什么？
> Redis 单线程执行 Lua 脚本期间不会插入其他命令→天然原子。注意：脚本不能太长（阻塞其他请求）、避免死循环、集群模式下所有 key 必须在同一 slot（用 hash tag）。

### 应用

16. 怎么在 Redis 10 亿个数据中查找 10w 个 key 前缀部分相同的数据？
> 用 SCAN 命令（游标遍历，不阻塞）+ MATCH 模式。禁止用 KEYS（O(N) 阻塞）。

17. Redis 怎么实现限制用户请求？多线程怎么保证线程安全？
> 限流：固定窗口（INCR+EXPIRE）、滑动窗口（ZSET 按时间戳）、令牌桶（Lua 脚本）。线程安全：Redis 命令本身是原子的；复合操作用 Lua 脚本或 WATCH+MULTI 事务。

18. 基于 Redis 的 pub/sub 实现的动态配置中心消息丢失了怎么办？
> pub/sub 不持久化、无确认机制，订阅者离线就丢消息。解决：①用 Stream（有消费者组+ACK）；②配合持久化存储（DB/ZK）做兜底，启动时全量拉取。

19. Redis Rehash 过程详解？
> 渐进式 rehash：分配新哈希表（2倍大小），每次 CRUD 操作时迁移一个桶到新表，迁移期间同时查两个表。直到旧表为空释放。避免一次性 rehash 阻塞。

20. Redis 大 Key 问题怎么解决？
> 大 Key：单个 value 过大（如几 MB 的 String、百万元素的 Hash）→阻塞主线程、网络带宽打满、主从同步延迟。解决：①拆分（Hash 分段 key_1~key_N）；②压缩（序列化/gzip）；③异步删除（UNLINK 替代 DEL）；④定期 `redis-cli --bigkeys` 扫描。

21. 如何让拆分后的 key 均匀分散在集群不同分片中？
> 避免 hash tag（`{}`）导致同 slot。方案：key 命名中加入随机后缀或业务 ID → CRC16 自然散列到不同 slot。若需要同 slot（如事务），用 hash tag `{user:123}:field_N`。

---

## 三、计算机网络

### TCP/UDP

1. TCP 三次握手和四次挥手的详细过程？为什么断开要 4 次？（**高频 Top3**）
> 握手：SYN→SYN+ACK→ACK（双方确认收发能力）。挥手：FIN→ACK→FIN→ACK（4 次因为 TCP 全双工，每个方向独立关闭，被动关闭方可能还有数据要发）。

2. TCP 和 UDP 的区别与应用场景？
> TCP：面向连接、可靠、有序、流控拥控、开销大→HTTP/文件传输。UDP：无连接、不可靠、无序、快→DNS/视频直播/游戏。

3. TCP 拥塞控制的详细过程？WiFi 信号弱时拥塞控制发生什么？
> 慢启动（指数增长）→拥塞避免（线性增长）→快重传（3 次重复 ACK 立即重传）→快恢复（窗口减半继续线性增长）。WiFi 弱→丢包→TCP 误判为拥塞→窗口骤降→吞吐暴跌。

4. TCP 如何保证可靠性？滑动窗口原理？
> 序号+确认号+超时重传+校验和+流量控制+拥塞控制。滑动窗口：发送方维护 [已确认 \| 已发未确认 \| 可发 \| 不可发]，接收方通告 rwnd 控制发送速率。

5. TCP 怎么解决包乱序？怎么解决包重复？
> 乱序：接收方按序号缓存，等齐后交付上层（或发 SACK）。重复：通过序号去重，丢弃已接收的包。

6. 四次挥手后要等多久才断开？TIME_WAIT 为什么是 2MSL？如何解决 TIME_WAIT 过多？
> 等 2MSL（约 60s）。原因：确保最后一个 ACK 到达对方，防止旧连接的延迟包干扰新连接。解决：SO_REUSEADDR/tcp_tw_reuse/缩短 MSL/连接池复用。

7. 设计可靠 UDP？
> 应用层加：序号（排序去重）+ ACK 确认 + 超时重传 + 滑动窗口（流控）。参考 KCP/QUIC。

### HTTP/HTTPS

8. 在浏览器输入一个 URL 后发生了什么？DNS 解析的具体步骤？（**高频 Top3**）
> DNS 解析（浏览器缓存→OS 缓存→hosts→本地 DNS→递归/迭代查询根→顶级→权威）→TCP 三次握手→（TLS 握手）→发 HTTP 请求→服务器处理返回响应→浏览器解析渲染（DOM→CSSOM→Layout→Paint）。

9. HTTP 和 HTTPS 的区别？HTTPS 连接建立过程/SSL/TLS 握手过程？
> HTTPS = HTTP + TLS 加密。握手：Client Hello（支持的加密套件）→Server Hello+证书→客户端验证证书→客户端生成预主密钥用服务器公钥加密发送→双方计算会话密钥→对称加密通信。

10. HTTP 1.0/1.1/2.0/3.0 的区别？长连接和短连接？各自使用场景？
> 1.0 短连接（每次请求新建 TCP）；1.1 长连接+pipeline（但队头阻塞）；2.0 多路复用+头部压缩+服务器推送+二进制帧；3.0 基于 QUIC（UDP），解决 TCP 队头阻塞。长连接场景：频繁交互（WebSocket/数据库连接池/RPC）。短连接场景：低频一次性请求、客户端数量极多无法维持连接。

11. HTTP 请求报文包含哪些字段？有哪些请求方式？
> 请求行（方法+URL+版本）+请求头（Host/Content-Type/Cookie/Authorization）+空行+请求体。方法：GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS。

12. HTTP 是无状态的，怎么让用户保留登录状态？session 和 cookie 的原理和区别？
> Cookie 存客户端（键值对，随请求自动带上）；Session 存服务端（通过 Cookie 中的 SessionID 关联）。Token/JWT：无状态令牌，服务端不存储，自包含用户信息+签名。

13. 常见的服务器返回的状态码含义？302/403？
> 2xx 成功（200 OK/201 Created）；3xx 重定向（301 永久/302 临时/304 未修改）；4xx 客户端错误（400 Bad Request/401 未认证/403 禁止访问/404 Not Found）；5xx 服务端错误（500/502/503）。

### 网络模型

14. 计算机网络七层/五层/四层模型？为什么要分层？
> 七层：应用/表示/会话/传输/网络/链路/物理。五层：应用/传输/网络/链路/物理。四层 TCP/IP：应用/传输/网际/网络接口。分层→各层独立演进、易于标准化和排错。

---

## 四、操作系统

### 进程与线程

1. 进程和线程的区别？各自通信方式？（**高频 Top3**）
> 进程：资源分配的基本单位，独立地址空间。线程：CPU 调度基本单位，共享进程资源。进程通信：管道/消息队列/共享内存/信号/Socket。线程通信：共享变量+锁/条件变量/信号量。

2. 协程比起线程有什么优势？线程切换和协程切换的开销？
> 协程：用户态调度，无系统调用开销，栈更小（KB 级 vs 线程 MB 级）。线程切换：内核态切换（保存/恢复寄存器、TLB 刷新），约几微秒。协程切换：用户态保存几个寄存器，约几十纳秒。

3. 进程间通信有哪些方式？共享内存怎么实现？
> 管道（匿名/命名）、消息队列、共享内存、信号量、信号、Socket。共享内存：shmget 创建→shmat 映射到各进程地址空间→读写→需自行用信号量同步。

4. 死锁是什么？产生条件？怎么避免？
> 多进程互相等待对方持有的资源。四个必要条件：互斥、占有且等待、不可抢占、循环等待。避免：破坏任一条件，如按固定顺序加锁（破坏循环等待）、超时释放、银行家算法。

5. 进程调度算法有哪些？CFS？
> FCFS、SJF、优先级、时间片轮转、多级反馈队列。CFS（完全公平调度）：红黑树维护 vruntime（虚拟运行时间），总选 vruntime 最小的进程运行，保证公平性。

6. 僵尸进程和孤儿进程？怎么预防和解决？
> 僵尸：子进程退出但父进程没 wait()，PCB 残留占 PID。孤儿：父进程先退出，子进程被 init/systemd 收养（无害）。解决僵尸：父进程 wait()/waitpid()，或 SIGCHLD 信号处理，或双 fork。

7. fork 原理？创建新进程内核做了什么？copy-on-write？
> fork 复制父进程 PCB（PID 不同），页表指向相同物理页（只读共享）。写时复制（COW）：任一进程写入时才真正拷贝该页，减少 fork 开销。

### 内存管理

8. 虚拟内存是什么？页表？缺页中断？TLB？
> 虚拟内存：每个进程独立的虚拟地址空间，通过页表映射到物理内存。缺页中断：访问的页不在物理内存→OS 从磁盘换入。TLB：页表缓存（快表），加速虚拟→物理地址转换。

9. 堆和栈的区别？为什么要有栈，不可以直接在堆上分配内存吗？
> 栈：自动管理（入栈出栈）、快、空间小、存局部变量/函数调用。堆：手动管理（malloc/free）、慢、空间大、存动态数据。栈的优势：分配释放 O(1)（移动栈指针）、缓存友好、天然按调用嵌套回收。

10. 用户态和内核态的区别？
> 用户态：受限指令集，不能直接访问硬件/内核内存。内核态：完全权限。切换触发：系统调用、中断、异常。切换开销：保存/恢复用户态上下文。

### I/O 与文件系统

11. IO 多路复用：select/poll/epoll 的区别？水平触发和边缘触发？
> select：fd 集合有 1024 上限，每次调用拷贝全部 fd，O(n) 轮询。poll：无上限但仍 O(n) 轮询。epoll：内核事件表+回调，O(1) 获取就绪事件，支持 ET。LT（水平触发）：就绪就一直通知；ET（边缘触发）：只在状态变化时通知一次，必须一次读完。

12. 文件系统的 inode 有什么信息？进程在写文件时直接 rm 会发生什么？
> inode：文件大小、权限、时间戳、数据块指针、硬链接数。rm 只是删目录项（硬链接数-1），进程仍持有 fd 指向 inode，数据可继续读写，直到进程关闭 fd 且链接数为 0 才真正释放。

13. 软连接和硬连接的区别？
> 硬链接：同 inode 不同目录项，不能跨文件系统，不能链目录。软链接：独立 inode 存目标路径，可跨文件系统，可链目录，原文件删除则失效。

### 其他

14. Linux 常见命令？系统输入命令比较卡如何排查？
> top/htop（CPU/内存）、iostat（磁盘 IO）、vmstat（上下文切换）、netstat/ss（网络连接）、strace（系统调用跟踪）、dmesg（内核日志）。排查卡顿：看 CPU（top）→ 内存/swap（free）→ 磁盘 IO（iostat/iotop）→ 网络（iftop）。

15. CPU 各级存储的速度？多核访问同一资源可能出现什么问题？
> 寄存器（1 cycle）→L1（~1ns）→L2（~3ns）→L3（~10ns）→内存（~100ns）→SSD（~100μs）→HDD（~10ms）。多核问题：缓存一致性（A 核改了 x，B 核 cache 中 x 还是旧值）。解决：MESI 协议（Modified/Exclusive/Shared/Invalid）+ 总线嗅探/目录协议。

---

## 五、消息队列与中间件

### Kafka/MQ

1. MQ 幂等性怎么保证？
> 生产端：唯一消息 ID + 去重表（或 Redis SET）。消费端：幂等操作（如 UPSERT）/ 消费前查 ID 是否已处理 / 数据库唯一约束。Kafka 自身：enable.idempotence=true（生产者幂等）。

2. Kafka 怎么保证高可用性？leader 选举策略？
> 每个 partition 多副本（leader+follower），leader 处理读写，follower 同步。leader 挂→从 ISR（同步副本集）中选新 leader（优先选 ISR 中 LEO 最大的）。

3. Kafka 丢失消息的情况？怎么解决？消息没发出去怎么办？
> 生产端：acks=0/1 时 leader 挂→丢。解决：acks=all + min.insync.replicas≥2。消费端：自动提交 offset 但处理失败→丢。解决：手动提交。Broker：异步刷盘→丢。解决：同步刷盘/多副本。

4. Kafka 怎么保证顺序性？
> 同一 partition 内有序。方案：需要顺序的消息发到同一 partition（指定 key，hash 到同一分区）。消费者单线程消费该分区或加内存队列按 key 分组。

5. Kafka 怎么把消息发送到 partition 里的？
> 有 key：hash(key) % partition 数。无 key：轮询 / 粘性分区（Sticky Partitioner，同一 batch 发同一分区）。也可自定义 Partitioner。

6. 几种 MQ 的区别？消息队列选型？
> Kafka：高吞吐、日志型、适合大数据/流处理。RabbitMQ：功能丰富（路由/优先级/延迟）、吞吐中等、适合业务系统。RocketMQ：事务消息/延迟消息/顺序消息，阿里系首选。

7. MQ 发送消息失败/超时怎么办？怎么防止 MQ 挂？
> 失败：重试（指数退避）+ 死信队列 + 本地消息表兜底。防挂：集群部署多副本 + 持久化 + 监控报警 + 降级方案（写本地再异步补发）。

### 微服务

8. 微服务是什么？有什么好处？RPC 协议？
> 按业务拆分为独立部署的小服务。好处：独立开发部署、技术栈灵活、故障隔离、水平扩展。RPC：序列化（Protobuf/Thrift）+ 网络传输 + 服务发现 + 负载均衡。

9. Nginx 负载均衡有哪些策略？
> 轮询、加权轮询、IP Hash（会话粘滞）、最少连接、一致性哈希。

10. Dubbo 原理？Netty 原理？
> Dubbo：Provider 注册到注册中心（Zookeeper）→Consumer 订阅→直连调用（Netty 通信）+负载均衡+容错+监控。Netty：基于 NIO 的事件驱动网络框架，Reactor 模型（Boss 接收连接 + Worker 处理 IO）+零拷贝+内存池。

11. Spring Cloud Gateway 如何实现服务发现和注册？Nacos 注册中心？
> 服务启动时向 Nacos 注册（IP+端口+服务名）。Gateway 从 Nacos 拉取服务列表，根据路由规则转发请求，结合 Ribbon 做负载均衡。Nacos：AP/CP 可切换，支持配置中心+服务发现。

---

## 六、Java/语言基础

### 集合

1. HashMap 底层原理？怎么插入？怎么扩容？链表转红黑树阈值为什么是 8？1.8 尾插法？（**高频**）
> 数组 + 链表/红黑树。hash(key) & (n-1) 定位桶，冲突挂链表，链表≥8 转红黑树（泊松分布下≥8 概率极低）。扩容：容量×2，重新 hash 分配（1.8 只看高位 bit）。1.8 尾插法避免多线程环形链表。

2. ConcurrentHashMap 底层原理？如何保证线程安全？分段锁？
> 1.7：Segment 分段锁（每段独立 ReentrantLock）。1.8：CAS + synchronized（锁单个桶头节点），粒度更细。读无锁（volatile Node.val/next）。

3. Java 集合有哪些？Map 有几种？
> List（ArrayList/LinkedList）、Set（HashSet/TreeSet）、Queue（ArrayDeque/PriorityQueue）。Map：HashMap、TreeMap（红黑树有序）、LinkedHashMap（插入序）、ConcurrentHashMap。

### JVM

4. Java GC 算法？垃圾回收器（CMS、G1）？
> 算法：标记清除（碎片）、标记整理（移动开销）、复制（空间浪费）、分代收集。CMS：并发标记清除，低停顿但碎片多。G1：分 Region，可预测停顿时间，标记整理，适合大堆。ZGC：亚毫秒停顿。

5. JVM 内存模型/内存分配？堆中的分代？
> 堆（对象实例）、方法区/元空间（类信息/常量池）、虚拟机栈（栈帧）、本地方法栈、程序计数器。堆分代：Young（Eden+S0+S1，Minor GC）+ Old（Major/Full GC）。新对象先 Eden，存活 N 次晋升 Old。

6. 类加载机制和双亲委派模型？
> 加载→验证→准备→解析→初始化。双亲委派：先委托父加载器加载（Bootstrap→Extension→Application），父加载不了才自己加载。保证类唯一性、防核心类被篡改。

7. Java 的四种引用类型（强、弱、软、虚）？使用场景？
> 强引用：不回收。软引用：内存不足时回收（缓存）。弱引用：下次 GC 必回收（WeakHashMap/ThreadLocalMap）。虚引用：仅跟踪回收时机（堆外内存管理）。

### 并发

8. 线程池的功能、常用参数、类型？子线程异常怎么捕获？
> 参数：corePoolSize、maxPoolSize、keepAliveTime、workQueue、threadFactory、rejectedHandler。类型：Fixed/Cached/Scheduled/SingleThread。捕获异常：submit 用 Future.get()；execute 设 UncaughtExceptionHandler。

9. synchronized 实现原理？和 Lock/ReentrantLock 的区别？锁状态转换？
> synchronized：对象头 Mark Word + monitor（monitorenter/monitorexit）。锁升级：无锁→偏向锁→轻量级锁（CAS 自旋）→重量级锁（阻塞）。ReentrantLock 区别：可中断、可超时、可公平、支持多 Condition。

10. volatile 的理解？底层实现？
> 保证可见性（修改立即刷主存+其他线程缓存失效）+ 禁止指令重排序。不保证原子性。底层：内存屏障（Store Barrier/Load Barrier），x86 用 lock 前缀指令。

11. CountDownLatch 底层实现？怎么让线程等待？
> 基于 AQS，state 初始化为 count。countDown() → state-1（CAS）；await() → state!=0 就阻塞（入 AQS 等待队列）；state=0 时唤醒所有等待线程。

12. ReentrantLock 底层实现？公平锁与非公平锁？
> 基于 AQS。state=0 无锁，state>0 已锁（可重入次数）。公平锁：先检查队列有无等待者。非公平锁：直接 CAS 抢，失败再排队（默认，吞吐更高）。

13. ThreadLocal 是什么？实现线程隔离的原理？内存泄露问题？
> 每个线程有自己的 ThreadLocalMap（key=ThreadLocal 弱引用，value=值）。隔离：各线程访问自己的 map。泄露：key 被回收后 value 仍在→用完必须 remove()。

14. CAS 实现原理？是否线程安全？
> Compare And Swap：CPU 原子指令（cmpxchg），比较内存值与期望值相等则更新。线程安全但有 ABA 问题（用版本号/AtomicStampedReference 解决）。

15. 可见性、原子性、有序性怎么理解？
> 可见性：一个线程修改对其他线程立即可见（volatile/synchronized/final）。原子性：操作不可分割（synchronized/CAS/Atomic 类）。有序性：指令不被重排（volatile 禁止重排/happens-before 规则）。

16. 乐观锁、悲观锁使用场景？
> 悲观锁（synchronized/SELECT FOR UPDATE）：写多读少、竞争激烈。乐观锁（CAS/版本号）：读多写少、竞争不激烈。数据库场景：version 字段 UPDATE ... WHERE version=x。

### Spring

17. Spring IOC/DI/AOP？用到了什么设计模式？
> IOC（控制反转）：容器管理 Bean 生命周期。DI（依赖注入）：构造器/Setter/字段注入。AOP（面向切面）：动态代理实现日志/事务/权限。设计模式：工厂（BeanFactory）、单例（Bean 默认）、代理（AOP）、模板方法（JdbcTemplate）、观察者（事件机制）。

18. Spring Boot 启动流程和自动配置原理？
> 启动：main→SpringApplication.run→创建上下文→扫描配置→刷新容器→启动内嵌 Tomcat。自动配置：@EnableAutoConfiguration→读 META-INF/spring.factories→加载 AutoConfiguration 类→@Conditional 条件装配。

### 设计模式

19. 设计模式有几大类？工厂模式、策略模式、单例模式、责任链模式？
> 三大类：创建型（工厂/单例/建造者）、结构型（代理/适配器/装饰器）、行为型（策略/观察者/责任链）。工厂：封装创建逻辑。策略：一组算法可互换。单例：全局唯一实例（双重检查/枚举）。责任链：请求沿链传递（Filter/Interceptor）。

### 其他

20. Java AIO/NIO/BIO？
> BIO：同步阻塞，一连接一线程。NIO：同步非阻塞，Selector 多路复用+Channel+Buffer，一线程管多连接。AIO：异步非阻塞，OS 完成后回调通知（Linux 实现不成熟，用得少）。

21. Go 的 GMP 模型？goroutine 的工作窃取？runtime 逃逸分析？
> G（goroutine）M（OS 线程）P（逻辑处理器，本地队列）。M 绑定 P 执行 G，P 的本地队列空了从其他 P 偷一半（work stealing）。逃逸分析：编译时判断变量是否逃逸到堆（取地址/返回指针/闭包引用→分配到堆）。

---

## 七、系统设计

1. 秒杀系统如何设计？如何防止超卖？（**高频**）
> 前端：按钮防抖+验证码+CDN 静态化。后端：请求先到 Redis（DECR 库存原子扣减）→成功的入 MQ→消费者异步下单写 DB。防超卖：Redis 原子扣减 + DB 乐观锁（stock>0）兜底。

2. 大量用户直播场景有点赞功能如何优化？
> 本地聚合：客户端/网关层攒批（如每秒合并一次）→ Redis INCRBY 批量加 → 定时同步 DB。展示层：前端本地先 +1 乐观显示。不需要精确实时→最终一致。

3. 如何设计一个高可用的分布式系统？
> 冗余（多副本/多机房）、故障检测（心跳/健康检查）、自动切换（主从切换/选主）、限流降级熔断、数据一致（复制+对账）、无状态服务+水平扩展。

4. 缓存模式（Cache Aside、Read Through、Write Through、Write Behind）？
> Cache Aside：应用自己管（读 miss 查 DB 填缓存，写先更 DB 再删缓存）。Read Through：缓存层自动加载。Write Through：同步写缓存+DB。Write Behind：先写缓存，异步批量刷 DB（性能好但可能丢数据）。

5. 如何处理高并发？如何提高并发？
> 垂直扩展（升配）+ 水平扩展（加机器）。缓存（减少 DB 压力）、异步（MQ 削峰）、分库分表、读写分离、CDN、连接池、无锁数据结构。

6. 限流算法有哪些？
> 固定窗口（简单但边界突刺）、滑动窗口（精确但内存大）、漏桶（固定速率输出，平滑流量）、令牌桶（允许突发，匀速放令牌）。

7. 设计电影院的票务系统，数据库有哪些表？
> 影院表、影厅表、座位表、场次表（film_id+hall_id+时间）、订单表、用户表。核心：场次-座位锁定（SELECT FOR UPDATE 或 Redis 分布式锁），防止同座超卖。

8. 如何实现三个线程执行完成后再执行主线程？三个线程按顺序打印 1,2,3？
> 等待完成：CountDownLatch(3) / Thread.join() / CompletableFuture.allOf()。顺序打印：①三个线程顺序 join；②Semaphore 传递信号；③Lock+Condition 依次唤醒。

9. 分布式一致性算法？
> Paxos（理论基础/复杂）、Raft（易理解：Leader 选举+日志复制+安全性）、ZAB（ZooKeeper 用）。CP：强一致但可用性受限。AP：最终一致（Gossip/CRDT）。

10. IM 群聊消息发送如何设计？
> 写扩散（每人收件箱写一份，读快写重）vs 读扩散（只写一份到群 timeline，读时聚合）。大群用读扩散 + 推拉结合（在线推，离线拉）。消息 ID 用 Snowflake 保序。

11. 如何给大量 url 和 ip 去重？
> 布隆过滤器（允许少量误判）。精确去重：分桶（hash 到多个小文件）→ 各文件内 HashSet 去重。或 bitmap（IP 用 4B int 做索引，只需 512MB）。

12. 100 亿 IP 找 top10？一篇文章找出现次数最多的五个单词？
> 分治：hash 分到 N 个小文件→各文件 HashMap 计数→各文件取 top10→全局 N 路归并/小根堆取 top10。文章同理：HashMap 统计词频→ 大小为 5 的小根堆维护 top5。

13. 分布式事务怎么处理？本地消息表方案？
> 2PC（强一致但阻塞）、TCC（Try-Confirm-Cancel）、Saga（补偿事务）、本地消息表（事务写业务+消息到同一 DB→定时任务/MQ 发消息→消费方幂等处理，最终一致）。

14. 设计一个视频网站供很多人观看？设计一个聊天窗口供多人聊天？
> 视频：CDN 分发 + 分片上传 + 转码队列 + HLS/DASH 自适应码率 + 热点视频预热缓存。聊天：WebSocket 长连接 + 消息队列广播 + 会话管理 + 消息持久化 + 离线消息拉取。

15. 手写令牌桶限流器代码？
> 核心：维护令牌数 tokens + 上次填充时间。每次请求时先按时间差补充令牌（tokens += elapsed * rate，cap 上限），再判断 tokens≥1 则放行并 -1，否则拒绝。支持突发（桶满时可连续消耗），与漏桶区别：漏桶匀速出，令牌桶允许突发。

16. 分布式场景中上游调下游服务，路由是怎么确定的？
> 服务注册中心（Nacos/ZK/Consul）维护服务实例列表。上游通过 SDK 拉取实例列表→负载均衡策略选一个（轮询/加权/一致性哈希/最少连接）→发起 RPC。健康检查剔除故障节点，灰度发布用权重/标签路由。

---

## 八、算法与数据结构（手撕题）

> 按出现频次排序，标注 LeetCode 编号。

| # | 题目 | 频次 | LeetCode |
|---|------|------|----------|
| 1 | [LC 146. LRU 缓存](https://onefly.top/zero2Leetcode/playground.html?id=146) | 6 | 146 |
| 2 | [LC 200. 岛屿数量](https://onefly.top/zero2Leetcode/playground.html?id=200) | 5 | 200 |
| 3 | [LC 215. 第 K 大元素](https://onefly.top/zero2Leetcode/playground.html?id=215) | 3 | 215 |
| 4 | [LC 93. 复原 IP 地址](https://leetcode.cn/problems/restore-ip-addresses/) | 3 | 93 |
| 5 | 股票买卖系列（[121](https://onefly.top/zero2Leetcode/playground.html?id=121)/[122](https://onefly.top/zero2Leetcode/playground.html?id=122)/[123](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-iii/)/[188](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-iv/)） | 3 | 121/122/123/188 |
| 6 | [LC 199. 二叉树的右视图](https://onefly.top/zero2Leetcode/playground.html?id=199) | 1 | 199 |
| 7 | [LC 3. 最长不重复子串](https://onefly.top/zero2Leetcode/playground.html?id=3) | 2 | 3 |
| 8 | [LC 31. 下一个排列](https://onefly.top/zero2Leetcode/playground.html?id=31) | 2 | 31 |
| 9 | [LC 42. 接雨水](https://onefly.top/zero2Leetcode/playground.html?id=42) | 2 | 42 |
| 10 | [LC 143. 重排链表](https://leetcode.cn/problems/reorder-list/) | 1 | 143 |
| 11 | [LC 236. 二叉树最近公共祖先](https://onefly.top/zero2Leetcode/playground.html?id=236) | 3 | 236 |
| 12 | 归并排序 | 1 | — |
| 13 | [LC 25. 反转 K 个一组链表](https://onefly.top/zero2Leetcode/playground.html?id=25) | 1 | 25 |
| 14 | [LC 714. 带手续费股票利润](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-with-transaction-fee/) | 1 | 714 |
| 15 | [LC 426. 二叉搜索树转有序链表](https://leetcode.cn/problems/convert-binary-search-tree-to-sorted-doubly-linked-list/) | 1 | 426 |
| 16 | 打家劫舍（[198](https://onefly.top/zero2Leetcode/playground.html?id=198)/[213](https://leetcode.cn/problems/house-robber-ii/)） | 2 | 198/213 |
| 17 | [LC 23. K 个有序链表合并](https://onefly.top/zero2Leetcode/playground.html?id=23) | 1 | 23 |
| 18 | 快排 | 2 | — |
| 19 | [LC 160. 链表相交](https://onefly.top/zero2Leetcode/playground.html?id=160) | 2 | 160 |
| 20 | [LC 15. 三数之和](https://onefly.top/zero2Leetcode/playground.html?id=15) | 1 | 15 |
| 21 | [LC 43. 字符串相乘](https://leetcode.cn/problems/multiply-strings/) | 1 | 43 |
| 22 | [LC 154. 旋转数组最小值（含重复）](https://leetcode.cn/problems/find-minimum-in-rotated-sorted-array-ii/) | 1 | 154 |
| 23 | [LC 572. 另一棵树的子树](https://leetcode.cn/problems/subtree-of-another-tree/) | 1 | 572 |
| 24 | [LC 402. 移掉 K 位数字](https://leetcode.cn/problems/remove-k-digits/) | 1 | 402 |
| 25 | [LC 785. 判断二分图](https://leetcode.cn/problems/is-graph-bipartite/) | 1 | 785 |
| 26 | [LC 560. 和为 K 的子数组](https://onefly.top/zero2Leetcode/playground.html?id=560) | 1 | 560 |
| 27 | [LC 437. 路径总和 III](https://onefly.top/zero2Leetcode/playground.html?id=437) | 1 | 437 |
| 28 | [LC 128. 最长连续序列](https://onefly.top/zero2Leetcode/playground.html?id=128) | 1 | 128 |
| 29 | [LC 102. 二叉树层序遍历](https://onefly.top/zero2Leetcode/playground.html?id=102) | 2 | 102 |
| 30 | [LC 662. 二叉树最大宽度](https://leetcode.cn/problems/maximum-width-of-binary-tree/) | 1 | 662 |
| 31 | [LC 470. 用 Rand7 实现 Rand10](https://leetcode.cn/problems/implement-rand10-using-rand7/) | 1 | 470 |
| 32 | [LC 678. 有效的括号字符串](https://leetcode.cn/problems/valid-parenthesis-string/) | 1 | 678 |
| 33 | 大数阶乘 | 1 | — |
| 34 | [LC 295. 数据流中位数](https://onefly.top/zero2Leetcode/playground.html?id=295) | 1 | 295 |
| 35 | 手写可重入锁 | 1 | — |
| 36 | [LC 103. 二叉树锯齿形层序遍历](https://leetcode.cn/problems/binary-tree-zigzag-level-order-traversal/) | 1 | 103 |
| 37 | 手写令牌桶限流器 | 1 | — |
| 38 | 给定集合 A 和正整数 n，求组成 ≤n 的最大值（0/1背包变体） | 1 | — |
| 39 | 十六进制转换 | 1 | — |

---

## 高频考点 TOP 10

| 排名 | 考点 | 出现次数 |
|------|------|----------|
| 1 | MySQL 索引相关（结构/失效/覆盖/联合索引） | 15+ |
| 2 | TCP 三次握手四次挥手 | 10+ |
| 3 | Redis 缓存一致性 | 8+ |
| 4 | 进程与线程区别 | 8+ |
| 5 | 输入 URL 后发生什么 | 7+ |
| 6 | HashMap 底层原理 | 7+ |
| 7 | Redis 为什么快 | 6+ |
| 8 | LRU 实现 | 6+ |
| 9 | 事务隔离级别与 MVCC | 6+ |
| 10 | 缓存穿透/击穿/雪崩 | 5+ |
