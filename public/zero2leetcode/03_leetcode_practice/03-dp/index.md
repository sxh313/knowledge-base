---
layout: default
title: 动态规划题 — Climbing Stairs
description: LeetCode 70. Climbing Stairs 动态规划解法详解
eyebrow: LeetCode 实战 / 03
---

# 70. 爬楼梯 (Easy) - 动态规划

> 📝 题目：每次爬 1 或 2 阶，问爬到第 n 阶有多少种方法

**思路**：经典斐波那契 `dp[n] = dp[n-1] + dp[n-2]`

```python
class Solution:
    def climbStairs(self, n: int) -> int:
        """
        空间优化的动态规划
        时间: O(n)
        空间: O(1)
        """
        if n <= 2:
            return n

        prev2 = 1  # dp[i-2]
        prev1 = 2  # dp[i-1]

        for i in range(3, n + 1):
            curr = prev1 + prev2
            prev2 = prev1
            prev1 = curr

        return prev1

# 测试
sol = Solution()
print(sol.climbStairs(5))   # 8
print(sol.climbStairs(10))  # 89
```

[-> 去 LeetCode 练习](https://leetcode.cn/problems/climbing-stairs/)

---

## 📊 刷题进度表

| 分类 | 题数 | 重要程度 |
|------|------|----------|
| 哈希表 | 5 | ⭐⭐⭐⭐⭐ |
| 双指针 | 4 | ⭐⭐⭐⭐ |
| 滑动窗口 | 4 | ⭐⭐⭐⭐ |
| 栈 | 6 | ⭐⭐⭐⭐ |
| 链表 | 14 | ⭐⭐⭐⭐ |
| 二叉树 | 15 | ⭐⭐⭐⭐⭐ |
| 回溯 | 8 | ⭐⭐⭐⭐ |
| 二分查找 | 6 | ⭐⭐⭐⭐ |
| 动态规划 | 15 | ⭐⭐⭐⭐⭐ |
| 贪心 | 4 | ⭐⭐⭐ |

---

[← 返回 LeetCode 实战](../index.html)
