import { routeAI } from '../ai/router';
import type { RetrievedChunk } from '../ai/retrieval';
import { assertZero2Sources } from './isolation';
import { buildEvaluatorMessages } from './prompts';
import type { Zero2EvaluationDraft, Zero2MistakeType, Zero2ReviewQuestion } from './types';

function parseObject(text: string): Record<string, unknown> | null {
  const fenced = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] || text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

const MISTAKES = new Set<Zero2MistakeType>(['concept', 'boundary', 'comparison', 'application', 'terminology']);
const QUESTION_TYPES = new Set<Zero2ReviewQuestion['type']>(['recall', 'comparison', 'boundary', 'application', 'diagnostic']);

export async function evaluateZero2Answer(question: string, answer: string, chunks: RetrievedChunk[]): Promise<Zero2EvaluationDraft> {
  assertZero2Sources(chunks);
  const allowed = new Set(chunks.map((chunk) => chunk.chunkId));
  try {
    const result = await routeAI('qa', buildEvaluatorMessages(question, answer, chunks));
    const parsed = parseObject(result.content);
    const score = Number(parsed?.score);
    if (![0, 1, 2, 3, 4].includes(score)) throw new Error('invalid score');
    const mistakes = Array.isArray(parsed?.mistakeTypes)
      ? parsed.mistakeTypes.filter((value): value is Zero2MistakeType => typeof value === 'string' && MISTAKES.has(value as Zero2MistakeType))
      : [];
    const evidence = Array.isArray(parsed?.evidenceChunkIds)
      ? parsed.evidenceChunkIds.filter((value): value is string => typeof value === 'string' && allowed.has(value))
      : [];
    const next = typeof parsed?.nextQuestionType === 'string' && QUESTION_TYPES.has(parsed.nextQuestionType as Zero2ReviewQuestion['type'])
      ? parsed.nextQuestionType as Zero2ReviewQuestion['type']
      : 'recall';
    return {
      score: score as Zero2EvaluationDraft['score'],
      correctPoints: Array.isArray(parsed?.correctPoints) ? parsed.correctPoints.filter((value): value is string => typeof value === 'string').slice(0, 8) : [],
      missingPoints: Array.isArray(parsed?.missingPoints) ? parsed.missingPoints.filter((value): value is string => typeof value === 'string').slice(0, 8) : [],
      mistakeTypes: mistakes,
      evidenceChunkIds: evidence,
      nextQuestionType: next,
    };
  } catch {
    return { score: 0, correctPoints: [], missingPoints: ['无法基于当前资料完成可靠评价'], mistakeTypes: ['concept'], evidenceChunkIds: [], nextQuestionType: 'recall' };
  }
}
