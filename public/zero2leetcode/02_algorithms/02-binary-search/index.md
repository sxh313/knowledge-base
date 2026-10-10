---
layout: default
title: 二分查找
description: 有序数组中排除一半的核心模板
eyebrow: 核心算法 / 02
---

# 二分查找

## 什么是二分查找

二分查找是一种在**有序数组**中高效定位目标值的算法。想象你在字典里查单词——先翻到中间，看看目标在前半还是后半，然后继续对半翻，这就是二分查找。

- **前提条件：** 数据必须有序（本文以升序为例）
- **核心思想：** 每次比较中间元素，排除一半搜索范围
- **时间复杂度：** O(log n)。n = 100 万时只需约 20 次比较，远胜线性查找的 O(n)
- **空间复杂度：** O(1)

---

## 基础模板：标准二分查找

目标：在升序数组 `nums` 中查找 `target`，找到返回下标，找不到返回 -1。

```python
def binary_search(nums, target):
    left, right = 0, len(nums) - 1  # 搜索区间 [left, right]

    while left <= right:             # 区间不为空就继续
        mid = left + (right - left) // 2  # 防溢出的写法
        if nums[mid] == target:
            return mid               # 找到了
        elif nums[mid] < target:
            left = mid + 1           # target 在右半部分
        else:
            right = mid - 1          # target 在左半部分

    return -1  # 搜索区间为空，未找到
```

**图解思路（以 nums = [1, 3, 5, 7, 9, 11], target = 7 为例）：**

```
第 1 轮: left=0, right=5, mid=2 → nums[2]=5 < 7 → left=3
第 2 轮: left=3, right=5, mid=4 → nums[4]=9 > 7 → right=3
第 3 轮: left=3, right=3, mid=3 → nums[3]=7 = 7 → 返回 3
```

**为什么循环条件是 `left <= right`？**

我们定义的搜索区间是**闭区间** `[left, right]`。当 `left == right` 时，区间里还有一个元素没检查，所以要用 `<=`。当 `left > right` 时，区间为空，搜索结束。

---

## 常见变体

### 变体一：查找左边界（第一个 >= target 的位置）

也叫 `lower_bound`。返回第一个大于等于 target 的下标，若不存在返回 `len(nums)`。

```python
def lower_bound(nums, target):
    left, right = 0, len(nums)  # 注意：right = len(nums)
    while left < right:          # 注意：< 不是 <=
        mid = left + (right - left) // 2
        if nums[mid] < target:
            left = mid + 1       # mid 太小，不可能是答案
        else:
            right = mid          # mid 可能是答案，保留

    return left  # left == right，即为答案位置
```

**什么时候用？** 需要找"第一个满足某条件的位置"时，比如：插入位置（LC 35）、第一个等于 target 的位置等。

### 变体二：查找右边界（最后一个 <= target 的位置）

也叫 `upper_bound - 1`。返回最后一个小于等于 target 的下标，若不存在返回 -1。

```python
def upper_bound_minus_1(nums, target):
    left, right = 0, len(nums)
    while left < right:
        mid = left + (right - left) // 2
        if nums[mid] <= target:
            left = mid + 1       # mid 满足条件，但右边可能还有
        else:
            right = mid          # mid 太大了

    return left - 1  # left - 1 就是最后一个 <= target 的位置
```

### 变体三：查找第一个等于 target / 最后一个等于 target

这是 LC 34「在排序数组中查找元素的第一个和最后一个位置」的完整解法。

```python
def search_range(nums, target):
    """LC 34: 返回 [起始位置, 结束位置]，不存在返回 [-1, -1]"""
    def find_first(nums, target):
        left, right, result = 0, len(nums) - 1, -1
        while left <= right:
            mid = left + (right - left) // 2
            if nums[mid] == target:
                result = mid; right = mid - 1   # 记录并继续往左找
            elif nums[mid] < target:
                left = mid + 1
            else:
                right = mid - 1
        return result

    def find_last(nums, target):
        left, right, result = 0, len(nums) - 1, -1
        while left <= right:
            mid = left + (right - left) // 2
            if nums[mid] == target:
                result = mid; left = mid + 1    # 记录并继续往右找
            elif nums[mid] < target:
                left = mid + 1
            else:
                right = mid - 1
        return result

    return [find_first(nums, target), find_last(nums, target)]

# 调用示例
print(search_range([5, 7, 7, 8, 8, 10], 8))  # 输出 [3, 4]
print(search_range([5, 7, 7, 8, 8, 10], 6))  # 输出 [-1, -1]
```

---

## 二分答案

### 什么是"二分答案"

有一类优化问题问的是"最小化最大值"或"最大化最小值"。直接求最优解很难，但**猜一个答案再验证是否可行**却很容易。对答案范围做二分，就把优化问题转化为了判定问题。

**套路：**
1. 确定答案的上下界 `[lo, hi]`
2. 二分猜一个答案 `mid`
3. 写一个 `check(mid)` 函数判断该答案是否可行
4. 根据 check 结果收缩范围

### 例子一：LC 410 分割数组的最大值

将数组分成 k 个子数组，使子数组和的最大值最小。

```python
def split_array(nums, k):
    def can_split(max_sum):
        """判断：子数组和不超过 max_sum 的前提下，能否分成 <= k 段"""
        count = 1          # 当前段数
        current_sum = 0
        for num in nums:
            if current_sum + num > max_sum:
                count += 1
                current_sum = num
                if count > k:
                    return False
            else:
                current_sum += num
        return True

    lo, hi = max(nums), sum(nums)  # 答案范围：单个最大元素 ~ 整个数组之和
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if can_split(mid):
            hi = mid       # mid 可行，尝试更小的答案
        else:
            lo = mid + 1   # mid 不可行，答案需要更大
    return lo
```

### 例子二：LC 1011 在 D 天内送达包裹

思路与上题几乎一样：对运载能力做二分，check 函数计算在该运载能力下需要多少天。

```python
def ship_within_days(weights, days):
    def can_ship(capacity):
        """判断：运载能力为 capacity 时，能否在 days 天内送完"""
        day_count = 1
        current_load = 0
        for w in weights:
            if current_load + w > capacity:
                day_count += 1
                current_load = w
            else:
                current_load += w
        return day_count <= days

    lo, hi = max(weights), sum(weights)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if can_ship(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo
```

---

## 旋转数组中的二分

旋转数组是把有序数组从某个点截断、前后交换拼接，例如 `[4, 5, 6, 7, 0, 1, 2]`。虽然不完全有序，但**至少有一半是有序的**，这就给了我们二分的抓手。

### LC 33 搜索旋转排序数组

**关键思路：** 每次取 mid 后，`[left, mid]` 和 `[mid, right]` 至少有一段有序。先判断哪段有序，再判断 target 是否在其中。

```python
def search_rotated(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if nums[mid] == target:
            return mid
        if nums[left] <= nums[mid]:  # 左半段有序
            if nums[left] <= target < nums[mid]:
                right = mid - 1  # target 在左半段
            else:
                left = mid + 1
        else:                        # 右半段有序
            if nums[mid] < target <= nums[right]:
                left = mid + 1   # target 在右半段
            else:
                right = mid - 1
    return -1
```

### LC 153 寻找旋转排序数组中的最小值

**思路：** 比较 `nums[mid]` 和 `nums[right]`。若 `nums[mid] > nums[right]`，断崖在右半边，最小值在 mid 右侧；否则最小值在 mid 或其左侧。

```python
def find_min(nums):
    left, right = 0, len(nums) - 1
    while left < right:
        mid = left + (right - left) // 2
        if nums[mid] > nums[right]:
            left = mid + 1     # 最小值一定在 mid 右边
        else:
            right = mid        # 最小值可能是 mid 本身

    return nums[left]
```

---

## 经典题目

**入门**
- LC 704 二分查找（标准模板直接用）
- LC 35 搜索插入位置（lower_bound 的直接应用）
- LC 69 x 的平方根（二分答案入门）

**基础**
- LC 34 在排序数组中查找元素的第一个和最后一个位置（左右边界）
- LC 162 寻找峰值（非有序数组的二分）
- LC 74 搜索二维矩阵（把二维展平成一维）

**进阶**
- LC 33 搜索旋转排序数组（旋转数组经典题）
- LC 153 寻找旋转排序数组中的最小值（旋转 + 最小值）
- LC 410 分割数组的最大值（二分答案）
- LC 1011 在 D 天内送达包裹的能力（二分答案）

---

## 小结

二分查找看起来简单，写对却不容易。抓住三个关键：

1. **搜索区间定义** —— 你用的是闭区间 `[left, right]` 还是左闭右开 `[left, right)`？这决定了初始值和循环条件。
2. **循环条件** —— 闭区间用 `left <= right`，左闭右开用 `left < right`。本质是"区间不为空就继续"。
3. **收缩逻辑** —— `left = mid + 1` 还是 `left = mid`？`right = mid - 1` 还是 `right = mid`？取决于 mid 是否可能是答案。

**一句话记忆：** 定义好区间，写对循环，想清楚 mid 留不留。
