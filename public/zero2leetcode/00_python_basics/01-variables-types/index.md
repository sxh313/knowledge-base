---
layout: default
title: 变量与数据类型
description: Python 基本数据类型、类型转换与字符串操作
eyebrow: Python 基础 / 01
---

# 变量与数据类型

### 基本数据类型

```python
# 整数 int
age = 25
negative = -10
big_number = 1_000_000  # 可用下划线分隔，提高可读性

# 浮点数 float
price = 19.99
pi = 3.14159

# 字符串 str
name = "Alice"
greeting = 'Hello, World!'
multiline = """
这是一个
多行字符串
"""

# 布尔值 bool
is_valid = True
is_empty = False

# None 类型（表示空值）
result = None
```

### 类型转换

```python
# 字符串转整数
num_str = "123"
num_int = int(num_str)

# 整数转字符串
age_str = str(25)

# 字符串转浮点数
price_float = float("19.99")

# 数值转布尔值
# 0, 0.0, "", [], {}, None 转为 False，其他转为 True
bool(0)      # False
bool(1)      # True
bool("")     # False
bool("hello") # True
```

### 字符串操作（刷题常用！）

```python
s = "hello world"

# 长度
len(s)          # 11

# 索引访问
s[0]            # 'h' 第一个字符
s[-1]           # 'd' 最后一个字符

# 切片
s[0:5]          # 'hello' 前5个字符
s[6:]           # 'world' 第6个到结尾
s[::-1]         # 'dlrow olleh' 反转字符串

# 分割与连接
words = s.split(" ")      # ['hello', 'world']
"-".join(words)           # 'hello-world'

# 替换与查找
s.replace("world", "python")  # 'hello python'
s.find("world")               # 6

# 大小写
s.upper()       # 'HELLO WORLD'
s.lower()       # 'hello world'

# 去空格
"  hello  ".strip()  # 'hello'

# 判断
"abc".isalpha()      # True
"123".isdigit()      # True
```

---

[← 返回 Python 基础](../index.html) | [下一篇：控制流 →](../02-control-flow/index.html)
