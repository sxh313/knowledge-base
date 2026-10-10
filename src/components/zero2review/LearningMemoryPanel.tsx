import { useEffect, useMemo, useState } from 'react';
import { Check, History, Plus, Trash2 } from 'lucide-react';
import type { Zero2LearningMemory, Zero2Mastery } from '../../lib/db/schema';
import { confirmLearningMemory, deleteLearningMemory, listLearningMemories, markLearningMemoryWeak, saveLearningMemory } from '../../lib/zero2review/repository';
import { masteryStatus } from '../../lib/zero2review/mastery';

const kindLabels = { weak_point: '薄弱点', preference: '学习偏好', mastery: '已掌握', prerequisite: '前置知识' } as const;

export default function LearningMemoryPanel({ mastery, refreshKey }: { mastery: Zero2Mastery[]; refreshKey?: string }) {
  const [memories, setMemories] = useState<Zero2LearningMemory[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preference, setPreference] = useState('');
  const load = async () => setMemories(await listLearningMemories());
  useEffect(() => { void load(); }, [refreshKey]);
  const weakPoints = useMemo(() => memories.filter((memory) => memory.kind === 'weak_point'), [memories]);
  const confirmed = useMemo(() => memories.filter((memory) => memory.kind === 'mastery'), [memories]);
  const act = async (id: string, action: 'confirm' | 'weak' | 'delete') => {
    setBusyId(id);
    try {
      if (action === 'confirm') await confirmLearningMemory(id);
      else if (action === 'weak') await markLearningMemoryWeak(id);
      else await deleteLearningMemory(id);
      await load();
    } finally { setBusyId(null); }
  };
  const addPreference = async () => {
    const content = preference.trim();
    if (!content) return;
    setBusyId('new-preference');
    try {
      await saveLearningMemory({ kind: 'preference', content: `学习偏好：${content}`, confidence: 1, userConfirmed: true });
      setPreference('');
      await load();
      setExpanded(true);
    } finally { setBusyId(null); }
  };
  return <section className="card space-y-3 p-4" aria-label="学习记忆">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="font-semibold">学习记忆</h2><p className="mt-1 text-xs text-[var(--color-text-secondary)]">只记录有作答来源的判断，可随时纠正或删除。</p></div>
      <button type="button" className="btn-ghost inline-flex h-8 items-center gap-1 px-2 text-xs" onClick={() => setExpanded((value) => !value)}>{expanded ? '收起' : '查看记录'} <History className="h-3.5 w-3.5" /></button>
    </div>
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <div className="rounded-md bg-[var(--color-surface-2)] px-2.5 py-2"><span className="block text-[var(--color-text-tertiary)]">薄弱点</span><b className="mt-1 block text-sm">{weakPoints.length}</b></div>
      <div className="rounded-md bg-[var(--color-surface-2)] px-2.5 py-2"><span className="block text-[var(--color-text-tertiary)]">已确认</span><b className="mt-1 block text-sm">{confirmed.length}</b></div>
      <div className="rounded-md bg-[var(--color-surface-2)] px-2.5 py-2"><span className="block text-[var(--color-text-tertiary)]">待复习</span><b className="mt-1 block text-sm">{mastery.filter((item) => masteryStatus(item) === 'due').length}</b></div>
      <div className="rounded-md bg-[var(--color-surface-2)] px-2.5 py-2"><span className="block text-[var(--color-text-tertiary)]">主题数</span><b className="mt-1 block text-sm">{mastery.length}</b></div>
    </div>
    {expanded && <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
      <div className="flex flex-col gap-2 sm:flex-row"><input className="input-field min-w-0 flex-1 text-xs" value={preference} onChange={(event) => setPreference(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addPreference(); } }} placeholder="记录偏好，例如：先举例，再解释原理" aria-label="新增学习偏好" /><button type="button" className="btn-ghost inline-flex items-center justify-center gap-1 text-xs" disabled={!preference.trim() || busyId === 'new-preference'} onClick={() => void addPreference()}><Plus className="h-3.5 w-3.5" />记录偏好</button></div>
      {memories.length === 0 ? <p className="text-xs text-[var(--color-text-tertiary)]">完成一次带来源的诊断作答后，这里会出现学习记忆。</p> : memories.slice(0, 12).map((memory) => <div key={memory.id} className="flex items-start gap-2 rounded-md border border-[var(--color-border)] p-2.5">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-medium text-[var(--color-primary)]">{kindLabels[memory.kind]}</span>{memory.topicId && <span className="truncate text-[10px] text-[var(--color-text-tertiary)]">{memory.topicId}</span>}{memory.userConfirmed && <span className="text-[10px] text-[var(--color-success)]">用户确认</span>}</div><p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{memory.content}</p><p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">置信度 {Math.round(memory.confidence * 100)}% · 来源 {memory.sourceAttemptIds.length} 次作答{memory.sourceMessageIds.length > 0 ? ` · ${memory.sourceMessageIds.length} 条教练记录` : ''}</p></div>
        <div className="flex shrink-0 gap-1"><button type="button" className="btn-ghost h-7 px-1.5 text-[10px]" disabled={busyId === memory.id || memory.kind === 'mastery'} onClick={() => void act(memory.id, 'confirm')} title="标记为已掌握"><Check className="h-3 w-3" />{memory.kind === 'mastery' ? '已确认' : '已掌握'}</button>{memory.kind === 'mastery' && <button type="button" className="btn-ghost h-7 px-1.5 text-[10px]" disabled={busyId === memory.id} onClick={() => void act(memory.id, 'weak')} title="改回待复习"><History className="h-3 w-3" />仍需复习</button>}<button type="button" className="btn-ghost h-7 w-7 p-1.5 text-[var(--color-danger)]" disabled={busyId === memory.id} onClick={() => void act(memory.id, 'delete')} title="删除这条学习记忆"><Trash2 className="h-3 w-3" /></button></div>
      </div>)}
    </div>}
  </section>;
}
