import { useEffect, useState } from 'react';
import { listActiveReviewPlans, listReviewSessions } from '../lib/zero2review/repository';
import { useZero2ReviewStore } from '../stores/zero2ReviewStore';
import ReviewHeader from '../components/zero2review/ReviewHeader';
import TodayTaskList from '../components/zero2review/TodayTaskList';
import ReviewConversation from '../components/zero2review/ReviewConversation';
import DiagnosticQuestion from '../components/zero2review/DiagnosticQuestion';
import ReviewPlanPanel from '../components/zero2review/ReviewPlanPanel';
import MasteryPanel from '../components/zero2review/MasteryPanel';
import OutOfScopeNotice from '../components/zero2review/OutOfScopeNotice';

function today() { return new Date().toISOString().slice(0, 10); }

export default function Zero2Review() {
  const { state, input, answer, tasks, mastery, planStatus, setInput, setAnswer, submit, submitAnswer, correctScore, reset, finishTask, skipTask, rebuildPlan, pausePlan, resumePlan, refreshDashboard } = useZero2ReviewStore();
  const [dailyMinutes, setDailyMinutes] = useState(30);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [sessions, plans] = await Promise.all([listReviewSessions(), listActiveReviewPlans()]);
      if (cancelled) return;
      const latest = sessions[0];
      if (latest) await useZero2ReviewStore.getState().restore(latest.id);
      const plan = plans.find((item) => item.goalId === 'learn-agent-interview') ?? plans[0];
      if (plan && !cancelled) await refreshDashboard(plan.id, today());
    })();
    return () => { cancelled = true; };
  }, [refreshDashboard]);
  const generatePlan = () => void rebuildPlan(dailyMinutes, today(), 'learn-agent-interview');
  const rejected = state?.stage === 'rejected';
  return <div className="content-frame-reading review-page space-y-4">
    <ReviewHeader stage={state?.stage} dailyMinutes={dailyMinutes} />
    <div className="review-question card grid gap-3 p-4 md:grid-cols-[1fr_auto_auto]">
      <div className="min-w-0"><div className="mb-2 flex items-center justify-between gap-2"><span className="panel-eyebrow">ASK / 基于原文提问</span><span className="text-[11px] text-[var(--color-text-tertiary)]">Ctrl/⌘ + Enter</span></div><textarea aria-label="复习问题" className="input-field min-h-20 w-full resize-y" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void submit(); } }} placeholder="例如：ReAct 和 Plan-and-Execute 如何选择？" /></div>
      <label className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]"><span>每日</span><input className="input-field w-20 text-sm" type="number" min={10} max={240} value={dailyMinutes} onChange={(event) => setDailyMinutes(Number(event.target.value) || 30)} /><span>分钟</span></label>
      <div className="flex items-center justify-end gap-2"><button className="btn-ghost" onClick={reset}>新会话</button><button className="btn-primary" disabled={!input.trim()} onClick={() => void submit()}>开始提问</button></div>
    </div>
    {state?.clarification && !rejected && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{state.clarification}</div>}
    {rejected && <OutOfScopeNotice message={state.clarification || '该问题不属于 zero2Agent 复习范围。'} />}
    {state?.error && <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">{state.error}</div>}
    <ReviewConversation response={state?.response} />
    <DiagnosticQuestion question={state?.question} evaluation={state?.evaluation} answer={answer} onAnswer={setAnswer} onSubmit={() => void submitAnswer()} onCorrect={(score) => void correctScore(score)} />
    <div className="grid gap-4 lg:grid-cols-2"><TodayTaskList tasks={tasks} onSkip={(id) => void skipTask(id)} onFinish={(id) => void finishTask(id)} /><MasteryPanel mastery={mastery} /></div>
    <ReviewPlanPanel tasks={tasks} dailyMinutes={dailyMinutes} planStatus={planStatus} onRebuild={generatePlan} onPause={() => void pausePlan()} onResume={() => void resumePlan()} />
  </div>;
}
