---
layout: default
title: 算法岗笔试必考ML编程题
description: 27届暑期实习算法岗笔试趋势分析：美团、携程、蚂蚁已确认必考ML编程题，附备考路线
eyebrow: 大厂真题 / 备考技巧
permalink: /04_real_interviews/tips/ml-coding-trend/
---

# 27届算法岗笔试变了！ML编程题成为标配

## 核心变化

2027届暑期实习笔试出现了一个非常明显的趋势：**算法岗笔试开始必考一道机器学习编程题**。

目前已确认的公司：

| 公司 | 算法岗题量 | ML题数 | 研发岗是否受影响 |
|------|-----------|--------|----------------|
| 美团 | 4道 | 1道 | 否（3道传统算法） |
| 携程 | 4道 | 1道 | 否 |
| 蚂蚁 | 3道 | 1道 | 否 |

去年只有少数公司在算法岗笔试中考ML编程题，今年已经三家确认。**ML编程题正在变成算法岗笔试的行业标配。**

---

## ML编程题 vs 传统算法题

传统算法题考的是数据结构、动态规划、贪心、图论，需要自己设计算法逻辑，C++/Java/Python 都可以用。

ML编程题完全不一样：
- **只能用 Python**
- 核心是三个库：**numpy、pandas、sklearn**
- 不是手推数学公式，而是写出可运行的代码
- 比如用 sklearn 实现 KMeans 聚类，用 pandas 做特征工程

**最大区别：传统算法题可以靠思维硬想，ML编程题不会就是不会，考场上临时学库函数来不及。**

---

## 真题示例：蚂蚁算法岗 - 节点分类器

题目要求实现一个单层 GraphSAGE-Mean 节点分类器：

- 给你一张图的邻接表和节点特征
- 用 numpy 做矩阵运算（一跳平均聚合）
- 用岭回归闭式解求权重向量
- 用 Sigmoid 做二分类预测
- 仅允许使用 numpy/pandas/sklearn

三类人的反应：
- **传统算法选手**：完全看不懂
- **有ML基础但没练过编程题的**：大概知道思路，但写不出来
- **练过ML编程题的**：套路题，10分钟搞定

---

## 58道ML真题考点分布

| 考点 | 题数 | 占比 | 代表公司 |
|------|------|------|---------|
| 分类算法（随机森林/LR/朴素贝叶斯/KNN） | 12 | 21% | 蚂蚁、美团 |
| 聚类算法（K-Means/DBSCAN/PCA+K-Means） | 9 | 16% | 阿里云、蚂蚁 |
| 深度学习基础（损失函数/反向传播/LayerNorm） | 7 | 12% | 华为 |
| 特征工程（归一化/TF-IDF/PCA/Pipeline） | 5 | 9% | 蚂蚁 |
| 回归算法（线性/多项式/岭回归） | 5 | 9% | 美团、华为 |
| 推荐系统（协同过滤/NDCG） | 5 | 9% | 阿里云 |
| Attention 注意力机制 | 4 | 7% | 华为 |
| SVM（特征权重/核矩阵） | 3 | 5% | 蚂蚁、美团 |
| 异常检测（孤立森林/PCA重构误差） | 3 | 5% | 蚂蚁、美团 |
| 图神经网络（GraphSAGE） | 2 | 3% | 蚂蚁 |
| 时序与概率（HMM/ACF） | 3 | 5% | 混合 |

**核心结论：分类 + 聚类合计 21 道，占了 36%，是绝对重点。**

---

## 各公司偏好差异

### 蚂蚁（19道，最多）

偏好 sklearn 工具链调用。高频考点：随机森林、TF-IDF 文本特征、PCA 降维。独家考点：GraphSAGE 图神经网络。

### 美团（10道）

偏好经典 ML 算法，部分题目**禁用 sklearn**，要求纯 numpy 手写实现。比如手写 SVM 核矩阵、手写 DBSCAN。

### 阿里云（7道）

偏好推荐系统和聚类。协同过滤、NDCG、K-Means 是高频考点。

### 华为（12道）

偏好深度学习组件底层实现。Attention、LoRA、反向传播是高频考点，大部分只用 numpy。

**备考优先级：优先练蚂蚁和美团的题，考点最通用。华为的深度学习组件题比较独立，投华为算法岗再单独准备。**

---

## 三个库最常考什么

### numpy（几乎每道题都用）

```python
np.array / reshape / flatten     # 数组创建和变形
np.dot / @                       # 矩阵乘法（Attention、线性分类必用）
np.linalg.norm                   # 距离计算（K-Means 核心）
np.linalg.inv / np.linalg.solve  # 岭回归闭式解
np.exp / np.log                  # Sigmoid、Softmax、交叉熵
np.argmax / np.argsort           # 分类预测、排序
```

### sklearn（蚂蚁/美团高频）

```python
StandardScaler        # 数据标准化
PCA                   # 降维
KMeans                # 聚类
RandomForestClassifier # 随机森林分类
LogisticRegression    # 逻辑回归
DBSCAN                # 异常检测
```

### pandas（数据预处理题）

```python
pd.DataFrame          # 创建表格
df.iloc / df.loc      # 行列切片
(x - min) / (max - min)  # 归一化
```

---

## 三阶段备考路线

### 第一阶段：基础 API 熟悉（3-5天）

- 刷 numpy 数组操作：创建、变形、索引、矩阵乘法
- 学会 sklearn 标准流程：`fit` → `transform` → `predict`
- 熟悉 JSON 输入输出格式（阿里系 ML 题必备）
- 做 3-5 道基础 ML 题练手：K-Means、KNN、交叉熵

### 第二阶段：高频题型专项（1周）

- **分类算法**：随机森林、逻辑回归、朴素贝叶斯（最高频）
- **聚类算法**：K-Means、DBSCAN、PCA+K-Means
- **回归算法**：线性回归、岭回归闭式解
- **特征工程**：StandardScaler、TF-IDF、PCA
- 每个考点做 2-3 道真题

### 第三阶段：进阶拓展（3-5天）

- Attention 注意力机制（华为必考）
- 推荐系统/协同过滤（阿里云必考）
- 异常检测/GraphSAGE（蚂蚁特色）
- 纯 numpy 手写实现（美团特色）

**建议至少达到第二阶段水平，第一二阶段加起来大概 2 周时间。**

---

## 最容易踩的坑

### 1. 输入输出格式

阿里系 ML 题几乎都是 JSON 格式输入：

```python
import json
import numpy as np

data = json.loads(input())
train = np.array(data['train'], dtype=float)
test = np.array(data['test'], dtype=float)
```

### 2. StandardScaler 的坑

训练集用 `fit_transform`，测试集只用 `transform`，**绝对不能对测试集重新 fit**：

```python
scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)  # 训练集：fit + transform
X_test = scaler.transform(X_test)         # 测试集：只 transform
```

### 3. 数值稳定性

```python
# Softmax 数值稳定版
def stable_softmax(S):
    S = S - S.max(axis=1, keepdims=True)
    exp_S = np.exp(S)
    return exp_S / exp_S.sum(axis=1, keepdims=True)

# Sigmoid 数值稳定版
def sigmoid(x):
    x = np.clip(x, -500, 500)
    return 1.0 / (1.0 + np.exp(-x))
```

### 4. 不会的题先看能不能调 sklearn

很多题目本质上就是：读数据 → 标准化 → 调模型 → 输出。如果题目没限制不能用 sklearn，直接调库是最快的。

---

## 小结

- **研发岗不受影响**，还是传统算法题
- **算法岗必须额外准备** numpy/pandas/sklearn，花 1-2 周时间
- 分类 + 聚类是绝对重点，占 36%
- 优先练蚂蚁和美团的题，考点最通用
- 铁律：**不会的库函数考场上临时学来不及，必须提前练**
