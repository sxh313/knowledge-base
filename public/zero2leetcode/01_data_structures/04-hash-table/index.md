---
layout: default
title: 哈希表
description: Counter、defaultdict 与 O(1) 查找
eyebrow: 数据结构 / 04
---

# 哈希表

## 什么是哈希表

哈希表（Hash Table）是一种通过**哈希函数**将键（key）映射到存储位置的数据结构，从而实现近乎 O(1) 的查找、插入和删除操作。它是算法面试中出现频率最高的数据结构之一。

### 核心原理

1. **哈希函数**：将任意键转换为数组下标。理想的哈希函数应当分布均匀、计算高效。
2. **哈希冲突**：不同的键可能映射到同一下标，必须有冲突处理策略。

常见的冲突解决方式：

| 方法 | 思路 | 优缺点 |
|------|------|--------|
| **链地址法（Chaining）** | 每个槽位维护一个链表，冲突元素追加到链表 | 实现简单；极端情况退化为 O(n) |
| **开放寻址法（Open Addressing）** | 冲突时按探测序列寻找下一个空槽 | 缓存友好；装载因子高时性能下降 |

> Python 的 `dict` 内部采用开放寻址法。

### 时间复杂度

| 操作 | 平均 | 最坏 |
|------|------|------|
| 查找 | O(1) | O(n) |
| 插入 | O(1) | O(n) |
| 删除 | O(1) | O(n) |

最坏情况出现在所有键发生冲突时，但在合理的哈希函数下几乎不会发生。

---

## Python 中的哈希表

Python 提供了多种基于哈希的内置类型，面试中最常用的有四个：`dict`、`Counter`、`defaultdict` 和 `set`。

### dict

`dict` 是 Python 最基础的哈希表实现。

```python
d = {"apple": 3, "banana": 5}
d["cherry"] = 7           # 增
d["apple"] = 10           # 改（覆盖旧值）
val = d.get("grape", 0)   # 查，不存在返回默认值
del d["banana"]           # 删
val = d.pop("cherry", None)
if "apple" in d:          # 判断键是否存在
    print(d["apple"])
```

**遍历与推导式：**

```python
for k, v in d.items():    # 遍历键值对；也可用 .keys()、.values()
    print(k, v)

squared = {x: x ** 2 for x in [1, 2, 3, 4]}
# {1: 1, 2: 4, 3: 9, 4: 16}
```

### collections.Counter

`Counter` 专门用于计数，是 `dict` 的子类。

```python
from collections import Counter

cnt = Counter(["apple", "banana", "apple", "cherry", "banana", "apple"])
# Counter({'apple': 3, 'banana': 2, 'cherry': 1})

cnt["grape"]               # 不存在返回 0，不抛异常
cnt.most_common(2)         # [('apple', 3), ('banana', 2)]

freq = Counter("abracadabra")  # 字符频率统计
# Counter({'a': 5, 'b': 2, 'r': 2, 'c': 1, 'd': 1})
```

### collections.defaultdict

`defaultdict` 在访问不存在的键时自动创建默认值，避免 `KeyError`。

```python
from collections import defaultdict

# defaultdict(int)：默认值 0，适合计数
counter = defaultdict(int)
for ch in "hello":
    counter[ch] += 1  # {'h': 1, 'e': 1, 'l': 2, 'o': 1}

# defaultdict(list)：默认值空列表，适合分组
groups = defaultdict(list)
for category, item in [("fruit", "apple"), ("fruit", "banana"), ("veggie", "carrot")]:
    groups[category].append(item)

# defaultdict(set)：去重分组，常用于建图
graph = defaultdict(set)
for u, v in [(1, 2), (1, 3), (2, 3)]:
    graph[u].add(v)
    graph[v].add(u)
```

### set

`set` 是基于哈希表的无序集合，元素唯一，支持 O(1) 成员检查。

```python
s = set([1, 2, 2, 3])     # 自动去重 -> {1, 2, 3}
s.add(4)
s.discard(2)               # 不存在也不报错
if 3 in s:                 # O(1) 成员检查
    print("found")

a, b = {1, 2, 3, 4}, {3, 4, 5, 6}
a & b   # 交集 {3, 4}
a | b   # 并集 {1, 2, 3, 4, 5, 6}
a - b   # 差集 {1, 2}
a ^ b   # 对称差集 {1, 2, 5, 6}
```

> **面试提示**：当题目要求"判断是否存在"或"去重"时，优先考虑 `set`。

---

## 高频题型与解题模式

### 两数之和模式

**核心思路**：遍历数组时，用哈希表记录已见过的元素及其下标。对于当前元素 `num`，检查 `target - num` 是否在哈希表中。

```python
def two_sum(nums: list[int], target: int) -> list[int]:
    seen = {}  # val -> index
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []
```

时间 O(n)，空间 O(n)。这个"边遍历边查表"的模式非常通用，可以推广到 k 数之和、配对问题等。

### 计数问题

**字母异位词分组（LC 49）**：将每个单词排序后作为键，值为该键对应的所有原始单词。

```python
def group_anagrams(strs: list[str]) -> list[list[str]]:
    groups = defaultdict(list)
    for s in strs:
        key = tuple(sorted(s))
        groups[key].append(s)
    return list(groups.values())
```

**前缀和 + 哈希表（LC 560 和为 K 的子数组）**：维护前缀和的计数哈希表。子数组 `nums[i..j]` 的和等于 `prefix[j+1] - prefix[i]`，因此对于每个前缀和，查找 `prefix_sum - k` 出现的次数。

```python
def subarray_sum(nums: list[int], k: int) -> int:
    count = 0
    prefix_sum = 0
    prefix_count = defaultdict(int)
    prefix_count[0] = 1  # 空前缀
    for num in nums:
        prefix_sum += num
        count += prefix_count[prefix_sum - k]
        prefix_count[prefix_sum] += 1
    return count
```

### 滑动窗口 + 哈希表

**找所有字母异位词（LC 438）**：维护一个固定大小的窗口，用 `Counter` 统计窗口内字符频率，与目标频率比较。

```python
def find_anagrams(s: str, p: str) -> list[int]:
    if len(s) < len(p):
        return []
    p_count = Counter(p)
    s_count = Counter(s[:len(p)])
    result = []
    if s_count == p_count:
        result.append(0)
    for i in range(len(p), len(s)):
        # 右端加入
        s_count[s[i]] += 1
        # 左端移出
        left = s[i - len(p)]
        s_count[left] -= 1
        if s_count[left] == 0:
            del s_count[left]
        if s_count == p_count:
            result.append(i - len(p) + 1)
    return result
```

---

## 经典题目

按难度分组的高频哈希表题目：

### Easy

| # | 题目 | 关键思路 |
|---|------|----------|
| 1 | [两数之和](https://leetcode.cn/problems/two-sum/) | 哈希表存已遍历元素 |
| 217 | [存在重复元素](https://leetcode.cn/problems/contains-duplicate/) | set 判重 |
| 242 | [有效的字母异位词](https://leetcode.cn/problems/valid-anagram/) | Counter 比较频率 |

### Medium

| # | 题目 | 关键思路 |
|---|------|----------|
| 49 | [字母异位词分组](https://leetcode.cn/problems/group-anagrams/) | 排序后作键，defaultdict 分组 |
| 128 | [最长连续序列](https://leetcode.cn/problems/longest-consecutive-sequence/) | set + 只从序列起点开始计数 |
| 347 | [前 K 个高频元素](https://leetcode.cn/problems/top-k-frequent-elements/) | Counter.most_common 或桶排序 |
| 438 | [找到字符串中所有字母异位词](https://leetcode.cn/problems/find-all-anagrams-in-a-string/) | 滑动窗口 + Counter |
| 560 | [和为 K 的子数组](https://leetcode.cn/problems/subarray-sum-equals-k/) | 前缀和 + 哈希表计数 |

---

## 小结

| 要点 | 说明 |
|------|------|
| **O(1) 查找** | 哈希表的核心优势，将暴力 O(n) 查找降为 O(1) |
| **空间换时间** | 几乎所有哈希表解法都是用额外空间换取时间复杂度的降低 |
| **选对工具** | 计数用 `Counter`，分组用 `defaultdict(list)`，判重用 `set`，通用映射用 `dict` |
| **常见搭配** | 哈希表 + 前缀和、哈希表 + 滑动窗口、哈希表 + 排序 |

掌握哈希表的关键不在于记住 API，而在于识别"需要快速查找/计数/去重"的场景，并选择合适的数据结构来实现。
