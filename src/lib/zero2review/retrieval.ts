import { retrieve, type RetrievedChunk } from '../ai/retrieval';
import type { Zero2SourceReference, Zero2TopicCandidate } from './types';

export interface Zero2ReviewRetrieval {
  chunks: RetrievedChunk[];
  citations: Zero2SourceReference[];
  candidates: Zero2TopicCandidate[];
  sufficient: boolean;
  topScore: number;
  secondScore: number;
  dispersion: number;
}

/** 当前产品的复习域默认对应“Agent 面试通关”课程，可在此切换到完整 zero2Agent。 */
export const DEFAULT_ZERO2_REVIEW_PATH_PREFIX = 'learn-agent-interview/';

function topicIdForChunk(chunk: RetrievedChunk): string {
  return chunk.knowledgeDocId || chunk.sourceId;
}

export async function retrieveZero2Review(question: string, topK = 8, pathPrefix = DEFAULT_ZERO2_REVIEW_PATH_PREFIX): Promise<Zero2ReviewRetrieval> {
  const chunks = await retrieve(question, { kind: 'zero2agent', pathPrefix }, Math.max(2, topK));
  if (chunks.some((chunk) => chunk.source !== 'zero2agent')) {
    throw new Error('复习 Agent 检索到了非法知识源');
  }

  const selected: RetrievedChunk[] = [];
  const perDocument = new Map<string, number>();
  for (const chunk of chunks) {
    const documentId = chunk.knowledgeDocId || chunk.sourceId;
    const count = perDocument.get(documentId) ?? 0;
    if (count >= 2 || chunk.journalId || !chunk.path) continue;
    perDocument.set(documentId, count + 1);
    selected.push(chunk);
    if (selected.length >= topK) break;
  }
  const byTopic = new Map<string, { score: number; count: number }>();
  for (const chunk of selected) {
    const id = topicIdForChunk(chunk);
    const current = byTopic.get(id) ?? { score: 0, count: 0 };
    byTopic.set(id, { score: current.score + chunk.score, count: current.count + 1 });
  }
  const candidates = Array.from(byTopic.entries())
    .map(([topicId, value]) => ({
      topicId,
      score: value.score,
      confidence: Math.min(0.99, value.score / Math.max(1, selected.length * 3)),
      sourceCount: value.count,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const citations: Zero2SourceReference[] = selected.map((chunk) => ({
    source: 'zero2agent',
    sourceId: chunk.sourceId,
    chunkId: chunk.chunkId,
    title: chunk.title,
    path: chunk.path || '',
    heading: chunk.heading,
    headingPath: chunk.headingPath,
    startOffset: chunk.offset?.start,
    sourceUrl: chunk.sourceUrl,
    sourceAnchor: chunk.sourceAnchor,
    localUrl: chunk.localUrl,
  }));

  const sortedScores = candidates.map((candidate) => candidate.score).sort((a, b) => b - a);
  const topScore = sortedScores[0] ?? 0;
  return {
    chunks: selected,
    citations,
    candidates,
    sufficient: candidates.length > 0 && topScore > 0,
    topScore,
    secondScore: sortedScores[1] ?? 0,
    dispersion: candidates.length === 0 ? 0 : candidates.length / Math.max(1, selected.length),
  };
}

