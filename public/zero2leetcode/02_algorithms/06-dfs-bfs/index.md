---
layout: default
title: DFS / BFS
description: 深度优先搜索与广度优先搜索模板
eyebrow: 核心算法 / 06
---

# DFS / BFS

## 什么是图/网格搜索

很多算法问题可以抽象为**图的遍历**：二维网格（岛屿、迷宫）中每个格子是节点、上下左右是边；课程依赖是有向图；社交网络是无向图。面对这类问题，**DFS（深度优先搜索）** 和 **BFS（广度优先搜索）** 是两种最基本的遍历策略。

---

## DFS（深度优先搜索）

### 核心思想

**"一条路走到黑，走不通就回头。"** DFS 沿着一个方向一直往深处走，直到无路可走，再回退到上一个岔路口尝试另一个方向。可以用**递归**（系统帮你维护栈）或**显式栈**来实现。

### 递归模板

```python
def dfs(node, visited, graph):
    """通用 DFS 递归模板"""
    if node in visited:       # 已经访问过，直接返回
        return
    visited.add(node)         # 标记为已访问
    process(node)             # 处理当前节点（根据题意写逻辑）
    for neighbor in graph[node]:   # 遍历所有邻居
        dfs(neighbor, visited, graph)
```

### 显式栈模板

```python
def dfs_iterative(start, graph):
    """用栈模拟 DFS，避免递归深度过大"""
    stack = [start]
    visited = {start}
    while stack:
        node = stack.pop()        # 栈顶弹出
        process(node)
        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                stack.append(neighbor)
```

### 网格 DFS — LC 200 岛屿数量

> 给定一个 `'1'`（陆地）和 `'0'`（水）组成的二维网格，计算岛屿的数量。

**思路**：遍历每个格子，遇到 `'1'` 就启动一次 DFS 把整座岛"淹掉"（标记为已访问），岛屿计数 +1。

```python
def numIslands(grid):
    if not grid:
        return 0
    rows, cols = len(grid), len(grid[0])
    count = 0

    def dfs(r, c):
        # 越界 或 遇到水，直接返回
        if r < 0 or r >= rows or c < 0 or c >= cols:
            return
        if grid[r][c] == '0':
            return
        grid[r][c] = '0'   # 把当前陆地"淹掉"，防止重复访问
        # 向四个方向扩散
        dfs(r + 1, c)  # 下
        dfs(r - 1, c)  # 上
        dfs(r, c + 1)  # 右
        dfs(r, c - 1)  # 左

    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1':   # 发现新岛屿
                count += 1
                dfs(r, c)           # 把整座岛标记掉
    return count
```

**四方向移动的常用写法**（用方向数组让代码更简洁）：

```python
directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]
for dr, dc in directions:
    nr, nc = r + dr, c + dc
    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == '1':
        dfs(nr, nc)
```

---

## BFS（广度优先搜索）

### 核心思想

**"逐层扩散，像水波纹一样。"** BFS 从起点出发，先访问距离为 1 的节点，再访问距离为 2 的节点，依此类推。因为一层一层扩展，**BFS 天然能求最短路径**（边权相等时）。用**队列（deque）**实现。

### BFS 模板

```python
from collections import deque

def bfs(start, graph):
    """通用 BFS 模板"""
    queue = deque([start])
    visited = {start}
    while queue:
        node = queue.popleft()    # 队头弹出（先进先出）
        process(node)
        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
```

### 分层 BFS 模板

很多题目需要知道"当前是第几层"（比如求最短距离），用分层写法：

```python
from collections import deque

def bfs_level(start, graph):
    queue = deque([start])
    visited = {start}
    level = 0
    while queue:
        size = len(queue)               # 当前层的节点数
        for _ in range(size):
            node = queue.popleft()
            for neighbor in graph[node]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        level += 1                       # 一层处理完，层数 +1
    return level
```

### 多源 BFS — LC 994 腐烂的橘子

> 网格中 `0` 是空格，`1` 是新鲜橘子，`2` 是腐烂橘子。每分钟腐烂橘子会让上下左右的新鲜橘子腐烂。求所有橘子腐烂的最短时间，不可能则返回 -1。

**思路**：把所有腐烂橘子同时作为 BFS 起点（多源 BFS），一层层向外扩散，每扩一层就是 1 分钟。

```python
from collections import deque

def orangesRotting(grid):
    rows, cols = len(grid), len(grid[0])
    queue = deque()
    fresh = 0
    # 第一步：找出所有腐烂橘子和新鲜橘子数
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 2:
                queue.append((r, c))   # 所有腐烂橘子入队
            elif grid[r][c] == 1:
                fresh += 1
    if fresh == 0:
        return 0

    directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]
    minutes = 0
    # 第二步：BFS 逐层扩散
    while queue:
        size = len(queue)
        for _ in range(size):
            r, c = queue.popleft()
            for dr, dc in directions:
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
                    grid[nr][nc] = 2       # 新鲜 → 腐烂
                    fresh -= 1
                    queue.append((nr, nc))
        minutes += 1
    # 最后一轮多加了 1，需要减掉
    return minutes - 1 if fresh == 0 else -1
```

---

## DFS vs BFS 对比

| 维度 | DFS | BFS |
|------|-----|-----|
| 数据结构 | 栈 / 递归 | 队列（deque） |
| 遍历顺序 | 先深后广 | 先广后深（逐层） |
| 空间复杂度 | O(h)，h 为深度 | O(w)，w 为最大宽度 |
| 能否求最短路径 | 不能（需额外处理） | 天然最短路径 |
| 典型场景 | 路径搜索、连通分量、回溯 | 最短路径、层序遍历 |

**选择建议**：
- 求**连通性、所有路径、是否可达** → DFS（代码简洁）
- 求**最短距离、最少步数** → BFS（天然最短）
- 网格/树的层序遍历 → BFS

---

## 拓扑排序

拓扑排序针对**有向无环图（DAG）**，把所有节点排成一条线，使得每条边的起点都排在终点前面。典型场景是**任务调度、课程依赖**。核心概念是**入度**（指向该节点的边数），入度为 0 的节点没有前置依赖，可以最先处理。

### LC 207 课程表

> 共 `numCourses` 门课，`prerequisites[i] = [a, b]` 表示学 a 之前要先学 b。判断是否能完成所有课程（即图中是否有环）。

**思路**：BFS 拓扑排序（Kahn 算法）。维护入度表，每次取入度为 0 的节点，处理后将其邻居入度 -1。最终处理节点数等于总数则无环。

```python
from collections import deque, defaultdict

def canFinish(numCourses, prerequisites):
    # 建图 + 统计入度
    graph = defaultdict(list)
    in_degree = [0] * numCourses
    for course, pre in prerequisites:
        graph[pre].append(course)   # pre → course
        in_degree[course] += 1
    # 入度为 0 的节点入队
    queue = deque()
    for i in range(numCourses):
        if in_degree[i] == 0:
            queue.append(i)
    count = 0   # 已处理的课程数
    while queue:
        node = queue.popleft()
        count += 1
        for neighbor in graph[node]:
            in_degree[neighbor] -= 1        # 删掉这条边
            if in_degree[neighbor] == 0:    # 入度变 0，可以学了
                queue.append(neighbor)
    return count == numCourses   # 全部处理完说明无环
```

---

## 经典题目

### 入门

| 题号 | 题目 | 关键点 |
|------|------|--------|
| LC 200 | 岛屿数量 | 网格 DFS/BFS 入门 |
| LC 733 | 图像渲染（Flood Fill） | 基础 DFS 染色 |
| LC 617 | 合并二叉树 | 树的 DFS |

### 进阶

| 题号 | 题目 | 关键点 |
|------|------|--------|
| LC 994 | 腐烂的橘子 | 多源 BFS |
| LC 695 | 岛屿的最大面积 | DFS + 计数 |
| LC 542 | 01 矩阵 | 多源 BFS 求最短距离 |
| LC 207 | 课程表 | 拓扑排序判环 |

### 挑战

| 题号 | 题目 | 关键点 |
|------|------|--------|
| LC 127 | 单词接龙 | BFS 最短变换路径 |
| LC 210 | 课程表 II | 拓扑排序输出顺序 |
| LC 417 | 太平洋大西洋水流问题 | 反向 DFS，两次搜索求交集 |

---

## 小结

1. **DFS 和 BFS 是图搜索的两大基石**，大量题目都是它们的变体。
2. DFS 用递归或栈，擅长路径搜索和连通性判断。
3. BFS 用队列，擅长最短路径和层序遍历；多源 BFS 处理"同时出发"的场景。
4. 网格问题本质就是图问题，四方向移动是固定套路。
5. 拓扑排序用 BFS（Kahn 算法）处理有向无环图的依赖关系。
6. 刷题时先判断是 DFS 还是 BFS 场景，再套模板，最后根据题意调整细节。
