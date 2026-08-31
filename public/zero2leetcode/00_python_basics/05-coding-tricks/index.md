---
layout: default
title: 刷题必备技巧
description: enumerate、zip、sorted、Counter、deque 等刷题常用技巧与练习题
eyebrow: Python 基础 / 05
---

# 刷题必备技巧

```python
# 1. enumerate - 同时获取索引和值
for i, val in enumerate(arr):
    print(f"索引 {i}: 值 {val}")

# 2. zip - 并行遍历多个列表
for a, b in zip(list1, list2):
    print(a, b)

# 3. sorted 与 key 参数
sorted(arr, key=lambda x: x[1], reverse=True)

# 4. 字典 get 方法 - 安全访问
count = d.get(key, 0)  # 不存在返回默认值 0

# 5. collections 模块
from collections import Counter, defaultdict, deque
counter = Counter(arr)  # 计数器
dd = defaultdict(list)  # 默认值字典
dq = deque()            # 双端队列
```

---

## 练习题

```python
# 练习1: 将字符串 "12345" 转换为整数并求和
s = "12345"
total = sum(int(c) for c in s)  # 15

# 练习2: 判断一个字符串是否是回文
def is_palindrome(s):
    return s == s[::-1]

is_palindrome('racecar')  # True
is_palindrome('hello')    # False

# 练习3: 统计字符串中每个字符出现的次数
s = "aabbccc"
count = {}
for c in s:
    count[c] = count.get(c, 0) + 1
# {'a': 2, 'b': 2, 'c': 3}
```

---

[← 返回 Python 基础](../index.html) | [上一篇：集合类型](../04-collections/index.html) | [下一章：数据结构 →]({{ '/01_data_structures/' | relative_url }})
