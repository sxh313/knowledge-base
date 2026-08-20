import { describe, expect, it } from 'vitest';
import { mergeByNewest, mergeData, type FullData } from './merge';

const empty = (): FullData => ({
  version: 2, exportedAt: 0, journals: [], notes: [], cards: [], graphNodes: [], graphEdges: [],
  aiConversations: [], savedSearches: [], journalVersions: [], propertyDefinitions: [], categories: [],
  attachments: [], userPreferences: [], learningGoals: [], learningTasks: [],
});

describe('sync merge', () => {
  it('keeps a newer deletion tombstone instead of reviving stale data', () => {
    const merged = mergeByNewest(
      [{ id: 'card-1', updatedAt: 10, deletedAt: 30 }],
      [{ id: 'card-1', updatedAt: 20 }],
    );
    expect(merged).toEqual([{ id: 'card-1', updatedAt: 10, deletedAt: 30 }]);
  });

  it('merges key-based preferences and tolerates old remote payloads', () => {
    const local = empty();
    local.userPreferences = [{ key: 'documentOrder', value: ['a'], updatedAt: 20 }];
    const remote = { ...empty(), userPreferences: undefined, learningGoals: undefined, learningTasks: undefined } as unknown as FullData;
    const merged = mergeData(local, remote);
    expect(merged.userPreferences).toEqual(local.userPreferences);
    expect(merged.learningGoals).toEqual([]);
  });
});
