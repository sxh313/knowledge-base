import { db, type Zero2Mastery, type Zero2ReviewAttempt, type Zero2ReviewMessage, type Zero2ReviewPlan, type Zero2ReviewSession, type Zero2ReviewTask } from '../db/schema';

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

export async function saveAcceptedMessage(input: Omit<Zero2ReviewMessage, 'id' | 'createdAt'>): Promise<Zero2ReviewMessage> {
  const message: Zero2ReviewMessage = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
  await db.zero2ReviewMessages.add(message);
  await db.zero2ReviewSessions.update(input.sessionId, { updatedAt: Date.now() });
  return message;
}

export async function listAcceptedMessages(sessionId: string): Promise<Zero2ReviewMessage[]> {
  return db.zero2ReviewMessages.where('sessionId').equals(sessionId).sortBy('createdAt');
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
  const attempt: Zero2ReviewAttempt = { ...input, id, answeredAt: Date.now() };
  await db.zero2ReviewAttempts.add(attempt);
  return { attempt, created: true };
}

export async function listTopicAttempts(topicId: string): Promise<Zero2ReviewAttempt[]> {
  return db.zero2ReviewAttempts.where('topicId').equals(topicId).sortBy('answeredAt');
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

export async function listActiveReviewPlans(): Promise<Zero2ReviewPlan[]> {
  return db.zero2ReviewPlans.where('status').equals('active').filter((plan) => !plan.deletedAt).toArray();
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
