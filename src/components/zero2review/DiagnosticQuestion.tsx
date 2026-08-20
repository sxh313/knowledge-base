import type { Zero2ReviewQuestion } from '../../lib/zero2review/types';
import type { Zero2EvaluationDraft } from '../../lib/zero2review/types';

export default function DiagnosticQuestion({ question, answer, evaluation, onAnswer, onSubmit, onCorrect }: { question?: Zero2ReviewQuestion; answer: string; evaluation?: Zero2EvaluationDraft; onAnswer: (value: string) => void; onSubmit: () => void; onCorrect?: (score: 0 | 1 | 2 | 3 | 4) => void }) {
  if (!question && !evaluation) return null;
  if (!question) {
    if (!evaluation) return null;
    return <section className="card space-y-2 p-4"><h2 className="font-semibold">本次评价：{evaluation.score}/4</h2>{evaluation.missingPoints.length > 0 && <p className="text-sm text-[var(--color-text-secondary)]">遗漏：{evaluation.missingPoints.join('；')}</p>}{onCorrect && <div className="flex flex-wrap gap-1 text-xs"><span className="self-center text-[var(--color-text-tertiary)]">修正评分：</span>{([0, 1, 2, 3, 4] as const).map((score) => <button key={score} className={`btn-ghost ${evaluation.score === score ? 'border-[var(--color-primary)]' : ''}`} onClick={() => onCorrect(score)}>{score}</button>)}</div>}</section>;
  }
  return <section className="card space-y-3 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">诊断题</h2><span className="text-xs text-[var(--color-text-tertiary)]">{question.type}</span></div><p className="text-sm leading-6">{question.prompt}</p><textarea className="input-field min-h-24 w-full" value={answer} onChange={(event) => onAnswer(event.target.value)} placeholder="用自己的话回答，提交后才会更新掌握度" /><button className="btn-primary" disabled={!answer.trim()} onClick={onSubmit}>提交答案</button></section>;
}
