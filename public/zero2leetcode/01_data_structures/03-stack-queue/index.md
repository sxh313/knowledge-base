---
layout: default
title: 栈与队列
description: LIFO/FIFO 原理与 deque 使用
eyebrow: 数据结构 / 03
---

# 栈与队列

栈和队列是两种最基础的线性数据结构，区别仅在于元素的进出顺序。它们是很多复杂题型（单调栈、BFS、滑动窗口）的底层构件。

## 栈（Stack）

### LIFO 原理

栈遵循 **后进先出（Last In, First Out）** 原则：最后放入的元素最先被取出。

### Python 用 list 实现栈

`list` 的 `append` 和 `pop` 都是对末尾操作，时间复杂度均为 O(1)。

```python
stack = []
stack.append(1)
stack.append(2)
stack.append(3)   # stack = [1, 2, 3]，栈顶是 3
top = stack[-1]   # peek：查看栈顶，值为 3
val = stack.pop() # pop：弹出栈顶，val = 3
if not stack:     # is_empty：判空
    print("栈为空")
```

### 时间复杂度

| 操作 | 复杂度 |
|------|--------|
| push (append) | O(1) 均摊 |
| pop | O(1) |
| peek (stack[-1]) | O(1) |
| is_empty | O(1) |

## 队列（Queue）

### FIFO 原理

队列遵循 **先进先出（First In, First Out）** 原则：最先放入的元素最先被取出。

### Python 用 collections.deque 实现队列

```python
from collections import deque
queue = deque()
queue.append(1)
queue.append(2)
queue.append(3)        # deque([1, 2, 3])
val = queue.popleft()  # val = 1, deque([2, 3])
front = queue[0]       # 查看队首：2
```

### 为什么不用 list 做队列

`list.pop(0)` 需要将后面所有元素前移一位，时间复杂度为 **O(n)**；而 `deque.popleft()` 基于双向链表实现，时间复杂度为 **O(1)**。

## 双端队列（Deque）

`deque`（double-ended queue）两端都可以高效地进出元素，是 Python 中最通用的队列实现。

### 常用方法

```python
from collections import deque
d = deque()
d.append(1)            # 右端入队
d.appendleft(0)        # 左端入队
d.pop()                # 右端出队
d.popleft()            # 左端出队
d.extend([2, 3])       # 右端批量入队
d.extendleft([-1, -2]) # 左端批量入队（顺序会反转）
d.rotate(1)            # 所有元素右移 1 位
```

`deque` 两端操作均为 O(1)，但随机访问 `d[i]` 为 O(n)，不适合频繁按索引取值。

## 高频题型

### 括号匹配

遇到左括号入栈，遇到右括号弹出栈顶检查是否匹配。

**有效括号（LC 20）：**

```python
def isValid(s: str) -> bool:
    stack = []
    mapping = {')': '(', ']': '[', '}': '{'}
    for ch in s:
        if ch in mapping:
            if not stack or stack[-1] != mapping[ch]:
                return False
            stack.pop()
        else:
            stack.append(ch)
    return len(stack) == 0
```

遍历结束后栈必须为空，否则说明有多余的左括号。

### 单调栈

#### 什么是单调栈

单调栈维护栈内元素的单调递增或递减，每次入栈前先弹出所有破坏单调性的元素。核心价值：O(n) 时间找到每个元素左/右第一个更大（或更小）的元素。

#### 下一个更大元素模板

```python
def next_greater_element(nums):
    n = len(nums)
    result = [-1] * n
    stack = []  # 存索引，栈底到栈顶对应值单调递减
    for i in range(n):
        while stack and nums[i] > nums[stack[-1]]:
            idx = stack.pop()
            result[idx] = nums[i]
        stack.append(i)
    return result
```

#### 每日温度（LC 739）

```python
def dailyTemperatures(temperatures: list[int]) -> list[int]:
    n = len(temperatures)
    answer = [0] * n
    stack = []  # 存索引，栈内温度单调递减
    for i in range(n):
        while stack and temperatures[i] > temperatures[stack[-1]]:
            prev = stack.pop()
            answer[prev] = i - prev
        stack.append(i)
    return answer
```

### 用栈实现队列 / 用队列实现栈

#### LC 232 用栈实现队列

两个栈：in_stack 入队，out_stack 出队。出队时若 out_stack 为空，把 in_stack 全部倒入，顺序翻转实现 FIFO。均摊 O(1)。

```python
class MyQueue:
    def __init__(self):
        self.in_stack = []
        self.out_stack = []
    def push(self, x: int) -> None:
        self.in_stack.append(x)
    def pop(self) -> int:
        self._move()
        return self.out_stack.pop()
    def peek(self) -> int:
        self._move()
        return self.out_stack[-1]
    def empty(self) -> bool:
        return not self.in_stack and not self.out_stack
    def _move(self):
        if not self.out_stack:
            while self.in_stack:
                self.out_stack.append(self.in_stack.pop())
```

#### LC 225 用队列实现栈

每次 push 后将前面的元素依次出队再入队，保持队首始终是最后入队的元素。

```python
from collections import deque
class MyStack:
    def __init__(self):
        self.queue = deque()
    def push(self, x: int) -> None:
        self.queue.append(x)
        for _ in range(len(self.queue) - 1):
            self.queue.append(self.queue.popleft())
    def pop(self) -> int:
        return self.queue.popleft()
    def top(self) -> int:
        return self.queue[0]
    def empty(self) -> bool:
        return len(self.queue) == 0
```

### 最小栈（LC 155）

支持 O(1) 获取最小值。辅助栈同步记录每个状态下的最小值。

```python
class MinStack:
    def __init__(self):
        self.stack = []
        self.min_stack = []
    def push(self, val: int) -> None:
        self.stack.append(val)
        cur_min = min(val, self.min_stack[-1] if self.min_stack else val)
        self.min_stack.append(cur_min)
    def pop(self) -> None:
        self.stack.pop()
        self.min_stack.pop()
    def top(self) -> int:
        return self.stack[-1]
    def getMin(self) -> int:
        return self.min_stack[-1]
```

所有操作均为 O(1)，空间换时间。

## 经典题目

### 简单

| 题目 | 链接 |
|------|------|
| 有效的括号 | [LC 20](https://leetcode.com/problems/valid-parentheses/) |
| 用栈实现队列 | [LC 232](https://leetcode.com/problems/implement-queue-using-stacks/) |
| 用队列实现栈 | [LC 225](https://leetcode.com/problems/implement-stack-using-queues/) |
| 最小栈 | [LC 155](https://leetcode.com/problems/min-stack/) |

### 中等

| 题目 | 链接 |
|------|------|
| 每日温度 | [LC 739](https://leetcode.com/problems/daily-temperatures/) |
| 下一个更大元素 II | [LC 503](https://leetcode.com/problems/next-greater-element-ii/) |
| 字符串解码 | [LC 394](https://leetcode.com/problems/decode-string/) |
| 简化路径 | [LC 71](https://leetcode.com/problems/simplify-path/) |

### 困难

| 题目 | 链接 |
|------|------|
| 柱状图中最大的矩形 | [LC 84](https://leetcode.com/problems/largest-rectangle-in-histogram/) |
| 滑动窗口最大值 | [LC 239](https://leetcode.com/problems/sliding-window-maximum/) |

## 小结

- **栈**用 `list`，**队列**用 `deque`，这是 Python 的标准做法。
- 括号匹配、表达式求值、DFS 路径回溯都依赖栈。
- BFS 遍历、任务调度依赖队列。
- **单调栈**是面试高频考点，核心模板务必熟练：维护栈的单调性，在弹出时更新答案。
- 最小栈、用栈实现队列等设计题考查对数据结构的灵活组合，理解"辅助结构"和"延迟转移"的思想即可。
