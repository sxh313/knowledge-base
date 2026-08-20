import type { Zero2Mastery } from '../../lib/db/schema';
import { masteryStatus } from '../../lib/zero2review/mastery';
import { listTopicAttempts } from '../../lib/zero2review/repository';
import { explainMasteryWithAttempts } from '../../lib/zero2review/mastery';
import { useState } from 'react';

const labels = { unknown: '未知', 'evidence-insufficient': '证据不足', learning: '学习中', due: '待复习', mastered: '已掌握' } as const;

export default function MasteryPanel({ mastery }: { mastery: Zero2Mastery[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string[]>>({});
  const toggle = async (item: Zero2Mastery) => {
    if (expanded === item.topicId) { setExpanded(null); return; }
    setExpanded(item.topicId);
    if (!explanations[item.topicId]) {
      const attempts = await listTopicAttempts(item.topicId);
      setExplanations((current) => ({ ...current, [item.topicId]: explainMasteryWithAttempts(item, attempts) }));
    }
  };
  return <section className="card space-y-3 p-4"><h2 className="font-semibold">掌握度概览</h2>{mastery.length === 0 ? <p className="text-sm text-[var(--color-text-tertiary)]">完成诊断题后，这里会显示按主题统计的掌握度。</p> : mastery.slice(0, 12).map((item) => <div key={item.topicId} className="rounded border border-[var(--color-border)]"><button className="flex w-full items-center gap-2 p-2 text-left text-sm" onClick={() => void toggle(item)}><span className="min-w-0 flex-1 truncate">{item.topicId}</span><span className="text-xs text-[var(--color-text-secondary)]">{labels[masteryStatus(item)]}</span><span className="w-12 text-right text-xs">{item.mastery == null ? '—' : `${Math.round(item.mastery * 100)}%`}</span><span className="text-xs text-[var(--color-text-tertiary)]">{expanded === item.topicId ? '收起' : '依据'}</span></button>{expanded === item.topicId && <div className="space-y-1 border-t border-[var(--color-border)] p-2 text-xs text-[var(--color-text-secondary)]">{(explanations[item.topicId] ?? ['加载依据…']).map((line) => <p key={line}>{line}</p>)}</div>}</div>)}</section>;
}
