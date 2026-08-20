export interface FullData {
  version: number;
  exportedAt: number;
  journals: unknown[];
  notes: unknown[];
  cards: unknown[];
  graphNodes: unknown[];
  graphEdges: unknown[];
  aiConversations: unknown[];
  savedSearches: unknown[];
  journalVersions: unknown[];
  propertyDefinitions: unknown[];
  categories: unknown[];
  attachments: unknown[];
  agentSessions?: unknown[];
  agentMessages?: unknown[];
  agentRuns?: unknown[];
  agentAuditLogs?: unknown[];
  userPreferences: unknown[];
  learningGoals: unknown[];
  learningTasks: unknown[];
  zero2ReviewSessions?: unknown[];
  zero2ReviewMessages?: unknown[];
  zero2Mastery?: unknown[];
  zero2ReviewPlans?: unknown[];
  zero2ReviewTasks?: unknown[];
  zero2ReviewAttempts?: unknown[];
}

interface TimedRow {
  id?: string;
  key?: string;
  updatedAt?: number;
  createdAt?: number;
  deletedAt?: number;
  nextReviewAt?: number;
  lastReviewAt?: number;
}

export function rowTime(row: TimedRow): number {
  return row.deletedAt ?? row.updatedAt ?? row.lastReviewAt ?? row.nextReviewAt ?? row.createdAt ?? 0;
}

export function mergeByNewest(left: unknown[], right: unknown[]): unknown[] {
  const merged = new Map<string, unknown>();
  for (const row of [...left, ...right]) {
    const timed = row as TimedRow;
    const key = timed.id ?? timed.key;
    if (!key) continue;
    const existing = merged.get(key) as TimedRow | undefined;
    if (!existing || rowTime(timed) >= rowTime(existing)) merged.set(key, row);
  }
  return [...merged.values()];
}

export function mergeData(local: FullData, remote: FullData): FullData {
  const r = remote as Partial<FullData>;
  return {
    version: 5,
    exportedAt: Date.now(),
    journals: mergeByNewest(local.journals, r.journals ?? []),
    notes: mergeByNewest(local.notes, r.notes ?? []),
    cards: mergeByNewest(local.cards, r.cards ?? []),
    graphNodes: mergeByNewest(local.graphNodes, r.graphNodes ?? []),
    graphEdges: mergeByNewest(local.graphEdges, r.graphEdges ?? []),
    aiConversations: mergeByNewest(local.aiConversations, r.aiConversations ?? []),
    savedSearches: mergeByNewest(local.savedSearches, r.savedSearches ?? []),
    journalVersions: mergeByNewest(local.journalVersions, r.journalVersions ?? []),
    propertyDefinitions: mergeByNewest(local.propertyDefinitions, r.propertyDefinitions ?? []),
    categories: mergeByNewest(local.categories, r.categories ?? []),
    attachments: mergeByNewest(local.attachments, r.attachments ?? []),
    agentSessions: mergeByNewest(local.agentSessions ?? [], r.agentSessions ?? []),
    agentMessages: mergeByNewest(local.agentMessages ?? [], r.agentMessages ?? []),
    agentRuns: mergeByNewest(local.agentRuns ?? [], r.agentRuns ?? []),
    agentAuditLogs: mergeByNewest(local.agentAuditLogs ?? [], r.agentAuditLogs ?? []),
    userPreferences: mergeByNewest(local.userPreferences ?? [], r.userPreferences ?? []),
    learningGoals: mergeByNewest(local.learningGoals ?? [], r.learningGoals ?? []),
    learningTasks: mergeByNewest(local.learningTasks ?? [], r.learningTasks ?? []),
    zero2ReviewSessions: mergeByNewest(local.zero2ReviewSessions ?? [], r.zero2ReviewSessions ?? []),
    zero2ReviewMessages: mergeByNewest(local.zero2ReviewMessages ?? [], r.zero2ReviewMessages ?? []),
    zero2Mastery: mergeByNewest(local.zero2Mastery ?? [], r.zero2Mastery ?? []),
    zero2ReviewPlans: mergeByNewest(local.zero2ReviewPlans ?? [], r.zero2ReviewPlans ?? []),
    zero2ReviewTasks: mergeByNewest(local.zero2ReviewTasks ?? [], r.zero2ReviewTasks ?? []),
    zero2ReviewAttempts: mergeByNewest(local.zero2ReviewAttempts ?? [], r.zero2ReviewAttempts ?? []),
  };
}
