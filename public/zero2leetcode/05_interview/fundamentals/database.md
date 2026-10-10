# 数据库八股文

---

## 〇、基本SQL语句

### 1. 数据查询（SELECT）

| 类型 | 示例 |
|------|------|
| 基础查询 | `SELECT * FROM users;` |
| 指定列 | `SELECT id, name FROM users;` |
| 条件查询 | `SELECT * FROM users WHERE age > 25;` |
| 排序 | `SELECT * FROM users ORDER BY age DESC;` |
| 去重 | `SELECT DISTINCT city FROM users;` |
| 分页 | `SELECT * FROM users LIMIT 10 OFFSET 20;` |
| 别名 | `SELECT name AS username FROM users;` |
| 模糊匹配 | `SELECT * FROM users WHERE name LIKE 'A%';` |
| 范围查询 | `SELECT * FROM users WHERE age BETWEEN 20 AND 30;` |
| 多条件 | `SELECT * FROM users WHERE age > 20 AND city = 'Beijing';` |

### 2. 多表操作（连接与子查询）

| 类型 | 示例 |
|------|------|
| 内连接 | `SELECT u.name, o.amount FROM users u JOIN orders o ON u.id = o.user_id;` |
| 左连接 | `SELECT u.name, o.amount FROM users u LEFT JOIN orders o ON u.id = o.user_id;` |
| 右连接 | `SELECT u.name, o.amount FROM users u RIGHT JOIN orders o ON u.id = o.user_id;` |
| 子查询（WHERE中） | `SELECT name FROM users WHERE id IN (SELECT user_id FROM orders);` |
| 子查询（FROM中） | `SELECT t.user_id, COUNT(*) FROM (SELECT * FROM orders WHERE amount > 100) t GROUP BY t.user_id;` |

### 3. 聚合与分组

| 类型 | 示例 |
|------|------|
| 总数 | `SELECT COUNT(*) FROM users;` |
| 求和 | `SELECT SUM(amount) FROM orders;` |
| 平均值 | `SELECT AVG(age) FROM users;` |
| 最大/最小值 | `SELECT MAX(age), MIN(age) FROM users;` |
| 分组统计 | `SELECT city, COUNT(*) FROM users GROUP BY city;` |
| 分组条件 | `SELECT city, COUNT(*) FROM users GROUP BY city HAVING COUNT(*) > 10;` |

### 4. 数据更新与写入

| 类型 | 示例 |
|------|------|
| 插入 | `INSERT INTO users(name, age) VALUES('Alice', 30);` |
| 批量插入 | `INSERT INTO users(name, age) VALUES ('Bob', 25), ('Cathy', 22);` |
| 插入或更新 | `INSERT INTO users(id, name) VALUES (1, 'Tom') ON DUPLICATE KEY UPDATE name='Tom';` |
| 更新数据 | `UPDATE users SET age = 28 WHERE id = 1;` |
| 删除数据 | `DELETE FROM users WHERE age < 18;` |

### 5. 索引与性能优化相关

| 类型 | 示例 |
|------|------|
| 查看索引 | `SHOW INDEX FROM users;` |
| 创建索引 | `CREATE INDEX idx_age ON users(age);` |
| 删除索引 | `DROP INDEX idx_age ON users;` |
| 执行计划 | `EXPLAIN SELECT * FROM users WHERE age > 30;` |
| 查看慢查询日志 | `SHOW VARIABLES LIKE 'slow_query_log%';` |
| 强制使用索引 | `SELECT * FROM users FORCE INDEX (idx_age) WHERE age > 25;` |

### 6. 事务与锁操作

| 类型 | 示例 |
|------|------|
| 开启事务 | `START TRANSACTION;` 或 `BEGIN;` |
| 提交事务 | `COMMIT;` |
| 回滚事务 | `ROLLBACK;` |
| 设置隔离级别 | `SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;` |
| 查看当前隔离级别 | `SELECT @@tx_isolation;` |
| 悲观锁 | `SELECT * FROM users WHERE id = 1 FOR UPDATE;` |
| 乐观锁 | `UPDATE users SET age = 26, version = version + 1 WHERE id = 1 AND version = 2;` |

### 7. 面试高频场景题

| 问题 | 示例 |
|------|------|
| 查询每个用户的最后一笔订单 | `GROUP BY` + `MAX(order_time)` 或子查询 + JOIN |
| 查询重复数据 | `SELECT name, COUNT(*) FROM users GROUP BY name HAVING COUNT(*) > 1;` |
| 查询某字段为空 | `SELECT * FROM users WHERE phone IS NULL;` |
| 查询某天注册的用户 | `SELECT * FROM users WHERE DATE(register_time) = '2024-01-01';` |
| 分页优化 | `SELECT * FROM users WHERE id > ? LIMIT 10;` 替代 OFFSET |

---

## 一、基础概念

### 1. SQL查询语句执行流程

SQL查询执行的7个阶段：

1. **连接阶段** - 连接器建立客户端与服务器的连接，验证用户权限
2. **查询缓存** - 检查是否命中缓存（MySQL 8.0后已移除，因并发场景下维护成本高、命中率低）
3. **解析与预处理** - 词法/语法分析，生成抽象语法树，验证表和字段存在性
4. **优化器** - 基于统计信息选择最优执行计划（考虑索引选择、表连接顺序、连接算法等）
5. **执行器** - 根据执行计划调用存储引擎接口
6. **存储引擎** - 从磁盘/内存读取数据
7. **返回结果** - 将结果集返回客户端

**慢SQL分析方法：** 使用`EXPLAIN`查看执行计划、启用慢查询日志、检查锁竞争。

### 2. 事务的四大特性（ACID）

1. **原子性（Atomicity）** - 事务不可分割，操作全部成功或全部失败回滚。通过**Undo Log**实现
2. **一致性（Consistency）** - 事务使数据库从一个一致性状态转换到另一个。通过其他三个特性与完整性约束保证
3. **隔离性（Isolation）** - 多个并发事务相互隔离。通过**锁机制**和**MVCC**实现
4. **持久性（Durability）** - 已提交事务的改变是永久性的。通过**Redo Log**保证

### 3. 事务隔离级别

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 说明 |
|---------|------|-----------|------|------|
| Read Uncommitted | 可能 | 可能 | 可能 | 最低隔离，可读取未提交数据 |
| Read Committed | 避免 | 可能 | 可能 | 仅读已提交数据 |
| Repeatable Read | 避免 | 避免 | 可能 | MySQL默认级别，MVCC实现 |
| Serializable | 避免 | 避免 | 避免 | 最高隔离，事务串行执行 |

**三类并发问题：**
- **脏读**：读取未提交数据
- **不可重复读**：同一行数据多次读取结果不一致
- **幻读**：同一查询多次执行返回行数不一致

**InnoDB特性：** Repeatable Read级别下通过Next-Key Lock（行锁+间隙锁）在一定程度上避免幻读。

---

## 二、索引

### 1. 索引种类

**数据结构角度：**
- **B+树索引** - 最常见，所有数据存储在叶子结点，适合范围查询和排序
- **哈希索引** - 等值查询快，但不支持范围查询
- **全文索引** - 用于文本内容搜索

**物理存储角度：**
- **聚簇索引** - 数据和索引存储在一起，决定物理顺序
- **非聚簇索引** - 索引独立于数据存储，通过指针指向数据

**逻辑特性角度：**
- **主键索引** - 唯一非空标识
- **普通索引** - 无唯一性限制
- **联合索引** - 多字段创建，遵循最左前缀原则
- **唯一索引** - 值唯一，允许空值
- **空间索引** - 用于地理空间数据

### 2. MySQL为什么使用B+树

1. **高效的磁盘I/O** - 树高度低，非叶子节点只存索引键，一个节点能存更多键，提高扇出
2. **优化的范围查询** - 叶子节点通过链表连接，方便范围扫描
3. **稳定的查询性能** - 所有查询路径长度相同
4. **适合磁盘存储** - 节点大小与磁盘页匹配

**与其他结构对比：**
- 哈希表不支持范围查询
- B树范围查询效率低（数据分布在所有节点）
- 二叉查找树易退化
- B+树综合性能最均衡

### 3. 什么时候需要创建索引

- WHERE子句中经常使用的列
- JOIN操作中的连接列
- ORDER BY或GROUP BY子句中的列
- 数据量较大的表
- 主键和唯一约束列（自动创建）
- 外键约束列

### 4. 什么时候不需要创建索引

- 数据量小的表（全表扫描可能更快）
- 写入操作频繁的表（索引维护成本高）
- 区分度低的列（如性别）
- 不常用于查询的列
- 查询返回大部分数据时（顺序读可能比索引回表更高效）

### 5. 索引失效的场景

**查询条件操作：**
- 在索引列上使用函数或计算
- 以通配符开头的模糊匹配（`LIKE '%keyword'`）
- 使用不等于操作符（`!=` 或 `<>`）
- 使用OR连接不同索引列
- 隐式类型转换

**联合索引最左前缀原则：**
对于联合索引 `(a, b, c)`：
- ✓ 有效：`WHERE a = 1`、`WHERE a = 1 AND b = 2`
- ✗ 失效：`WHERE b = 2`、`WHERE c = 3`
- ⚠ 部分生效：`WHERE a = 1 AND c = 3`（仅a列索引生效）

**优化器选择：** 查询结果集占比高、索引列区分度低、统计信息不准确时优化器可能放弃索引。

---

## 三、进阶机制

### 1. MVCC机制

MVCC（多版本并发控制）通过保存数据的多个版本，使读操作能读取旧版本数据，实现读写并发。

**核心组件：**

- **版本链**：InnoDB在每行数据后添加隐藏列（DB_TRX_ID事务ID、DB_ROLL_PTR回滚指针），旧版本存储在Undo Log中
- **读视图(Read View)**：事务开始时生成，记录活跃事务状态
  - `m_ids`：系统活跃事务ID列表
  - `min_trx_id`：最小事务ID
  - `max_trx_id`：下一个新事务将分配的ID
  - `creator_trx_id`：当前事务ID

**可见性判断规则：**
- `DB_trx_id < min_trx_id` → 数据可见
- `DB_trx_id >= max_trx_id` → 数据不可见
- `min_trx_id ≤ DB_trx_id < max_trx_id` → 检查是否在m_ids列表中

**隔离级别差异：**
- Read Committed：每次读操作生成新Read View
- Repeatable Read：事务开始时仅生成一个Read View

### 2. 数据库中的锁

**全局锁：**
- 锁住整个数据库实例使其只读，`FLUSH TABLES WITH READ LOCK`
- 主要用于全库备份

**表级锁：**
- **表锁**：`LOCK TABLES`显式加锁，开销最小但并发度低
- **元数据锁(MDL)**：自动添加，保证DDL和DML不冲突
- **意向锁**：InnoDB自动添加，表示事务将对行加共享锁(IS)或排他锁(IX)
- **AUTO-INC锁**：保证并发插入时自增值唯一且连续

**行级锁：**
- **Record Lock**：锁住单条索引记录
- **Gap Lock**：锁住索引记录之间的间隙，防止幻读
- **Next-Key Lock**：记录锁+间隙锁的组合，InnoDB默认行锁
- **插入意向锁**：特殊间隙锁，多个事务在同一间隙插入时可同时持有

**InnoDB行级锁基于索引实现，若无索引则可能导致全表扫描。**

---

## 四、MySQL深入

### 1. MySQL执行引擎

| 引擎 | 事务 | 锁级别 | 特点 | 适用场景 |
|------|------|--------|------|---------|
| InnoDB | 支持 | 行级锁 | ACID事务、外键、崩溃恢复、缓冲池 | 高并发、事务场景（默认） |
| MyISAM | 不支持 | 表级锁 | 读速快、不支持外键 | 读多写少、简单应用 |
| Memory | 不支持 | 表级锁 | 数据在内存中，极快但易失 | 临时表和缓存 |
| Archive | 不支持 | 行级锁 | 高度压缩、高速插入 | 历史日志归档 |

### 2. MySQL日志文件

| 日志类型 | 层级 | 作用 | 特点 |
|---------|------|------|------|
| 错误日志 | Server | 记录启动、运行和关闭的错误警告 | 最重要的诊断工具 |
| 二进制日志(Binlog) | Server | 记录所有数据库修改操作 | 追加写入，三种格式(Statement/Row/Mixed) |
| 慢查询日志 | Server | 记录超过阈值的SQL | 通过`long_query_time`配置 |
| 中继日志 | Server | 从库存储主库binlog | 用于数据同步 |
| 重做日志(Redo Log) | InnoDB | 保证事务持久性和崩溃恢复 | 循环写入 |
| 回滚日志(Undo Log) | InnoDB | 记录数据旧版本 | 支持回滚和MVCC |

**Redo Log vs Binlog：**
- Redo Log是InnoDB引擎层日志，循环写入
- Binlog是Server层日志，追加写入
- Redo Log用于崩溃恢复，Binlog用于复制和恢复

---

> 来源：[卡码笔记](https://notes.kamacoder.com/base/)
