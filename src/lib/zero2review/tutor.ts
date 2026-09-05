import { routeBoundAI } from '../ai/router';
import type { RetrievedChunk } from '../ai/retrieval';
import { assertCitationAllowList, assertZero2Sources } from './isolation';
import { buildTutorMessages } from './prompts';
import type { Zero2AdaptivePolicy, Zero2ReviewQuestion, Zero2SourceReference, Zero2TutorResponse } from './types';

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
    headingPath: chunk.headingPath,
    startOffset: chunk.offset?.start,
    sourceUrl: chunk.sourceUrl,
    sourceAnchor: chunk.sourceAnchor,
    localUrl: chunk.localUrl,
  }));
}

export async function answerZero2Question(question: string, topicIds: string[], chunks: RetrievedChunk[], adaptivePolicy?: Zero2AdaptivePolicy): Promise<Zero2TutorResponse> {
  assertZero2Sources(chunks);
  const allowed = new Set(chunks.map((chunk) => chunk.chunkId));
  const citations = referencesFromChunks(chunks);
  try {
    const result = await routeBoundAI('reviewTutorModelId', 'qa', buildTutorMessages(question, chunks, adaptivePolicy));
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
    if (validCitations.length === 0) throw new Error('Tutor 返回了没有合法 Citation 的回答');
    return {
      answer,
      topicIds,
      citations: validCitations,
      diagnosticQuestion: prompt ? { id: crypto.randomUUID(), topicId: topicIds[0] || 'unknown', type, prompt, sourceChunkIds: sourceChunkIds.length ? sourceChunkIds : [chunks[0]?.chunkId].filter(Boolean) as string[] } : {
        id: crypto.randomUUID(), topicId: topicIds[0] || 'unknown', type: 'diagnostic', prompt: `请用自己的话总结“${chunks[0]?.heading || chunks[0]?.title || question}”，并说明一个适用边界。`, sourceChunkIds: chunks.slice(0, 2).map((chunk) => chunk.chunkId),
      },
    };
  } catch {
    const fallback = chunks[0];
    return {
      answer: fallback ? `我在 zero2Agent 资料中找到相关内容：\n\n${fallback.content}` : 'zero2Agent 资料中没有足够内容回答这个问题。',
      topicIds,
      citations,
      diagnosticQuestion: fallback ? { id: crypto.randomUUID(), topicId: topicIds[0] || 'unknown', type: 'diagnostic', prompt: `请用自己的话总结“${fallback.heading || fallback.title}”，并说明一个适用边界。`, sourceChunkIds: [fallback.chunkId] } : undefined,
    };
  }
}
