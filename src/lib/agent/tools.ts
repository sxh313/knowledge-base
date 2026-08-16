// ──── Agent 工具定义 ────
// Agent 通过结构化 JSON 指令操作知识库文档。
// 所有操作均为「声明式」：AI 只生成操作计划，由本地 executor 执行，
// 这样既兼容所有 OpenAI 兼容 provider（无需原生 function calling），
// 又能保证对已有文档的修改可控、可预览、可回滚。

import type { JournalEntry } from '../db/schema';

/** 操作类型 */
export type AgentOpType =
  | 'create'      // 新建文档
  | 'edit'        // 编辑（整体替换）已有文档
  | 'append'      // 在已有文档末尾追加内容
  | 'prepend'     // 在已有文档开头插入内容
  | 'insertAfter' // 在指定标题/锚点后插入内容
  | 'read'        // 读取文档内容（供 AI 参考）
  | 'search'      // 搜索文档
  | 'rename'      // 重命名文档
  | 'delete'      // 删除文档（移到回收站）
  | 'move'        // 移动文档到指定分类
  | 'addTags'     // 批量添加标签
  | 'removeTags'  // 批量移除标签
  | 'generateCards'; // 从内容生成知识卡片

/** 单个操作 */
export interface AgentOp {
  type: AgentOpType;
  /** 目标文档 id（create 时忽略；edit/append/prepend/insertAfter/read 必填） */
  journalId?: string;
  /** 目标文档标题（用于按标题定位；与 journalId 二选一） */
  title?: string;
  /** 新建/写入的内容（markdown） */
  content?: string;
  /** 新建文档时的标题 */
  newTitle?: string;
  /** 新建文档时的分类 */
  subject?: string;
  /** 新建文档时的标签 */
  tags?: string[];
  /** insertAfter 时：在哪个标题（## 或 ###）之后插入 */
  afterHeading?: string;
  /** 搜索关键词 */
  query?: string;
  /** rename 时的新标题 */
  newName?: string;
  /** move 时的目标分类 */
  newSubject?: string;
  /** 操作说明（供预览展示） */
  note?: string;
}

/** 一次 Agent 执行产生的操作计划 */
export interface AgentPlan {
  /** 给用户的总体说明 */
  summary?: string;
  /** 操作列表（按顺序执行） */
  ops: AgentOp[];
}

/** 单个操作执行后的结果 */
export interface AgentOpResult {
  op: AgentOp;
  ok: boolean;
  /** 成功：新建/编辑后的文档 id */
  journalId?: string;
  /** 成功：文档标题 */
  title?: string;
  /** 成功：读取/搜索返回的内容 */
  content?: string;
  /** 失败原因 */
  error?: string;
}

/** 执行结果汇总 */
export interface AgentExecutionResult {
  results: AgentOpResult[];
  /** 是否有任何操作失败 */
  hasError: boolean;
}

/** 供 AI 参考的文档摘要（不把全文塞进 prompt，避免超长） */
export interface AgentDocRef {
  id: string;
  title: string;
  subject: string;
  tags: string[];
  updatedAt: number;
  /** 前 N 字符预览 */
  preview: string;
}

/** 从 AI 返回文本中解析操作计划 JSON */
export function parseAgentPlan(text: string): AgentPlan | null {
  let cleaned = text.trim();
  // 去掉可能的 markdown 代码块围栏
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  // 去掉首尾可能的多余说明文字（只保留最外层 JSON 对象）
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  cleaned = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(cleaned) as AgentPlan;
    if (!parsed || !Array.isArray(parsed.ops)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 把文档转成 AI 可读的引用摘要 */
export function toDocRef(entry: JournalEntry, previewLen = 400): AgentDocRef {
  return {
    id: entry.id,
    title: entry.title,
    subject: entry.subject,
    tags: entry.tags ?? [],
    updatedAt: entry.updatedAt,
    preview: (entry.content || '').slice(0, previewLen),
  };
}
