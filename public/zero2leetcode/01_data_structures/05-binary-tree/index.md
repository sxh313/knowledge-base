---
layout: default
title: 树与二叉树
description: TreeNode 定义与前中后序遍历模板
eyebrow: 数据结构 / 05
---

# 树与二叉树

## 什么是树

树是一种**非线性**的层次数据结构，由节点和边组成。掌握以下基本概念：

| 术语 | 含义 |
|------|------|
| 节点（Node） | 树中的基本单元，存储数据 |
| 根（Root） | 树最顶层的节点，没有父节点 |
| 叶子（Leaf） | 没有子节点的节点 |
| 深度（Depth） | 从根到该节点经过的边数 |
| 高度（Height） | 从该节点到最远叶子的边数；树的高度 = 根的高度 |
| 子树（Subtree） | 以某节点为根的整棵树 |

**二叉树的特点**：每个节点最多有两个子节点——左子节点和右子节点。面试中绝大多数树的题目都围绕二叉树展开。

---

## 二叉树的类型

### 满二叉树（Full Binary Tree）

每个节点要么有 0 个子节点，要么有 2 个子节点，不存在只有 1 个子节点的情况。

### 完全二叉树（Complete Binary Tree）

除最后一层外每层都被填满，最后一层的节点全部靠左排列。堆（Heap）就是用完全二叉树实现的。

### 平衡二叉树（Balanced Binary Tree）

任意节点的左右子树高度差不超过 1。AVL 树是严格的平衡二叉树。

### 二叉搜索树（BST）

满足以下性质：

- 左子树所有节点的值 **<** 当前节点的值
- 右子树所有节点的值 **>** 当前节点的值
- 左右子树也分别是 BST

BST 的中序遍历结果是一个**升序序列**，这是解题的核心性质。

---

## Python 节点定义

```python
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
```

LeetCode 中所有二叉树题目都使用这个定义，务必记牢。

---

## 遍历方式

### 前序遍历（根-左-右）

**递归写法**——最直观：

```python
def preorder(root: TreeNode) -> list[int]:
    if not root:
        return []
    return [root.val] + preorder(root.left) + preorder(root.right)
```

**迭代写法**——用栈模拟递归，注意先压右再压左：

```python
def preorder_iterative(root: TreeNode) -> list[int]:
    if not root:
        return []
    stack, res = [root], []
    while stack:
        node = stack.pop()
        res.append(node.val)
        if node.right:
            stack.append(node.right)
        if node.left:
            stack.append(node.left)
    return res
```

### 中序遍历（左-根-右）

**递归写法**：

```python
def inorder(root: TreeNode) -> list[int]:
    if not root:
        return []
    return inorder(root.left) + [root.val] + inorder(root.right)
```

**迭代写法**——不断向左深入，弹出时处理节点再转向右子树：

```python
def inorder_iterative(root: TreeNode) -> list[int]:
    stack, res = [], []
    cur = root
    while cur or stack:
        while cur:
            stack.append(cur)
            cur = cur.left
        cur = stack.pop()
        res.append(cur.val)
        cur = cur.right
    return res
```

> 对 BST 执行中序遍历，得到的就是有序数组——很多 BST 题目的关键突破口。

### 后序遍历（左-右-根）

**递归写法**：

```python
def postorder(root: TreeNode) -> list[int]:
    if not root:
        return []
    return postorder(root.left) + postorder(root.right) + [root.val]
```

**迭代写法**——巧妙做法：按「根-右-左」入栈，最后反转结果：

```python
def postorder_iterative(root: TreeNode) -> list[int]:
    if not root:
        return []
    stack, res = [root], []
    while stack:
        node = stack.pop()
        res.append(node.val)
        if node.left:
            stack.append(node.left)
        if node.right:
            stack.append(node.right)
    return res[::-1]
```

### 层序遍历（BFS）

使用 `deque` 逐层处理，是 BFS 在树上的标准应用：

```python
from collections import deque

def level_order(root: TreeNode) -> list[list[int]]:
    if not root:
        return []
    queue = deque([root])
    res = []
    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        res.append(level)
    return res
```

`for _ in range(len(queue))` 这一行是层序遍历的关键——它确保每次 while 循环恰好处理一层。

---

## 高频技巧

### DFS 递归模板

大量二叉树题目都可以归结为「对每个节点，利用左右子树的结果计算当前结果」。

**求最大深度（LC 104）**：

```python
def max_depth(root: TreeNode) -> int:
    if not root:
        return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))
```

**判断是否对称（LC 101）**：

```python
def is_symmetric(root: TreeNode) -> bool:
    def check(left, right):
        if not left and not right:
            return True
        if not left or not right:
            return False
        return (left.val == right.val
                and check(left.left, right.right)
                and check(left.right, right.left))
    return check(root.left, root.right) if root else True
```

**路径总和（LC 112）**：

```python
def has_path_sum(root: TreeNode, target: int) -> bool:
    if not root:
        return False
    if not root.left and not root.right:
        return root.val == target
    return (has_path_sum(root.left, target - root.val)
            or has_path_sum(root.right, target - root.val))
```

### BST 操作

**查找**——利用 BST 性质每次排除一半，时间 O(h)：

```python
def search_bst(root: TreeNode, val: int) -> TreeNode:
    if not root or root.val == val:
        return root
    if val < root.val:
        return search_bst(root.left, val)
    return search_bst(root.right, val)
```

**插入**：

```python
def insert_bst(root: TreeNode, val: int) -> TreeNode:
    if not root:
        return TreeNode(val)
    if val < root.val:
        root.left = insert_bst(root.left, val)
    else:
        root.right = insert_bst(root.right, val)
    return root
```

**验证 BST（LC 98）**——用上下界递归：

```python
def is_valid_bst(root: TreeNode) -> bool:
    def validate(node, lo=float('-inf'), hi=float('inf')):
        if not node:
            return True
        if node.val <= lo or node.val >= hi:
            return False
        return (validate(node.left, lo, node.val)
                and validate(node.right, node.val, hi))
    return validate(root)
```

### 从遍历序列构建树

**前序 + 中序重建二叉树（LC 105）**：

前序的第一个元素是根；在中序中找到根的位置，左侧是左子树，右侧是右子树。用哈希表加速查找。

```python
def build_tree(preorder: list[int], inorder: list[int]) -> TreeNode:
    idx_map = {val: i for i, val in enumerate(inorder)}

    def helper(pre_left, pre_right, in_left, in_right):
        if pre_left > pre_right:
            return None
        root_val = preorder[pre_left]
        root = TreeNode(root_val)
        in_root = idx_map[root_val]
        left_size = in_root - in_left

        root.left = helper(pre_left + 1, pre_left + left_size,
                           in_left, in_root - 1)
        root.right = helper(pre_left + left_size + 1, pre_right,
                            in_root + 1, in_right)
        return root

    n = len(preorder)
    return helper(0, n - 1, 0, n - 1)
```

时间复杂度 O(n)，空间复杂度 O(n)。

---

## 经典题目

按难度分组，建议按顺序刷完：

### Easy

| # | 题目 | 关键点 |
|---|------|--------|
| 104 | [二叉树的最大深度](https://leetcode.cn/problems/maximum-depth-of-binary-tree/) | DFS 入门，递归一行解 |
| 226 | [翻转二叉树](https://leetcode.cn/problems/invert-binary-tree/) | 递归交换左右子树 |
| 101 | [对称二叉树](https://leetcode.cn/problems/symmetric-tree/) | 双指针递归比较 |
| 108 | [有序数组转 BST](https://leetcode.cn/problems/convert-sorted-array-to-binary-search-tree/) | 取中点为根，递归建树 |
| 543 | [二叉树的直径](https://leetcode.cn/problems/diameter-of-binary-tree/) | 后序遍历 + 全局变量记录最大值 |

### Medium

| # | 题目 | 关键点 |
|---|------|--------|
| 102 | [二叉树的层序遍历](https://leetcode.cn/problems/binary-tree-level-order-traversal/) | BFS 模板题 |
| 98 | [验证二叉搜索树](https://leetcode.cn/problems/validate-binary-search-tree/) | 上下界递归 / 中序遍历判递增 |
| 230 | [BST 中第 K 小的元素](https://leetcode.cn/problems/kth-smallest-element-in-a-bst/) | 中序遍历计数 |
| 105 | [从前序与中序遍历构造二叉树](https://leetcode.cn/problems/construct-binary-tree-from-preorder-and-inorder-traversal/) | 哈希 + 递归分治 |
| 236 | [二叉树的最近公共祖先](https://leetcode.cn/problems/lowest-common-ancestor-of-a-binary-tree/) | 后序遍历，左右子树分别查找 |
| 199 | [二叉树的右视图](https://leetcode.cn/problems/binary-tree-right-side-view/) | BFS 取每层最后一个 / DFS 优先访问右子树 |
| 114 | [二叉树展开为链表](https://leetcode.cn/problems/flatten-binary-tree-to-linked-list/) | 前序遍历 + 原地修改指针 |

### Hard

| # | 题目 | 关键点 |
|---|------|--------|
| 124 | [二叉树中的最大路径和](https://leetcode.cn/problems/binary-tree-maximum-path-sum/) | 后序遍历，区分「经过当前节点的路径」和「向上贡献的路径」 |

---

## 小结

- **递归是二叉树的核心思维方式**：绝大多数题目都可以用「把问题分解到左右子树」来解决。
- **四种遍历务必熟练**：前序、中序、后序（DFS）和层序（BFS），递归和迭代写法都要会。
- **BST 的中序遍历 = 有序序列**：这是 BST 类题目最常用的性质。
- **构建树的题目**：抓住「前序/后序确定根，中序确定左右子树范围」的规律。
- 刷题建议：先把 Easy 题目写到闭眼能写，再攻克 Medium，最后挑战 Hard。
