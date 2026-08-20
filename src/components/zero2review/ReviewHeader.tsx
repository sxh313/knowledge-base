import { Brain, Clock3 } from 'lucide-react';
import type { Zero2ReviewStage } from '../../lib/zero2review/types';

const labels: Record<Zero2ReviewStage, string> = {
  idle: '待开始', classifying: '识别主题', clarifying: '等待澄清', retrieving: '检索原文', answering: '生成讲解', awaiting_answer: '等待作答', evaluating: '评价答案', planning: '生成计划', complete: '已完成', rejected: '范围外', error: '需要重试',
};

export default function ReviewHeader({ stage, dailyMinutes = 30, onStart }: { stage?: Zero2ReviewStage; dailyMinutes?: number; onStart?: () => void }) {
  return <header className="page-hero flex flex-wrap items-center justify-between gap-4">
    <div className="page-hero-copy"><div className="page-kicker flex items-center gap-1"><Brain className="h-3.5 w-3.5" /> Source-grounded review</div><h1 className="text-xl font-bold">Agent 面试复习教练</h1><p className="page-subtitle">只使用 Agent 面试通关 Markdown 原文；提问不会直接提高掌握度。</p></div>
    <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]"><span className="rounded-full border border-[var(--color-border)] px-2 py-1">{labels[stage ?? 'idle']}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />每天 {dailyMinutes} 分钟</span>{onStart && <button className="btn-primary text-xs" onClick={onStart}>开始新会话</button>}</div>
  </header>;
}
