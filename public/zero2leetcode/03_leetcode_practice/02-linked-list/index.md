---
layout: default
title: 链表题 — Reverse Linked List
description: LeetCode 206. Reverse Linked List 迭代法详解
eyebrow: LeetCode 实战 / 02
---

# 206. 反转链表 (Easy) - 链表

> 📝 题目：反转单链表

**思路**：三指针迭代法 `prev, curr, next`

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class Solution:
    def reverseList(self, head: ListNode) -> ListNode:
        """
        迭代法
        时间: O(n)
        空间: O(1)

        图解：
        原始: 1 -> 2 -> 3 -> None
        步骤1: None <- 1    2 -> 3 -> None
        步骤2: None <- 1 <- 2    3 -> None
        步骤3: None <- 1 <- 2 <- 3
        """
        prev = None
        curr = head

        while curr:
            next_temp = curr.next  # 保存下一个节点
            curr.next = prev       # 反转指针
            prev = curr            # prev 前进
            curr = next_temp       # curr 前进

        return prev
```

[-> 去 LeetCode 练习](https://leetcode.cn/problems/reverse-linked-list/)

---

[← 返回 LeetCode 实战](../index.html)
