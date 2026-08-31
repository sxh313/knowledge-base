---
layout: default
title: 腾讯面试高频手撕 2026.4
description: 腾讯 2026 暑期实习面试手撕代码高频题TOP50汇总，基于3784篇面经统计，6大分类（栈/堆/哈希/设计、排序/数组/矩阵、字符串/滑动窗口/双指针、链表、动态规划、二分/二叉树/搜索/数学）完整题单，含LeetCode原题TOP10、原创场景题、算法岗ML手撕、腾讯vs字节核心区别分析与三周刷题计划
eyebrow: 面试手撕 / 腾讯
permalink: /05_interview/coding/tencent-202604/
---

# 腾讯面试高频手撕【27届暑期实习版】

> 数据来源：3114 篇牛客 + 670 篇小红书面经，共 3784 篇，2524 条手撕记录（2026年4月更新）

## 数据概览

腾讯面试手撕分为三大类，按题目类型和频次统计：

| 类别 | 出现次数 | 题目数 | 占比 | 适用岗位 |
|------|---------|--------|------|----------|
| LeetCode 原题 | 1833 次 | 253 道 | 73% | 所有技术岗 |
| 原创 / 场景算法题 | 633 次 | 375 道 | 25% | 所有技术岗 |
| 算法岗 ML/DL 手撕 | 58 次 | 19 类 | 2% | 算法岗 / 大模型岗 |

- 后端 / 前端 / 客户端岗：主考 LeetCode 原题 + 原创场景题，不考 ML 手撕
- 算法岗 / 大模型岗：三类全要准备，但 ML 手撕压力比字节小

---

## 腾讯 vs 字节：3 个核心区别

面腾讯和面字节的准备策略不一样。基于两家公司的面经数据对比，有三个核心区别：

**区别一：模式一样，都以 ACM 模式为主。** 字节强制 ACM 模式，腾讯同样以 ACM 模式为主。平时练习一定要用 ACM 模式写，不能只用 LeetCode 的核心代码模式。

**区别二：非 LeetCode 题占比差距巨大。** 字节的非 LC 题只占 7%，但腾讯高达 **25%**——四分之一的手撕题不是 LeetCode 原题。只刷 LeetCode 在腾讯面试时更容易遇到没见过的题。

**区别三：LRU 是腾讯的绝对霸主。** LRU 缓存在腾讯出现了 **123 次**（第 1 名），字节为 72 次（第 2 名），腾讯对 LRU 的考察强度接近字节的 **2 倍**。面腾讯，必须能手写 LRU（双向链表 + 哈希表）。

---

## LeetCode 原题 TOP10（1833 次 · 253 道 · 占 73%）

LeetCode 原题是所有技术岗的绝对主力，仅 TOP 10 就贡献了 596 次，占 LC 总频次的 33%。

| 排名 | 题目 | 频次 |
|------|------|------|
| 1 | [LeetCode 146 LRU 缓存](https://onefly.top/zero2Leetcode/playground.html?id=146) | **123 次** |
| 2 | [LeetCode 912 排序数组（手写快排）](https://onefly.top/zero2Leetcode/playground.html?id=912) | **85 次** |
| 3 | [LeetCode 3 无重复字符最长子串](https://onefly.top/zero2Leetcode/playground.html?id=3) | 76 次 |
| 4 | [LeetCode 53 最大子数组和](https://onefly.top/zero2Leetcode/playground.html?id=53) | 60 次 |
| 5 | [LeetCode 215 第 K 个最大元素](https://onefly.top/zero2Leetcode/playground.html?id=215) | 60 次 |
| 6 | [LeetCode 300 最长递增子序列](https://onefly.top/zero2Leetcode/playground.html?id=300) | 44 次 |
| 7 | [LeetCode 206 反转链表](https://onefly.top/zero2Leetcode/playground.html?id=206) | 41 次 |
| 8 | [LeetCode 20 有效的括号](https://onefly.top/zero2Leetcode/playground.html?id=20) | 41 次 |
| 9 | [LeetCode 415 字符串相加](https://onefly.top/zero2Leetcode/playground.html?id=415) | 36 次 |
| 10 | [LeetCode 21 合并两个有序链表](https://onefly.top/zero2Leetcode/playground.html?id=21) | 30 次 |

### 腾讯 vs 字节 TOP10 频次对比

| 题目 | 腾讯频次 | 字节频次 | 说明 |
|------|---------|---------|------|
| LC 146 LRU 缓存 | **123** | 72 | 腾讯考察强度接近字节 2 倍 |
| LC 912 排序数组 | **85** | 15 | 腾讯特别喜欢考手写快排 |
| LC 3 无重复字符最长子串 | 76 | **129** | 字节的脸面题 |
| LC 415 字符串相加 | **36** | 14 | 腾讯 TOP10，字节不算高频 |
| LC 206 反转链表 | 41 | 40 | 两家都是链表基本功 |

几个值得注意的点：

- **LRU 123 次**，断层领先，是腾讯的标志性题目。面试官要求手写双向链表 + 哈希表，禁用 OrderedDict
- **排序数组 85 次**，腾讯特别喜欢考手写快排（不是调 sort），字节这道题只有 15 次
- **字符串相加 36 次**，这道题在字节不算高频（14 次），但在腾讯是 TOP 10
- 链表题密度极高，TOP 50 里有 **10 道链表题**

---

## LeetCode 高频 TOP50 · 6 大分类详解

这 50 道题覆盖了 LeetCode 原题总频次（1833 次）的 **67%**，是备考腾讯面试手撕的最高性价比清单。按算法类型分为 6 大类：

| 分类 | 题目数 | 总频次 |
|------|--------|--------|
| 栈 / 堆 / 哈希 / 设计 | 8 道 | 307 次 |
| 排序 + 数组 + 矩阵 | 8 道 | 246 次 |
| 字符串 + 滑动窗口 + 双指针 | 8 道 | 209 次 |
| 链表 | 10 道 | 194 次 |
| 动态规划 | 8 道 | 163 次 |
| 二分 + 二叉树 + 搜索 + 数学 | 8 道 | 106 次 |

### 栈 / 堆 / 哈希 / 设计（8 道 · 307 次）— LRU 断层领先

| 排名 | 题目 | 频次 |
|------|------|------|
| 1 | [LC 146 LRU 缓存](https://onefly.top/zero2Leetcode/playground.html?id=146) | **123 次** |
| 2 | [LC 215 第 K 个最大元素](https://onefly.top/zero2Leetcode/playground.html?id=215) | **60 次** |
| 3 | [LC 20 有效的括号](https://onefly.top/zero2Leetcode/playground.html?id=20) | 41 次 |
| 4 | [LC 1 两数之和](https://onefly.top/zero2Leetcode/playground.html?id=1) | 23 次 |
| 5 | [LC 224 基本计算器](https://onefly.top/zero2Leetcode/playground.html?id=224) | 18 次 |
| 6 | [LC 347 前 K 个高频元素](https://onefly.top/zero2Leetcode/playground.html?id=347) | 16 次 |
| 7 | [LC 239 滑动窗口最大值](https://onefly.top/zero2Leetcode/playground.html?id=239) | 14 次 |
| 8 | [LC 231 2 的幂](https://onefly.top/zero2Leetcode/playground.html?id=231) | 12 次 |

- LRU 缓存 123 次断层领先，面试要求**手写双向链表 + 哈希表**，不能用 OrderedDict。写完还会被追问淘汰逻辑和时间复杂度
- 第 K 个最大元素要掌握快速选择和小根堆两种写法，面试官经常追问最坏情况复杂度
- 基本计算器考栈处理嵌套括号和运算优先级，腾讯出现频率明显高于其他公司

### 排序 + 数组 + 矩阵（8 道 · 246 次）— 手写快排是腾讯特色

| 排名 | 题目 | 频次 |
|------|------|------|
| 1 | [LC 912 排序数组（手写快排）](https://onefly.top/zero2Leetcode/playground.html?id=912) | **85 次** |
| 2 | [LC 53 最大子数组和](https://onefly.top/zero2Leetcode/playground.html?id=53) | **60 次** |
| 3 | [LC 56 合并区间](https://onefly.top/zero2Leetcode/playground.html?id=56) | 29 次 |
| 4 | [LC 442 数组中重复的数据](https://onefly.top/zero2Leetcode/playground.html?id=442) | 22 次 |
| 5 | [LC 240 搜索二维矩阵 II](https://onefly.top/zero2Leetcode/playground.html?id=240) | 18 次 |
| 6 | [LC 75 颜色分类](https://onefly.top/zero2Leetcode/playground.html?id=75) | 12 次 |
| 7 | [LC 88 合并两个有序数组](https://onefly.top/zero2Leetcode/playground.html?id=88) | 10 次 |
| 8 | [LC 54 螺旋矩阵](https://onefly.top/zero2Leetcode/playground.html?id=54) | 10 次 |

- 排序数组 85 次排全榜第 2，腾讯是字节的 **3 倍**（字节仅 28 次），是腾讯独有的高频考点。常见追问：快排最坏情况怎么优化？快排是稳定排序吗？手写一个归并排序
- 最大子数组和用 Kadane 算法，面试官会追问：如果要返回子数组本身呢？如果允许环形呢（LC 918）？

### 字符串 + 滑动窗口 + 双指针（8 道 · 209 次）

| 排名 | 题目 | 频次 |
|------|------|------|
| 1 | [LC 3 无重复字符最长子串](https://onefly.top/zero2Leetcode/playground.html?id=3) | **76 次** |
| 2 | [LC 415 字符串相加](https://onefly.top/zero2Leetcode/playground.html?id=415) | **36 次** |
| 3 | [LC 165 比较版本号](https://onefly.top/zero2Leetcode/playground.html?id=165) | 23 次 |
| 4 | [LC 15 三数之和](https://onefly.top/zero2Leetcode/playground.html?id=15) | 20 次 |
| 5 | [LC 43 字符串相乘](https://onefly.top/zero2Leetcode/playground.html?id=43) | 17 次 |
| 6 | [LC 209 长度最小的子数组](https://onefly.top/zero2Leetcode/playground.html?id=209) | 17 次 |
| 7 | [LC 42 接雨水](https://onefly.top/zero2Leetcode/playground.html?id=42) | 10 次 |
| 8 | [LC 76 最小覆盖子串](https://onefly.top/zero2Leetcode/playground.html?id=76) | 10 次 |

- LC 3 出现 76 次，三大公司共同的脸面题，必须做到 10 分钟内 bug-free
- 字符串相加 + 字符串相乘是腾讯特色高频题，本质是大数运算。面试官还可能追问大数减法和小数点处理
- 比较版本号是工程场景题，代码不难但细节多（前导零、长度不等）

### 链表（10 道 · 194 次）— 题数最多

| 排名 | 题目 | 频次 |
|------|------|------|
| 1 | [LC 206 反转链表](https://onefly.top/zero2Leetcode/playground.html?id=206) | **41 次** |
| 2 | [LC 21 合并两个有序链表](https://onefly.top/zero2Leetcode/playground.html?id=21) | **30 次** |
| 3 | [LC 23 合并 K 个升序链表](https://onefly.top/zero2Leetcode/playground.html?id=23) | 28 次 |
| 4 | [LC 25 K 个一组翻转链表](https://onefly.top/zero2Leetcode/playground.html?id=25) | 22 次 |
| 5 | [LC 19 删除链表倒数第 N 个结点](https://onefly.top/zero2Leetcode/playground.html?id=19) | 20 次 |
| 6 | [LC 82 删除排序链表中的重复元素 II](https://onefly.top/zero2Leetcode/playground.html?id=82) | 12 次 |
| 7 | [LC 160 相交链表](https://onefly.top/zero2Leetcode/playground.html?id=160) | 11 次 |
| 8 | [LC 141 环形链表](https://onefly.top/zero2Leetcode/playground.html?id=141) | 10 次 |
| 9 | [LC 142 环形链表 II](https://onefly.top/zero2Leetcode/playground.html?id=142) | 10 次 |
| 10 | [LC 24 两两交换链表中的节点](https://onefly.top/zero2Leetcode/playground.html?id=24) | 10 次 |

- 链表是腾讯高频题中**题目数量最多**的分类（10 道），遇到链表题的概率极高
- 反转链表系列（LC 206 + LC 25）两道合计 63 次，面试官惯用套路：先考 LC 206 基础反转，写完接着问「K 个一组翻转呢？」——两道必须一起练
- 环形链表（LC 141）+ 找环入口（LC 142）合计 20 次，Floyd 快慢指针经典应用，常被追问「为什么快指针走两步慢指针走一步一定会相遇？」

### 动态规划（8 道 · 163 次）

| 排名 | 题目 | 频次 |
|------|------|------|
| 1 | [LC 300 最长递增子序列](https://onefly.top/zero2Leetcode/playground.html?id=300) | **44 次** |
| 2 | [LC 5 最长回文子串](https://onefly.top/zero2Leetcode/playground.html?id=5) | 25 次 |
| 3 | [LC 322 零钱兑换](https://onefly.top/zero2Leetcode/playground.html?id=322) | 25 次 |
| 4 | [LC 72 编辑距离](https://onefly.top/zero2Leetcode/playground.html?id=72) | 17 次 |
| 5 | [LC 70 爬楼梯](https://onefly.top/zero2Leetcode/playground.html?id=70) | 15 次 |
| 6 | [LC 121 买卖股票的最佳时机](https://onefly.top/zero2Leetcode/playground.html?id=121) | 13 次 |
| 7 | [LC 718 最长重复子数组](https://onefly.top/zero2Leetcode/playground.html?id=718) | 13 次 |
| 8 | [LC 1262 可被三整除的最大和](https://onefly.top/zero2Leetcode/playground.html?id=1262) | 11 次 |

- 最长递增子序列 44 次是腾讯 DP 的第一名，必须掌握 $O(n^2)$ 基础 DP 和 $O(n \log n)$ 贪心 + 二分两种写法，面试官大概率追问优化
- 可被三整除的最大和是腾讯的**独有高频题**，其他公司很少考，用 DP + 余数分类
- 编辑距离是 Hard 难度经典二维 DP，面试官经常追问空间优化（$O(mn) \to O(n)$）

### 二分 + 二叉树 + 搜索 + 数学（8 道 · 106 次）

| 排名 | 题目 | 频次 |
|------|------|------|
| 1 | [LC 102 二叉树层序遍历](https://onefly.top/zero2Leetcode/playground.html?id=102) | **25 次** |
| 2 | [LC 200 岛屿数量](https://onefly.top/zero2Leetcode/playground.html?id=200) | 13 次 |
| 3 | [LC 22 括号生成](https://onefly.top/zero2Leetcode/playground.html?id=22) | 12 次 |
| 4 | [LC 704 二分查找](https://onefly.top/zero2Leetcode/playground.html?id=704) | 12 次 |
| 5 | [LC 33 搜索旋转排序数组](https://onefly.top/zero2Leetcode/playground.html?id=33) | 12 次 |
| 6 | [LC 287 寻找重复数](https://onefly.top/zero2Leetcode/playground.html?id=287) | 12 次 |
| 7 | [LC 153 寻找旋转排序数组中的最小值](https://onefly.top/zero2Leetcode/playground.html?id=153) | 10 次 |
| 8 | [LC 470 用 Rand7() 实现 Rand10()](https://onefly.top/zero2Leetcode/playground.html?id=470) | 10 次 |

- 层序遍历 25 次是树类题的入口，常见追问：锯齿形输出（LC 103）？只输出最右边节点（LC 199）？建议一起练
- 搜索旋转排序数组系列（LC 33 + LC 153）合计 22 次，考二分查找变种，可能追问有重复元素怎么处理
- Rand7 实现 Rand10 是腾讯独有高频题，核心是拒绝采样：两次 Rand7() 构造 [1,49] 均匀分布，取 [1,40] 映射到 [1,10]

---

## 原创 / 场景算法题（633 次 · 375 道 · 占 25%）

这是腾讯手撕和字节最大的不同。字节的非 LC 题只占 7%，而腾讯高达 25%。这 375 道题不是 LeetCode 原题，包括面试官自己出的原创题、经典算法实现、场景编程题等。

### 代表题 1：带优先级的括号匹配（8 次）

括号有优先级：`{` > `[` > `(`。`{[()]}` 合法，`[{}]` 不合法。考察**栈 + 优先级判断**。这道题 LeetCode 上没有对应原题，纯属腾讯面试官的偏好。

### 代表题 2：等概率随机抽样（9 次）

30 万员工用 `rand16()` 抽 1 万人，要求每个人中奖概率相等。考察**蓄水池采样**或扩展随机数范围。这个系列有多个变体，都是围绕「如何用有限范围的随机数生成器实现大范围均匀采样」。

### 代表题 3：消消乐（4 次）

长度为 $n$ 的 1-9 数字串，相邻两数之和为 10 则消除，求最短串长度。考察**栈模拟**。

### 其他高频原创题

| 题目 | 考点 |
|------|------|
| 敏感词过滤 | Trie + KMP |
| 视频字幕快速查找 | TreeMap 二分 |
| 微信红包算法 | 二倍均值法 |
| 10 亿整数排序去重 | 位图 BitMap |

这类题没法刷原题，但题型有规律——核心考察的是能不能把**实际场景抽象成算法问题**。准备方式：熟练掌握栈、Trie、二分、采样等基础算法后，重点练习「从场景到算法」的转化能力。

---

## 算法岗 ML/DL 手撕（58 次 · 19 类 · 占 2%）

仅算法岗 / 大模型算法岗考，后端 / 前端 / 客户端不考。

| 排名 | 题目 | 频次 |
|------|------|------|
| 1 | Multi-Head Attention | **21 次** |
| 2 | Grouped Query Attention | 5 次 |
| 3 | Self-Attention | 5 次 |
| 4 | Cross-Attention | 4 次 |
| 5 | MLP / 全连接网络 | 3 次 |
| 6 | InfoNCE Loss | 3 次 |

- MHA 一题就占 ML 总频次的 36%，大模型方向几乎必考
- 腾讯 ML 手撕总频次（58 次）远低于字节（277 次），ML 手撕压力比字节小
- 但不能因此不准备——GQA / Cross-Attention / InfoNCE 等新题在上升

---

## 不同岗位备考重点

### 后端 / 前端 / 客户端

- 主要考 LeetCode 原题（占 73%），TOP10 必须全部熟练
- 原创 / 场景题也会遇到（占 25%），需要注意场景抽象能力
- 不考 ML/DL 手撕
- **LRU + 手写快排**是两道基本功，必须熟练

### 算法岗 / 大模型算法岗

- LeetCode + ML/DL 手撕 + 原创题，三类都要准备
- MHA 出现 21 次，大模型方向几乎必考
- LeetCode 也不能放松，LC 原题仍然是主力
- GQA / Cross-Attention / InfoNCE 等新题也在上升

---

## 全榜 TOP10 · 优先刷题顺序

时间紧先刷这 10 道，覆盖约 33% 的腾讯 LC 手撕考察概率：

| 优先级 | 题目 | 频次 |
|--------|------|------|
| 1 | [LeetCode 146 LRU 缓存](https://onefly.top/zero2Leetcode/playground.html?id=146) | 123 次 |
| 2 | [LeetCode 912 排序数组](https://onefly.top/zero2Leetcode/playground.html?id=912) | 85 次 |
| 3 | [LeetCode 3 无重复字符最长子串](https://onefly.top/zero2Leetcode/playground.html?id=3) | 76 次 |
| 4 | [LeetCode 53 最大子数组和](https://onefly.top/zero2Leetcode/playground.html?id=53) | 60 次 |
| 5 | [LeetCode 215 第K个最大元素](https://onefly.top/zero2Leetcode/playground.html?id=215) | 60 次 |
| 6 | [LeetCode 300 最长递增子序列](https://onefly.top/zero2Leetcode/playground.html?id=300) | 44 次 |
| 7 | [LeetCode 206 反转链表](https://onefly.top/zero2Leetcode/playground.html?id=206) | 41 次 |
| 8 | [LeetCode 20 有效的括号](https://onefly.top/zero2Leetcode/playground.html?id=20) | 41 次 |
| 9 | [LeetCode 415 字符串相加](https://onefly.top/zero2Leetcode/playground.html?id=415) | 36 次 |
| 10 | [LeetCode 21 合并两个有序链表](https://onefly.top/zero2Leetcode/playground.html?id=21) | 30 次 |

---

## 三周刷题计划

**第一周：TOP10 + 每个分类最高频那道**

- TOP10 全部做到闭眼写的程度
- 每个分类的第 1 名必须拿下（LRU / 排序数组 / LC3 / 反转链表 / LIS / 层序遍历）
- 重点练习手写快排的 partition 函数

**第二周：补齐 6 大分类，重点练链表和 DP**

- 链表 10 道全部过一遍，重点练反转系列（LC 206 + LC 25）
- DP 8 道按难度递进：爬楼梯 → 买卖股票 → LIS → 零钱兑换 → 编辑距离
- 练 2-3 道原创场景题，培养场景到算法的抽象能力
- 每道至少手写两遍

**第三周：全量复盘 + 练 ACM 模式**

- 50 道全部做完，查漏补缺
- 每道至少做两遍，确保 15 分钟内 bug-free
- 用 ACM 模式输入输出写完整程序（腾讯以 ACM 模式为主）

---

## 腾讯手撕 = ACM 模式

腾讯面试手撕同样以 **ACM 模式**为主——需要自己处理输入输出，不是 LeetCode 那种只写核心代码的模式。

很多人算法会写，但栽在 ACM 模式上。平时练习务必用 ACM 模式！

本站所有题解均采用 ACM 模式（标准输入输出），可直接作为面试手撕的练习素材。
