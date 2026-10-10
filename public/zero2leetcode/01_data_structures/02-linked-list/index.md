---
layout: default
title: 链表
description: 单链表与双链表的核心操作
eyebrow: 数据结构 / 02
---

# 链表

## 什么是链表

链表是一种线性数据结构，与数组不同，它的元素在内存中**不需要连续存储**。每个元素称为**节点（Node）**，节点包含两部分：

1. **数据域（val）**：存储实际的值
2. **指针域（next / prev）**：存储指向下一个（或上一个）节点的引用

### 单链表 vs 双链表

- **单链表**：每个节点只有一个 `next` 指针，指向下一个节点。只能从头到尾单向遍历。
- **双链表**：每个节点有 `next` 和 `prev` 两个指针，可以双向遍历。插入和删除操作更灵活，但占用更多内存。

### 与数组的对比

| 操作 | 数组 | 链表 |
|------|------|------|
| 按索引访问 | O(1) | O(n) |
| 头部插入 | O(n) | O(1) |
| 尾部插入 | O(1) 均摊 | O(n) 单链表 / O(1) 有尾指针 |
| 中间插入 | O(n) | O(1) 已知位置时 |
| 删除 | O(n) | O(1) 已知位置时 |
| 内存 | 连续，可能浪费 | 非连续，按需分配 |

**总结**：链表在频繁插入删除的场景下优于数组，但不支持随机访问。

## Python 链表定义

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
```

双链表节点：

```python
class DoublyListNode:
    def __init__(self, val=0, next=None, prev=None):
        self.val = val
        self.next = next
        self.prev = prev
```

## 核心操作

### 遍历与查找

```python
def traverse(head: ListNode):
    """遍历链表并打印所有节点值"""
    curr = head
    while curr:
        print(curr.val)
        curr = curr.next

def search(head: ListNode, target: int) -> bool:
    """查找链表中是否存在目标值"""
    curr = head
    while curr:
        if curr.val == target:
            return True
        curr = curr.next
    return False
```

### 插入节点

**头插法** — O(1)：

```python
def insert_at_head(head: ListNode, val: int) -> ListNode:
    new_node = ListNode(val)
    new_node.next = head
    return new_node  # 新的头节点
```

**尾插法** — O(n)：

```python
def insert_at_tail(head: ListNode, val: int) -> ListNode:
    new_node = ListNode(val)
    if not head:
        return new_node
    curr = head
    while curr.next:
        curr = curr.next
    curr.next = new_node
    return head
```

**中间插入** — 在第 k 个节点后插入：

```python
def insert_after(node: ListNode, val: int):
    """在给定节点后面插入新节点"""
    new_node = ListNode(val)
    new_node.next = node.next
    node.next = new_node
```

### 删除节点

```python
def delete_node(head: ListNode, target: int) -> ListNode:
    """删除链表中第一个值为 target 的节点"""
    dummy = ListNode(0, head)
    prev = dummy
    curr = head
    while curr:
        if curr.val == target:
            prev.next = curr.next  # 跳过当前节点
            break
        prev = curr
        curr = curr.next
    return dummy.next
```

### 虚拟头节点（Dummy Node）

**为什么使用 Dummy Node？**

链表操作中，头节点的处理往往是特殊情况。例如删除头节点时，需要单独判断。引入一个虚拟头节点（dummy），让它指向真正的头节点，可以**统一所有操作的逻辑**，消除边界条件。

```python
def remove_elements(head: ListNode, val: int) -> ListNode:
    """删除链表中所有值为 val 的节点（LeetCode 203）"""
    dummy = ListNode(0, head)  # dummy.next 指向真正的头
    prev = dummy
    curr = head
    while curr:
        if curr.val == val:
            prev.next = curr.next  # 删除 curr
        else:
            prev = curr
        curr = curr.next
    return dummy.next  # 返回真正的头节点
```

使用 dummy node 后，无论删除的是头节点还是中间节点，代码逻辑完全一致。

## 高频技巧

### 链表反转

链表反转是面试中出现频率最高的链表问题，务必熟练掌握迭代和递归两种写法。

**迭代法（三指针）**：

```python
def reverse_list(head: ListNode) -> ListNode:
    """反转链表 — 迭代（LeetCode 206）"""
    prev = None
    curr = head
    while curr:
        nxt = curr.next   # 先保存下一个节点
        curr.next = prev  # 反转指针
        prev = curr       # prev 前进
        curr = nxt        # curr 前进
    return prev  # prev 就是新的头节点
```

核心思路：用 `prev`、`curr`、`nxt` 三个指针，逐个翻转每条边的方向。

**递归法**：

```python
def reverse_list_recursive(head: ListNode) -> ListNode:
    """反转链表 — 递归"""
    # base case：空链表或只有一个节点
    if not head or not head.next:
        return head
    # 递归反转后面的部分，new_head 是反转后的头
    new_head = reverse_list_recursive(head.next)
    # head.next 现在是反转后子链表的尾节点，让它指回 head
    head.next.next = head
    head.next = None  # 断开原来的正向指针
    return new_head
```

### 快慢指针

快慢指针是链表中最重要的技巧之一，核心思想：两个指针以不同速度遍历链表。

**找中间节点**：

```python
def find_middle(head: ListNode) -> ListNode:
    """找链表中间节点（LeetCode 876）"""
    slow = fast = head
    while fast and fast.next:
        slow = slow.next       # 慢指针走一步
        fast = fast.next.next  # 快指针走两步
    return slow  # 当 fast 到达末尾时，slow 正好在中间
```

**判断是否有环（Floyd 算法）**：

```python
def has_cycle(head: ListNode) -> bool:
    """判断链表是否有环（LeetCode 141）"""
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow == fast:  # 快慢指针相遇，说明有环
            return True
    return False
```

**找环入口**：

```python
def detect_cycle(head: ListNode) -> ListNode:
    """找到环的入口节点（LeetCode 142）"""
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow == fast:
            # 相遇后，一个指针回到头部，两个同速前进
            slow = head
            while slow != fast:
                slow = slow.next
                fast = fast.next
            return slow  # 再次相遇点就是环入口
    return None
```

数学证明：设头到环入口距离为 `a`，环入口到相遇点距离为 `b`，环长为 `c`。相遇时慢指针走了 `a + b`，快指针走了 `a + b + nc`。因为快指针速度是慢指针两倍，所以 `2(a + b) = a + b + nc`，即 `a = nc - b`。因此从头部和相遇点同时出发，一定在环入口相遇。

### 合并链表

```python
def merge_two_lists(l1: ListNode, l2: ListNode) -> ListNode:
    """合并两个有序链表（LeetCode 21）"""
    dummy = ListNode(0)
    curr = dummy
    while l1 and l2:
        if l1.val <= l2.val:
            curr.next = l1
            l1 = l1.next
        else:
            curr.next = l2
            l2 = l2.next
        curr = curr.next
    curr.next = l1 or l2  # 拼接剩余部分
    return dummy.next
```

## 经典题目

按难度分组的 LeetCode 高频链表题：

### Easy

| 题号 | 题目 | 关键技巧 |
|------|------|----------|
| [206](https://leetcode.com/problems/reverse-linked-list/) | 反转链表 | 迭代 / 递归 |
| [21](https://leetcode.com/problems/merge-two-sorted-lists/) | 合并两个有序链表 | dummy node + 双指针 |
| [141](https://leetcode.com/problems/linked-list-cycle/) | 环形链表 | 快慢指针 |
| [160](https://leetcode.com/problems/intersection-of-two-linked-lists/) | 相交链表 | 双指针对齐 |

### Medium

| 题号 | 题目 | 关键技巧 |
|------|------|----------|
| [19](https://leetcode.com/problems/remove-nth-node-from-end-of-list/) | 删除链表的倒数第 N 个节点 | 快慢指针间隔 N 步 |
| [24](https://leetcode.com/problems/swap-nodes-in-pairs/) | 两两交换链表中的节点 | 递归 / 迭代模拟 |
| [142](https://leetcode.com/problems/linked-list-cycle-ii/) | 环形链表 II | Floyd 算法找入口 |
| [148](https://leetcode.com/problems/sort-list/) | 排序链表 | 归并排序 + 快慢指针找中点 |

### Hard

| 题号 | 题目 | 关键技巧 |
|------|------|----------|
| [23](https://leetcode.com/problems/merge-k-sorted-lists/) | 合并 K 个升序链表 | 最小堆 / 分治合并 |
| [25](https://leetcode.com/problems/reverse-nodes-in-k-group/) | K 个一组翻转链表 | 分段反转 + 递归 |

## 小结

链表的核心在于**指针操作**，写代码时需要注意：

1. **画图**：链表题一定要在纸上画出指针变化过程，避免指针丢失。
2. **Dummy Node**：涉及头节点可能变化的操作，优先使用虚拟头节点简化逻辑。
3. **快慢指针**：找中点、判环、找环入口，是链表最核心的技巧。
4. **反转操作**：迭代和递归两种写法都要熟练，很多中高难度题是反转的变体。
5. **边界检查**：空链表、单节点链表、操作最后一个节点时，都要确认逻辑正确。

掌握以上内容，足以应对绝大多数面试中的链表问题。
