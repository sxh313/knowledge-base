import { routeAI } from '../ai/router';
import type { RetrievedChunk } from '../ai/retrieval';
import { assertCitationAllowList, assertZero2Sources } from './isolation';
import { buildTutorMessages } from './prompts';
import type { Zero2ReviewQuestion, Zero2SourceReference, Zero2TutorResponse } from './types';

function parseObject(text: string): Record<string, unknown> | null {
  const match = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/) || [text, text];
  const raw = match[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function referencesFromChunks(chunks: RetrievedChunk[]): Zero2SourceReference[] {
  return chunks.map((chunk) => ({
    source: 'zero2agent',
    sourceId: chunk.sourceId,
    chunkId: chunk.chunkId,
    title: chunk.title,
    path: chunk.path || '',
    heading: chunk.heading,
    startOffset: chunk.offset?.start,
  }));
}

export async function answerZero2Question(question: string, topicIds: string[], chunks: RetrievedChunk[]): Promise<Zero2TutorResponse> {
  assertZero2Sources(chunks);
  const allowed = new Set(chunks.map((chunk) => chunk.chunkId));
  const citations = referencesFromChunks(chunks);
  try {
    const result = await routeAI('qa', buildTutorMessages(question, chunks));
    const parsed = parseObject(result.content);
    const answer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : '';
    if (!answer) throw new Error('Tutor 未返回有效回答');
    const citationChunkIds = Array.isArray(parsed?.citationChunkIds)
      ? parsed.citationChunkIds.filter((id): id is string => typeof id === 'string')
      : [];
    const validCitations = assertCitationAllowList(citations.filter((citation) => citationChunkIds.includes(citation.chunkId)), allowed);
    const questionDraft = parsed?.diagnosticQuestion as Record<string, unknown> | undefined;
    const prompt = typeof questionDraft?.prompt === 'string' ? questionDraft.prompt.trim() : '';
    const type = ['recall', 'comparison', 'boundary', 'application', 'diagnostic'].includes(String(questionDraft?.type))
      ? questionDraft?.type as Zero2ReviewQuestion['type']
      : 'diagnostic';
    const sourceChunkIds = Array.isArray(questionDraft?.sourceChunkIds)
      ? questionDraft.sourceChunkIds.filter((id): id is string => typeof id === 'string' && allowed.has(id))
      : [];
    return {
      answer,
      topicIds,
      citations: validCitations.length > 0 ? validCitations : citations,
      diagnosticQuestion: prompt ? { id: crypto.randomUUID(), topicId: topicIds[0] || 'unknown', type, prompt, sourceChunkIds } : undefined,
    };
  } catch {
    const fallback = chunks[0];
    return {
      answer: fallback ? `我在 zero2Agent 资料中找到相关内容：\n\n${fallback.content}` : 'zero2Agent 资料中没有足够内容回答这个问题。',
      topicIds,
      citations,
    };
  }
}
