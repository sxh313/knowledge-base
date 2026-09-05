import { BrainCircuit, Gauge, Target } from 'lucide-react';
import type { Zero2AdaptivePolicy } from '../../lib/zero2review/types';

const modeLabels = { diagnose: '建立基线', reinforce: '巩固理解', scaffold: '补齐薄弱点', challenge: '提高挑战' } as const;
const typeLabels = { recall: '回忆题', comparison: '对比题', boundary: '边界题', application: '应用题', diagnostic: '诊断题' } as const;

export default function AdaptivePolicyPanel({ policy }: { policy?: Zero2AdaptivePolicy }) {
  if (!policy) return null;
  return <section className="rounded-lg border border-[var(--color-primary)]/20 bg-[var(--color-primary-light)]/45 p-3 text-sm" aria-label="当前学习策略">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-primary)]"><BrainCircuit className="h-4 w-4" />当前学习策略</span>
      <span className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]"><Target className="h-3.5 w-3.5" />{modeLabels[policy.mode]}</span>
      <span className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]"><Gauge className="h-3.5 w-3.5" />{typeLabels[policy.questionType]} · 难度 {policy.difficulty}/5</span>
      {policy.recentScores.length > 0 && <span className="text-xs text-[var(--color-text-tertiary)]">最近评分：{policy.recentScores.join('、')}/4</span>}
    </div>
    <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">{policy.rationale}</p>
    {policy.weakPoints.length > 0 && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">重点关注：{policy.weakPoints.join('、')}</p>}
  </section>;
}