---
layout: default
title: 递归与回溯
description: 回溯通用模板与解题框架
eyebrow: 核心算法 / 05
---

# 递归与回溯

## 什么是递归

递归就是**函数调用自身**。听起来像套娃，实际上计算机非常擅长做这件事。

写好一个递归函数，需要抓住三个要素：

1. **终止条件**（Base Case）：什么时候停下来？没有终止条件就会无限递归，直到栈溢出。
2. **递归公式**：大问题怎么拆成小问题？每次调用都要让问题规模缩小。
3. **返回值**：每一层递归把什么结果交给上一层？

### 例子：阶乘

`n! = n * (n-1) * ... * 1`，用递归写非常直观：

```python
def factorial(n):
    if n <= 1:          # 终止条件
        return 1
    return n * factorial(n - 1)  # 递归公式
```

### 例子：斐波那契数列

```python
def fib(n):
    if n <= 1:          # 终止条件：fib(0)=0, fib(1)=1
        return n
    return fib(n - 1) + fib(n - 2)  # 递归公式
```

> 注意：朴素递归的斐波那契时间复杂度是 O(2^n)，实际中需要用记忆化或动态规划优化。

---

## 什么是回溯

一句话概括：**回溯 = 递归 + 撤销选择**。

回溯的本质是**穷举所有可能的方案**，在穷举过程中通过**剪枝**丢弃不合法的分支，从而找到所有（或某个）满足条件的解。

### 决策树思想

以从 `[1, 2, 3]` 中选出所有排列为例，想象一棵树：根节点是空列表 `[]`，第一层分别选 1、2、3，第二层在剩余数字中再选一个……直到叶子节点就得到一个完整排列。**"撤销选择"就是从当前节点退回父节点，尝试另一条路。**

---

## 回溯通用模板

绝大多数回溯题都可以套用下面的框架：

```python
result = []  # 存放所有合法结果

def backtrack(path, choices):
    # 1. 终止条件：路径长度满足要求，收集结果
    if 满足终止条件:
        result.append(path[:])   # 注意要拷贝，不能直接 append(path)
        return

    # 2. 遍历当前可用的选择
    for choice in choices:
        path.append(choice)       # 做选择
        backtrack(path, new_choices)  # 递归进入下一层
        path.pop()                # 撤销选择（回溯）
```

**逐行解释：**

| 行 | 作用 |
|---|---|
| `if 满足终止条件` | 递归出口，通常是路径长度等于目标长度 |
| `result.append(path[:])` | 把当前路径的**副本**加入结果；如果写 `path` 会因为引用导致结果全为空 |
| `for choice in choices` | 枚举当前层能做的所有选择 |
| `path.append(choice)` | 做出选择，将当前元素加入路径 |
| `backtrack(...)` | 递归到下一层继续选择 |
| `path.pop()` | 撤销选择，恢复现场，以便尝试其他分支 |

---

## 排列问题

### 全排列（LC 46）

> 给定一个不含重复数字的数组 `nums`，返回其所有全排列。

```python
def permute(nums):
    result = []

    def backtrack(path, used):
        # 终止条件：排列长度等于数组长度
        if len(path) == len(nums):
            result.append(path[:])
            return

        for i in range(len(nums)):
            if used[i]:       # 跳过已经使用过的数字
                continue
            path.append(nums[i])   # 做选择
            used[i] = True
            backtrack(path, used)   # 递归
            path.pop()             # 撤销选择
            used[i] = False

    backtrack([], [False] * len(nums))
    return result
```

这里用 `used` 数组记录哪些数字已经被选过，避免重复使用同一个元素。

---

## 组合问题

### 组合总和（LC 39）

> 给定候选数组 `candidates`（无重复）和目标值 `target`，找出所有和为 `target` 的组合。每个数字可以无限次使用。

```python
def combinationSum(candidates, target):
    result = []
    candidates.sort()  # 排序，方便剪枝

    def backtrack(path, remain, start):
        # 终止条件：剩余目标为 0，找到一组合法解
        if remain == 0:
            result.append(path[:])
            return

        for i in range(start, len(candidates)):
            # 剪枝：如果当前数字已经超过剩余目标，后面更大的数也不用看了
            if candidates[i] > remain:
                break
            path.append(candidates[i])           # 做选择
            backtrack(path, remain - candidates[i], i)  # 注意传 i 而不是 i+1，因为可以重复使用
            path.pop()                           # 撤销选择

    backtrack([], target, 0)
    return result
```

**剪枝技巧：** 先对数组排序，当 `candidates[i] > remain` 时直接 `break`，省去大量无效递归。

---

## 子集问题

### 子集（LC 78）

> 给定一个不含重复元素的整数数组 `nums`，返回其所有子集。

```python
def subsets(nums):
    result = []

    def backtrack(path, start):
        # 每个节点都是一个合法子集，直接收集
        result.append(path[:])

        for i in range(start, len(nums)):
            path.append(nums[i])        # 做选择
            backtrack(path, i + 1)      # 递归，从 i+1 开始避免重复
            path.pop()                  # 撤销选择

    backtrack([], 0)
    return result
```

子集问题和组合问题的区别：子集在**每个节点**都收集结果，而组合只在叶子节点（满足条件时）收集。

---

## N 皇后（LC 51）

> 在 n x n 的棋盘上放置 n 个皇后，使得任意两个皇后不能在同一行、同一列、同一斜线上。

思路：逐行放置皇后，每一行尝试每一列，用三个集合记录哪些列和对角线已被占用。

```python
def solveNQueens(n):
    result = []
    board = [['.' ] * n for _ in range(n)]

    def backtrack(row, cols, diag1, diag2):
        # 终止条件：所有行都放完了
        if row == n:
            result.append([''.join(r) for r in board])
            return

        for col in range(n):
            # 剪枝：检查列、主对角线、副对角线是否冲突
            if col in cols or (row - col) in diag1 or (row + col) in diag2:
                continue
            # 做选择
            board[row][col] = 'Q'
            cols.add(col)
            diag1.add(row - col)
            diag2.add(row + col)

            backtrack(row + 1, cols, diag1, diag2)  # 递归下一行

            # 撤销选择
            board[row][col] = '.'
            cols.remove(col)
            diag1.remove(row - col)
            diag2.remove(row + col)

    backtrack(0, set(), set(), set())
    return result
```

- `cols`：记录已占用的列。
- `diag1`（主对角线）：同一主对角线上 `row - col` 相同。
- `diag2`（副对角线）：同一副对角线上 `row + col` 相同。

---

## 经典题目

按难度分组，建议按顺序练习：

### 入门

| 题号 | 题目 | 要点 |
|------|------|------|
| 46 | 全排列 | 回溯入门，used 数组 |
| 78 | 子集 | 每个节点收集结果 |
| 77 | 组合 | 选 k 个数，start 去重 |

### 进阶

| 题号 | 题目 | 要点 |
|------|------|------|
| 39 | 组合总和 | 元素可重复使用，排序剪枝 |
| 40 | 组合总和 II | 元素不可重复，同层去重 |
| 47 | 全排列 II | 含重复数字的排列，排序 + 跳过 |
| 90 | 子集 II | 含重复元素的子集 |

### 挑战

| 题号 | 题目 | 要点 |
|------|------|------|
| 51 | N 皇后 | 经典回溯，对角线剪枝 |
| 37 | 解数独 | 二维回溯，逐格尝试 |
| 131 | 分割回文串 | 回溯 + 回文判断 |

---

## 小结

回溯的核心就三步，反复练习直到形成肌肉记忆：

1. **做选择** -- 把当前元素加入路径。
2. **递归** -- 进入下一层决策。
3. **撤销选择** -- 退回来，尝试其他分支。

**剪枝是回溯效率的关键。** 没有剪枝的回溯就是暴力穷举，时间复杂度爆炸。常见剪枝手段：

- 排序后提前 `break`（如组合总和）。
- 用集合 / 数组标记已使用的元素（如全排列）。
- 同层去重：排序后跳过相邻重复元素（如全排列 II、子集 II）。

掌握模板之后，遇到新题只需要思考两个问题：

- **终止条件是什么？**
- **每一层的选择列表是什么？如何剪枝？**

想清楚这两点，代码自然就写出来了。
