---
layout: default
title: 数组与字符串
description: 数组与字符串的基础操作与高频题型
eyebrow: 数据结构 / 01
---

# 数组与字符串

数组和字符串是算法面试中出现频率最高的数据结构。几乎所有其他数据结构和算法都建立在它们之上。扎实掌握数组与字符串的基本操作和常见题型，是刷题之路的第一步。

## 什么是数组

数组是一块**连续的内存空间**，用于存储相同类型（或在 Python 中为任意类型）的元素。

核心特性：

- **O(1) 随机访问**：通过索引直接计算内存地址，瞬间定位元素。
- **O(n) 插入 / 删除**：在中间位置操作时，需要移动后续所有元素。
- **缓存友好**：连续内存布局使 CPU 缓存命中率高，实际性能优于链表。

Python 中的 `list` 本质上是一个**动态数组**：当容量不够时会自动扩容（通常扩为原来的约 1.125 倍），均摊 append 时间复杂度为 O(1)。

| 操作 | 时间复杂度 | 说明 |
|------|-----------|------|
| 按索引访问 `a[i]` | O(1) | 随机访问 |
| 末尾追加 `a.append(x)` | 均摊 O(1) | 可能触发扩容 |
| 中间插入 `a.insert(i, x)` | O(n) | 需要移动元素 |
| 删除元素 `a.pop(i)` | O(n) | `pop()` 末尾删除为 O(1) |
| 查找元素 `x in a` | O(n) | 线性扫描 |
| 切片 `a[i:j]` | O(j-i) | 创建新列表 |

## 数组常用操作

### 遍历

```python
nums = [1, 2, 3, 4, 5]

# 遍历值
for num in nums:
    print(num)

# 同时获取索引和值
for i, num in enumerate(nums):
    print(i, num)
```

### 切片与反转

```python
a = [1, 2, 3, 4, 5]

a[1:4]      # [2, 3, 4]  —— 左闭右开
a[::-1]     # [5, 4, 3, 2, 1]  —— 反转
a[::2]      # [1, 3, 5]  —— 步长为 2
```

### 原地操作 vs 新建数组

面试中经常要求**原地修改**（in-place），即空间复杂度 O(1)，不允许新建等长数组。关键技巧是用**指针 / 索引**标记写入位置。

```python
# 原地移除所有值为 val 的元素，返回新长度
def remove_element(nums: list[int], val: int) -> int:
    slow = 0
    for fast in range(len(nums)):
        if nums[fast] != val:
            nums[slow] = nums[fast]
            slow += 1
    return slow
```

## 字符串基础

Python 字符串是**不可变对象**：任何"修改"操作都会创建新字符串。频繁拼接时应先收集到列表，再用 `join` 合并。

### 常用方法速查

```python
s = "  hello, world  "

s.strip()             # "hello, world"       去除首尾空白
s.split(", ")         # ["hello", "world"]   按分隔符拆分
", ".join(["a","b"])  # "a, b"               用分隔符连接
s.replace("o", "0")   # "  hell0, w0rld  "   替换子串
s.find("world")       # 9                    查找子串位置，未找到返回 -1
```

### 字符串与列表互转

```python
s = "hello"
chars = list(s)        # ['h', 'e', 'l', 'l', 'o']
chars.reverse()        # 原地反转列表
result = "".join(chars) # "olleh"
```

这是面试中处理"原地修改字符串"类题目的标准做法：先转 list，操作完再转回。

## 高频题型与解题模式

### 双指针

双指针是数组 / 字符串题目中最常用的技巧，核心思想是用两个指针协作遍历，将 O(n^2) 降为 O(n)。

#### 对撞指针

两个指针分别从数组两端向中间移动，常用于有序数组或需要考虑区间的场景。

```python
# 模板：对撞指针
def two_pointer(nums):
    left, right = 0, len(nums) - 1
    while left < right:
        # 根据条件移动指针
        if condition(nums[left], nums[right]):
            left += 1
        else:
            right -= 1
```

典型题目：
- **两数之和 II**（有序数组）：和太小则左指针右移，和太大则右指针左移。
- **盛最多水的容器**：每次移动较短的那一边，因为移动较长边不可能得到更大面积。

#### 快慢指针

两个指针同向移动，慢指针标记"已处理"区域的边界，快指针负责扫描。

```python
# 经典题：移动零到末尾（保持非零元素相对顺序）
def move_zeroes(nums: list[int]) -> None:
    slow = 0  # slow 指向下一个非零元素应放的位置
    for fast in range(len(nums)):
        if nums[fast] != 0:
            nums[slow], nums[fast] = nums[fast], nums[slow]
            slow += 1
```

### 滑动窗口

滑动窗口适用于**连续子数组 / 子串**问题。维护一个窗口 `[left, right)`，右端扩张探索、左端收缩维持约束。

```python
# 模板：最长满足条件的子串/子数组
def sliding_window(s):
    left = 0
    window = {}  # 窗口内的状态（如字符计数）
    result = 0

    for right in range(len(s)):
        # 1. 扩张：将 s[right] 加入窗口
        window[s[right]] = window.get(s[right], 0) + 1

        # 2. 收缩：当窗口不满足条件时，移动左端
        while not valid(window):
            window[s[left]] -= 1
            if window[s[left]] == 0:
                del window[s[left]]
            left += 1

        # 3. 更新答案
        result = max(result, right - left + 1)

    return result
```

典型题目：
- **最长无重复子串**：窗口内不允许重复字符，出现重复时收缩左端。
- **最小覆盖子串**：窗口需包含目标所有字符，满足时尝试收缩。

### 前缀和

前缀和将"区间求和"从 O(n) 降为 O(1)，是处理子数组求和问题的利器。

```python
# 构建前缀和数组
nums = [1, 2, 3, 4, 5]
prefix = [0] * (len(nums) + 1)
for i in range(len(nums)):
    prefix[i + 1] = prefix[i] + nums[i]
# prefix = [0, 1, 3, 6, 10, 15]

# 区间 [i, j] 的和 = prefix[j+1] - prefix[i]
# 例：nums[1:4] 的和 = prefix[4] - prefix[1] = 10 - 1 = 9
```

结合哈希表可以解决"和为 k 的子数组个数"等问题：遍历时记录已出现的前缀和，查找 `当前前缀和 - k` 是否存在。

## 经典题目

以下是数组与字符串章节最值得练习的高频题目，按难度分组：

### Easy

| # | 题目 | 核心技巧 |
|---|------|---------|
| 283 | [移动零](https://leetcode.cn/problems/move-zeroes/) | 快慢指针、原地操作 |
| 26 | [删除有序数组中的重复项](https://leetcode.cn/problems/remove-duplicates-from-sorted-array/) | 快慢指针 |
| 88 | [合并两个有序数组](https://leetcode.cn/problems/merge-sorted-array/) | 逆向双指针 |

### Medium

| # | 题目 | 核心技巧 |
|---|------|---------|
| 11 | [盛最多水的容器](https://leetcode.cn/problems/container-with-most-water/) | 对撞指针 |
| 15 | [三数之和](https://leetcode.cn/problems/3sum/) | 排序 + 对撞指针 + 去重 |
| 3 | [无重复字符的最长子串](https://leetcode.cn/problems/longest-substring-without-repeating-characters/) | 滑动窗口 |
| 56 | [合并区间](https://leetcode.cn/problems/merge-intervals/) | 排序 + 贪心 |
| 238 | [除自身以外数组的乘积](https://leetcode.cn/problems/product-of-array-except-self/) | 前缀积 + 后缀积 |

### Hard

| # | 题目 | 核心技巧 |
|---|------|---------|
| 42 | [接雨水](https://leetcode.cn/problems/trapping-rain-water/) | 对撞指针 / 单调栈 |

建议按 Easy -> Medium -> Hard 的顺序练习。每道题先独立思考 15 分钟，想不出来再看提示。

## 小结

- **数组**的核心优势是 O(1) 随机访问；面试中重点考察原地操作能力。
- **字符串**在 Python 中不可变，修改时先转 list 再转回是常见套路。
- **双指针**是数组题的第一解题直觉：对撞指针处理有序/区间问题，快慢指针处理原地操作。
- **滑动窗口**专攻连续子数组/子串的最优值问题，掌握"扩张-收缩"模板即可覆盖大部分变体。
- **前缀和**将区间求和降为 O(1)，配合哈希表可以解决更复杂的子数组求和问题。

熟练掌握以上模式后，数组与字符串类题目的解题速度会有质的提升。
