import type { KnowledgeCard } from '../db/schema';

export interface ReviewAnswer {
  cardId: string;
  rating?: 1 | 2 | 3 | 4;
  answer: string;
  correct?: boolean;
  answeredAt: number;
}

export interface ReviewSession {
  id: string;
  cardIds: string[];
  startedAt: number;
  finishedAt?: number;
  answers: ReviewAnswer[];
  status: 'active' | 'finished';
}

const sessions = new Map<string, ReviewSession>();

export function startReviewSession(cards: KnowledgeCard[]): ReviewSession {
  const session: ReviewSession = { id: crypto.randomUUID(), cardIds: cards.map((card) => card.id), startedAt: Date.now(), answers: [], status: 'active' };
  sessions.set(session.id, session);
  return session;
}

export function submitReviewAnswer(sessionId: string, answer: Omit<ReviewAnswer, 'answeredAt'>): ReviewSession {
  const session = sessions.get(sessionId);
  if (!session || session.status !== 'active') throw new Error('复习会话不存在或已结束');
  session.answers.push({ ...answer, answeredAt: Date.now() });
  return session;
}

export function finishReviewSession(sessionId: string): ReviewSession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('复习会话不存在');
  session.status = 'finished';
  session.finishedAt = Date.now();
  return session;
}

export function getReviewSession(sessionId: string): ReviewSession | undefined {
  return sessions.get(sessionId);
}
