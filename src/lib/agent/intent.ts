// ──── Agent 请求意图分流 ────
// 普通问答 / 搜索 / 草稿生成不进入完整写入闭环，降低延迟与 token 成本。
// 初版使用可解释的关键词规则；后续可替换为轻量模型分类。

export type AgentIntent = 'chat' | 'search' | 'draft' | 'plan' | 'execute' | 'batch';

/** 意图展示元信息（供 UI 显示当前模式与提示） */
export const INTENT_META: Record<AgentIntent, { label: string; hint: string }> = {
  chat: { label: '问答', hint: '基于知识库回答，不会修改笔记' },
  search: { label: '搜索', hint: '返回检索结果与引用，不调用模型' },
  draft: { label: '草稿', hint: '生成草稿：不会修改笔记' },
  plan: { label: '计划', hint: '生成待确认的操作计划' },
  execute: { label: '执行', hint: '执行当前待确认的计划' },
  batch: { label: '批量', hint: '批量任务：数量受限且需逐项确认' },
};

/** 写入类关键词（触发 plan/batch） */
const PLAN_KEYWORDS = [
  '整理', '添加', '新增', '加标签', '打标签', '加上标签', '移除标签', '删除', '删掉', '移到', '移动到',
  '移动', '修改', '编辑', '新建', '创建', '保存', '重命名', '改名', '追加', '插入', '更新', '归档',
  '套用', '应用修复', '生成卡片', '打上', '换个标题',
];

/** 草稿类关键词 */
const DRAFT_KEYWORDS = [
  '写一份', '写一篇', '写个', '写一个', '起草', '生成草稿', '生成一份', '帮我总结', '总结一下',
  '帮我写', '拟一份', '列一个大纲', '写份',
];

/** 搜索类关键词 */
const SEARCH_KEYWORDS = ['找一下', '找找', '搜索', '检索', '查找', '查一下', '哪篇笔记', '哪些笔记', '有没有关于', '有没有讲'];

/** 问答类关键词 */
const CHAT_KEYWORDS = ['是什么', '什么是', '为什么', '怎么回事', '怎么理解', '如何理解', '解释', '区别', '什么意思', '介绍一下', '讲讲', '说说', '怎么用', '如何使用'];

/** 批量类关键词 */
const BATCH_KEYWORDS = ['全部', '批量', '每篇', '所有笔记', '所有文档', '全部笔记', '全部文档'];

/** 执行类关键词 */
const EXECUTE_KEYWORDS = ['执行', '确认执行', '应用计划', '应用上面的', '就这么办', '按计划执行'];

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

/**
 * 基于可解释关键词规则的意图分类。
 * 优先级：execute → batch → plan → draft → search → chat（默认）。
 */
export function classifyAgentIntent(input: string): AgentIntent {
  const text = (input || '').trim();
  if (!text) return 'chat';

  // 执行：明确要求执行/应用已有计划
  if (containsAny(text, EXECUTE_KEYWORDS)) {
    // “执行”也可能出现在提问里（如“怎么执行”），排除疑问式表达
    if (!/^(怎么|如何|为什么|什么)/.test(text)) return 'execute';
  }

  const hasWrite = containsAny(text, PLAN_KEYWORDS);
  const hasBatch = containsAny(text, BATCH_KEYWORDS);

  // 批量：范围词 + 写入动作
  if (hasBatch && hasWrite) return 'batch';

  // 计划：明确的写入动作
  if (hasWrite) return 'plan';

  // 草稿：生成内容但不写入
  if (containsAny(text, DRAFT_KEYWORDS)) return 'draft';

  // 搜索：找文档/资料
  if (containsAny(text, SEARCH_KEYWORDS)) return 'search';

  // 问答：概念解释类
  if (containsAny(text, CHAT_KEYWORDS)) return 'chat';

  return 'chat';
}