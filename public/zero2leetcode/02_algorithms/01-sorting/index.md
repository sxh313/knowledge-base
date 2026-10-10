---
layout: default
title: 排序算法
description: 快排、归并排序、堆排序的复杂度对比
eyebrow: 核心算法 / 01
---

# 排序算法

## 为什么要学排序

1. **很多算法的前提都是有序数据**。比如二分查找要求数组有序；很多贪心策略需要先按某个维度排序再处理。
2. **面试高频考点**。面试官经常问：快排和归并的区别是什么？哪些排序是稳定的？时间复杂度各是多少？
3. **锻炼算法思维**。排序算法涵盖了暴力枚举、分治、递归等核心思想，是训练算法直觉的绝佳入口。

对于刷题来说，你不需要手写每一种排序，但**必须理解原理和复杂度**，尤其是归并排序和快速排序。

---

## 常见排序算法对比

| 算法 | 平均时间复杂度 | 最坏时间复杂度 | 空间复杂度 | 是否稳定 |
|------|--------------|--------------|-----------|---------|
| 冒泡排序 | O(n²) | O(n²) | O(1) | 稳定 |
| 选择排序 | O(n²) | O(n²) | O(1) | 不稳定 |
| 插入排序 | O(n²) | O(n²) | O(1) | 稳定 |
| 归并排序 | O(n log n) | O(n log n) | O(n) | 稳定 |
| 快速排序 | O(n log n) | O(n²) | O(log n) | 不稳定 |
| 堆排序 | O(n log n) | O(n log n) | O(1) | 不稳定 |
| Python sorted/sort | O(n log n) | O(n log n) | O(n) | 稳定 |

**怎么记？** 简单排序（冒泡、选择、插入）都是 O(n²)；高级排序（归并、快排、堆排）都是 O(n log n)。稳定性记住"快选堆不稳定"。

---

## 冒泡排序

**相邻两个元素比较，如果前面比后面大就交换**。每一轮遍历后，最大的元素会像气泡一样"浮"到数组末尾。

以 `[5, 3, 8, 1]` 为例，第一轮：比较 5 和 3 → 交换；比较 5 和 8 → 不换；比较 8 和 1 → 交换。结果 `[3, 5, 1, 8]`，最大值 8 已到末尾。接下来对前面部分重复。

```python
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        swapped = False  # 优化：如果某轮没发生交换，说明已经有序
        for j in range(n - 1 - i):  # 每轮结束后末尾已排好，不用再比
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        if not swapped:
            break  # 提前退出
    return arr
```

- 时间 O(n²)，最好情况（已有序）O(n)；空间 O(1)；**稳定**。

---

## 选择排序

每一轮从未排序部分中**找到最小值**，然后放到已排序部分的末尾。

以 `[5, 3, 8, 1]` 为例：第一轮找到最小值 1，和下标 0 交换 → `[1, 3, 8, 5]`；第二轮 3 已在正确位置；第三轮 5 和 8 交换 → `[1, 3, 5, 8]`。

```python
def selection_sort(arr):
    n = len(arr)
    for i in range(n):
        min_idx = i  # 假设当前位置就是最小值
        for j in range(i + 1, n):
            if arr[j] < arr[min_idx]:
                min_idx = j  # 记录真正最小值的下标
        arr[i], arr[min_idx] = arr[min_idx], arr[i]  # 把最小值放到前面
    return arr
```

- 时间 O(n²)，无论数据是否有序都一样；空间 O(1)；**不稳定**。

---

## 插入排序

类似**打扑克牌时整理手牌**：手里已有排好的牌，每摸到一张新牌，从右往左找到合适的位置插进去。

以 `[5, 3, 8, 1]` 为例：取出 3，插到 5 前面；取出 8，位置不变；取出 1，一路往前，插到最前面 → `[1, 3, 5, 8]`。

```python
def insertion_sort(arr):
    for i in range(1, len(arr)):
        key = arr[i]  # 当前要插入的"新牌"
        j = i - 1
        # 从右往左，把比 key 大的元素都往后挪一位
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key  # 找到位置，插入
    return arr
```

- 时间 O(n²)，最好情况（已有序）O(n)；空间 O(1)；**稳定**。
- 小技巧：数据量很小或基本有序时，插入排序性能反而比快排好。Python 内置的 Timsort 就在小段数据上使用插入排序。

---

## 归并排序（重点）

归并排序是**分治思想**的经典应用，核心三步：**分 → 排 → 合**。

1. **分**：把数组从中间一分为二，递归地对左右两半分别排序。
2. **排**：递归到只剩一个元素时，天然有序，开始返回。
3. **合**：把两个已排好序的子数组合并成一个有序数组——就像两堆已排好的扑克牌，每次比较牌顶，取较小的放到新堆里。

```
[5, 3, 8, 1]
     ↓ 分
[5, 3]   [8, 1]
  ↓ 分      ↓ 分
[5] [3]  [8] [1]
  ↓ 合      ↓ 合
[3, 5]   [1, 8]
     ↓ 合
[1, 3, 5, 8]
```

```python
def merge_sort(arr):
    if len(arr) <= 1:
        return arr  # 递归终止：只有一个元素，天然有序

    mid = len(arr) // 2
    left = merge_sort(arr[:mid])   # 递归排序左半部分
    right = merge_sort(arr[mid:])  # 递归排序右半部分
    return merge(left, right)

def merge(left, right):
    """合并两个有序数组"""
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:  # <= 保证稳定性
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    # 把剩余的元素加上（只有一边会有剩余）
    result.extend(left[i:])
    result.extend(right[j:])
    return result
```

- **时间 O(n log n)**：每层合并 O(n)，共 log n 层，最好最坏都一样。
- **空间 O(n)**：合并时需要额外数组。
- **稳定排序**：合并时相等元素取左边的，保持原有顺序。

**面试点拨**：归并排序是唯一保证 O(n log n) 且稳定的比较排序。链表排序（LC 148）首选归并，因为链表合并不需要额外空间。

---

## 快速排序（重点）

快速排序也是分治法，但思路和归并不同：

1. **选基准（Pivot）**：从数组中选一个元素作为基准。
2. **分区（Partition）**：比 pivot 小的放左边，比 pivot 大的放右边。
3. **递归**：对左右两部分分别递归快排。

归并是"先分后合"，快排是"先分区后递归"，分区过程本身就在排序，所以不需要合并步骤。

简洁写法（易理解但有额外空间开销）：

```python
def quick_sort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]  # 选中间元素作为基准
    left = [x for x in arr if x < pivot]    # 比基准小的
    middle = [x for x in arr if x == pivot]  # 等于基准的
    right = [x for x in arr if x > pivot]   # 比基准大的
    return quick_sort(left) + middle + quick_sort(right)
```

面试中更常考**原地分区**写法：

```python
def quick_sort_inplace(arr, low, high):
    if low < high:
        pivot_idx = partition(arr, low, high)
        quick_sort_inplace(arr, low, pivot_idx - 1)
        quick_sort_inplace(arr, pivot_idx + 1, high)

def partition(arr, low, high):
    """以最右元素为基准，把小于基准的移到左边"""
    pivot = arr[high]
    i = low  # i 指向下一个该放"小元素"的位置
    for j in range(low, high):
        if arr[j] < pivot:
            arr[i], arr[j] = arr[j], arr[i]
            i += 1
    arr[i], arr[high] = arr[high], arr[i]  # 把 pivot 放到正确位置
    return i

# 用法：quick_sort_inplace(arr, 0, len(arr) - 1)
```

- **平均时间 O(n log n)**，最坏 O(n²)（数组已有序且每次选到极端 pivot，可通过随机选 pivot 避免）。
- **空间 O(log n)**：递归调用栈开销。
- **不稳定**：分区过程中交换可能打乱相对顺序。

**面试点拨**：快排在工程中最常用，常数因子小、缓存友好。LC 215（第 K 大元素）可以用快排分区思想（Quick Select）在平均 O(n) 时间内解决。

---

## Python 内置排序

实际刷题中，90% 的场景直接用 Python 内置排序就够了。

**sorted() 和 list.sort() 的区别**：

```python
# sorted() —— 返回新列表，不改变原列表
nums = [3, 1, 4, 1, 5]
new_list = sorted(nums)  # new_list = [1, 1, 3, 4, 5]，nums 不变

# list.sort() —— 原地排序，返回 None
nums.sort()  # nums 变为 [1, 1, 3, 4, 5]
```

`sorted()` 可以用于任何可迭代对象（列表、元组、字符串等），返回新列表；`list.sort()` 只能用于列表，原地修改，更省内存。

**key 参数用法**——自定义排序规则，传入函数，按返回值比较：

```python
# 按绝对值排序
sorted([-3, 1, -2, 4], key=abs)  # [1, -2, -3, 4]

# 按字符串长度排序
sorted(["banana", "apple", "fig"], key=len)  # ["fig", "apple", "banana"]

# 按元组的第二个元素排序（面试常用！）
intervals = [(1, 3), (2, 1), (3, 2)]
sorted(intervals, key=lambda x: x[1])  # [(2, 1), (3, 2), (1, 3)]

# 多条件排序：先按第一个元素升序，再按第二个元素降序
sorted(intervals, key=lambda x: (x[0], -x[1]))
```

**Timsort 简介**：Python 底层使用 Timsort 算法（Tim Peters，2002），它是归并排序和插入排序的混合体。先把数组分成天然有序的小段（run），对每段用插入排序整理，再用归并方式逐步合并。由于现实数据往往部分有序，Timsort 最好情况可达 O(n)。复杂度：时间 O(n log n)，空间 O(n)，稳定排序。

---

## 经典题目

以下是排序相关的高频面试题，建议按顺序练习：

| 题号 | 题目 | 考查重点 |
|------|------|---------|
| LC 912 | 排序数组 | 手写快排/归并，练习排序模板 |
| LC 56 | 合并区间 | 按左端点排序后贪心合并，`key=lambda` 的典型应用 |
| LC 148 | 排序链表 | 链表上的归并排序，练习链表操作 + 分治 |
| LC 215 | 数组中的第 K 个最大元素 | 快速选择（Quick Select），快排分区的变形 |
| LC 75 | 颜色分类 | 荷兰国旗问题，三路分区，一次遍历 O(n) |

**LC 912** 是最好的练习起点：用它来手写归并和快排，确保模板能 AC。

**LC 215** 是面试超高频题，除了排序 O(n log n)，还可以用 Quick Select 优化到平均 O(n)——本质就是快排分区，每次只递归一边。

**LC 75** 是荷兰国旗问题：用三个指针（low、mid、high）把数组分成 0、1、2 三个区域，一次遍历完成，思路和快排分区相通。

---

## 小结

1. **基础排序**（冒泡、选择、插入）时间复杂度 O(n²)，面试中需要理解原理，但很少要求手写。
2. **归并排序**和**快速排序**是重中之重，必须能手写。归并稳定且时间始终 O(n log n)；快排平均最快但最坏 O(n²)。
3. **实际刷题**直接用 `sorted()` / `list.sort()`，重点掌握 `key` 参数的灵活运用。
4. 排序不是孤立的知识点——**二分查找、贪心、分治**等进阶主题都以排序为基础。
5. 记住口诀：**"快选堆不稳定"**，其余常见排序都是稳定的。
