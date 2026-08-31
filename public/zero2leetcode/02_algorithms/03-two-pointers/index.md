---
layout: default
title: 双指针
description: 对撞指针与快慢指针两种经典模式
eyebrow: 核心算法 / 03
---

# 双指针

## 什么是双指针

双指针是一种用**两个指针（索引）协同扫描**数据结构的技巧。与暴力双重循环 O(n^2) 相比，双指针往往能在 O(n) 内完成任务。

常见的三种类型：

| 类型 | 指针方向 | 典型场景 |
|------|---------|---------|
| 对撞指针 | 两端向中间 | 有序数组搜索、回文判断 |
| 快慢指针 | 同向不同速 | 链表环检测、找中点 |
| 同向双指针 | 同向同速/不同速 | 原地去重、移动元素 |

核心思路只有一句话：**利用有序性或单调性，让两个指针各走一遍，就能覆盖所有需要考虑的情况。**

---

## 对撞指针（相向双指针）

### 原理

`left` 从数组最左边出发，`right` 从最右边出发，两者向中间靠拢。每一步根据当前状态决定移动哪一侧。

```
[1, 2, 3, 4, 5, 6, 7]
 ^                 ^
 left             right
```

适用前提：数组有序，或问题本身具有某种单调性——移动某一端一定能让结果变大或变小。

### 两数之和 II（LC 167）

> 给定一个**升序**数组 numbers 和一个目标值 target，找到两个数使它们之和等于 target。

因为数组有序：
- `numbers[left] + numbers[right] > target` 时，和太大，`right -= 1`
- `numbers[left] + numbers[right] < target` 时，和太小，`left += 1`
- 相等就找到了

```python
def twoSum(numbers, target):
    left, right = 0, len(numbers) - 1

    while left < right:
        curr_sum = numbers[left] + numbers[right]

        if curr_sum == target:
            # 题目要求下标从 1 开始
            return [left + 1, right + 1]
        elif curr_sum < target:
            left += 1   # 和太小，左指针右移让和变大
        else:
            right -= 1  # 和太大，右指针左移让和变小

    return []  # 题目保证有解，这里只是保底
```

时间 O(n)，空间 O(1)。

### 盛最多水的容器（LC 11）

> 给定数组 height，选两条线与 x 轴围成容器，求最大面积。

面积 = `min(height[left], height[right]) * (right - left)`。

**为什么移动短板？** 如果移动高板，宽度减少 1，而高度受限于短板不会变高，面积一定变小。移动短板，虽然宽度减少，但高度有机会变高，面积才可能更大。

```python
def maxArea(height):
    left, right = 0, len(height) - 1
    max_water = 0

    while left < right:
        # 计算当前面积
        w = right - left
        h = min(height[left], height[right])
        max_water = max(max_water, w * h)

        # 移动较矮的那一端
        if height[left] < height[right]:
            left += 1
        else:
            right -= 1

    return max_water
```

时间 O(n)，空间 O(1)。

### 三数之和（LC 15）

> 找出数组中所有和为 0 的三元组，结果不能重复。

思路：**排序 + 固定一个数 + 对撞双指针找另外两个数**。去重是难点。

```python
def threeSum(nums):
    nums.sort()  # 排序是双指针的前提
    result = []

    for i in range(len(nums) - 2):
        # 去重：跳过和前一个相同的数
        if i > 0 and nums[i] == nums[i - 1]:
            continue

        # 小优化：最小的三个数之和 > 0，后面不可能有解
        if nums[i] + nums[i + 1] + nums[i + 2] > 0:
            break
        # 小优化：当前数加最大两个数 < 0，当前 i 无解，跳过
        if nums[i] + nums[-2] + nums[-1] < 0:
            continue

        left, right = i + 1, len(nums) - 1
        target = -nums[i]

        while left < right:
            s = nums[left] + nums[right]
            if s == target:
                result.append([nums[i], nums[left], nums[right]])
                left += 1
                right -= 1
                # 去重：跳过重复的 left 和 right
                while left < right and nums[left] == nums[left - 1]:
                    left += 1
                while left < right and nums[right] == nums[right + 1]:
                    right -= 1
            elif s < target:
                left += 1
            else:
                right -= 1

    return result
```

时间 O(n^2)，空间 O(1)（不计输出）。

---

## 快慢指针

### 原理

两个指针从同一起点出发，`fast` 每次走两步，`slow` 每次走一步。主要用于链表问题。

### 判断链表是否有环（LC 141）

**Floyd 判圈算法**：想象两个人在环形跑道上跑步，一个快一个慢，如果有环，快的人一定会从后面追上慢的人。如果没有环，快指针会先到达终点（None）。

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def hasCycle(head):
    slow = head
    fast = head

    while fast and fast.next:
        slow = slow.next        # 慢指针走一步
        fast = fast.next.next   # 快指针走两步

        if slow == fast:        # 相遇说明有环
            return True

    return False  # fast 到达末尾，无环
```

时间 O(n)，空间 O(1)。

**为什么一定会相遇？** 当 slow 进入环后，fast 和 slow 每轮的距离差缩小 1，所以一定会相遇，不会错过。

### 找链表中点（LC 876）

当 fast 到达末尾时，slow 恰好在中间。对于偶数长度链表，slow 停在靠后的中点。

```python
def middleNode(head):
    slow = head
    fast = head

    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next

    return slow  # slow 就是中间节点
```

时间 O(n)，空间 O(1)。

这个技巧在归并排序链表、判断回文链表中非常常用。

---

## 同向双指针（滑动窗口预备）

两个指针同向移动，一个负责"探索"，一个负责"记录"。这是滑动窗口的基础。

### 移动零（LC 283）

> 把数组中所有 0 移到末尾，保持非零元素相对顺序。

思路：`slow` 指向下一个非零元素应该放的位置，`fast` 负责遍历。

```python
def moveZeroes(nums):
    slow = 0  # slow 左边的元素都是已处理好的非零数

    for fast in range(len(nums)):
        if nums[fast] != 0:
            # 把非零数换到 slow 的位置
            nums[slow], nums[fast] = nums[fast], nums[slow]
            slow += 1

    # 不需要额外处理，swap 已经把 0 换到后面了
```

时间 O(n)，空间 O(1)。

### 删除有序数组重复项（LC 26）

> 原地删除有序数组中的重复元素，返回新长度。

`slow` 指向最后一个不重复元素，`fast` 去找下一个不同的值。

```python
def removeDuplicates(nums):
    if not nums:
        return 0

    slow = 0  # slow 指向当前最后一个不重复的位置

    for fast in range(1, len(nums)):
        if nums[fast] != nums[slow]:
            slow += 1
            nums[slow] = nums[fast]  # 把新值放到 slow 的下一个位置

    return slow + 1  # 新数组长度
```

时间 O(n)，空间 O(1)。

---

## 经典题目

按难度分组，建议从上到下刷：

### 入门

| 题号 | 题目 | 核心技巧 |
|------|------|---------|
| LC 344 | 反转字符串 | 对撞指针，左右交换 |
| LC 283 | 移动零 | 同向双指针 |
| LC 26 | 删除有序数组重复项 | 同向双指针 |

### 基础

| 题号 | 题目 | 核心技巧 |
|------|------|---------|
| LC 167 | 两数之和 II | 对撞指针 |
| LC 141 | 环形链表 | 快慢指针 |
| LC 876 | 链表的中间结点 | 快慢指针 |
| LC 125 | 验证回文串 | 对撞指针，跳过非字母数字字符 |

### 进阶

| 题号 | 题目 | 核心技巧 |
|------|------|---------|
| LC 11 | 盛最多水的容器 | 对撞指针 + 贪心 |
| LC 15 | 三数之和 | 排序 + 对撞指针 + 去重 |
| LC 142 | 环形链表 II（找入环点） | 快慢指针 + 数学推导 |

---

## 小结

1. **对撞指针**：左右夹逼，适合有序数组。核心是判断"移动哪一端能接近目标"。
2. **快慢指针**：用速度差检测环或找中点。记住 Floyd 判圈法。
3. **同向双指针**：一个探索一个记录，是滑动窗口的基础。

双指针的本质是**利用有序性或单调性来减少搜索空间**——每移动一步都能排除一批不可能的答案，从而把 O(n^2) 降到 O(n)。

掌握这三种模式后，遇到新题时先问自己：
- 数组有序吗？考虑对撞指针。
- 涉及链表环或中点？考虑快慢指针。
- 需要原地处理数组？考虑同向双指针。
