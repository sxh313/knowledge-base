import { db } from '../db/schema';
import { diffLines } from './diff';
import type { AgentOp, AgentOpResult } from './tools';

export interface SyncConflictReport {
  conflictId: string;
  journalId: string;
  title: string;
  local: string;
  remote: string;
  differences: { type: 'added' | 'removed' | 'changed'; text: string }[];
  needsManualReview: boolean;
  draft?: string;
}

export async function explainSyncConflict(conflictId?: string, journalId?: string): Promise<SyncConflictReport | null> {
  const conflict = conflictId
    ? await db.syncConflicts.get(conflictId)
    : journalId
      ? await db.syncConflicts.where('journalId').equals(journalId).filter((c) => !c.resolvedAt).first()
      : await db.syncConflicts.filter((c) => !c.resolvedAt).first();
  if (!conflict) return null;
  const local = conflict.local.content || '';
  const remote = conflict.remote.content || '';
  const differences = diffLines(local, remote)
    .filter((line) => line.type !== 'same')
    .slice(0, 300)
    .map((line) => ({ type: line.type === 'add' ? 'added' as const : line.type === 'remove' ? 'removed' as const : 'changed' as const, text: line.text }));
  const localChanged = local.trim() !== remote.trim();
  return {
    conflictId: conflict.id,
    journalId: conflict.journalId,
    title: conflict.local.title || conflict.remote.title || '冲突文档',
    local,
    remote,
    differences,
    needsManualReview: localChanged,
  };
}

export async function prepareConflictMerge(conflictId?: string, journalId?: string): Promise<SyncConflictReport | null> {
  const report = await explainSyncConflict(conflictId, journalId);
  if (!report) return null;
  // 只生成草案：没有共同段落冲突时保留本地正文并追加远端新增段落，仍要求用户确认。
  const localLines = new Set(report.local.split('\n').map((line) => line.trim()).filter(Boolean));
  const remoteOnly = report.remote.split('\n').filter((line) => line.trim() && !localLines.has(line.trim()));
  const draft = remoteOnly.length ? `${report.local.trim()}\n\n<!-- 远端新增内容，待确认 -->\n${remoteOnly.join('\n')}` : report.local;
  return { ...report, draft };
}

export function conflictToResult(op: AgentOp, report: SyncConflictReport | null): AgentOpResult {
  if (!report) return { op, ok: false, error: '没有找到未解决的同步冲突' };
  return {
    op: op as AgentOp,
    ok: true,
    content: `${report.title}：发现 ${report.differences.length} 处差异${report.needsManualReview ? '，需要人工复核' : ''}。${report.draft ? '已生成合并草案，未写入文档。' : ''}`,
    syncConflict: report,
  };
}
