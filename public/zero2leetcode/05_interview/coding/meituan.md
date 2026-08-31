---
layout: default
title: 美团面试高频手撕题与部门专项题单
description: 基于100篇美团面经样本整理高频手撕代码题，覆盖快速排序、链表、二叉树、数组与字符串，并按基础研发平台、到家、到店、金融、美团优选、美团买菜和快驴归纳部门专项题单
keywords: 美团面试, 手撕代码, LeetCode高频题, 链表, 快速排序, 二叉树, ACM模式
permalink: /05_interview/coding/meituan/
eyebrow: 面试手撕 / 美团
---

# 美团面试高频手撕题与部门专项题单

> 本页基于一批来源材料标注截至 9 月 8 日、但未注明年份的 100 篇美团面经样本。频次仅代表题目在该样本中的出现次数，不等同于真实出题概率；部门题单也只用于确定复习优先级，不表示对应部门只考这些题。

这批样本呈现出两个明显特点：

1. **链表题密集**：反转链表 II、反转链表、环形链表 II、环形链表、合并链表和删除倒数节点均进入高频题单。
2. **基础算法仍需手写**：手写快速排序以 6 次记录排在首位，不能只依赖语言内置排序函数。

建议先完成全公司高频题，再根据目标部门补充专项题单。

---

## 一、样本高频题总览

以下为样本中出现至少 2 次的题目：

| 排名 | 题目 | 样本频次 | 核心方法 |
|------|------|----------|----------|
| 1 | 手写快速排序 | **6** | 分治 + Partition |
| 2 | [LC 92 反转链表 II](https://leetcode.cn/problems/reverse-linked-list-ii/)（本站练习场暂未收录） | **5** | 区间反转 + 节点重连 |
| 2 | [LC 102 二叉树的层序遍历](https://onefly.top/zero2Leetcode/playground.html?id=102) | **5** | BFS + 队列 |
| 2 | [LC 206 反转链表](https://onefly.top/zero2Leetcode/playground.html?id=206) | **5** | 迭代 / 递归 |
| 2 | [LC 88 合并两个有序数组](https://leetcode.cn/problems/merge-sorted-array/)（本站练习场暂未收录） | **5** | 逆向双指针 |
| 2 | [LC 142 环形链表 II](https://onefly.top/zero2Leetcode/playground.html?id=142) | **5** | Floyd 快慢指针 |
| 7 | [LC 141 环形链表](https://onefly.top/zero2Leetcode/playground.html?id=141) | **4** | 快慢指针 |
| 8 | [LC 21 合并两个有序链表](https://onefly.top/zero2Leetcode/playground.html?id=21) | **3** | 双指针 + 哨兵节点 |
| 8 | [LC 215 数组中的第 K 个最大元素](https://onefly.top/zero2Leetcode/playground.html?id=215) | **3** | 快速选择 / 堆 |
| 8 | [LC 144 二叉树的前序遍历](https://leetcode.cn/problems/binary-tree-preorder-traversal/)（本站练习场暂未收录） | **3** | 递归 / 迭代栈 |
| 8 | [LC 19 删除链表的倒数第 N 个节点](https://onefly.top/zero2Leetcode/playground.html?id=19) | **3** | 快慢指针 |
| 12 | [LC 43 字符串相乘](https://leetcode.cn/problems/multiply-strings/)（本站练习场暂未收录） | **2** | 竖式乘法模拟 |
| 12 | [LC 82 删除排序链表中的重复元素 II](https://leetcode.cn/problems/remove-duplicates-from-sorted-list-ii/)（本站练习场暂未收录） | **2** | 双指针 + 哨兵节点 |
| 12 | [LC 32 最长有效括号](https://onefly.top/zero2Leetcode/playground.html?id=32) | **2** | DP / 栈 |
| 12 | [LC 14 最长公共前缀](https://leetcode.cn/problems/longest-common-prefix/)（本站练习场暂未收录） | **2** | 横向扫描 / 排序 |
| 12 | [LC 111 二叉树的最小深度](https://leetcode.cn/problems/minimum-depth-of-binary-tree/)（本站练习场暂未收录） | **2** | BFS / DFS |
| 12 | [LC 15 三数之和](https://onefly.top/zero2Leetcode/playground.html?id=15) | **2** | 排序 + 双指针 |
| 12 | [LC 143 重排链表](https://leetcode.cn/problems/reorder-list/)（本站练习场暂未收录） | **2** | 找中点 + 反转 + 合并 |
| 12 | [LC 23 合并 K 个升序链表](https://onefly.top/zero2Leetcode/playground.html?id=23) | **2** | 优先队列 / 分治 |
| 12 | [LC 8 字符串转换整数（atoi）](https://leetcode.cn/problems/string-to-integer-atoi/)（本站练习场暂未收录） | **2** | 字符串模拟 + 边界处理 |
| 12 | [LC 239 滑动窗口最大值](https://onefly.top/zero2Leetcode/playground.html?id=239) | **2** | 单调队列 |

> 链接到本站练习场的题目可直接在线编码；标注“本站练习场暂未收录”的题目将跳转到 LeetCode 中文站。

---

## 二、第一优先级：快速排序与链表

### 1. 手写快速排序

快速排序是本批样本中记录最多的单项。题目要求手写快速排序时，需要完整实现 `partition` 和递归过程，不能以调用内置排序代替。

建议固定一种分区模板，并能解释：

- 基准值如何选择。
- 分区结束后，基准值位于什么位置。
- 左右递归区间是否包含基准值。
- 平均、最坏时间复杂度分别是多少。
- 如何通过随机选取基准值降低退化风险。

以双指针分区为例，核心代码可以写成：

```python
def quick_sort(nums, left, right):
    if left >= right:
        return

    pivot_index = partition(nums, left, right)
    quick_sort(nums, left, pivot_index - 1)
    quick_sort(nums, pivot_index + 1, right)


def partition(nums, left, right):
    pivot = nums[right]
    boundary = left

    for i in range(left, right):
        if nums[i] <= pivot:
            nums[boundary], nums[i] = nums[i], nums[boundary]
            boundary += 1

    nums[boundary], nums[right] = nums[right], nums[boundary]
    return boundary
```

这套 `partition` 还能直接迁移到 LC 215 的快速选择解法。

### 2. 反转链表 II

LC 92 要求只反转链表的 `[left, right]` 区间。与完整反转相比，它更强调节点重连：

1. 使用哨兵节点处理 `left = 1` 的情况。
2. 找到反转区间前一个节点 `pre`。
3. 反转指定长度的链表区间。
4. 将反转后的头尾与原链表重新连接。

可以使用常规区间反转，也可以使用头插法。无论选择哪种写法，都要先明确每个指针在循环前后的语义。

### 3. 反转链表

LC 206 是 LC 92 和 LC 143 的基础。迭代写法至少维护：

- `prev`：已经反转部分的头节点。
- `cur`：当前处理节点。
- `next_node`：修改 `cur.next` 前保存后继节点。

建议同时准备递归写法，并能解释递归函数返回的是反转后链表的头节点。

### 4. 环形链表与环入口

LC 141 判断是否存在环，LC 142 进一步寻找环入口，两题应当一起准备。

- 第一阶段：快指针每次走两步，慢指针每次走一步，判断是否相遇。
- 第二阶段：相遇后将一个指针移回链表头部，两个指针每次各走一步，再次相遇的位置就是环入口。

面试官可能要求解释第二阶段成立的距离关系，不能只背代码。

### 5. 链表组合题

还应集中完成：

- LC 19：哨兵节点 + 快慢指针删除倒数第 N 个节点。
- LC 21：合并两个有序链表。
- LC 23：使用小根堆或分治合并 K 条链表。
- LC 82：删除所有重复值对应的节点，而不是每个值只保留一个。
- LC 143：找中点、反转后半段、交替合并两段链表。

链表题适合按“基本操作 → 组合题”的顺序训练，而不是孤立记忆每道答案。

---

## 三、第二优先级：二叉树、数组与字符串

### 1. 二叉树层序遍历

LC 102 使用队列完成 BFS。每轮先记录当前队列长度，再依次取出这一层的节点，由此保证输出按层分组。

建议继续练习两个变体：

- LC 103 锯齿形层序遍历：按层交替改变输出方向。
- LC 111 最小深度：BFS 首次遇到叶子节点时即可返回当前层数。

### 2. 二叉树前序遍历

LC 144 要同时会递归和迭代：

- 递归顺序：根、左、右。
- 迭代时使用栈，先压入右子树，再压入左子树。

### 3. 合并两个有序数组

LC 88 的关键是从数组末尾逆向填充，避免覆盖 `nums1` 中尚未处理的元素。三个指针分别指向两个数组当前末尾和最终写入位置。

时间复杂度为 $O(m+n)$，额外空间复杂度为 $O(1)$。

### 4. 数组中的第 K 个最大元素

LC 215 可以复用快速排序的分区逻辑。需要准备：

- 快速选择：平均 $O(n)$。
- 大小为 K 的小根堆：$O(n\log k)$。

如果题目变为持续到来的数据流，优先考虑堆；如果数据一次性给出且限制复杂度，可以使用快速选择。

### 5. 三数之和

LC 15 先排序，再枚举第一个数，剩余部分使用双指针。主要检查三个去重点：

- 枚举位置跳过重复值。
- 找到答案后，左指针跳过重复值。
- 找到答案后，右指针跳过重复值。

### 6. 字符串边界题

字符串题数量不多，但都容易因边界处理失分：

- LC 8 atoi：空格、正负号、非数字终止和 32 位整数截断。
- [LC 14 最长公共前缀](https://leetcode.cn/problems/longest-common-prefix/)（本站练习场暂未收录）：空数组和单字符串输入。
- [LC 43 字符串相乘](https://leetcode.cn/problems/multiply-strings/)（本站练习场暂未收录）：结果数组下标映射、进位和前导零。
- LC 32 最长有效括号：需要熟悉 DP 或栈的状态含义。

---

## 四、部门专项题单

以下仅按来源材料保留部门与题目的对应记录，不代表部门偏好、固定题库或真实出题概率。建议先完成样本高频榜，再补目标部门记录到的题目，避免只准备少数专项题。

### 1. 基础研发平台

| 题目 | 主要考点 |
|------|----------|
| [LC 146 LRU 缓存](https://onefly.top/zero2Leetcode/playground.html?id=146) | 哈希表 + 双向链表 |
| [LC 120 三角形最小路径和](https://leetcode.cn/problems/triangle/)（本站练习场暂未收录） | 动态规划 / 空间压缩 |
| [LC 143 重排链表](https://leetcode.cn/problems/reorder-list/)（本站练习场暂未收录） | 找中点 + 反转 + 合并 |
| [LC 93 复原 IP 地址](https://leetcode.cn/problems/restore-ip-addresses/)（本站练习场暂未收录） | 回溯 + 合法性判断 |
| IP 地址与整数转换 | 位运算 / 字符串解析 |

这一组题同时覆盖数据结构设计、动态规划、链表组合、回溯和网络地址转换，准备时应特别注意 IP 地址的合法范围与整数溢出问题。

### 2. 到家

| 题目 | 主要考点 |
|------|----------|
| [LC 143 重排链表](https://leetcode.cn/problems/reorder-list/)（本站练习场暂未收录） | 链表综合操作 |
| [LC 32 最长有效括号](https://onefly.top/zero2Leetcode/playground.html?id=32) | DP / 栈 |

两道题都不是单一模板的直接套用，重点练习多步骤算法的口述和边界验证。

### 3. 到店

| 题目 | 主要考点 |
|------|----------|
| [LC 718 最长重复子数组](https://leetcode.cn/problems/maximum-length-of-repeated-subarray/)（本站练习场暂未收录） | 二维 DP / 滚动数组 |
| [LC 23 合并 K 个升序链表](https://onefly.top/zero2Leetcode/playground.html?id=23) | 优先队列 / 分治 |

LC 718 需要区分“子数组”和“子序列”：子数组要求元素连续，状态转移不能沿用最长公共子序列的写法。

### 4. 金融服务平台

| 题目 | 主要考点 |
|------|----------|
| [LC 16 最接近的三数之和](https://leetcode.cn/problems/3sum-closest/)（本站练习场暂未收录） | 排序 + 双指针 |
| [LC 42 接雨水](https://onefly.top/zero2Leetcode/playground.html?id=42) | 双指针 / 单调栈 |
| [LC 647 回文子串](https://leetcode.cn/problems/palindromic-substrings/)（本站练习场暂未收录） | 中心扩展 / DP |

这一组以数组和字符串为主。接雨水建议掌握双指针和单调栈两种方法，并能说明每种方法维护的状态。

### 5. 美团优选

| 题目 | 主要考点 |
|------|----------|
| [LC 124 二叉树中的最大路径和](https://onefly.top/zero2Leetcode/playground.html?id=124) | 后序遍历 + 全局最优值 |
| [LC 128 最长连续序列](https://onefly.top/zero2Leetcode/playground.html?id=128) | 哈希集合 |
| [LC 236 二叉树的最近公共祖先](https://onefly.top/zero2Leetcode/playground.html?id=236) | 递归后序遍历 |
| [LC 468 验证 IP 地址](https://leetcode.cn/problems/validate-ip-address/)（本站练习场暂未收录） | 字符串解析 + 严格校验 |

二叉树题占一半。LC 124 和 LC 236 都需要先定义递归返回值，再组合左右子树结果。

### 6. 美团买菜

| 题目 | 主要考点 |
|------|----------|
| [LC 718 最长重复子数组](https://leetcode.cn/problems/maximum-length-of-repeated-subarray/)（本站练习场暂未收录） | 二维 DP / 滚动数组 |
| [LC 103 二叉树的锯齿形层序遍历](https://leetcode.cn/problems/binary-tree-zigzag-level-order-traversal/)（本站练习场暂未收录） | BFS + 层序方向控制 |

锯齿形遍历可以在普通层序遍历基础上改变每层写入顺序，不需要改变节点入队顺序。

### 7. 快驴

| 题目 | 主要考点 |
|------|----------|
| [LC 5 最长回文子串](https://onefly.top/zero2Leetcode/playground.html?id=5) | 中心扩展 / DP |
| [LC 468 验证 IP 地址](https://leetcode.cn/problems/validate-ip-address/)（本站练习场暂未收录） | 字符串解析 + 边界处理 |

最长回文子串优先掌握中心扩展法；验证 IP 地址要分别处理 IPv4 和 IPv6 的段数、字符范围与前导零规则。

### 8. 智慧交通测试岗补充

样本还记录到 [LC 326「3 的幂」](https://leetcode.cn/problems/power-of-three/)（本站练习场暂未收录）。这道题可以用循环除法，也可以讨论整数范围内最大 3 的幂取模的做法。准备测试岗时，应同时说明零、负数和非 3 次幂输入的处理。

---

## 五、两周备考路线

### 第一周：公司公共高频题

- **第 1 天**：手写快速排序、LC 215 快速选择。
- **第 2 天**：LC 206、LC 92，固定链表反转模板。
- **第 3 天**：LC 141、LC 142、LC 19。
- **第 4 天**：LC 21、LC 23、LC 82、LC 143。
- **第 5 天**：LC 102、LC 111、LC 144。
- **第 6 天**：LC 88、LC 15、LC 239。
- **第 7 天**：LC 8、LC 14、LC 32、LC 43，并复盘本周错题。

### 第二周：部门专项与模拟

1. 按目标部门完成对应题单。
2. 将每道题改写为 ACM 模式，补齐输入输出。
3. 做两次 45～60 分钟模拟，每次包括一道链表题和一道数组、树或 DP 题。
4. 对每道错题记录错误类型：思路缺失、边界遗漏、指针错误、复杂度不达标或表达不清。
5. 模拟结束后不看答案重写，直到能稳定完成。

---

## 六、面试现场检查清单

### 写代码前

- 复述输入、输出和约束。
- 确认能否使用语言内置数据结构或排序函数。
- 说明朴素解法及其复杂度，再提出优化方案。

### 写代码时

- 链表题优先考虑哨兵节点。
- 二叉树题先定义递归函数返回值。
- 双指针题明确左右指针的移动条件。
- 快排和二分题统一使用熟悉的区间模板。

### 写完后

至少手动检查以下输入：

- 空输入或空链表。
- 单元素输入。
- 全部元素相同。
- 已有序和逆序数组。
- 链表头节点被删除或反转。
- 整数边界、前导零和非法字符。

在本页 100 篇样本中，链表和基础排序的记录相对集中。先把快速排序、链表反转、判环、链表合并和层序遍历写稳定，再补部门专项题，比只按 LeetCode 题号顺序刷更有针对性。
