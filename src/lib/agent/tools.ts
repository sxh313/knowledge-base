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
  | 'patchJournal' // 精确替换文档中的一处文本
  | 'updateMetadata' // 更新摘要、标签、分类等元数据
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
  | 'repairDocumentLinks' // 失效链接修复计划（只读，返回逐条修复建议）
  | 'analyzeKnowledgeGaps' // 知识缺口分析（只读）
  | 'suggestJournalMetadata' // 收件箱元数据建议（只读）
  | 'findRelatedJournals' // 相关文档建议（只读）
  | 'explainSyncConflict' // 同步冲突解释（只读）
  | 'prepareConflictMerge' // 同步冲突合并草案（只读）
  | 'applyConflictMerge'; // 用户确认后写入合并草案

/** 全部合法操作类型（供校验与权限策略复用） */
export const ALL_AGENT_OP_TYPES: readonly AgentOpType[] = [
  'create', 'edit', 'append', 'prepend', 'insertAfter', 'patchJournal', 'updateMetadata', 'read', 'search',
  'rename', 'delete', 'move', 'addTags', 'removeTags', 'generateCards',
  'findDuplicates', 'reviewQuality', 'createStudyPlan',
  'suggestQualityFixes', 'analyzeJournalImpact', 'repairDocumentLinks',
  'analyzeKnowledgeGaps', 'suggestJournalMetadata', 'findRelatedJournals',
  'explainSyncConflict', 'prepareConflictMerge', 'applyConflictMerge',
];

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
  /** patchJournal 的精确匹配文本（只替换第一处） */
  findText?: string;
  /** patchJournal 的替换文本 */
  replaceText?: string;
  /** updateMetadata 的结构化字段 */
  metadata?: {
    summary?: string;
    tags?: string[];
    subject?: string;
    aliases?: string[];
    status?: 'inbox' | 'active' | 'archived';
  };
  /** 搜索关键词 */
  query?: string;
  /** 主题、冲突或分析上下文 */
  topic?: string;
  conflictId?: string;
  /** rename 时的新标题 */
  newName?: string;
  /** move 时的目标分类 */
  newSubject?: string;
  /** 操作说明（供预览展示） */
  note?: string;
  /** 修改依据：指向检索命中的笔记片段；高影响写操作必须携带 */
  evidence?: {
    journalId: string;
    chunkId?: string;
    reason: string;
  }[];
  /** 依赖的前置操作 opId 列表（执行时按拓扑排序，前置失败则跳过） */
  dependsOn?: string[];
  /** 前置条件（执行前校验，不满足则该操作失败） */
  preconditions?: {
    journalExists?: boolean;
    expectedHash?: string;
  }[];
  /** 风险等级（由本地根据操作类型与影响范围计算） */
  risk?: 'low' | 'medium' | 'high';
}

/** 操作风险等级 */
export type AgentRisk = 'low' | 'medium' | 'high';

/** 单条证据 reason 中声明跨文档关系的关键字（用于高影响操作的目标一致性校验） */
export const CROSS_DOC_KEYWORD = '跨文档';

/** 高影响写操作：必须携带 evidence（修改依据） */
export const HIGH_IMPACT_TYPES: ReadonlySet<AgentOpType> = new Set<AgentOpType>([
  'edit',
  'delete',
  'patchJournal',
  'rename',
  'move',
  'addTags',
  'removeTags',
  'updateMetadata',
  'applyConflictMerge',
]);

/** 根据操作类型与内容计算风险等级 */
export function classifyRisk(op: AgentOp): AgentRisk {
  switch (op.type) {
    case 'delete':
      return 'high';
    case 'edit':
      // 整体替换已有文档内容，风险较高
      return 'high';
    case 'applyConflictMerge':
      return 'high';
    case 'rename':
    case 'move':
      return 'medium';
    case 'create':
    case 'append':
    case 'prepend':
    case 'insertAfter':
    case 'patchJournal':
    case 'updateMetadata':
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
    case 'analyzeKnowledgeGaps':
    case 'suggestJournalMetadata':
    case 'findRelatedJournals':
    case 'explainSyncConflict':
    case 'prepareConflictMerge':
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
/** 批量任务允许的最大操作数（更保守，需额外确认） */
export const MAX_BATCH_OPS = 10;
/** 单个操作允许的最大内容长度（字符） */
export const MAX_CONTENT_LENGTH = 50000;
/** 单个操作允许的最大标签数 */
export const MAX_TAGS_PER_OP = 30;
/** 搜索关键词最小长度（禁止空查询全库搜索） */
export const MIN_QUERY_LENGTH = 1;
/** 单个操作允许携带的最大证据条数 */
export const MAX_EVIDENCE_PER_OP = 5;

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
  'patchJournal',
  'updateMetadata',
  'applyConflictMerge',
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
  'patchJournal',
  'updateMetadata',
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
  if (!op.type || !ALL_AGENT_OP_TYPES.includes(op.type)) {
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
  if (op.metadata?.tags && op.metadata.tags.length > MAX_TAGS_PER_OP) {
    errors.push(`${label}(${op.type}): metadata.tags 数量过多（上限 ${MAX_TAGS_PER_OP}）`);
  }
  if (op.metadata?.summary && op.metadata.summary.length > 2000) {
    errors.push(`${label}(${op.type}): 摘要过长（上限 2000 字符）`);
  }
  if (op.findText && op.findText.length > 2000) {
    errors.push(`${label}(${op.type}): findText 过长（上限 2000 字符）`);
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
    case 'patchJournal':
      if (!op.findText?.trim()) errors.push(`${label}(patchJournal): 缺少 findText`);
      if (op.replaceText === undefined) errors.push(`${label}(patchJournal): 缺少 replaceText`);
      break;
    case 'updateMetadata':
      if (!op.metadata || Object.keys(op.metadata).length === 0) errors.push(`${label}(updateMetadata): 缺少 metadata`);
      break;
    case 'applyConflictMerge':
      if (!op.conflictId && !op.journalId) errors.push(`${label}(applyConflictMerge): 缺少 conflictId 或 journalId`);
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

  // 证据（evidence）校验：高影响写操作必须携带修改依据
  if (op.evidence) {
    if (op.evidence.length > MAX_EVIDENCE_PER_OP) {
      errors.push(`${label}(${op.type}): 证据数量过多（${op.evidence.length} 条，上限 ${MAX_EVIDENCE_PER_OP}）`);
    }
    op.evidence.forEach((ev, k) => {
      if (!ev || !ev.journalId) {
        errors.push(`${label}(${op.type}): 第 ${k + 1} 条证据缺少 journalId`);
      } else if (!ev.reason || !ev.reason.trim()) {
        errors.push(`${label}(${op.type}): 第 ${k + 1} 条证据缺少 reason（修改依据说明）`);
      }
    });
  }
  if (HIGH_IMPACT_TYPES.has(op.type)) {
    if (!op.evidence || op.evidence.length === 0) {
      errors.push(`${label}(${op.type}): 高影响写操作缺少修改依据（evidence）；请先检索相关笔记并在 evidence 中引用命中片段`);
    } else if (op.journalId) {
      // 目标文档必须与证据文档一致，或在 reason 中明确说明跨文档关系
      const matched = op.evidence.some((ev) => ev && ev.journalId === op.journalId);
      const crossDoc = op.evidence.some((ev) => ev?.reason?.includes(CROSS_DOC_KEYWORD));
      if (!matched && !crossDoc) {
        errors.push(`${label}(${op.type}): 目标文档与证据文档不一致；如确需跨文档操作，请在证据 reason 中说明「${CROSS_DOC_KEYWORD}」关系`);
      }
    }
  }

  return { errors, warnings };
}

/** 检测操作依赖是否存在循环；存在时返回错误信息，否则返回 null */
export function detectDependencyCycle(ops: AgentOp[]): string | null {
  // DFS 三色标记：0=未访问 1=访问中 2=已完成
  const color = new Map<string, number>();
  const byId = new Map<string, AgentOp>();
  for (const op of ops) {
    if (op.opId) byId.set(op.opId, op);
  }
  const stack: string[] = [];
  const visit = (op: AgentOp): boolean => {
    const key = op.opId ?? '';
    if (!key) return false;
    const state = color.get(key) ?? 0;
    if (state === 1) {
      stack.push(key);
      return true;
    }
    if (state === 2) return false;
    color.set(key, 1);
    for (const dep of op.dependsOn ?? []) {
      const depOp = byId.get(dep);
      if (depOp && visit(depOp)) {
        stack.push(key);
        return true;
      }
    }
    color.set(key, 2);
    return false;
  };
  for (const op of ops) {
    if (visit(op)) {
      return `计划存在循环依赖：${stack.reverse().join(' → ')}`;
    }
    stack.length = 0;
  }
  return null;
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

  // 依赖关系校验：依赖 ID 存在、不允许自依赖、不允许循环依赖
  const opIds = new Set(plan.ops.map((op) => op.opId).filter((id): id is string => !!id));
  const typeById = new Map(plan.ops.map((op) => [op.opId ?? '', op.type]));
  plan.ops.forEach((op, i) => {
    for (const dep of op.dependsOn ?? []) {
      if (!dep) continue;
      if (!opIds.has(dep)) {
        errors.push(`操作 #${i + 1}: 依赖的操作 opId「${dep}」不存在`);
      } else if (op.opId === dep) {
        errors.push(`操作 #${i + 1}: 不允许依赖自己`);
      } else if (typeById.get(dep) === 'delete') {
        // 删除操作不能被后续写操作作为可用前置条件
        errors.push(`操作 #${i + 1}: 删除操作不能作为前置条件`);
      }
    }
  });
  const cycleError = detectDependencyCycle(plan.ops);
  if (cycleError) errors.push(cycleError);

  return { ok: errors.length === 0, errors, warnings };
}

/** 单个操作执行后的结果 */
export interface AgentOpResult {
  op: AgentOp;
  ok: boolean;
  /** 该操作被跳过（逐项批准时未勾选，或前置依赖失败） */
  skipped?: boolean;
  /** 跳过的具体原因（供 UI 展示） */
  skippedReason?: string;
  /** 运行时状态（拓扑执行过程中的生命周期） */
  opStatus?: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  /** 单个操作耗时（ms） */
  durationMs?: number;
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
  beforeSummary?: string;
  afterSummary?: string;
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
  /** 知识缺口分析结果 */
  knowledgeGaps?: {
    topic: string;
    covered: { concept: string; evidence: string[]; confidence: number }[];
    missing: { concept: string; reason: string; confidence: number }[];
  };
  /** 收件箱或文档的元数据建议 */
  metadataSuggestions?: {
    journalId: string;
    title: string;
    suggestedTitle?: string;
    summary?: string;
    tags: string[];
    subject?: string;
    relatedIds: string[];
  }[];
  /** 相关文档结果 */
  relatedJournals?: { journalId: string; title: string; score: number; reason: string }[];
  /** 同步冲突解释或合并草案 */
  syncConflict?: {
    conflictId: string;
    journalId: string;
    title: string;
    local: string;
    remote: string;
    differences: { type: 'added' | 'removed' | 'changed'; text: string }[];
    needsManualReview: boolean;
    draft?: string;
  };
  /** 结构化知识卡片草案 */
  cards?: { front: string; back: string }[];
  /** 只读分析转换出的安全计划草案，由用户确认后再进入预览 */
  suggestedPlan?: AgentPlan;
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