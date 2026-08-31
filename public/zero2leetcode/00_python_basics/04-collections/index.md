---
layout: default
title: 集合类型
description: Python list、dict、set 操作详解
eyebrow: Python 基础 / 04
---

# 集合类型

### 列表 list

```python
# 创建
nums = [1, 2, 3, 4, 5]

# 添加
nums.append(6)          # 末尾添加
nums.insert(0, 0)       # 指定位置插入

# 删除
nums.pop()              # 删除末尾
nums.pop(0)             # 删除指定索引
nums.remove(3)          # 删除指定值

# 列表推导式（非常重要！）
squares = [x**2 for x in range(5)]        # [0, 1, 4, 9, 16]
evens = [x for x in range(10) if x % 2 == 0]  # [0, 2, 4, 6, 8]
```

### 字典 dict

```python
# 创建
person = {"name": "Alice", "age": 25}

# 访问
person["name"]              # 'Alice'
person.get("city", "Unknown")  # 默认值

# 遍历
for key, value in person.items():
    print(key, value)

# 计数模式（刷题常用！）
from collections import Counter
count = Counter(['a', 'b', 'a', 'c', 'a', 'b'])
# Counter({'a': 3, 'b': 2, 'c': 1})
```

### 集合 set

```python
# 从列表创建（去重）
nums = [1, 2, 2, 3, 3, 3]
unique = set(nums)  # {1, 2, 3}

# 集合运算
a = {1, 2, 3}
b = {2, 3, 4}
a | b   # 并集 {1, 2, 3, 4}
a & b   # 交集 {2, 3}
a - b   # 差集 {1}
```

---

[← 返回 Python 基础](../index.html) | [上一篇：函数](../03-functions/index.html) | [下一篇：刷题必备技巧 →](../05-coding-tricks/index.html)
