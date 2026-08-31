---
layout: default
title: Hot 100 面试手撕真实考频与高效刷题路线
description: 基于6139篇华为、腾讯、字节面经整理Hot 100真实考频，覆盖Top 50高频题、链表/动态规划/二分/二叉树等章节重点，以及1周到1个月的分层备考路线
keywords: Hot 100, 面试手撕, LeetCode高频题, 大厂面试, 刷题路线, ACM模式
permalink: /05_interview/coding/hot100-frequency-202608/
eyebrow: 面试手撕 / Hot 100
---

# Hot 100 面试手撕真实考频与高效刷题路线

> 本榜单基于一批包含华为、腾讯、字节记录的独立样本整理，样本共 6139 篇面经。它与本站三篇公司专项文章使用的数据集和统计版本不同，因此不能将公司专项文章中的频次直接相加复算本榜单。统计频次只反映该样本中的出现次数，不等同于出题概率；未统计到也不表示完全不会考。

Hot 100 一共有 100 道题，但面试中的出题频次并不均匀。时间有限时，与其按题单顺序一路刷到底，不如先解决高频核心题，再按章节补齐模板和变体。

本文给出一条可直接执行的路线：

1. 先完成 Top 10，建立滑动窗口、链表、堆、动态规划、栈、DFS 和双指针的基本能力。
2. 再完成 Top 20，补上区间、二叉树、单调栈和二维动态规划。
3. 最后按章节完成 Top 21～50，集中训练同一类题的通用模板。

---

## 一、Top 10：优先级最高的十道题

| 排名 | 题目 | 难度 | 样本频次 | 核心方法 |
|------|------|------|----------|----------|
| 1 | [LC 3 无重复字符的最长子串](https://onefly.top/zero2Leetcode/playground.html?id=3) | Medium | **301** | 滑动窗口 + 哈希表 |
| 2 | [LC 146 LRU 缓存](https://onefly.top/zero2Leetcode/playground.html?id=146) | Medium | **226** | 哈希表 + 双向链表 |
| 3 | [LC 215 数组中的第 K 个最大元素](https://onefly.top/zero2Leetcode/playground.html?id=215) | Medium | **138** | 快速选择 / 堆 |
| 4 | [LC 53 最大子数组和](https://onefly.top/zero2Leetcode/playground.html?id=53) | Medium | **117** | 动态规划 / Kadane |
| 5 | [LC 206 反转链表](https://onefly.top/zero2Leetcode/playground.html?id=206) | Easy | **112** | 迭代 / 递归 |
| 6 | [LC 300 最长递增子序列](https://onefly.top/zero2Leetcode/playground.html?id=300) | Medium | **107** | DP / 贪心 + 二分 |
| 7 | [LC 20 有效的括号](https://onefly.top/zero2Leetcode/playground.html?id=20) | Easy | **100** | 栈 |
| 8 | [LC 200 岛屿数量](https://onefly.top/zero2Leetcode/playground.html?id=200) | Medium | **94** | DFS / BFS |
| 9 | [LC 25 K 个一组翻转链表](https://onefly.top/zero2Leetcode/playground.html?id=25) | Hard | **82** | 分组 + 局部反转 |
| 10 | [LC 15 三数之和](https://onefly.top/zero2Leetcode/playground.html?id=15) | Medium | **79** | 排序 + 双指针 + 去重 |

### 1. 无重复字符的最长子串

这是样本中出现次数最多的题。标准做法是维护一个无重复字符窗口：右指针不断扩张，发现重复字符后移动左指针。

需要重点处理两个细节：

- 左指针只能向右移动，不能因为旧记录而回退。
- 哈希表记录的是字符最近一次出现的位置，更新时机要统一。

面试目标：能够在 5～10 分钟内写出无越界、无重复计数问题的实现。

### 2. LRU 缓存

LRU 的难点不在思路，而在指针操作。要在 $O(1)$ 时间内完成 `get` 和 `put`，通常需要：

- 哈希表：由 key 定位链表节点。
- 双向链表：维护最近使用顺序。
- 头尾哨兵节点：减少插入、删除时的边界分支。

必须熟练掌握四个操作：删除节点、插入头部、移动到头部、删除尾部节点。不要依赖语言内置的有序字典替代核心实现。

### 3. 数组中的第 K 个最大元素

至少准备两种解法：

- 小根堆：时间复杂度 $O(n\log k)$，实现稳定，适合数据流或 Top K 场景。
- 快速选择：平均时间复杂度 $O(n)$，适合面试官限制排序或堆的情况。

快速选择最常见的问题是 `partition` 边界写错。建议固定一种模板，明确基准值最终落点和下一轮搜索区间。

### 4. 最大子数组和

核心状态是：以当前位置结尾的最大子数组和。

$$
dp[i] = \max(nums[i], dp[i-1] + nums[i])
$$

由于当前状态只依赖前一个状态，可以将空间从 $O(n)$ 优化到 $O(1)$。还应准备追问：如何返回最大子数组的左右边界。

### 5. 反转链表

迭代写法需要维护 `prev`、`cur` 和 `next`；递归写法需要明确返回的新头节点，并将当前节点接到后继节点之后。

建议两种写法都掌握，因为它还是反转链表 II、K 个一组翻转链表等题目的基础。

### 6. 最长递增子序列

需要掌握两个复杂度层级：

- 基础 DP：$O(n^2)$，适合先说明状态定义和转移过程。
- 贪心 + 二分：$O(n\log n)$，维护不同长度递增子序列的最小结尾值。

二分数组中的值不一定构成最终答案，它表示的是每个长度对应的最优结尾。

### 7. 有效的括号

标准栈题，但边界条件容易失分：

- 字符串长度为奇数时可以直接返回 `false`。
- 遇到右括号时必须先判断栈是否为空。
- 遍历结束后，栈必须为空。

### 8. 岛屿数量

把二维网格视为图，从每个尚未访问的陆地出发做 DFS 或 BFS，并将整块连通区域标记为已访问。

要统一处理行列边界、访问标记和四个方向。常见变体包括最大岛屿面积、岛屿周长和被围绕的区域。

### 9. K 个一组翻转链表

这道题综合考察链表分组、区间反转和节点重连。建议按以下顺序写：

1. 从当前组起点向后检查是否存在完整的 K 个节点。
2. 保存下一组的起点。
3. 翻转当前 `[groupHead, groupTail]` 区间。
4. 将上一组尾部、当前组新头、当前组新尾和下一组重新连接。

不足 K 个节点时保持原顺序。

### 10. 三数之和

先排序，再枚举第一个数，剩余区间使用左右双指针。正确性和复杂度之外，面试官通常重点检查去重：

- 枚举下标 `i` 时跳过相同值。
- 找到答案后，`left` 和 `right` 都要跳过相同值。
- 排序后当前值大于 0 时可以提前结束。

---

## 二、Top 11～20：补齐高频模板

> 同频题沿用原始榜单顺序，不表示相同频次的题目存在严格优先级差异。例如第 20 名与后续题目中均有 52 次记录，实战中可视为同一优先级。

| 排名 | 题目 | 难度 | 样本频次 | 核心方法 |
|------|------|------|----------|----------|
| 11 | [LC 5 最长回文子串](https://onefly.top/zero2Leetcode/playground.html?id=5) | Medium | 78 | 中心扩展 / DP |
| 12 | [LC 23 合并 K 个升序链表](https://onefly.top/zero2Leetcode/playground.html?id=23) | Hard | 74 | 优先队列 / 分治 |
| 13 | [LC 56 合并区间](https://onefly.top/zero2Leetcode/playground.html?id=56) | Medium | 73 | 排序 + 区间合并 |
| 14 | [LC 19 删除链表的倒数第 N 个结点](https://onefly.top/zero2Leetcode/playground.html?id=19) | Medium | 68 | 快慢指针 |
| 15 | [LC 72 编辑距离](https://onefly.top/zero2Leetcode/playground.html?id=72) | Medium | 64 | 二维 DP |
| 16 | [LC 42 接雨水](https://onefly.top/zero2Leetcode/playground.html?id=42) | Hard | 64 | 双指针 / 单调栈 |
| 17 | [LC 21 合并两个有序链表](https://onefly.top/zero2Leetcode/playground.html?id=21) | Easy | 63 | 双指针 |
| 18 | [LC 102 二叉树的层序遍历](https://onefly.top/zero2Leetcode/playground.html?id=102) | Medium | 61 | BFS 队列 |
| 19 | [LC 236 二叉树的最近公共祖先](https://onefly.top/zero2Leetcode/playground.html?id=236) | Medium | 58 | 递归后序遍历 |
| 20 | [LC 121 买卖股票的最佳时机](https://onefly.top/zero2Leetcode/playground.html?id=121) | Easy | 52 | 前缀最小值 |

这一阶段重点补齐四类能力：

- **链表**：合并、删除、分组反转和 K 路归并。
- **动态规划**：一维状态压缩与二维字符串 DP。
- **二叉树**：层序遍历和后序递归返回值设计。
- **单调结构**：接雨水的双指针或单调栈推导。

其中，合并 K 个升序链表和接雨水虽然是 Hard，但解法高度模板化，适合专项训练。

---

## 三、Top 21～50：按章节集中训练

Top 20 之后，不建议继续按总榜名次零散刷题。把同类题集中完成，更容易形成可复用模板。

### 1. 链表

| 题目 | 难度 | 样本频次 |
|------|------|----------|
| [LC 141 环形链表](https://onefly.top/zero2Leetcode/playground.html?id=141) | Easy | 31 |
| [LC 142 环形链表 II](https://onefly.top/zero2Leetcode/playground.html?id=142) | Medium | 30 |
| [LC 160 相交链表](https://onefly.top/zero2Leetcode/playground.html?id=160) | Easy | 28 |
| [LC 2 两数相加](https://onefly.top/zero2Leetcode/playground.html?id=2) | Medium | 26 |
| [LC 148 排序链表](https://onefly.top/zero2Leetcode/playground.html?id=148) | Medium | 20 |

连同 Top 20 中的五道题，链表共有十道高频题。训练时要把以下操作拆成固定模板：

- 快慢指针找中点、找倒数节点和判环。
- 链表反转与区间重连。
- 两条链表合并与分治合并。
- 哨兵节点处理头节点变化。

### 2. 动态规划

| 题目 | 难度 | 样本频次 |
|------|------|----------|
| [LC 322 零钱兑换](https://onefly.top/zero2Leetcode/playground.html?id=322) | Medium | 49 |
| [LC 1143 最长公共子序列](https://onefly.top/zero2Leetcode/playground.html?id=1143) | Medium | 39 |
| [LC 70 爬楼梯](https://onefly.top/zero2Leetcode/playground.html?id=70) | Easy | 35 |
| [LC 32 最长有效括号](https://onefly.top/zero2Leetcode/playground.html?id=32) | Hard | 25 |
| [LC 416 分割等和子集](https://onefly.top/zero2Leetcode/playground.html?id=416) | Medium | 21 |
| [LC 64 最小路径和](https://onefly.top/zero2Leetcode/playground.html?id=64) | Medium | 19 |

不要只记代码。每道 DP 题都应当能说清楚：状态含义、转移来源、初始化、遍历顺序和答案位置。

建议按线性 DP、二维字符串 DP、背包 DP 和网格 DP 四类整理。

### 3. 二分查找

| 题目 | 难度 | 样本频次 |
|------|------|----------|
| [LC 33 搜索旋转排序数组](https://onefly.top/zero2Leetcode/playground.html?id=33) | Medium | 52 |
| [LC 34 在排序数组中查找元素的第一个和最后一个位置](https://onefly.top/zero2Leetcode/playground.html?id=34) | Medium | 42 |
| [LC 153 寻找旋转排序数组中的最小值](https://onefly.top/zero2Leetcode/playground.html?id=153) | Medium | 21 |
| [LC 4 寻找两个正序数组的中位数](https://onefly.top/zero2Leetcode/playground.html?id=4) | Hard | 19 |

二分的主要失分点是区间定义混乱。选择左闭右闭或左闭右开模板后，循环条件、中点更新和返回值必须保持一致。

至少熟练掌握：查找目标值、查找第一个大于等于目标值的位置、查找最后一个小于等于目标值的位置。

### 4. 二叉树

| 题目 | 难度 | 样本频次 |
|------|------|----------|
| [LC 199 二叉树的右视图](https://onefly.top/zero2Leetcode/playground.html?id=199) | Medium | 26 |
| [LC 124 二叉树中的最大路径和](https://onefly.top/zero2Leetcode/playground.html?id=124) | Hard | 19 |
| [LC 230 二叉搜索树中第 K 小的元素](https://onefly.top/zero2Leetcode/playground.html?id=230) | Medium | 16 |

树题的关键不是背答案，而是先确定递归函数的语义：参数是什么、向父节点返回什么、当前节点如何组合左右子树结果。

- 层序问题优先考虑 BFS。
- BST 有序性问题优先考虑中序遍历。
- 路径与祖先问题通常需要后序遍历。

### 5. 回溯

| 题目 | 难度 | 样本频次 |
|------|------|----------|
| [LC 46 全排列](https://onefly.top/zero2Leetcode/playground.html?id=46) | Medium | 40 |
| [LC 22 括号生成](https://onefly.top/zero2Leetcode/playground.html?id=22) | Medium | 33 |

回溯模板包含选择、递归、撤销选择三步。全排列重点处理已使用元素；括号生成则通过左右括号数量约束提前剪枝。

### 6. 滑动窗口与单调队列

| 题目 | 难度 | 样本频次 |
|------|------|----------|
| [LC 239 滑动窗口最大值](https://onefly.top/zero2Leetcode/playground.html?id=239) | Hard | 37 |
| [LC 76 最小覆盖子串](https://onefly.top/zero2Leetcode/playground.html?id=76) | Hard | 25 |

这两题分别代表两种模板：

- 滑动窗口最大值：维护下标单调递减的双端队列。
- 最小覆盖子串：维护需求计数、已满足种类数和可收缩窗口。

### 7. 数组、哈希与堆

| 题目 | 难度 | 样本频次 |
|------|------|----------|
| [LC 1 两数之和](https://onefly.top/zero2Leetcode/playground.html?id=1) | Easy | 52 |
| [LC 287 寻找重复数](https://onefly.top/zero2Leetcode/playground.html?id=287) | Medium | 32 |
| [LC 347 前 K 个高频元素](https://onefly.top/zero2Leetcode/playground.html?id=347) | Medium | 27 |

两数之和虽是 Easy，仍要准确说明为什么边遍历边查表可以避免重复使用同一元素。寻找重复数可用 Floyd 判环思路；前 K 个高频元素可用小根堆或桶排序。

### 8. 矩阵

| 题目 | 难度 | 样本频次 |
|------|------|----------|
| [LC 54 螺旋矩阵](https://onefly.top/zero2Leetcode/playground.html?id=54) | Medium | 39 |
| [LC 240 搜索二维矩阵 II](https://onefly.top/zero2Leetcode/playground.html?id=240) | Medium | 26 |

矩阵题要优先明确循环不变量。螺旋遍历使用上下左右四条边界；搜索二维矩阵 II 从右上角或左下角开始，每一步都能排除一行或一列。

### 9. 栈

| 题目 | 难度 | 样本频次 |
|------|------|----------|
| [LC 394 字符串解码](https://onefly.top/zero2Leetcode/playground.html?id=394) | Medium | 25 |
| [LC 155 最小栈](https://onefly.top/zero2Leetcode/playground.html?id=155) | Medium | 16 |

字符串解码需要保存进入括号前的字符串和重复次数；最小栈需要在 $O(1)$ 时间内返回当前最小值，可使用辅助栈或在每个节点保存同步最小值。

### 10. 图

| 题目 | 难度 | 样本频次 |
|------|------|----------|
| [LC 207 课程表](https://onefly.top/zero2Leetcode/playground.html?id=207) | Medium | 22 |

课程表本质是判断有向图是否存在环。可以使用入度表完成 Kahn 拓扑排序，也可以使用三色标记 DFS。

---

## 四、本样本未记录题单

以下题目在本次华为、腾讯、字节面经样本中没有统计到出现记录。这里的结论只能用于安排当前三家公司的复习顺序，不能推出其他公司不考，也不能推出未来不会考。

### Hot 100 范围内

- [LC 283 移动零](https://onefly.top/zero2Leetcode/playground.html?id=283)
- [LC 49 字母异位词分组](https://onefly.top/zero2Leetcode/playground.html?id=49)
- [LC 136 只出现一次的数字](https://onefly.top/zero2Leetcode/playground.html?id=136)
- [LC 118 杨辉三角](https://onefly.top/zero2Leetcode/playground.html?id=118)
- [LC 279 完全平方数](https://onefly.top/zero2Leetcode/playground.html?id=279)
- [LC 45 跳跃游戏 II](https://onefly.top/zero2Leetcode/playground.html?id=45)
- [LC 763 划分字母区间](https://onefly.top/zero2Leetcode/playground.html?id=763)
- [LC 84 柱状图中最大的矩形](https://onefly.top/zero2Leetcode/playground.html?id=84)
- [LC 35 搜索插入位置](https://onefly.top/zero2Leetcode/playground.html?id=35)
- [LC 74 搜索二维矩阵](https://onefly.top/zero2Leetcode/playground.html?id=74)
- [LC 131 分割回文串](https://onefly.top/zero2Leetcode/playground.html?id=131)
- [LC 51 N 皇后](https://onefly.top/zero2Leetcode/playground.html?id=51)
- [LC 208 实现 Trie（前缀树）](https://onefly.top/zero2Leetcode/playground.html?id=208)
- [LC 108 将有序数组转换为二叉搜索树](https://onefly.top/zero2Leetcode/playground.html?id=108)
- [LC 114 二叉树展开为链表](https://onefly.top/zero2Leetcode/playground.html?id=114)
- [LC 437 路径总和 III](https://onefly.top/zero2Leetcode/playground.html?id=437)
- [LC 138 随机链表的复制](https://onefly.top/zero2Leetcode/playground.html?id=138)
- [LC 73 矩阵置零](https://onefly.top/zero2Leetcode/playground.html?id=73)
- [LC 238 除自身以外数组的乘积](https://onefly.top/zero2Leetcode/playground.html?id=238)
- [LC 438 找到字符串中所有字母异位词](https://onefly.top/zero2Leetcode/playground.html?id=438)

其余未统计项为平台内部基础题，例如 A+B、数组求和、矩阵求和和基础链表遍历，不属于严格的 Hot 100 范围。

---

## 五、按时间预算制定刷题计划

| 时间预算 | 建议范围 | 执行重点 |
|----------|----------|----------|
| 1 周以内 | Top 10 | 每题独立写出，集中修复边界错误 |
| 2～3 周 | Top 20 + 链表、DP | 建立高频模板，补充常见追问 |
| 1 个月 | Top 50 | 按章节训练，完成至少两轮复盘 |
| 时间充裕 | Hot 100 全量 | 系统补齐知识面并做公司专项题单 |

### 1 周冲刺

- 第 1～2 天：无重复字符最长子串、LRU、第 K 大、最大子数组和。
- 第 3～4 天：反转链表、最长递增子序列、有效括号。
- 第 5 天：岛屿数量、K 个一组翻转、三数之和。
- 第 6 天：不看题解重写全部十题，记录错误类型。
- 第 7 天：使用 ACM 模式限时模拟，补输入输出和边界测试。

### 2～3 周强化

- 第一周完成 Top 10。
- 第二周完成 Top 11～20，并专项训练链表。
- 第三周完成动态规划和二分查找章节，最后做两次混合模拟。

### 1 个月系统训练

- 第一周：Top 10。
- 第二周：链表、栈、滑动窗口。
- 第三周：动态规划、二分、数组与矩阵。
- 第四周：二叉树、图、回溯，随后按错题记录复盘。

---

## 六、面试现场的完成标准

一道题“做过”不等于“能手撕”。建议用以下标准验收：

1. **能复述题意**：明确输入、输出、约束和特殊情况。
2. **能解释算法**：先讲朴素解法，再说明优化依据。
3. **能独立编码**：不看题解，在 10～20 分钟内完成核心逻辑。
4. **能覆盖边界**：主动测试空输入、单元素、重复元素、极值和越界条件。
5. **能分析复杂度**：准确说明时间和空间复杂度。
6. **能应对追问**：准备另一种解法、空间优化或常见变体。
7. **能写 ACM 模式**：会处理标准输入输出，不只会写 LeetCode 函数体。

刷题顺序只决定先练什么，最终通过面试仍取决于代码正确性、表达清晰度和对追问的处理。先用高频题建立稳定基本功，再按目标公司补充专项题单，通常比机械按题号顺序推进更有效。
