// ─── 文档模板 ───
// 新建文档时可选择的内置模板。每个模板返回初始 Markdown 内容。
// 模板里 {date} {week} 占位符会在创建时替换为当天信息。

export interface DocTemplate {
  key: string;
  name: string;
  emoji: string;
  desc: string;
  tags: string[];
  subject: string;
  build: () => string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
function weekStr(): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date().getDay()];
}

export const TEMPLATES: DocTemplate[] = [
  {
    key: 'blank',
    name: '空白文档',
    emoji: '📄',
    desc: '从零开始',
    tags: [],
    subject: '',
    build: () => '',
  },
  {
    key: 'daily',
    name: '每日复盘',
    emoji: '🗓️',
    desc: '今日总结与明日计划',
    tags: ['日记'],
    subject: '每日笔记',
    build: () => `# ${todayStr()} ${weekStr()}

## ✅ 今日完成
-

## 📚 学到了什么
-

## 💡 想法 / 灵感
-

## 🎯 明日计划
-
`,
  },
  {
    key: 'reading',
    name: '读书笔记',
    emoji: '📚',
    desc: '读书摘录与思考',
    tags: ['读书笔记'],
    subject: '阅读',
    build: () => `# 《书名》读书笔记

> **作者**：
> **阅读日期**：${todayStr()}
> **推荐指数**：⭐⭐⭐⭐⭐

## 📖 一句话概括

## 🔑 核心观点
1.
2.
3.

## ✍️ 摘录
>

## 💭 我的思考

## 🎬 行动项
-
`,
  },
  {
    key: 'meeting',
    name: '会议记录',
    emoji: '📝',
    desc: '会议纪要',
    tags: ['会议'],
    subject: '工作',
    build: () => `# 会议记录 · ${todayStr()}

> **时间**：
> **参会人**：
> **主题**：

## 📋 议题
1.

## 💬 讨论
-

## ✅ 决议与待办
- [ ]
- [ ]

## 📎 附
`,
  },
  {
    key: 'mistake',
    name: '错题整理',
    emoji: '❌',
    desc: '错题与反思',
    tags: ['错题'],
    subject: '错题本',
    build: () => `# 错题整理 · ${todayStr()}

## 题目

## 我的解答

## 正确解答

## ❓ 错在哪里

## 💡 关键知识点

## 🔁 举一反三
-
`,
  },
  {
    key: 'concept',
    name: '概念学习',
    emoji: '🧠',
    desc: '深入理解一个概念',
    tags: ['概念'],
    subject: '学习',
    build: () => `# 概念：

## 📌 是什么（定义）

## ❓ 为什么需要它（背景/动机）

## 🔧 怎么用（示例）

## ⚖️ 对比（相似概念区别）

## ⚠️ 常见误区

## 🔗 关联知识
-
`,
  },
];

/** 根据 key 取模板，找不到则返回空白模板 */
export function getTemplate(key: string): DocTemplate {
  return TEMPLATES.find(t => t.key === key) ?? TEMPLATES[0];
}
