---
layout: default
title: 滑动窗口
description: 滑动窗口通用模板与解题框架
eyebrow: 核心算法 / 04
---

# 滑动窗口

## 什么是滑动窗口

想象你拿着一个可以伸缩的放大镜，在一排数字（或字符）上从左往右滑动。放大镜框住的那一段，就是"窗口"。

**本质：** 维护一个可伸缩的区间 `[left, right]`，通过移动左右边界来遍历所有可能的连续子数组/子串。

**为什么要用滑动窗口？** 对比暴力枚举：

| 方法 | 思路 | 时间复杂度 |
|------|------|-----------|
| 暴力枚举 | 两层循环枚举所有子数组 | O(n²) |
| 滑动窗口 | 左右指针各走一遍 | O(n) |

**什么时候该想到滑动窗口？** 当题目同时满足以下两点：

1. 求的是 **连续子数组** 或 **连续子串**
2. 需要满足某个 **条件**（最长、最短、恰好包含等）

看到"连续"+"条件"，就该条件反射想到滑动窗口。

---

## 通用模板

下面是一个万能的滑动窗口框架，几乎所有滑窗题都能套进去：

```python
def sliding_window(s):
    window = {}          # 窗口内的数据统计（通常是哈希表）
    left = 0             # 窗口左边界
    result = 0           # 最终答案

    for right in range(len(s)):
        # ---- 第 1 步：扩大窗口 ----
        # right 指针右移，把新元素加入窗口
        c = s[right]
        window[c] = window.get(c, 0) + 1

        # ---- 第 2 步：收缩窗口 ----
        # 当窗口不满足条件时，移动 left 缩小窗口
        while need_shrink():  # 替换成具体的判断条件
            d = s[left]
            window[d] -= 1
            if window[d] == 0:
                del window[d]
            left += 1

        # ---- 第 3 步：更新答案 ----
        # 此时窗口 [left, right] 是合法的，更新结果
        result = max(result, right - left + 1)

    return result
```

**逐行理解：**

- `right` 一直往右走，负责"探索新元素"
- `left` 在必要时往右走，负责"丢掉旧元素"
- `window` 记录当前窗口内的状态
- 每次 `right` 移动一步后，检查是否需要收缩，收缩完再更新答案

核心就三步：**扩展 → 收缩 → 更新**。

---

## 固定窗口 vs 可变窗口

### 固定窗口

窗口大小始终为 k，每次滑动一格。

```python
def max_sum_subarray(nums, k):
    """求长度为 k 的子数组的最大和"""
    # 先算出第一个窗口的和
    window_sum = sum(nums[:k])
    result = window_sum

    # 窗口向右滑动：加入右边新元素，去掉左边旧元素
    for i in range(k, len(nums)):
        window_sum += nums[i]       # 右边进来一个
        window_sum -= nums[i - k]   # 左边出去一个
        result = max(result, window_sum)

    return result
```

固定窗口的题目相对简单，关键是"进一个、出一个"。

### 可变窗口（缩放窗口）

窗口大小不固定，`right` 负责扩展，`left` 负责收缩。这才是面试中滑动窗口题的重点。

可变窗口有两类常见问法：

- **求最长**：窗口尽量大，不满足条件时才收缩 → `while` 收缩
- **求最短**：窗口满足条件后就尝试收缩 → `while` 收缩并更新答案

```python
# 求最长：收缩到合法为止，然后更新答案
while not valid():
    shrink()
result = max(result, right - left + 1)

# 求最短：合法时就更新答案，然后继续收缩
while valid():
    result = min(result, right - left + 1)
    shrink()
```

---

## 经典题目详解

### 最长无重复子串（LC 3）

> 给定一个字符串 s，找出不含重复字符的最长子串的长度。

思路：窗口内不能有重复字符。`right` 加入新字符后，如果发现重复，就收缩 `left` 直到没有重复。

```python
def lengthOfLongestSubstring(s: str) -> int:
    window = set()   # 记录窗口内有哪些字符
    left = 0
    result = 0

    for right in range(len(s)):
        # 如果新字符已经在窗口中，收缩左边界
        while s[right] in window:
            window.remove(s[left])
            left += 1

        # 新字符加入窗口
        window.add(s[right])

        # 此时窗口无重复，更新答案
        result = max(result, right - left + 1)

    return result
```

**复杂度：** 时间 O(n)，空间 O(min(n, 字符集大小))。

**举例：** `s = "abcabcbb"`

| right | 加入 | 窗口 | left | 长度 |
|-------|------|------|------|------|
| 0 | a | {a} | 0 | 1 |
| 1 | b | {a,b} | 0 | 2 |
| 2 | c | {a,b,c} | 0 | 3 |
| 3 | a(重复) | 收缩→{b,c,a} | 1 | 3 |
| 4 | b(重复) | 收缩→{c,a,b} | 2 | 3 |

最终答案 3，对应子串 `"abc"`。

---

### 最小覆盖子串（LC 76）

> 给定字符串 s 和 t，找出 s 中包含 t 所有字符的最短子串。

这道题是滑动窗口的经典难题。核心思路：用两个计数器 `need` 和 `window`，加一个 `valid` 变量记录已满足的字符种类数。

```python
from collections import Counter

def minWindow(s: str, t: str) -> str:
    need = Counter(t)        # t 中每个字符需要的个数
    window = {}              # 窗口中每个字符的个数
    valid = 0                # 已经满足条件的字符种类数
    required = len(need)     # 需要满足的字符种类总数

    left = 0
    start, length = 0, float('inf')  # 记录最短子串的起点和长度

    for right in range(len(s)):
        # ---- 扩展窗口 ----
        c = s[right]
        if c in need:
            window[c] = window.get(c, 0) + 1
            if window[c] == need[c]:  # 这个字符刚好凑够了
                valid += 1

        # ---- 收缩窗口 ----
        # 当所有字符都满足了，尝试收缩左边界找更短的
        while valid == required:
            # 更新答案
            if right - left + 1 < length:
                start = left
                length = right - left + 1

            # 左边界字符移出窗口
            d = s[left]
            if d in need:
                if window[d] == need[d]:  # 移出后就不满足了
                    valid -= 1
                window[d] -= 1
            left += 1

    return "" if length == float('inf') else s[start:start + length]
```

**关键点：**

- `need` 记录"我需要什么"，`window` 记录"我有什么"
- `valid` 追踪有多少种字符已经凑够
- 当 `valid == required` 时，窗口满足条件，开始收缩找最短

---

### 找所有字母异位词（LC 438）

> 给定字符串 s 和 p，找出 s 中所有是 p 的字母异位词的子串起始索引。

思路和 LC 76 类似，只不过窗口大小固定为 `len(p)`。

```python
from collections import Counter

def findAnagrams(s: str, p: str) -> list:
    if len(s) < len(p):
        return []

    need = Counter(p)
    window = {}
    valid = 0
    required = len(need)
    result = []
    left = 0

    for right in range(len(s)):
        # 扩展窗口
        c = s[right]
        if c in need:
            window[c] = window.get(c, 0) + 1
            if window[c] == need[c]:
                valid += 1

        # 当窗口长度达到 p 的长度时，判断并收缩
        if right - left + 1 == len(p):
            if valid == required:
                result.append(left)

            # 左边界移出
            d = s[left]
            if d in need:
                if window[d] == need[d]:
                    valid -= 1
                window[d] -= 1
            left += 1

    return result
```

**注意：** 这里用 `if` 而不是 `while` 来收缩，因为每次只需要移出一个元素（固定窗口大小）。

---

### 长度最小的子数组（LC 209）

> 给定一个正整数数组和一个目标值 target，找出满足和 >= target 的最短子数组长度。

这是"求最短"的典型题。窗口合法（和 >= target）时就收缩并更新答案。

```python
def minSubArrayLen(target: int, nums: list) -> int:
    left = 0
    window_sum = 0
    result = float('inf')

    for right in range(len(nums)):
        window_sum += nums[right]           # 扩展窗口

        while window_sum >= target:         # 满足条件就收缩
            result = min(result, right - left + 1)
            window_sum -= nums[left]
            left += 1

    return result if result != float('inf') else 0
```

---

## 经典题目列表

按难度分组，建议按顺序练习：

**入门（Easy）**

| 题号 | 题目 | 核心考点 |
|------|------|---------|
| 643 | 子数组最大平均数 I | 固定窗口 |
| 1446 | 连续字符 | 最基础的窗口 |

**进阶（Medium）**

| 题号 | 题目 | 核心考点 |
|------|------|---------|
| 3 | 无重复字符的最长子串 | 可变窗口 + 集合 |
| 209 | 长度最小的子数组 | 求最短 + 正整数 |
| 438 | 找到字符串中所有字母异位词 | 固定窗口 + 计数器 |
| 567 | 字符串的排列 | 固定窗口 + 计数器 |
| 1004 | 最大连续1的个数 III | 可变窗口 + 条件转化 |
| 904 | 水果成篮 | 最多两种元素的最长子数组 |

**挑战（Hard）**

| 题号 | 题目 | 核心考点 |
|------|------|---------|
| 76 | 最小覆盖子串 | need/window 双计数器 |
| 239 | 滑动窗口最大值 | 单调队列（进阶数据结构） |

---

## 小结

滑动窗口的核心就是回答三个问题：

1. **何时扩展？** —— `right` 每轮必须右移一步，这是循环本身保证的
2. **何时收缩？** —— 根据题意写出 `while` 的条件（不合法就缩 / 合法就缩）
3. **何时更新答案？** —— 求最长在收缩后更新；求最短在收缩时更新

记住这个口诀：

> **右扩左缩，条件驱动，区间滑动，线性搞定。**

把上面的通用模板背熟，遇到题目只需要替换三个地方：窗口的数据结构、收缩的条件、更新答案的逻辑。多刷几道题，滑动窗口就变成肌肉记忆了。
