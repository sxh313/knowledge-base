import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Check, GitCompare, Copy, Trash2 } from 'lucide-react';
import { getSyncConflicts, resolveSyncConflict, deleteSyncConflict } from '../lib/db/queries';
import type { SyncConflict } from '../lib/db/schema';

interface SyncConflictsProps {
  /** 变化时重新加载（如同步完成后传入 lastSyncAt） */
  refreshKey?: number;
}

/**
 * 同步冲突查看与解决：
 * - 保留本地：维持当前本地版本，忽略远端改动
 * - 用远端覆盖：用远端版本替换本地
 * - 两者都保留：维持本地，并把远端版本存为新文档副本
 */
export default function SyncConflicts({ refreshKey }: SyncConflictsProps) {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setConflicts(await getSyncConflicts());
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const unresolved = conflicts.filter((c) => !c.resolvedAt);

  const handleResolve = async (id: string, resolution: 'local' | 'remote' | 'both') => {
    setBusy(id);
    try {
      await resolveSyncConflict(id, resolution);
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (unresolved.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-[var(--color-danger)]/40 bg-red-50/40 dark:bg-red-900/10 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-danger)] mb-2">
        <AlertTriangle className="h-4 w-4" /> 检测到 {unresolved.length} 处同步冲突
      </p>
      <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">
        以下文档在本地与远端都被修改过，已保留本地版本，请选择如何处理：
      </p>
      <div className="space-y-2">
        {unresolved.map((c) => (
          <div key={c.id} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  <GitCompare className="inline h-3.5 w-3.5 mr-1 text-[var(--color-text-tertiary)]" />
                  {c.local.title || '无标题'}
                </p>
                <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
                  本地更新：{new Date(c.local.updatedAt).toLocaleString('zh-CN')}
                  {' · '}
                  远端更新：{new Date(c.remote.updatedAt).toLocaleString('zh-CN')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <button
                className="btn-ghost text-xs flex items-center gap-1"
                onClick={() => handleResolve(c.id, 'local')}
                disabled={busy === c.id}
                title="维持当前本地版本"
              >
                <Check className="h-3 w-3" /> 保留本地
              </button>
              <button
                className="btn-ghost text-xs flex items-center gap-1"
                onClick={() => handleResolve(c.id, 'remote')}
                disabled={busy === c.id}
                title="用远端版本替换本地"
              >
                <GitCompare className="h-3 w-3" /> 用远端覆盖
              </button>
              <button
                className="btn-ghost text-xs flex items-center gap-1"
                onClick={() => handleResolve(c.id, 'both')}
                disabled={busy === c.id}
                title="保留本地，并把远端版本存为新文档副本"
              >
                <Copy className="h-3 w-3" /> 两者都保留
              </button>
              <button
                className="btn-ghost text-xs flex items-center gap-1 text-[var(--color-text-tertiary)] ml-auto"
                onClick={async () => { await deleteSyncConflict(c.id); await load(); }}
                title="忽略此冲突（不再提示）"
              >
                <Trash2 className="h-3 w-3" /> 忽略
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
