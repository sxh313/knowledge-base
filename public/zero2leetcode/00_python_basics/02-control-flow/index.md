---
layout: default
title: 控制流
description: Python 条件判断、循环与 break/continue
eyebrow: Python 基础 / 02
---

# 控制流

```python
# 条件语句
if x > 0:
    print("正数")
elif x < 0:
    print("负数")
else:
    print("零")

# for 循环
for i in range(5):      # 0, 1, 2, 3, 4
    print(i)

for item in [1, 2, 3]:  # 遍历列表
    print(item)

# while 循环
while condition:
    # do something
    if should_stop:
        break       # 跳出循环
    if should_skip:
        continue    # 跳过本次
```

---

[← 返回 Python 基础](../index.html) | [上一篇：变量与数据类型](../01-variables-types/index.html) | [下一篇：函数 →](../03-functions/index.html)
