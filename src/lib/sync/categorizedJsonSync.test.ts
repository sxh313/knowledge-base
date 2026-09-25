import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../db/schema';
import type { FullData } from './merge';
import {
  combineCategorizedSnapshot,
  documentJsonPath,
  safePathSegment,
  splitCategorizedSnapshot,
} from './categorizedJsonSync';

const journal = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'doc-1',
  title: '同步设计',
  content: '# 正文',
  contentPlain: '正文',
  tags: [],
  subject: '工作/项目',
  sourceType: 'manual',
  createdAt: 1,
  updatedAt: 2,
  ...overrides,
});

const snapshot = (): FullData => ({
  version: 5,
  exportedAt: 0,
  journals: [journal()],
  notes: [{ id: 'note-1', journalId: 'doc-1' }],
  cards: [{ id: 'card-1', journalId: 'doc-1' }, { id: 'global-card' }],
  graphNodes: [],
  graphEdges: [],
  aiConversations: [{ id: 'conversation-1', journalId: 'doc-1' }, { id: 'global-conversation' }],
  savedSearches: [],
  journalVersions: [{ id: 'version-1', journalId: 'doc-1' }],
  propertyDefinitions: [],
  categories: [{ id: 'category-1', name: '工作/项目' }],
  attachments: [{ id: 'attachment-1', journalId: 'doc-1' }],
  userPreferences: [],
  learningGoals: [],
  learningTasks: [],
});

describe('categorized document JSON sync', () => {
  it('uses a safe category directory and stable document id in the filename', () => {
    expect(documentJsonPath(journal())).toBe('documents-json/工作_项目/同步设计--doc-1.json');
    expect(documentJsonPath(journal({ id: 'doc-2', subject: '', title: '' }))).toBe('documents-json/未分类/无标题--doc-2.json');
    expect(documentJsonPath(journal({ id: 'doc-2' }))).not.toBe(documentJsonPath(journal()));
    expect(safePathSegment(' ../A:B\\C.. ', 'fallback')).toBe('_A_B_C');
  });

  it('stores document-linked records in the same JSON package and restores them losslessly', () => {
    const original = snapshot();
    const { meta, documents } = splitCategorizedSnapshot(original);

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      journal: { id: 'doc-1' },
      notes: [{ id: 'note-1', journalId: 'doc-1' }],
      cards: [{ id: 'card-1', journalId: 'doc-1' }],
      journalVersions: [{ id: 'version-1', journalId: 'doc-1' }],
      attachments: [{ id: 'attachment-1', journalId: 'doc-1' }],
      aiConversations: [{ id: 'conversation-1', journalId: 'doc-1' }],
    });
    expect(meta.journals).toEqual([]);
    expect(meta.cards).toEqual([{ id: 'global-card' }]);
    expect(meta.aiConversations).toEqual([{ id: 'global-conversation' }]);

    const restored = combineCategorizedSnapshot(meta, documents);
    expect(restored.journals).toEqual(original.journals);
    const byId = (rows: unknown[]) => [...rows].sort((a, b) => String((a as { id?: string }).id).localeCompare(String((b as { id?: string }).id)));
    expect(byId(restored.notes)).toEqual(byId(original.notes));
    expect(byId(restored.cards)).toEqual(byId(original.cards));
    expect(byId(restored.journalVersions)).toEqual(byId(original.journalVersions));
    expect(byId(restored.attachments)).toEqual(byId(original.attachments));
    expect(byId(restored.aiConversations)).toEqual(byId(original.aiConversations));
  });
});
