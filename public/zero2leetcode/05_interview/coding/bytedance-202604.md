---
layout: default
title: 字节跳动面试高频手撕 2026.8
description: 以 2026.4 完整分类题单为基础，合并 2026.8 秋招新增频次与题目，所有题目均直达本站力扣模拟练习场
keywords: 字节跳动, 面试手撕, 27届秋招, LeetCode高频题, 本地练习场, 刷题路线
eyebrow: 面试手撕 / 字节跳动
permalink: /05_interview/coding/bytedance-202604/
---

# 字节跳动面试高频手撕【2026.4 基线 + 2026.8 秋招增量】

> 本页不再用 2026.8 文章中“每类前三/前五”的展示题代替完整题单，而是恢复 2026.4 版完整 48 题基线，并按新版分类合并 2026.8 明确披露的新频次、新题和关联题。当前共展示 **52 道去重题目**，所有题目均直达本站力扣模拟练习场。

## 六大分类总览

| 分类 | 2026.8 统计题数 | 2026.8 样本总频次 | 本页已展示 |
|------|-----------------|-------------------|------------|
| 二叉树 + 搜索图论 | 21 | 390 | 11 |
| 栈队列 / 哈希 / 贪心 / 设计 | 16 | 373 | 9 |
| 链表 | 14 | 349 | 9 |
| 滑动窗口 + 双指针 + 字符串 | 9 | 337 | 6 |
| 二分查找 + 排序 / 数组 | 14 | 325 | 8 |
| 动态规划 | 13 | 277 | 10 |

> “本页已展示”按分类行计数；LC 215 同时具有选择/堆与数组排序属性，在两个分类中出现。全页去重后为 52 道。

---

## 1. 链表（2026.8：14 道 · 349 次）

| 题目 | 频次 | 数据版本 |
|------|------|----------|
| [LC 206 反转链表](https://onefly.top/zero2Leetcode/playground.html?id=206) | 55 | 08 更新 |
| [LC 25 K 个一组翻转链表](https://onefly.top/zero2Leetcode/playground.html?id=25) | 55 | 08 更新 |
| [LC 19 删除链表的倒数第 N 个结点](https://onefly.top/zero2Leetcode/playground.html?id=19) | 43 | 08 更新 |
| [LC 23 合并 K 个升序链表](https://onefly.top/zero2Leetcode/playground.html?id=23) | 36 | 08 更新 |
| [LC 21 合并两个有序链表](https://onefly.top/zero2Leetcode/playground.html?id=21) | 29 | 08 更新 |
| [LC 141 环形链表](https://onefly.top/zero2Leetcode/playground.html?id=141) | 14 | 04 基线 |
| [LC 148 排序链表](https://onefly.top/zero2Leetcode/playground.html?id=148) | 13 | 04 基线 |
| [LC 92 反转链表 II](https://onefly.top/zero2Leetcode/playground.html?id=92) | 15 | 08 推算 |
| [LC 2 两数相加](https://onefly.top/zero2Leetcode/playground.html?id=2) | 11 | 04 基线 |

08 材料给出反转系列 LC 206、LC 25、LC 92 合计 125 次，因此 LC 92 可由 `125 - 55 - 55` 得到 15 次。其余未在 08 材料逐题披露的题目保留 04 版频次。

---

## 2. 二叉树与搜索图论（2026.8：21 道 · 390 次）

| 题目 | 频次 | 数据版本 |
|------|------|----------|
| [LC 200 岛屿数量](https://onefly.top/zero2Leetcode/playground.html?id=200) | 50 | 08 更新 |
| [LC 236 二叉树的最近公共祖先](https://onefly.top/zero2Leetcode/playground.html?id=236) | 41 | 08 更新 |
| [LC 103 二叉树的锯齿形层序遍历](https://onefly.top/zero2Leetcode/playground.html?id=103) | 28 | 08 更新 |
| [LC 102 二叉树的层序遍历](https://onefly.top/zero2Leetcode/playground.html?id=102) | 27 | 08 更新 |
| [LC 199 二叉树的右视图](https://onefly.top/zero2Leetcode/playground.html?id=199) | 26 | 08 更新 |
| [LC 572 另一棵树的子树](https://onefly.top/zero2Leetcode/playground.html?id=572) | 17 | 08 更新 |
| [LC 104 二叉树的最大深度](https://onefly.top/zero2Leetcode/playground.html?id=104) | 22 | 04 基线 |
| [LC 94 二叉树的中序遍历](https://onefly.top/zero2Leetcode/playground.html?id=94) | 18 | 04 基线 |
| [LC 124 二叉树中的最大路径和](https://onefly.top/zero2Leetcode/playground.html?id=124) | 15 | 04 基线 |
| [LC 226 翻转二叉树](https://onefly.top/zero2Leetcode/playground.html?id=226) | 10 | 04 基线 |
| [LC 695 岛屿的最大面积](https://onefly.top/zero2Leetcode/playground.html?id=695) | 未单列 | 08 关联题 |

LC 102、LC 103、LC 199 可共用按层 BFS 框架；LC 200 与 LC 695 建议成组练习 DFS/BFS。

---

## 3. 动态规划（2026.8：13 道 · 277 次）

| 题目 | 频次 | 数据版本 |
|------|------|----------|
| [LC 5 最长回文子串](https://onefly.top/zero2Leetcode/playground.html?id=5) | 46 | 08 更新 |
| [LC 300 最长递增子序列](https://onefly.top/zero2Leetcode/playground.html?id=300) | 43 | 08 更新 |
| [LC 72 编辑距离](https://onefly.top/zero2Leetcode/playground.html?id=72) | 34 | 08 更新 |
| [LC 1143 最长公共子序列](https://onefly.top/zero2Leetcode/playground.html?id=1143) | 23 | 08 更新 |
| [LC 53 最大子数组和](https://onefly.top/zero2Leetcode/playground.html?id=53) | 30 | 04 基线 |
| [LC 121 买卖股票的最佳时机](https://onefly.top/zero2Leetcode/playground.html?id=121) | 23 | 04 基线 |
| [LC 322 零钱兑换](https://onefly.top/zero2Leetcode/playground.html?id=322) | 14 | 04 基线 |
| [LC 122 买卖股票的最佳时机 II](https://onefly.top/zero2Leetcode/playground.html?id=122) | 12 | 04 基线 |
| [LC 198 打家劫舍](https://onefly.top/zero2Leetcode/playground.html?id=198) | 8 | 04 基线 |
| [LC 70 爬楼梯](https://onefly.top/zero2Leetcode/playground.html?id=70) | 7 | 04 基线 |

LC 300 除 $O(n^2)$ 动态规划外，还应准备 $O(n\log n)$ 的贪心加二分写法。

---

## 4. 双指针、滑动窗口与字符串（2026.8：9 道 · 337 次）

| 题目 | 频次 | 数据版本 |
|------|------|----------|
| [LC 3 无重复字符的最长子串](https://onefly.top/zero2Leetcode/playground.html?id=3) | 174 | 08 更新 |
| [LC 15 三数之和](https://onefly.top/zero2Leetcode/playground.html?id=15) | 44 | 08 更新 |
| [LC 42 接雨水](https://onefly.top/zero2Leetcode/playground.html?id=42) | 38 | 08 更新 |
| [LC 88 合并两个有序数组](https://onefly.top/zero2Leetcode/playground.html?id=88) | 29 | 04 基线 |
| [LC 209 长度最小的子数组](https://onefly.top/zero2Leetcode/playground.html?id=209) | 12 | 04 基线 |
| [LC 239 滑动窗口最大值](https://onefly.top/zero2Leetcode/playground.html?id=239) | 9 | 04 基线 |

08 更新中 LC 3 提升到 174 次，仍是该分类最优先题目；LC 15 注意排序去重，LC 42 至少掌握双指针或单调栈的一种完整写法。

---

## 5. 栈、队列、哈希、贪心与设计（2026.8：16 道 · 373 次）

| 题目 | 频次 | 数据版本 |
|------|------|----------|
| [LC 146 LRU 缓存](https://onefly.top/zero2Leetcode/playground.html?id=146) | 72 | 08 更新 |
| [LC 215 数组中的第 K 个最大元素](https://onefly.top/zero2Leetcode/playground.html?id=215) | 64 | 08 更新 |
| [LC 20 有效的括号](https://onefly.top/zero2Leetcode/playground.html?id=20) | 36 | 08 更新 |
| [LC 1 两数之和](https://onefly.top/zero2Leetcode/playground.html?id=1) | 17 | 04 基线 |
| [LC 46 全排列](https://onefly.top/zero2Leetcode/playground.html?id=46) | 16 | 04 基线 |
| [LC 165 比较版本号](https://onefly.top/zero2Leetcode/playground.html?id=165) | 16 | 04 基线 |
| [LC 232 用栈实现队列](https://onefly.top/zero2Leetcode/playground.html?id=232) | 14 | 04 基线 |
| [LC 415 字符串相加](https://onefly.top/zero2Leetcode/playground.html?id=415) | 13 | 04 基线 |
| [LC 22 括号生成](https://onefly.top/zero2Leetcode/playground.html?id=22) | 7 | 04 基线 |

LC 146 重点是双向链表与哈希表的组织；LC 215 应同时准备快速选择和堆。

---

## 6. 二分查找、排序与数组（2026.8：14 道 · 325 次）

| 题目 | 频次 | 数据版本 |
|------|------|----------|
| [LC 215 数组中的第 K 个最大元素](https://onefly.top/zero2Leetcode/playground.html?id=215) | 64 | 08 更新 |
| [LC 56 合并区间](https://onefly.top/zero2Leetcode/playground.html?id=56) | 18 | 04 基线 |
| [LC 33 搜索旋转排序数组](https://onefly.top/zero2Leetcode/playground.html?id=33) | 15 | 04 基线 |
| [LC 34 在排序数组中查找元素的第一个和最后一个位置](https://onefly.top/zero2Leetcode/playground.html?id=34) | 12 | 04 基线 |
| [LC 912 排序数组](https://onefly.top/zero2Leetcode/playground.html?id=912) | 11 | 04 基线 |
| [LC 4 寻找两个正序数组的中位数](https://onefly.top/zero2Leetcode/playground.html?id=4) | 10 | 04 基线 |
| [LC 75 颜色分类](https://onefly.top/zero2Leetcode/playground.html?id=75) | 8 | 04 基线 |
| [LC 902 最大为 N 的数字组合](https://onefly.top/zero2Leetcode/playground.html?id=902) | 未单列 | 08 新增题 |

LC 902 是 08 材料新增强调的 Hot 100 外题目；LC 912、LC 415、LC 165 也是需要单独补齐的字节高频题。

---

## 全榜 Top 10（按 2026.8 明确频次）

| 排名 | 题目 | 频次 |
|------|------|------|
| 1 | [LC 3 无重复字符的最长子串](https://onefly.top/zero2Leetcode/playground.html?id=3) | 174 |
| 2 | [LC 146 LRU 缓存](https://onefly.top/zero2Leetcode/playground.html?id=146) | 72 |
| 3 | [LC 215 数组中的第 K 个最大元素](https://onefly.top/zero2Leetcode/playground.html?id=215) | 64 |
| 4 | [LC 206 反转链表](https://onefly.top/zero2Leetcode/playground.html?id=206) | 55 |
| 5 | [LC 25 K 个一组翻转链表](https://onefly.top/zero2Leetcode/playground.html?id=25) | 55 |
| 6 | [LC 200 岛屿数量](https://onefly.top/zero2Leetcode/playground.html?id=200) | 50 |
| 7 | [LC 5 最长回文子串](https://onefly.top/zero2Leetcode/playground.html?id=5) | 46 |
| 8 | [LC 15 三数之和](https://onefly.top/zero2Leetcode/playground.html?id=15) | 44 |
| 9 | [LC 19 删除链表的倒数第 N 个结点](https://onefly.top/zero2Leetcode/playground.html?id=19) | 43 |
| 10 | [LC 300 最长递增子序列](https://onefly.top/zero2Leetcode/playground.html?id=300) | 43 |

## Hot 100 之外的专项补充

- [LC 902 最大为 N 的数字组合](https://onefly.top/zero2Leetcode/playground.html?id=902)
- [LC 912 排序数组](https://onefly.top/zero2Leetcode/playground.html?id=912)
- [LC 415 字符串相加](https://onefly.top/zero2Leetcode/playground.html?id=415)
- [LC 165 比较版本号](https://onefly.top/zero2Leetcode/playground.html?id=165)

## 训练建议

1. 先完成 2026.8 Top 10，每题独立写两遍。
2. 再按本页六类表补齐：链表 → 二叉树/图 → 滑动窗口 → 动态规划。
3. 最后补 Hot 100 外专项，并为常见函数题独立写一遍完整 stdin/stdout 包装。
4. 完成标准是能在 10～20 分钟内独立编码、覆盖边界、说明复杂度，并在追问时给出替代解法。
