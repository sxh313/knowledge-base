import { describe, expect, it } from 'vitest';
import {
  toEvidenceChunks,
  rerankEvidence,
  toEvidenceRefs,
  formatEvidenceRefs,
  DEFAULT_EVIDENCE_TOP_K,
  MIN_EVIDENCE_LENGTH,
  MAX_CHUNKS_PER_DOC,
  type EvidenceChunk,
} from './evidence';
import type { RetrievedChunk } from '../ai/retrieval';

function chunk(patch: Partial<EvidenceChunk>): EvidenceChunk {
  return {
    journalId: 'j1',
    title: '笔记',
    content: '这是一段足够长的笔记内容，用来通过最短长度校验。',
    score: 1,
    ...patch,
  };
}

describe('toEvidenceChunks 证据转换', () => {
  it('仅保留个人文档来源且带 journalId 的片段', () => {
    const retrieved: RetrievedChunk[] = [
      { source: 'personal', journalId: 'j1', sourceId: 's1', chunkId: 'c1', title: 'A', content: '内容内容内容内容', score: 1 },
      { source: 'web', journalId: 'j2', sourceId: 's2', chunkId: 'c2', title: 'B', content: '内容内容内容内容', score: 2 },
      { source: 'personal', journalId: undefined as never, sourceId: 's3', chunkId: 'c3', title: 'C', content: '内容内容内容内容', score: 3 },
    ];
    const chunks = toEvidenceChunks(retrieved);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].journalId).toBe('j1');
  });
});

describe('rerankEvidence 本地重排序', () => {
  it('空候选返回空数组', () => {
    expect(rerankEvidence('问题', [])).toEqual([]);
  });

  it('淘汰过短片段', () => {
    const short = chunk({ journalId: 'a', content: '太短' });
    const result = rerankEvidence('笔记', [short]);
    expect(result).toHaveLength(0);
    expect(short.content.length).toBeLessThan(MIN_EVIDENCE_LENGTH);
  });

  it('淘汰零分且无命中的片段', () => {
    const noHit = chunk({ journalId: 'a', title: '无关标题', content: '完全 unrelated content，与问题没有任何关键词交集。', score: 0 });
    expect(rerankEvidence('react hooks', [noHit])).toHaveLength(0);
  });

  it('标题完整出现在问题中获得最强加分', () => {
    const titleHit = chunk({ journalId: 'a', title: 'react hooks', content: '常规内容，仅用于对照评分基准，补足长度以通过淘汰校验。' });
    const normal = chunk({ journalId: 'b', title: '其他笔记', content: '常规内容，仅用于对照评分基准，补足长度以通过淘汰校验。' });
    const result = rerankEvidence('请讲讲 react hooks 的用法', [titleHit, normal], { topK: 2 });
    expect(result[0].journalId).toBe('a');
  });

  it('用户指定文档获得加分排在前面', () => {
    const preferred = chunk({ journalId: 'a', title: '普通笔记一', content: '相同的内容用于对照，确保原始分数一致，并补足最短长度。', score: 1 });
    const other = chunk({ journalId: 'b', title: '普通笔记二', content: '相同的内容用于对照，确保原始分数一致，并补足最短长度。', score: 1 });
    const result = rerankEvidence('笔记', [other, preferred], { topK: 2, preferredJournalIds: ['a'] });
    expect(result[0].journalId).toBe('a');
  });

  it('单个文档最多保留 MAX_CHUNKS_PER_DOC 个片段', () => {
    const same = ['c1', 'c2', 'c3'].map((chunkId) =>
      chunk({ journalId: 'same', chunkId, content: '同一篇文档的不同片段，内容彼此不同但长度足够。' }),
    );
    const other = chunk({ journalId: 'other', content: '另一篇文档的片段，内容长度足够参与排序。' });
    const result = rerankEvidence('文档 片段', [...same, other], { topK: 10 });
    expect(result.filter((c) => c.journalId === 'same')).toHaveLength(MAX_CHUNKS_PER_DOC);
    expect(result.some((c) => c.journalId === 'other')).toBe(true);
  });

  it('遵守 topK 上限', () => {
    const chunks = Array.from({ length: DEFAULT_EVIDENCE_TOP_K + 4 }, (_, i) =>
      chunk({ journalId: `doc${i}`, title: `笔记${i}`, content: `第 ${i} 篇文档的内容片段，长度足够参与排序。` }),
    );
    const result = rerankEvidence('文档 片段', chunks, { topK: 3 });
    expect(result).toHaveLength(3);
  });
});

describe('证据引用格式化', () => {
  it('toEvidenceRefs 保留定位字段', () => {
    const refs = toEvidenceRefs([
      chunk({ journalId: 'j1', chunkId: 'c1', title: '标题', heading: '章节', content: '内容片段' }),
    ]);
    expect(refs[0]).toMatchObject({ journalId: 'j1', chunkId: 'c1', title: '标题', heading: '章节' });
    expect(refs[0].snippet).toBe('内容片段');
  });

  it('formatEvidenceRefs 空列表返回占位文案', () => {
    expect(formatEvidenceRefs([])).toBe('（本次未命中可靠笔记片段）');
  });

  it('formatEvidenceRefs 输出包含 journalId 与标题', () => {
    const text = formatEvidenceRefs([
      { journalId: 'j9', title: '深度学习笔记', snippet: '片段内容', score: 1 },
    ]);
    expect(text).toContain('journalId=j9');
    expect(text).toContain('《深度学习笔记》');
    expect(text).toContain('[证据1]');
  });
});