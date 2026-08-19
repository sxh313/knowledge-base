import Dexie, { type Table } from 'dexie';

// ──── Data Model Interfaces ────

export type JournalStatus = 'inbox' | 'active' | 'archived';

/** AI provider 名称（与 providers.ts 保持一致，避免循环依赖在此独立声明） */
export type ProviderName = 'shengsuanyun' | 'relay' | 'siliconflow' | 'zhipu' | 'deepseek';

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
}

export interface KnowledgeNode {
  id: string;
  label: string;
  description?: string;
  entryIds: string[];
  createdAt: number;
}

export interface KnowledgeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: 'prerequisite' | 'related' | 'extends' | 'example';
  weight: number;
}

export interface AIConversation {
  id: string;
  journalId?: string;
  model: string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
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
}

export interface SyncConfig {
  enabled: boolean;
  owner: string;        // GitHub 用户名，如 sxh313
  repo: string;         // 仓库名
  branch: string;       // 分支，默认 main
  path: string;         // 数据文件路径，默认 data.json
  token: string;        // Personal Access Token（加密存储于本地）
  autoSync: boolean;    // 编辑停顿后自动同步
  lastSyncAt?: number;
  lastSyncSha?: string;
  /** 上次成功同步后各文档的 contentHash 基线（用于三方冲突检测；仅存本地，不同步） */
  baselineHashes?: Record<string, string>;
  /** 是否同步 Agent 运行记录（含撤销快照，可能含敏感内容；默认关闭） */
  syncAgentData?: boolean;
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
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: number;
  updatedAt: number;
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
  }
}

export const db = new StudyJournalDB();
