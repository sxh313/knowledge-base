import { describe, expect, it } from 'vitest';
import { removeLocalOnlyData } from './github';
import type { FullData } from './merge';

const payload = (): FullData => ({
  version: 5,
  exportedAt: 0,
  journals: [
    { id: 'private', title: '私密', subject: '个人' },
    { id: 'public', title: '公开', subject: '工作' },
  ],
  notes: [{ id: 'n-private', journalId: 'private' }, { id: 'n-public', journalId: 'public' }],
  cards: [{ id: 'c-private', journalId: 'private' }, { id: 'c-public', journalId: 'public' }],
  graphNodes: [
    { id: 'g-private', entryIds: ['private'] },
    { id: 'g-public', entryIds: ['public'] },
  ],
  graphEdges: [{ id: 'edge', sourceId: 'g-private', targetId: 'g-public' }],
  aiConversations: [
    { id: 'bound', journalId: 'private' },
    { id: 'cited', citations: [{ journalId: 'private', content: '私密片段' }] },
    { id: 'message-cited', messages: [{ citations: [{ journalId: 'private', content: '私密片段' }] }] },
    { id: 'safe', journalId: 'public' },
  ],
  savedSearches: [],
  journalVersions: [{ id: 'v-private', journalId: 'private' }, { id: 'v-public', journalId: 'public' }],
  propertyDefinitions: [],
  categories: [{ id: 'cat-private', name: '个人' }, { id: 'cat-public', name: '工作' }],
  attachments: [{ id: 'a-private', journalId: 'private' }, { id: 'a-public', journalId: 'public' }],
  agentSessions: [{ id: 'session' }],
  agentMessages: [{ id: 'message', content: '可能包含私密正文' }],
  agentRuns: [{ id: 'run', undo: { versions: [{ journalId: 'private', content: '私密正文' }] } }],
  agentAuditLogs: [{ id: 'audit', journalId: 'private' }],
  userPreferences: [],
  learningGoals: [],
  learningTasks: [],
});

describe('local-only sync boundary', () => {
  it('removes a local-only journal and every linked data path from the cloud payload', () => {
    const safe = removeLocalOnlyData(payload(), new Set(['private']));

    expect(safe.journals).toEqual([{ id: 'public', title: '公开', subject: '工作' }]);
    expect(safe.notes).toEqual([{ id: 'n-public', journalId: 'public' }]);
    expect(safe.cards).toEqual([{ id: 'c-public', journalId: 'public' }]);
    expect(safe.journalVersions).toEqual([{ id: 'v-public', journalId: 'public' }]);
    expect(safe.attachments).toEqual([{ id: 'a-public', journalId: 'public' }]);
    expect(safe.aiConversations).toEqual([{ id: 'safe', journalId: 'public' }]);
    expect(safe.graphNodes).toEqual([{ id: 'g-public', entryIds: ['public'] }]);
    expect(safe.graphEdges).toEqual([]);
    expect(safe.categories).toEqual([{ id: 'cat-public', name: '工作' }]);
    expect(safe.agentSessions).toEqual([]);
    expect(safe.agentMessages).toEqual([]);
    expect(safe.agentRuns).toEqual([]);
    expect(safe.agentAuditLogs).toEqual([]);
  });

  it('leaves a payload unchanged when the device has no local-only journals', () => {
    const data = payload();
    expect(removeLocalOnlyData(data, new Set())).toBe(data);
  });
});
