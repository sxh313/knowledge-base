import Dexie, { type Table } from 'dexie';

// ──── Data Model Interfaces ────

export interface JournalEntry {
  id: string;
  title: string;
  content: string;           // Markdown
  contentPlain: string;      // plain text for search
  summary?: string;          // AI-generated summary
  tags: string[];
  subject: string;
  difficulty?: number;       // 1-5
  timeSpentMinutes?: number;
  sourceType: 'manual' | 'voice' | 'import' | 'webclip';
  sourceRef?: { url?: string; book?: string; course?: string };
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
  embedding?: number[];      // vector for semantic search
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
}

export interface AISettings {
  shengsuanyun: { baseUrl: string; apiKey: string; enabled: boolean };
  relay: { baseUrl: string; apiKey: string; enabled: boolean };
  siliconflow: { baseUrl: string; apiKey: string; enabled: boolean };
  zhipu: { baseUrl: string; apiKey: string; enabled: boolean };
  deepseek: { baseUrl: string; apiKey: string; enabled: boolean };
}

export interface AppSettings {
  id: 'global';
  aiProviders: AISettings;
  preferredModels: {
    highQuality: string;   // default: deepseek-v4-flash
    codeTask: string;      // default: deepseek-v4-flash
    fastTask: string;      // default: deepseek-v4-flash
  };
  /** 各 provider 可用模型列表（从 API /models 刷新获取） */
  availableModels: Record<string, string[]>;
  theme: 'light' | 'dark' | 'auto';
  reviewDailyGoal: number;   // cards per day
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
    // v2: 添加 availableModels + shengsuanyun provider（无索引变更）
    this.version(2).stores({
      journals: 'id, createdAt, updatedAt, subject, *tags, deletedAt',
      notes: 'id, journalId, parentId, position',
      cards: 'id, journalId, nextReviewAt, state, *tags',
      graphNodes: 'id, label, *entryIds',
      graphEdges: 'id, sourceId, targetId, relationType',
      aiConversations: 'id, journalId, createdAt',
      settings: 'id',
    });
  }
}

export const db = new StudyJournalDB();