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
  | 'generateCards' // 从内容生成知识卡片
  | 'findDuplicates' // 检测重复文档（只读，返回候选）
  | 'reviewQuality' // 文档质量检查（只读，返回问题清单）
  | 'createStudyPlan' // 生成学习计划（只读，返回计划建议）
  | 'suggestQualityFixes' // 文档质量问题一键修复建议（只读，返回修复前后对比）
  | 'analyzeJournalImpact' // 文档关系与变更影响分析（只读，返回影响范围）
  | 'repairDocumentLinks'; // 失效链接修复计划（只读，返回逐条修复建议）

/** 单个操作 */
export interface AgentOp {
  /** 操作唯一 id（由本地生成，用于防重复执行与审计） */
  opId?: string;
  type: AgentOpType;
  /** 目标文档 id（create 时忽略；edit/append/prepend/insertAfter/read 必填） */
  journalId?: string;
  /** 目标文档标题（用于按标题定位；与 journalId 二选一） */
  title?: string;
  /** 目标文档的 contentHash（编辑类操作必填，用于防止目标被修改后误执行旧计划） */
  expectedHash?: string;
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
  /** 风险等级（由本地根据操作类型与影响范围计算） */
  risk?: 'low' | 'medium' | 'high';
}

/** 操作风险等级 */
export type AgentRisk = 'low' | 'medium' | 'high';

/** 根据操作类型与内容计算风险等级 */
export function classifyRisk(op: AgentOp): AgentRisk {
  switch (op.type) {
    case 'delete':
      return 'high';
    case 'edit':
      // 整体替换已有文档内容，风险较高
      return 'high';
    case 'rename':
    case 'move':
      return 'medium';
    case 'create':
    case 'append':
    case 'prepend':
    case 'insertAfter':
    case 'addTags':
    case 'removeTags':
    case 'generateCards':
      return 'medium';
    case 'read':
    case 'search':
    case 'findDuplicates':
    case 'reviewQuality':
    case 'createStudyPlan':
    case 'suggestQualityFixes':
    case 'analyzeJournalImpact':
    case 'repairDocumentLinks':
    default:
      return 'low';
  }
}

/** 一次 Agent 执行产生的操作计划 */
export interface AgentPlan {
  /** 计划唯一 id（由本地生成，用于防重复执行与审计） */
  planId?: string;
  /** 给用户的总体说明 */
  summary?: string;
  /** 操作列表（按顺序执行） */
  ops: AgentOp[];
}

// ──── 计划校验常量 ────
/** 单次计划允许的最大操作数 */
export const MAX_OPS_PER_PLAN = 20;
/** 单个操作允许的最大内容长度（字符） */
export const MAX_CONTENT_LENGTH = 50000;
/** 单个操作允许的最大标签数 */
export const MAX_TAGS_PER_OP = 30;
/** 搜索关键词最小长度（禁止空查询全库搜索） */
export const MIN_QUERY_LENGTH = 1;

/** 计划校验结果 */
export interface PlanValidationResult {
  ok: boolean;
  /** 校验失败/警告信息列表 */
  errors: string[];
  /** 校验警告（不阻断执行，但应提示用户） */
  warnings: string[];
}

/** 需要目标文档 contentHash 的操作类型（编辑类，防止目标被修改后误执行） */
const HASH_REQUIRED_TYPES: ReadonlySet<AgentOpType> = new Set<AgentOpType>([
  'edit',
  'append',
  'prepend',
  'insertAfter',
  'rename',
  'move',
  'addTags',
  'removeTags',
  'delete',
]);

/** 需要目标文档定位（journalId 或 title）的操作类型 */
const TARGET_REQUIRED_TYPES: ReadonlySet<AgentOpType> = new Set<AgentOpType>([
  'edit',
  'append',
  'prepend',
  'insertAfter',
  'read',
  'rename',
  'delete',
  'move',
  'addTags',
  'removeTags',
]);

/** 校验单个操作，返回错误与警告列表 */
export function validateAgentOp(op: AgentOp, index: number): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = `操作 #${index + 1}`;

  if (!op || typeof op !== 'object') {
    return { errors: [`${label}: 操作不是有效对象`], warnings };
  }

  // 操作类型
  const validTypes: AgentOpType[] = [
    'create', 'edit', 'append', 'prepend', 'insertAfter', 'read', 'search',
    'rename', 'delete', 'move', 'addTags', 'removeTags', 'generateCards',
    'findDuplicates', 'reviewQuality', 'createStudyPlan',
    'suggestQualityFixes', 'analyzeJournalImpact', 'repairDocumentLinks',
  ];
  if (!op.type || !validTypes.includes(op.type)) {
    errors.push(`${label}: 未知操作类型「${String(op.type)}」`);
    return { errors, warnings };
  }

  // 目标文档定位
  if (TARGET_REQUIRED_TYPES.has(op.type)) {
    if (!op.journalId && !op.title) {
      errors.push(`${label}(${op.type}): 缺少目标文档，需要 journalId 或 title`);
    }
  }

  // 内容长度
  if (op.content && op.content.length > MAX_CONTENT_LENGTH) {
    errors.push(`${label}(${op.type}): 内容过长（${op.content.length} 字符，上限 ${MAX_CONTENT_LENGTH}）`);
  }

  // 标签数量
  if (op.tags && op.tags.length > MAX_TAGS_PER_OP) {
    errors.push(`${label}(${op.type}): 标签数量过多（${op.tags.length} 个，上限 ${MAX_TAGS_PER_OP}）`);
  }

  // 各类型必填字段
  switch (op.type) {
    case 'create':
      if (!op.newTitle || !op.newTitle.trim()) {
        errors.push(`${label}(create): 缺少 newTitle`);
      }
      break;
    case 'search':
      if (!op.query || !op.query.trim()) {
        errors.push(`${label}(search): 查询关键词为空，禁止全库搜索`);
      } else if (op.query.trim().length < MIN_QUERY_LENGTH) {
        errors.push(`${label}(search): 查询关键词过短`);
      }
      break;
    case 'insertAfter':
      if (!op.afterHeading || !op.afterHeading.trim()) {
        errors.push(`${label}(insertAfter): 缺少 afterHeading`);
      }
      break;
    case 'rename':
      if (!op.newName || !op.newName.trim()) {
        errors.push(`${label}(rename): 缺少 newName`);
      }
      break;
    case 'move':
      if (!op.newSubject || !op.newSubject.trim()) {
        errors.push(`${label}(move): 缺少 newSubject`);
      }
      break;
    case 'generateCards':
      if (!op.journalId && !op.title && !op.content) {
        errors.push(`${label}(generateCards): 缺少内容来源，需要 journalId/title 或 content`);
      }
      break;
    default:
      break;
  }

  // 编辑类操作需要 expectedHash（防止目标被修改后误执行）
  if (HASH_REQUIRED_TYPES.has(op.type) && !op.expectedHash) {
    warnings.push(`${label}(${op.type}): 缺少 expectedHash，无法校验目标文档是否被修改`);
  }

  return { errors, warnings };
}

/** 校验整个操作计划 */
export function validateAgentPlan(plan: AgentPlan | null | undefined): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!plan || typeof plan !== 'object') {
    return { ok: false, errors: ['计划不是有效对象'], warnings };
  }
  if (!Array.isArray(plan.ops)) {
    return { ok: false, errors: ['计划缺少 ops 数组'], warnings };
  }
  if (plan.ops.length === 0) {
    return { ok: false, errors: ['计划不包含任何操作'], warnings };
  }
  if (plan.ops.length > MAX_OPS_PER_PLAN) {
    errors.push(`操作数量过多（${plan.ops.length} 个，上限 ${MAX_OPS_PER_PLAN}）`);
  }

  plan.ops.forEach((op, i) => {
    const r = validateAgentOp(op, i);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  });

  return { ok: errors.length === 0, errors, warnings };
}

/** 单个操作执行后的结果 */
export interface AgentOpResult {
  op: AgentOp;
  ok: boolean;
  /** 该操作被跳过（逐项批准时未勾选） */
  skipped?: boolean;
  /** 成功：新建/编辑后的文档 id */
  journalId?: string;
  /** 成功：文档标题 */
  title?: string;
  /** 成功：读取/搜索返回的内容 */
  content?: string;
  /** 失败原因 */
  error?: string;
  /** 变更前内容（用于展示真实 diff） */
  beforeContent?: string;
  /** 变更后内容（用于展示真实 diff） */
  afterContent?: string;
  /** 变更前标题（用于展示标题变化） */
  beforeTitle?: string;
  /** 变更后标题（用于展示标题变化） */
  afterTitle?: string;
  /** 变更前标签（用于展示标签变化） */
  beforeTags?: string[];
  /** 变更后标签（用于展示标签变化） */
  afterTags?: string[];
  /** 变更前分类（用于展示分类变化） */
  beforeSubject?: string;
  /** 变更后分类（用于展示分类变化） */
  afterSubject?: string;
  /** 结构化搜索结果（search 操作）：文档 ID、标题、章节、匹配片段 */
  searchResults?: AgentSearchHit[];
  /** 重复文档检测结果（findDuplicates 操作） */
  duplicateGroups?: {
    groupId: string;
    items: { journalId: string; title: string; similarity: number }[];
    keepId?: string;
    suggestion: string;
  }[];
  /** 文档质量检查结果（reviewQuality 操作） */
  qualityIssues?: {
    journalId: string;
    title: string;
    severity: 'info' | 'warning' | 'error';
    type: string;
    message: string;
  }[];
  /** 学习计划建议（createStudyPlan 操作） */
  studyPlan?: {
    journalId: string;
    title: string;
    reviewInDays: number;
    reason: string;
  }[];
  /** 质量问题一键修复建议（suggestQualityFixes 操作） */
  qualityFixes?: {
    journalId: string;
    title: string;
    issueType: string;
    risk: 'low' | 'high';
    field: 'summary' | 'tags' | 'link' | 'title' | 'content';
    before: string;
    after: string;
    message: string;
  }[];
  /** 文档关系与变更影响分析（analyzeJournalImpact 操作） */
  journalImpact?: {
    journalId: string;
    title: string;
    level: 'none' | 'affected' | 'unknown';
    items: {
      journalId: string;
      title: string;
      kind: 'backlink' | 'broken-link' | 'card';
      detail: string;
    }[];
    summary: string;
  };
  /** 失效链接修复计划（repairDocumentLinks 操作） */
  linkRepairPlan?: {
    total: number;
    autoFixable: number;
    manualCount: number;
    items: {
      sourceId: string;
      sourceTitle: string;
      linkText: string;
      newLinkText: string;
      targetId?: string;
      autoFixable: boolean;
    }[];
  };
}

/** 结构化搜索结果条目（供 AI 引用来源） */
export interface AgentSearchHit {
  journalId: string;
  title: string;
  subject: string;
  /** 命中的章节标题（若有） */
  heading?: string;
  /** 匹配片段 */
  snippet: string;
  /** 匹配得分 */
  score: number;
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

/** 为计划与每个操作生成唯一 id（用于防重复执行与审计） */
export function assignPlanIds(plan: AgentPlan): AgentPlan {
  const planId = plan.planId || crypto.randomUUID();
  return {
    ...plan,
    planId,
    ops: plan.ops.map((op, i) => ({
      ...op,
      opId: op.opId || `${planId}:${i}`,
    })),
  };
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
