---
layout: default
title: 函数
description: Python 函数定义、默认参数与 lambda 表达式
eyebrow: Python 基础 / 03
---

# 函数

```python
# 基本函数
def add(a, b):
    return a + b

# 默认参数
def greet(name, msg="Hello"):
    return f"{msg}, {name}!"

# Lambda 表达式
square = lambda x: x ** 2

# 常用于排序
arr = [(1, 2), (3, 1), (2, 3)]
arr.sort(key=lambda x: x[1])  # 按第二个元素排序
```

---

[← 返回 Python 基础](../index.html) | [上一篇：控制流](../02-control-flow/index.html) | [下一篇：集合类型 →](../04-collections/index.html)
