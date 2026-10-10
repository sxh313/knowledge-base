import type { RetrievedChunk, RAGAnswerMode } from './retrieval';

export interface AnswerValidationResult {
  answer: string;
  citations: RetrievedChunk[];
  grounded: boolean;
  coverage: number;
  invalidReferences: string[];
}

function referenceMap(chunks: RetrievedChunk[]): Map<string, RetrievedChunk> {
  const local = chunks.filter((chunk) => chunk.source !== 'web');
  const web = chunks.filter((chunk) => chunk.source === 'web');
  const refs = new Map<string, RetrievedChunk>();
  local.forEach((chunk, index) => refs.set(String(index + 1), chunk));
  web.forEach((chunk, index) => refs.set(`W${index + 1}`, chunk));
  return refs;
}

function factualUnits(answer: string): string[] {
  // 兼容中文常见的“句号后引用”写法：先把引用并入前一句，再按标点切分。
  return answer
    .replace(/([。！？；])(\s*(?:\[[Ww]?\d+\]\s*)+)/g, '$2$1')
    .split(/\n+|(?<=[。！？；])/)
    .map((unit) => unit.trim())
    .filter((unit) => unit && !/^#{1,6}\s/.test(unit) && !/^[-*_]{3,}$/.test(unit))
    .filter((unit) => unit.replace(/\[[Ww]?\d+\]/g, '').replace(/^[-*+\d.、)\s]+/, '').length >= 14);
}

function extractiveFallback(chunks: RetrievedChunk[]): string {
  const local = chunks.filter((chunk) => chunk.source !== 'web');
  const web = chunks.filter((chunk) => chunk.source === 'web');
  const selected = chunks.slice(0, 3);
  return [
    '### 结论',
    '当前生成内容的来源覆盖不足，已改为展示可核对的原文要点。',
    '',
    '### 原文要点',
    ...selected.map((chunk) => {
      const index = chunk.source === 'web' ? `W${web.indexOf(chunk) + 1}` : String(local.indexOf(chunk) + 1);
      return `- ${chunk.content.replace(/\s+/g, ' ').trim().slice(0, 260)} [${index}]`;
    }),
  ].join('\n');
}

/** 对普通 RAG 流式回答做引用白名单与启发式事实覆盖校验。 */
export function validateRAGAnswer(answer: string, chunks: RetrievedChunk[], mode: RAGAnswerMode): AnswerValidationResult {
  const refs = referenceMap(chunks);
  const found = Array.from(answer.matchAll(/\[([Ww]?\d+)\]/g)).map((match) => match[1].toUpperCase());
  const invalidReferences = Array.from(new Set(found.filter((ref) => !refs.has(ref))));
  const sanitized = answer.replace(/\[([Ww]?\d+)\]/g, (_full, raw: string) => refs.has(raw.toUpperCase()) ? `[${raw.toUpperCase()}]` : '');
  const usedRefs = Array.from(new Set(found.filter((ref) => refs.has(ref))));
  const citations = usedRefs.map((ref) => refs.get(ref)!).filter(Boolean);
  const units = factualUnits(sanitized);
  const covered = units.filter((unit) => /\[[Ww]?\d+\]/.test(unit)).length;
  const coverage = units.length ? covered / units.length : (citations.length ? 1 : 0);
  const grounded = citations.length > 0 && invalidReferences.length === 0 && coverage >= 0.6;
  if (mode === 'strict' && !grounded) {
    return {
      answer: extractiveFallback(chunks),
      citations: chunks.slice(0, 3),
      grounded: false,
      coverage,
      invalidReferences,
    };
  }
  const notice = !grounded && mode === 'hybrid'
    ? '\n\n> 来源覆盖提示：部分内容没有直接知识库引用，属于常识补充或模型推断，请独立核对。'
    : '';
  return { answer: `${sanitized.trim()}${notice}`, citations, grounded, coverage, invalidReferences };
}
