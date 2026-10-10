---
layout: default
title: 动态规划
description: 动态规划解题五步法方法论
eyebrow: 核心算法 / 07
---

# 动态规划

动态规划（Dynamic Programming，简称 DP）是面试中出现频率最高的算法类型。很多同学觉得 DP 难，其实只要掌握了思考框架，绝大多数题目都能拆解出来。

---

## 什么是动态规划

**核心思想**：把一个大问题拆成若干个**重叠的子问题**，先解决小的子问题，把结果存起来，再用这些结果推导出大问题的答案。

### 与贪心算法的区别

| 维度 | 动态规划 | 贪心 |
|------|---------|------|
| 决策方式 | 考虑所有子问题，取**全局最优** | 每一步只看**局部最优** |
| 是否回溯 | 会比较多种选择 | 不会回头 |
| 适用场景 | 子问题有重叠、需要全局最优解 | 局部最优能推出全局最优 |

### 与分治算法的区别

分治也是把大问题拆成小问题，但分治的子问题**互不重叠**（如归并排序的左右两半）。DP 的子问题**大量重叠**，所以需要用数组或哈希表缓存结果，避免重复计算。

### 两种实现方式

1. **自顶向下（记忆化递归）**：从大问题出发，递归地解决子问题，用缓存记录已解决的子问题。
2. **自底向上（DP 表）**：从最小的子问题开始，逐步推导出大问题的解。这是面试中最常用的方式。

---

## 解题五步法

不管什么 DP 题目，都可以按这五步来思考：

### 第 1 步：定义状态

`dp[i]` 表示什么？这是最关键的一步。状态定义对了，后面水到渠成。

### 第 2 步：写出状态转移方程

`dp[i]` 和 `dp[i-1]`、`dp[i-2]` 等之间的关系是什么？这是 DP 的灵魂。

### 第 3 步：初始化

最小的子问题（边界条件）的值是多少？比如 `dp[0]`、`dp[1]`。

### 第 4 步：确定遍历顺序

一般从小到大遍历。但在某些二维 DP 或背包问题中，遍历顺序至关重要。

### 第 5 步：确定返回值

最终答案是 `dp[n]`？还是 `dp[n-1]`？还是 `max(dp)`？

> 调试技巧：把 dp 数组打印出来，和手动推导的结果对比，很容易发现 bug。

---

## 入门：爬楼梯（LC 70）

> 假设你正在爬楼梯，需要 n 阶才能到达楼顶。每次你可以爬 1 或 2 个台阶。有多少种不同的方法可以爬到楼顶？

### 用五步法分析

1. **定义状态**：`dp[i]` = 爬到第 i 阶楼梯的方法数
2. **状态转移方程**：到第 i 阶，要么从第 i-1 阶爬 1 步上来，要么从第 i-2 阶爬 2 步上来，所以 `dp[i] = dp[i-1] + dp[i-2]`
3. **初始化**：`dp[0] = 1`（站在地面，1 种方式），`dp[1] = 1`（爬 1 阶，1 种方式）
4. **遍历顺序**：从 2 到 n，从小到大
5. **返回值**：`dp[n]`

### 数组版代码

```python
def climbStairs(n: int) -> int:
    if n <= 1:
        return 1
    dp = [0] * (n + 1)
    dp[0] = 1  # 站在地面算 1 种
    dp[1] = 1  # 爬 1 阶有 1 种方法
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]  # 状态转移
    return dp[n]
```

### 空间优化版

dp[i] 只依赖 dp[i-1] 和 dp[i-2]，所以只需要两个变量：

```python
def climbStairs(n: int) -> int:
    if n <= 1:
        return 1
    prev, curr = 1, 1  # 分别对应 dp[i-2] 和 dp[i-1]
    for _ in range(2, n + 1):
        prev, curr = curr, prev + curr  # 滚动更新
    return curr
```

---

## 经典题型

### 一、线性 DP

线性 DP 是最基础的类型，状态沿着一个维度（通常是数组下标）递推。

#### 最大子数组和（LC 53）

> 给定一个整数数组 nums，找到一个具有最大和的连续子数组，返回其最大和。

**五步法分析**：

1. **状态定义**：`dp[i]` = 以 `nums[i]` 结尾的最大子数组和
2. **转移方程**：`dp[i] = max(dp[i-1] + nums[i], nums[i])`——要么接在前面的子数组后面，要么自己另起一个子数组
3. **初始化**：`dp[0] = nums[0]`
4. **遍历顺序**：从左到右
5. **返回值**：`max(dp)`，因为最大子数组可能在任意位置结尾

```python
def maxSubArray(nums: list[int]) -> int:
    n = len(nums)
    dp = [0] * n
    dp[0] = nums[0]
    for i in range(1, n):
        # 要么延续前面的子数组，要么从当前元素重新开始
        dp[i] = max(dp[i - 1] + nums[i], nums[i])
    return max(dp)
```

空间优化（只需要一个变量记录前一个状态）：

```python
def maxSubArray(nums: list[int]) -> int:
    cur_sum = nums[0]
    max_sum = nums[0]
    for i in range(1, len(nums)):
        cur_sum = max(cur_sum + nums[i], nums[i])
        max_sum = max(max_sum, cur_sum)
    return max_sum
```

#### 打家劫舍（LC 198）

> 你是一个小偷，沿街有一排房屋，每间房内有一定现金。相邻的房屋装有互相连通的防盗系统，如果两间相邻的房屋在同一晚被闯入，系统会自动报警。求在不触动报警装置的情况下，能偷到的最高金额。

1. **状态定义**：`dp[i]` = 偷到第 i 间房时能获得的最高金额
2. **转移方程**：`dp[i] = max(dp[i-1], dp[i-2] + nums[i])`——要么不偷第 i 间（金额等于 dp[i-1]），要么偷第 i 间（跳过第 i-1 间，金额等于 dp[i-2] + nums[i]）
3. **初始化**：`dp[0] = nums[0]`，`dp[1] = max(nums[0], nums[1])`

```python
def rob(nums: list[int]) -> int:
    if len(nums) == 1:
        return nums[0]
    dp = [0] * len(nums)
    dp[0] = nums[0]
    dp[1] = max(nums[0], nums[1])
    for i in range(2, len(nums)):
        dp[i] = max(dp[i - 1], dp[i - 2] + nums[i])
    return dp[-1]
```

---

### 二、二维 DP

当问题涉及两个维度（如网格的行和列），就需要二维 DP。

#### 不同路径（LC 62）

> 一个 m x n 的网格，从左上角走到右下角，每次只能向下或向右走一步，共有多少条不同路径？

1. **状态定义**：`dp[i][j]` = 从起点到位置 (i, j) 的路径数
2. **转移方程**：`dp[i][j] = dp[i-1][j] + dp[i][j-1]`（从上边来 + 从左边来）
3. **初始化**：第一行和第一列都是 1（只有一种走法）

```python
def uniquePaths(m: int, n: int) -> int:
    dp = [[1] * n for _ in range(m)]  # 初始化全部为 1
    for i in range(1, m):
        for j in range(1, n):
            dp[i][j] = dp[i - 1][j] + dp[i][j - 1]
    return dp[m - 1][n - 1]
```

#### 最小路径和（LC 64）

> 给定一个 m x n 的网格，每个格子有一个非负整数，找一条从左上角到右下角的路径，使路径上数字之和最小。

1. **状态定义**：`dp[i][j]` = 从起点到 (i, j) 的最小路径和
2. **转移方程**：`dp[i][j] = grid[i][j] + min(dp[i-1][j], dp[i][j-1])`

```python
def minPathSum(grid: list[list[int]]) -> int:
    m, n = len(grid), len(grid[0])
    dp = [[0] * n for _ in range(m)]
    dp[0][0] = grid[0][0]
    # 初始化第一行
    for j in range(1, n):
        dp[0][j] = dp[0][j - 1] + grid[0][j]
    # 初始化第一列
    for i in range(1, m):
        dp[i][0] = dp[i - 1][0] + grid[i][0]
    # 填表
    for i in range(1, m):
        for j in range(1, n):
            dp[i][j] = grid[i][j] + min(dp[i - 1][j], dp[i][j - 1])
    return dp[m - 1][n - 1]
```

---

### 三、背包问题

背包问题是 DP 中最经典的模型之一，很多看似无关的题目都能转化为背包问题。

#### 0-1 背包

**问题描述**：有 n 件物品和一个容量为 W 的背包。第 i 件物品重量 `weight[i]`，价值 `value[i]`。每件物品只能用一次，求能装入背包的最大价值。

1. **状态定义**：`dp[i][j]` = 考虑前 i 件物品、背包容量为 j 时的最大价值
2. **转移方程**：
   - 不选第 i 件：`dp[i][j] = dp[i-1][j]`
   - 选第 i 件（前提 `j >= weight[i]`）：`dp[i][j] = dp[i-1][j-weight[i]] + value[i]`
   - 取两者最大值

**二维代码**：

```python
def knapsack_01(weight: list[int], value: list[int], W: int) -> int:
    n = len(weight)
    dp = [[0] * (W + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(W + 1):
            dp[i][j] = dp[i - 1][j]  # 不选第 i 件
            if j >= weight[i - 1]:    # 能装下时，考虑选
                dp[i][j] = max(dp[i][j], dp[i - 1][j - weight[i - 1]] + value[i - 1])
    return dp[n][W]
```

**空间优化（一维滚动数组）**：

关键：内层循环**从大到小**遍历，确保每件物品只被选一次。

```python
def knapsack_01_optimized(weight: list[int], value: list[int], W: int) -> int:
    dp = [0] * (W + 1)
    for i in range(len(weight)):
        # 必须倒序遍历，防止同一轮中物品被重复选取
        for j in range(W, weight[i] - 1, -1):
            dp[j] = max(dp[j], dp[j - weight[i]] + value[i])
    return dp[W]
```

#### 分割等和子集（LC 416）

> 给定一个只包含正整数的非空数组 nums，判断是否可以将其分割成两个子集，使两个子集的元素和相等。

**转化思路**：总和为 S，问题等价于"能否从数组中选出若干个数，使其和恰好等于 S/2"。这就是一个容量为 S/2 的 0-1 背包问题。

```python
def canPartition(nums: list[int]) -> bool:
    total = sum(nums)
    if total % 2 != 0:  # 奇数不可能平分
        return False
    target = total // 2
    dp = [False] * (target + 1)
    dp[0] = True  # 和为 0 总是可行的
    for num in nums:
        # 倒序遍历，0-1 背包的标准做法
        for j in range(target, num - 1, -1):
            dp[j] = dp[j] or dp[j - num]
    return dp[target]
```

---

### 四、字符串 DP

两个字符串之间的比较、匹配、变换，往往用二维 DP 解决。

#### 最长公共子序列（LC 1143）

> 给定两个字符串 text1 和 text2，返回它们的最长公共子序列的长度。

1. **状态定义**：`dp[i][j]` = text1 前 i 个字符与 text2 前 j 个字符的最长公共子序列长度
2. **转移方程**：
   - 如果 `text1[i-1] == text2[j-1]`：`dp[i][j] = dp[i-1][j-1] + 1`
   - 否则：`dp[i][j] = max(dp[i-1][j], dp[i][j-1])`

用一个表格来理解（以 "ace" 和 "abcde" 为例）：

```
     ""  a  b  c  d  e
""    0  0  0  0  0  0
a     0  1  1  1  1  1
c     0  1  1  2  2  2
e     0  1  1  2  2  3
```

```python
def longestCommonSubsequence(text1: str, text2: str) -> int:
    m, n = len(text1), len(text2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if text1[i - 1] == text2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1  # 两个字符相同，长度 +1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])  # 取较大值
    return dp[m][n]
```

#### 编辑距离（LC 72）

> 给定两个单词 word1 和 word2，计算把 word1 转换成 word2 所需的最少操作数（插入、删除、替换一个字符）。

**思路**：

1. **状态定义**：`dp[i][j]` = word1 前 i 个字符变成 word2 前 j 个字符所需的最少操作数
2. **转移方程**：
   - 如果 `word1[i-1] == word2[j-1]`：`dp[i][j] = dp[i-1][j-1]`（不需要操作）
   - 否则取三种操作的最小值：
     - 插入：`dp[i][j-1] + 1`
     - 删除：`dp[i-1][j] + 1`
     - 替换：`dp[i-1][j-1] + 1`
3. **初始化**：`dp[i][0] = i`（删除 i 个字符），`dp[0][j] = j`（插入 j 个字符）

```python
def minDistance(word1: str, word2: str) -> int:
    m, n = len(word1), len(word2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    # 初始化：空串到任意串的编辑距离
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if word1[i - 1] == word2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(
                    dp[i - 1][j],      # 删除
                    dp[i][j - 1],      # 插入
                    dp[i - 1][j - 1]   # 替换
                )
    return dp[m][n]
```

---

### 五、区间 DP 与树形 DP（进阶）

#### 区间 DP

区间 DP 处理的是"在一个区间上做决策"的问题，状态一般定义为 `dp[i][j]` 表示区间 `[i, j]` 的最优解。

典型题目：
- **戳气球（LC 312）**：在区间 [i, j] 中选择最后一个戳破的气球
- **最长回文子序列（LC 516）**：`dp[i][j]` 表示 s[i..j] 中最长回文子序列的长度

遍历顺序的关键：**区间长度从小到大**，先处理短区间，再处理长区间。

#### 树形 DP

在树结构上做 DP，通常用 DFS 后序遍历，子节点的结果汇总到父节点。

典型题目：
- **打家劫舍 III（LC 337）**：在二叉树上偷东西，相邻节点不能同时偷
- **二叉树的直径（LC 543）**

---

## 经典题目清单

### 入门级

| 题号 | 题目 | 核心思路 |
|------|------|---------|
| LC 70 | 爬楼梯 | 斐波那契递推 |
| LC 509 | 斐波那契数 | 最基础的 DP |
| LC 746 | 使用最小花费爬楼梯 | 爬楼梯变体 |

### 基础级

| 题号 | 题目 | 核心思路 |
|------|------|---------|
| LC 53 | 最大子数组和 | 线性 DP |
| LC 198 | 打家劫舍 | 选或不选 |
| LC 62 | 不同路径 | 网格 DP |
| LC 64 | 最小路径和 | 网格 DP |
| LC 322 | 零钱兑换 | 完全背包 |

### 进阶级

| 题号 | 题目 | 核心思路 |
|------|------|---------|
| LC 416 | 分割等和子集 | 0-1 背包 |
| LC 1143 | 最长公共子序列 | 字符串 DP |
| LC 72 | 编辑距离 | 字符串 DP |
| LC 300 | 最长递增子序列 | 线性 DP + 二分优化 |

---

## 小结

动态规划的核心就是两件事：**状态定义**和**状态转移方程**。

推荐的学习路径：

1. **先写暴力递归**：不考虑效率，用递归把问题解出来
2. **加记忆化**：在递归基础上加一个缓存（字典或数组），消除重复计算
3. **改写为 DP 表**：把自顶向下的递归改成自底向上的循环
4. **空间优化**：如果 `dp[i]` 只依赖 `dp[i-1]`，就可以用滚动变量代替整个数组

```
暴力递归 → 记忆化搜索 → DP 表 → 空间优化
```

记住：DP 题目做多了自然就有感觉了。每道题都用五步法分析，刻意练习，很快就能在面试中游刃有余。
