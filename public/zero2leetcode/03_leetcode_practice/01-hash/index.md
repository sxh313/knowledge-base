---
layout: default
title: 哈希表题 — Two Sum
description: LeetCode 1. Two Sum 哈希表解法详解
eyebrow: LeetCode 实战 / 01
---

# 1. 两数之和 (Easy) - 哈希表

> 📝 题目：给定数组和目标值，找出和为目标值的两个数的索引

**思路**：遍历时用哈希表存储已遍历的 `{值: 索引}`，查找 `target - num` 是否存在

```python
from typing import List

class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        """
        哈希表解法
        时间: O(n) - 只遍历一次
        空间: O(n) - 哈希表存储
        """
        hashmap = {}  # 存储 {数值: 索引}

        for i, num in enumerate(nums):
            complement = target - num

            # 如果 complement 已在哈希表中，找到答案
            if complement in hashmap:
                return [hashmap[complement], i]

            # 否则将当前数存入哈希表
            hashmap[num] = i

        return []

# 测试
sol = Solution()
print(sol.twoSum([2, 7, 11, 15], 9))  # [0, 1]
print(sol.twoSum([3, 2, 4], 6))       # [1, 2]
```

[-> 去 LeetCode 练习](https://leetcode.cn/problems/two-sum/)

---

[← 返回 LeetCode 实战](../index.html)
