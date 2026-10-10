import { describe, expect, it } from 'vitest';
import { buildDocumentLinks } from './documents';
import type { JournalEntry } from '../db/schema';

function entry(id: string, title: string, content: string, extra: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id,
    title,
    content,
    contentPlain: content,
    tags: [],
    subject: '',
    sourceType: 'manual',
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

describe('document link indexing', () => {
  it('resolves links against titles and aliases while preserving broken links', () => {
    const target = entry('target', '目标文档', '', { aliases: ['旧名称'] });
    const source = entry('source', '来源文档', '[[目标文档]] [[旧名称]] [[不存在]]');

    expect(buildDocumentLinks(source, [source, target])).toMatchObject([
      { targetId: 'target', targetTitle: '目标文档', broken: false },
      { targetId: 'target', targetTitle: '目标文档', broken: false },
      { targetId: undefined, targetTitle: '不存在', broken: true },
    ]);
  });

  it('ignores deleted targets when rebuilding the graph', () => {
    const source = entry('source', '来源文档', '[[目标文档]]');
    const deletedTarget = entry('target', '目标文档', '', { deletedAt: 2 });

    expect(buildDocumentLinks(source, [source, deletedTarget])).toEqual([
      expect.objectContaining({ targetId: undefined, broken: true, targetTitle: '目标文档' }),
    ]);
  });
});
