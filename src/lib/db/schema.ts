import Dexie, { type Table } from 'dexie';

// ──── Data Model Interfaces ────

export type JournalStatus = 'inbox' | 'active' | 'archived';

/** AI provider 名称（与 providers.ts 保持一致，避免循环依赖在此独立声明） */
export type ProviderName = 'shengsuanyun' | 'relay' | 'siliconflow' | 'zhipu' | 'deepseek' | 'local';

export interface JournalSourceRef {
  url?: string;
  title?: string;
  author?: string;
  siteName?: string;
  book?: string;
  course?: string;
  capturedAt?: number;
  excerpt?: string;
}

export interface JournalEntry {
  id: string;
  title: string;
  content: string;           // Markdown
  contentPlain: string;      // plain text for search
  contentHash?: string;      // 规范化标题与内容的稳定哈希
  summary?: string;          // AI-generated summary
  aliases?: string[];
  tags: string[];
  subject: string;
  status?: JournalStatus;
  properties?: Record<string, string | number | boolean | string[] | null>;
  folderPath?: string;
  difficulty?: number;       // 1-5
  timeSpentMinutes?: number;
  sourceType: 'manual' | 'voice' | 'import' | 'webclip';
  sourceRef?: JournalSourceRef;
  pinned?: boolean;          // 置顶/收藏
  createdAt: number;         // timestamp ms
  updatedAt: number;
  deletedAt?: number;
}

export interface Note {
  id: string;
  journalId: string;
  parentId?: string;
  content: string;
  noteType: 'text' | 'code' | 'image' | 'question' | 'highlight';
  position: number;
  metadata?: { language?: string; imageUrl?: string };
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface KnowledgeCard {
  id: string;
  journalId?: string;
  front: string;
  back: string;
  cardType: 'basic' | 'cloze' | 'image';
  tags: string[];
  // FSRS params
  stability: number;
  difficulty: number;
  lastReviewAt?: number;
  nextReviewAt: number;
  repetitions: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface KnowledgeNode {
  id: string;
  label: string;
  description?: string;
  entryIds: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface KnowledgeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: 'prerequisite' | 'related' | 'extends' | 'example';
  weight: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface AIConversation {
  id: string;
  journalId?: string;
  model: string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  /** 最近一次回答使用的 RAG 来源，便于重新打开对话后继续定位原文 */
  citations?: {
    source: 'personal' | 'zero2agent' | 'web';
    sourceId: string;
    chunkId: string;
    offset?: { start: number; end: number };
    journalId?: string;
    knowledgeDocId?: string;
    title: string;
    heading?: string;
    content: string;
    score: number;
    confidence?: number;
    path?: string;
    module?: string;
    sourceUrl?: string;
    localPath?: string;
    headingPath?: string[];
    sourceAnchor?: string;
    localUrl?: string;
  }[];
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  createdAt: number;
  // 软删除墓碑：与 journals 一致，deletedAt 用于云同步合并时传播删除（避免被远端复活）
  updatedAt?: number;
  deletedAt?: number;
}

export interface AISettings {
  shengsuanyun: { baseUrl: string; apiKey: string; enabled: boolean };
  relay: { baseUrl: string; apiKey: string; enabled: boolean };
  siliconflow: { baseUrl: string; apiKey: string; enabled: boolean };
  zhipu: { baseUrl: string; apiKey: string; enabled: boolean };
  deepseek: { baseUrl: string; apiKey: string; enabled: boolean };
  local: { baseUrl: string; apiKey: string; enabled: boolean };
}

/**
 * 独立模型中心中的模型配置。一个配置可以被多个业务角色复用，避免
 * 在“回答 / 重排 / 复习 / 评分”等页面重复填写同一个端点。
 */
export type AIModelProfileKind = 'chat' | 'embedding';

export interface AIModelProfile {
  id: string;
  name: string;
  kind: AIModelProfileKind;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  enabled: boolean;
  dimension?: number;
}

export interface AIModelBindings {
  /** 最终回答、普通 AI 任务和 zero2Agent 回答使用的对话模型。 */
  answerModelId: string;
  /** 向量召回模型；没有配置时自动退回关键词检索。 */
  embeddingModelId?: string;
  /** 可选的 LLM 重排模型，通常绑定 chat 模型（例如 dsv4）。 */
  rerankerModelId?: string;
  /** 可选的查询改写模型。默认关闭，避免增加一次网络请求。 */
  queryRewriteModelId?: string;
  reviewTutorModelId: string;
  evaluatorModelId: string;
  plannerModelId: string;
}

export interface RetrievalSettings {
  vectorEnabled: boolean;
  rerankEnabled: boolean;
  queryRewriteEnabled: boolean;
  lexicalWeight: number;
  vectorWeight: number;
  candidateTopK: number;
  rerankTopK: number;
  rerankTimeoutMs: number;
}

export interface SyncConfig {
  enabled: boolean;
  owner: string;        // GitHub 用户名，如 sxh313
  repo: string;         // 仓库名
  branch: string;       // 分支，默认 main
  path: string;         // 数据文件路径，默认 data.json
  token: string;        // 用户自己的 Personal Access Token，仅存当前设备 IndexedDB
  autoSync: boolean;    // 编辑停顿后自动同步
  lastSyncAt?: number;
  lastSyncSha?: string;
  /** 上次成功同步后各文档的 contentHash 基线（用于三方冲突检测；仅存本地，不同步） */
  baselineHashes?: Record<string, string>;
  /** 是否同步 Agent 运行记录（含撤销快照，可能含敏感内容；默认关闭） */
  syncAgentData?: boolean;
  /** 是否同步 zero2Agent 的完整问答历史；默认关闭，仅同步进度与计划。 */
  syncZero2ReviewHistory?: boolean;
}

export interface AppSettings {
  id: 'global';
  aiProviders: AISettings;
  preferredModels: {
    highQuality: string;   // default: deepseek-v4-flash
    codeTask: string;      // default: deepseek-v4-flash
    fastTask: string;      // default: deepseek-v4-flash
  };
  /** 各 provider 从 API /models 刷新获取的全部模型 */
  availableModels: Record<string, string[]>;
  /** 用户从可用模型中勾选的模型（全局，用于模型偏好下拉） */
  selectedModels: string[];
  theme: 'light' | 'dark' | 'auto';
  reviewDailyGoal: number;   // cards per day
  /** 云同步配置（GitHub） */
  sync?: SyncConfig;
  /** AI provider 优先级顺序（用户可自定义排序；缺省时按内置顺序） */
  providerOrder?: ProviderName[];
  /** 独立模型中心；与旧的 provider 配置并存，逐步迁移不破坏旧用户设置。 */
  modelProfiles?: AIModelProfile[];
  /** 各业务角色实际绑定的模型配置。 */
  modelBindings?: AIModelBindings;
  /** 向量召回与 dsv4 重排开关。 */
  retrieval?: RetrievalSettings;
}

// ──── 文档版本历史快照 ────
export interface JournalVersion {
  id: string;
  journalId: string;
  title: string;
  content: string;
  createdAt: number;
}

export interface DocumentLink {
  id: string;
  sourceId: string;
  targetId?: string;
  targetTitle: string;
  linkText: string;
  position?: number;
  broken: boolean;
  createdAt: number;
}

export interface DocumentChunk {
  id: string;
  journalId: string;
  title: string;
  heading?: string;
  content: string;
  contentPlain: string;
  startOffset: number;
  endOffset: number;
  ordinal: number;
  createdAt: number;
}

export interface Attachment {
  id: string;
  journalId: string;
  name: string;
  mimeType: string;
  size: number;
  blob?: Blob;
  dataUrl?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface PropertyDefinition {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'multi-select';
  options?: string[];
  required?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface SyncConflict {
  id: string;
  journalId: string;
  local: JournalEntry;
  remote: JournalEntry;
  detectedAt: number;
  resolvedAt?: number;
  resolution?: 'local' | 'remote' | 'both';
}

// ──── Agent 会话持久化（Phase 3）────
export type AgentSessionStatus = 'active' | 'archived';

export interface AgentSession {
  id: string;
  title: string;
  status: AgentSessionStatus;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type AgentMessageRole = 'user' | 'assistant' | 'tool';

export interface AgentMessageRecord {
  id: string;
  sessionId: string;
  role: AgentMessageRole;
  content: string;
  /** 关联的操作计划 id（assistant 消息） */
  planId?: string;
  /** 关联的运行记录 id（assistant 消息执行后） */
  runId?: string;
  createdAt: number;
}

export type AgentRunStatus =
  | 'planned'
  | 'approved'
  | 'running'
  | 'success'
  | 'partial'
  | 'failed'
  | 'cancelled';

export interface AgentRun {
  id: string;
  sessionId: string;
  planId: string;
  status: AgentRunStatus;
  risk: 'low' | 'medium' | 'high';
  /** 计划摘要 */
  summary?: string;
  /** 操作计划（JSON 序列化） */
  operations: unknown[];
  /** 执行结果（JSON 序列化） */
  results?: unknown[];
  /** 模型 / provider 信息 */
  model?: string;
  provider?: string;
  /** 耗时（ms） */
  durationMs?: number;
  /** token 使用量 */
  tokensInput?: number;
  tokensOutput?: number;
  /** 失败原因 */
  error?: string;
  /** 撤销信息（版本快照 + 新建文档 id），供运行历史一键撤销 */
  undo?: {
    versions: { journalId: string; title: string; content: string }[];
    createdJournalIds: string[];
  };
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export interface AgentAuditLog {
  id: string;
  runId: string;
  operation: string;
  journalId?: string;
  beforeHash?: string;
  afterHash?: string;
  result: 'success' | 'failed' | 'skipped';
  createdAt: number;
}

export interface UserPreference {
  key: 'agent' | 'documentOrder' | 'zero2Review';
  value: unknown;
  updatedAt: number;
}

export interface LearningGoal {
  id: string;
  title: string;
  deadline?: string;
  dailyMinutes: number;
  level?: string;
  status: 'active' | 'paused' | 'completed';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface LearningTask {
  id: string;
  goalId: string;
  date: string;
  title: string;
  minutes: number;
  sourceIds: string[];
  status: 'todo' | 'done' | 'skipped';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Zero2ReviewSession {
  id: string;
  title: string;
  goalId?: string;
  status: 'active' | 'finished' | 'archived';
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  deletedAt?: number;
}

export interface Zero2ReviewMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'coach';
  intent: 'review_question' | 'review_command' | 'review_meta';
  content: string;
  topicIds: string[];
  citations: { source: 'zero2agent'; sourceId: string; chunkId: string; path: string; title: string; heading?: string; headingPath?: string[]; sourceUrl?: string; localUrl?: string; sourceAnchor?: string }[];
  diagnosticQuestion?: { id: string; topicId: string; type: 'recall' | 'comparison' | 'boundary' | 'application' | 'diagnostic'; prompt: string; sourceChunkIds: string[] };
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface Zero2Mastery {
  topicId: string;
  mastery: number | null;
  confidence: number;
  evidenceCount: number;
  questionCount: number;
  correctCount: number;
  interestScore: number;
  stability: number;
  difficulty: number;
  lastReviewAt?: number;
  nextReviewAt: number;
  repetitions: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
  updatedAt: number;
  deletedAt?: number;
}

export interface Zero2ReviewPlan {
  id: string;
  goalId: string;
  title: string;
  dailyMinutes: number;
  startDate: string;
  deadline?: string;
  topicIds: string[];
  status: 'active' | 'paused' | 'completed';
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Zero2ReviewTask {
  id: string;
  planId: string;
  topicId: string;
  date: string;
  type: 'learn' | 'recall' | 'quiz' | 'practice' | 'review';
  estimatedMinutes: number;
  sourceIds: string[];
  recommendationReason?: string;
  priority?: { total: number; weakness: number; prerequisiteGap: number; overdue: number; recentInterest: number; lowEvidence: number };
  status: 'todo' | 'done' | 'skipped';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Zero2ReviewAttempt {
  id: string;
  sessionId: string;
  topicId: string;
  question: string;
  answer: string;
  score: 0 | 1 | 2 | 3 | 4;
  mistakeTypes: ('concept' | 'boundary' | 'comparison' | 'application' | 'terminology')[];
  evidenceChunkIds: string[];
  answeredAt: number;
  updatedAt?: number;
  deletedAt?: number;
}

// ──── Database Class ────

export class StudyJournalDB extends Dexie {
  journals!: Table<JournalEntry>;
  notes!: Table<Note>;
  cards!: Table<KnowledgeCard>;
  graphNodes!: Table<KnowledgeNode>;
  graphEdges!: Table<KnowledgeEdge>;
  aiConversations!: Table<AIConversation>;
  settings!: Table<AppSettings>;
  journalVersions!: Table<JournalVersion>;
  documentLinks!: Table<DocumentLink>;
  documentChunks!: Table<DocumentChunk>;
  attachments!: Table<Attachment>;
  savedSearches!: Table<SavedSearch>;
  propertyDefinitions!: Table<PropertyDefinition>;
  categories!: Table<Category>;
  syncConflicts!: Table<SyncConflict>;
  agentSessions!: Table<AgentSession>;
  agentMessages!: Table<AgentMessageRecord>;
  agentRuns!: Table<AgentRun>;
  agentAuditLogs!: Table<AgentAuditLog>;
  userPreferences!: Table<UserPreference>;
  learningGoals!: Table<LearningGoal>;
  learningTasks!: Table<LearningTask>;
  zero2ReviewSessions!: Table<Zero2ReviewSession>;
  zero2ReviewMessages!: Table<Zero2ReviewMessage>;
  zero2Mastery!: Table<Zero2Mastery>;
  zero2ReviewPlans!: Table<Zero2ReviewPlan>;
  zero2ReviewTasks!: Table<Zero2ReviewTask>;
  zero2ReviewAttempts!: Table<Zero2ReviewAttempt>;

  constructor() {
    super('StudyJournalDB');
    this.version(1).stores({
      journals: 'id, createdAt, updatedAt, subject, *tags, deletedAt',
      notes: 'id, journalId, parentId, position',
      cards: 'id, journalId, nextReviewAt, state, *tags',
      graphNodes: 'id, label, *entryIds',
      graphEdges: 'id, sourceId, targetId, relationType',
      aiConversations: 'id, journalId, createdAt',
      settings: 'id',
    });
    // version(2): 新增文档版本历史表
    this.version(2).stores({
      journalVersions: 'id, journalId, createdAt',
    });
    // version(3): 主文档扩展字段 + 可重建索引与本地优先辅助数据
    this.version(3).stores({
      journals: 'id, createdAt, updatedAt, subject, status, folderPath, contentHash, *tags, *aliases, deletedAt',
      documentLinks: 'id, sourceId, targetId, targetTitle, broken, [sourceId+targetId]',
      documentChunks: 'id, journalId, heading, ordinal, [journalId+ordinal]',
      attachments: 'id, journalId, mimeType, createdAt',
      savedSearches: 'id, name, createdAt, updatedAt',
      propertyDefinitions: 'id, name, type, updatedAt',
      syncConflicts: 'id, journalId, detectedAt, resolvedAt',
    }).upgrade(async (tx) => {
      await tx.table<JournalEntry, string>('journals').toCollection().modify((entry) => {
        entry.aliases ??= [];
        entry.tags ??= [];
        entry.subject ??= '';
        entry.status ??= 'active';
        entry.properties ??= {};
      });
    });
    // version(4): 分类成为独立实体，支持空分类、重命名、删除和跨设备同步。
    this.version(4).stores({
      categories: 'id, name, updatedAt, deletedAt',
    }).upgrade(async (tx) => {
      const journals = await tx.table<JournalEntry, string>('journals').toArray();
      const names = Array.from(new Set(journals.map((entry) => entry.subject?.trim()).filter(Boolean) as string[]));
      const now = Date.now();
      if (names.length > 0) {
        await tx.table<Category, string>('categories').bulkPut(
          names.map((name, index) => ({
            id: crypto.randomUUID(),
            name,
            createdAt: now + index,
            updatedAt: now + index,
          })),
        );
      }
    });
    // 说明：availableModels / shengsuanyun 等非索引字段由读取时兼容补全，无需单独升级版本。
    // version(5): Agent 会话持久化（会话、消息、运行记录、审计日志）
    this.version(5).stores({
      agentSessions: 'id, status, updatedAt, deletedAt',
      agentMessages: 'id, sessionId, role, planId, runId, createdAt, [sessionId+createdAt]',
      agentRuns: 'id, sessionId, planId, status, createdAt, finishedAt, [sessionId+createdAt]',
      agentAuditLogs: 'id, runId, journalId, result, createdAt',
    });
    // version(6): 为跨设备可变实体统一补齐 updatedAt/deletedAt，确保删除墓碑可传播。
    this.version(6).stores({
      notes: 'id, journalId, parentId, position, updatedAt, deletedAt',
      cards: 'id, journalId, nextReviewAt, state, updatedAt, deletedAt, *tags',
      graphNodes: 'id, label, updatedAt, deletedAt, *entryIds',
      graphEdges: 'id, sourceId, targetId, relationType, updatedAt, deletedAt',
      attachments: 'id, journalId, mimeType, createdAt, updatedAt, deletedAt',
      savedSearches: 'id, name, createdAt, updatedAt, deletedAt',
    }).upgrade(async (tx) => {
      const now = Date.now();
      for (const tableName of ['notes', 'cards', 'graphNodes', 'graphEdges', 'attachments', 'savedSearches']) {
        await tx.table(tableName).toCollection().modify((row: { createdAt?: number; updatedAt?: number }) => {
          row.updatedAt ??= row.createdAt ?? now;
          row.createdAt ??= row.updatedAt ?? now;
        });
      }
    });
    // version(7): 将用户业务偏好、学习目标和手动排序从 localStorage 迁入 Dexie。
    this.version(7).stores({
      userPreferences: 'key, updatedAt',
      learningGoals: 'id, status, updatedAt, deletedAt',
      learningTasks: 'id, goalId, date, status, updatedAt, deletedAt',
    });
    this.version(8).stores({
      agentRuns: 'id, sessionId, planId, status, createdAt, updatedAt, finishedAt, [sessionId+createdAt]',
    }).upgrade(async (tx) => {
      await tx.table('agentRuns').toCollection().modify((run: { createdAt?: number; updatedAt?: number }) => {
        run.updatedAt ??= run.createdAt ?? Date.now();
      });
    });
    // version(9): zero2Agent 复习教练独立数据域，不与通用 Agent、个人文档和卡片混用。
    this.version(9).stores({
      zero2ReviewSessions: 'id, goalId, status, updatedAt, deletedAt',
      zero2ReviewMessages: 'id, sessionId, intent, createdAt, updatedAt, deletedAt, [sessionId+createdAt]',
      zero2Mastery: 'topicId, state, nextReviewAt, updatedAt, deletedAt',
      zero2ReviewPlans: 'id, goalId, status, updatedAt, deletedAt',
      zero2ReviewTasks: 'id, planId, topicId, date, status, updatedAt, [planId+date]',
      zero2ReviewAttempts: 'id, sessionId, topicId, answeredAt, updatedAt, deletedAt, [topicId+answeredAt]',
    });
    // version(10): 为复习消息/作答增加同步时间与删除墓碑，旧数据按创建时间补齐。
    this.version(10).stores({
      zero2ReviewMessages: 'id, sessionId, intent, createdAt, updatedAt, deletedAt, [sessionId+createdAt]',
      zero2ReviewAttempts: 'id, sessionId, topicId, answeredAt, updatedAt, deletedAt, [topicId+answeredAt]',
    }).upgrade(async (tx) => {
      const now = Date.now();
      await tx.table('zero2ReviewMessages').toCollection().modify((row: { createdAt?: number; updatedAt?: number }) => {
        row.updatedAt ??= row.createdAt ?? now;
      });
      await tx.table('zero2ReviewAttempts').toCollection().modify((row: { answeredAt?: number; updatedAt?: number }) => {
        row.updatedAt ??= row.answeredAt ?? now;
      });
    });
  }
}

export const db = new StudyJournalDB();
