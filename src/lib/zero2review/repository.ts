import { db, type Zero2LearningMemory, type Zero2LearningMemoryKind, type Zero2Mastery, type Zero2ReviewAttempt, type Zero2ReviewMessage, type Zero2ReviewPlan, type Zero2ReviewSession, type Zero2ReviewTask } from '../db/schema';
import { assertZero2Source } from './isolation';

export async function createReviewSession(title = 'zero2Agent 复习'): Promise<Zero2ReviewSession> {
  const now = Date.now();
  const session: Zero2ReviewSession = { id: crypto.randomUUID(), title, status: 'active', createdAt: now, updatedAt: now };
  await db.zero2ReviewSessions.add(session);
  return session;
}

export async function listReviewSessions(): Promise<Zero2ReviewSession[]> {
  return db.zero2ReviewSessions
    .filter((session) => !session.deletedAt)
    .sortBy('updatedAt')
    .then((sessions) => sessions.reverse());
}

export async function getReviewSession(id: string): Promise<Zero2ReviewSession | undefined> {
  return db.zero2ReviewSessions.get(id);
}

export async function archiveReviewSession(id: string): Promise<void> {
  await db.zero2ReviewSessions.update(id, { status: 'archived', updatedAt: Date.now() });
}

export async function softDeleteReviewSession(id: string): Promise<void> {
  const now = Date.now();
  await db.zero2ReviewSessions.update(id, { status: 'archived', deletedAt: now, updatedAt: now });
}

export async function saveAcceptedMessage(input: Omit<Zero2ReviewMessage, 'id' | 'createdAt'>): Promise<Zero2ReviewMessage> {
  input.citations.forEach(assertZero2Source);
  const now = Date.now();
  const message: Zero2ReviewMessage = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await db.zero2ReviewMessages.add(message);
  await db.zero2ReviewSessions.update(input.sessionId, { updatedAt: Date.now() });
  return message;
}

export async function saveAcceptedExchange(
  user: Omit<Zero2ReviewMessage, 'id' | 'createdAt'>,
  assistant: Omit<Zero2ReviewMessage, 'id' | 'createdAt'>,
): Promise<[Zero2ReviewMessage, Zero2ReviewMessage]> {
  user.citations.forEach(assertZero2Source);
  assistant.citations.forEach(assertZero2Source);
  const now = Date.now();
  const userMessage: Zero2ReviewMessage = { ...user, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  const assistantMessage: Zero2ReviewMessage = { ...assistant, id: crypto.randomUUID(), createdAt: now + 1, updatedAt: now + 1 };
  await db.transaction('rw', db.zero2ReviewSessions, db.zero2ReviewMessages, async () => {
    await db.zero2ReviewMessages.bulkAdd([userMessage, assistantMessage]);
    await db.zero2ReviewSessions.update(user.sessionId, { updatedAt: now + 1 });
  });
  return [userMessage, assistantMessage];
}

export async function saveAcceptedExchangeAndMastery(
  user: Omit<Zero2ReviewMessage, 'id' | 'createdAt'>,
  assistant: Omit<Zero2ReviewMessage, 'id' | 'createdAt'>,
  mastery: Zero2Mastery[],
): Promise<void> {
  user.citations.forEach(assertZero2Source);
  assistant.citations.forEach(assertZero2Source);
  const now = Date.now();
  const userMessage: Zero2ReviewMessage = { ...user, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  const assistantMessage: Zero2ReviewMessage = { ...assistant, id: crypto.randomUUID(), createdAt: now + 1, updatedAt: now + 1 };
  await db.transaction('rw', db.zero2ReviewSessions, db.zero2ReviewMessages, db.zero2Mastery, async () => {
    await db.zero2ReviewMessages.bulkAdd([userMessage, assistantMessage]);
    if (mastery.length) await db.zero2Mastery.bulkPut(mastery);
    await db.zero2ReviewSessions.update(user.sessionId, { updatedAt: now + 1 });
  });
}

export async function listAcceptedMessages(sessionId: string): Promise<Zero2ReviewMessage[]> {
  return (await db.zero2ReviewMessages.where('sessionId').equals(sessionId).sortBy('createdAt')).filter((message) => !message.deletedAt);
}

export async function getLatestReviewMessage(sessionId: string): Promise<Zero2ReviewMessage | undefined> {
  const messages = await listAcceptedMessages(sessionId);
  return messages.length > 0 ? messages[messages.length - 1] : undefined;
}

export async function getTopicMastery(topicId: string): Promise<Zero2Mastery | undefined> {
  return db.zero2Mastery.get(topicId);
}

export async function listTopicMastery(): Promise<Zero2Mastery[]> {
  return db.zero2Mastery.filter((item) => !item.deletedAt).toArray();
}

export async function listDueTopicMastery(now = Date.now()): Promise<Zero2Mastery[]> {
  return (await listTopicMastery()).filter((item) => item.nextReviewAt <= now);
}

export async function saveTopicMastery(input: Zero2Mastery): Promise<void> {
  await db.zero2Mastery.put({ ...input, updatedAt: Date.now() });
}

export async function recordAttempt(input: Omit<Zero2ReviewAttempt, 'id' | 'answeredAt'>, idempotencyKey?: string): Promise<{ attempt: Zero2ReviewAttempt; created: boolean }> {
  const id = idempotencyKey || crypto.randomUUID();
  const existing = await db.zero2ReviewAttempts.get(id);
  if (existing) return { attempt: existing, created: false };
  const now = Date.now();
  const attempt: Zero2ReviewAttempt = { ...input, id, answeredAt: now, updatedAt: now };
  await db.zero2ReviewAttempts.add(attempt);
  return { attempt, created: true };
}

export async function recordAttemptAndMastery(
  input: Omit<Zero2ReviewAttempt, 'id' | 'answeredAt'>,
  mastery: Zero2Mastery,
  idempotencyKey?: string,
): Promise<{ attempt: Zero2ReviewAttempt; created: boolean }> {
  const id = idempotencyKey || crypto.randomUUID();
  const existing = await db.zero2ReviewAttempts.get(id);
  if (existing) return { attempt: existing, created: false };
  const now = Date.now();
  const attempt: Zero2ReviewAttempt = { ...input, id, answeredAt: now, updatedAt: now };
  await db.transaction('rw', db.zero2ReviewAttempts, db.zero2Mastery, async () => {
    await db.zero2ReviewAttempts.add(attempt);
    await db.zero2Mastery.put({ ...mastery, updatedAt: now });
  });
  return { attempt, created: true };
}

export async function listTopicAttempts(topicId: string): Promise<Zero2ReviewAttempt[]> {
  return (await db.zero2ReviewAttempts.where('topicId').equals(topicId).sortBy('answeredAt')).filter((attempt) => !attempt.deletedAt);
}

export async function updateAttemptScore(id: string, score: Zero2ReviewAttempt['score'], mistakeTypes?: Zero2ReviewAttempt['mistakeTypes']): Promise<void> {
  await db.zero2ReviewAttempts.update(id, { score, ...(mistakeTypes ? { mistakeTypes } : {}), updatedAt: Date.now() });
}

export async function createReviewPlan(input: Omit<Zero2ReviewPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<Zero2ReviewPlan> {
  const now = Date.now();
  const plan: Zero2ReviewPlan = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await db.zero2ReviewPlans.add(plan);
  return plan;
}

export async function updateReviewPlan(id: string, patch: Partial<Zero2ReviewPlan>): Promise<void> {
  await db.zero2ReviewPlans.update(id, { ...patch, updatedAt: Date.now() });
}

export async function getReviewPlan(id: string): Promise<Zero2ReviewPlan | undefined> {
  return db.zero2ReviewPlans.get(id);
}

export async function listActiveReviewPlans(): Promise<Zero2ReviewPlan[]> {
  return db.zero2ReviewPlans.where('status').equals('active').filter((plan) => !plan.deletedAt).toArray();
}

export async function getActiveReviewPlan(goalId: string): Promise<Zero2ReviewPlan | undefined> {
  return db.zero2ReviewPlans.where('goalId').equals(goalId).filter((plan) => plan.status === 'active' && !plan.deletedAt).first();
}

export async function softDeleteReviewPlan(id: string): Promise<void> {
  const now = Date.now();
  await db.zero2ReviewPlans.update(id, { status: 'paused', deletedAt: now, updatedAt: now });
}

export async function saveReviewTasks(tasks: Zero2ReviewTask[]): Promise<void> {
  if (tasks.length > 0) await db.zero2ReviewTasks.bulkPut(tasks);
}

export async function listReviewTasks(planId: string, fromDate?: string): Promise<Zero2ReviewTask[]> {
  const tasks = await db.zero2ReviewTasks.where('planId').equals(planId).toArray();
  return tasks
    .filter((task) => !task.deletedAt && (!fromDate || task.date >= fromDate))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

export async function updateReviewTask(id: string, patch: Partial<Pick<Zero2ReviewTask, 'date' | 'status' | 'estimatedMinutes'>>): Promise<void> {
  await db.zero2ReviewTasks.update(id, { ...patch, updatedAt: Date.now() });
}

/** 已完成/跳过任务不可被重新规划覆盖；只更新仍待执行的同 id 任务。 */
export async function saveReviewTasksPreservingCompleted(tasks: Zero2ReviewTask[]): Promise<void> {
  if (!tasks.length) return;
  const ids = tasks.map((task) => task.id);
  const existing = await db.zero2ReviewTasks.bulkGet(ids);
  const safe = tasks.map((task, index) => {
    const old = existing[index];
    if (old && old.status !== 'todo') return old;
    return { ...task, updatedAt: Date.now(), createdAt: old?.createdAt ?? Date.now() };
  });
  await db.zero2ReviewTasks.bulkPut(safe);
}

export async function listLearningMemories(): Promise<Zero2LearningMemory[]> {
  return db.zero2LearningMemories
    .filter((memory) => !memory.deletedAt)
    .sortBy('updatedAt')
    .then((memories) => memories.reverse());
}

export async function saveLearningMemory(input: {
  topicId?: string;
  kind: Zero2LearningMemoryKind;
  content: string;
  sourceMessageIds?: string[];
  sourceAttemptIds?: string[];
  confidence: number;
  userConfirmed?: boolean;
}): Promise<Zero2LearningMemory> {
  const content = input.content.trim();
  if (!content) throw new Error('学习记忆内容不能为空');
  const now = Date.now();
  const existing = await db.zero2LearningMemories
    .filter((memory) => !memory.deletedAt && memory.topicId === input.topicId && memory.kind === input.kind && memory.content === content)
    .first();
  if (existing) {
    const updated = { ...existing, sourceMessageIds: Array.from(new Set([...(existing.sourceMessageIds ?? []), ...(input.sourceMessageIds ?? [])])), sourceAttemptIds: Array.from(new Set([...(existing.sourceAttemptIds ?? []), ...(input.sourceAttemptIds ?? [])])), confidence: Math.max(existing.confidence, Math.max(0, Math.min(1, input.confidence))), userConfirmed: input.userConfirmed ?? existing.userConfirmed, updatedAt: now };
    await db.zero2LearningMemories.put(updated);
    return updated;
  }
  const memory: Zero2LearningMemory = { id: crypto.randomUUID(), topicId: input.topicId, kind: input.kind, content, sourceMessageIds: Array.from(new Set(input.sourceMessageIds ?? [])), sourceAttemptIds: Array.from(new Set(input.sourceAttemptIds ?? [])), confidence: Math.max(0, Math.min(1, input.confidence)), userConfirmed: input.userConfirmed, createdAt: now, updatedAt: now };
  await db.zero2LearningMemories.add(memory);
  return memory;
}

export async function deleteLearningMemory(id: string): Promise<void> {
  await db.zero2LearningMemories.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
}

export async function confirmLearningMemory(id: string): Promise<void> {
  const memory = await db.zero2LearningMemories.get(id);
  if (!memory) return;
  await db.zero2LearningMemories.update(id, { kind: 'mastery', content: `已确认掌握：${memory.content.replace(/^待加强：/, '')}`, confidence: 1, userConfirmed: true, updatedAt: Date.now() });
}

export async function markLearningMemoryWeak(id: string): Promise<void> {
  const memory = await db.zero2LearningMemories.get(id);
  if (!memory) return;
  await db.zero2LearningMemories.update(id, { kind: 'weak_point', content: `待加强：${memory.content.replace(/^已确认掌握：/, '')}`, userConfirmed: true, updatedAt: Date.now() });
}
