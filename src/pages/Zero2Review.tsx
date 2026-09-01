import { useEffect, useRef, useState } from 'react';
import { BookOpen, Clock3, RefreshCw } from 'lucide-react';
import { listActiveReviewPlans, listReviewSessions } from '../lib/zero2review/repository';
import { useZero2ReviewStore } from '../stores/zero2ReviewStore';
import ReviewHeader from '../components/zero2review/ReviewHeader';
import TodayTaskList from '../components/zero2review/TodayTaskList';
import ReviewConversation from '../components/zero2review/ReviewConversation';
import ReviewPlanPanel from '../components/zero2review/ReviewPlanPanel';
import MasteryPanel from '../components/zero2review/MasteryPanel';
import OutOfScopeNotice from '../components/zero2review/OutOfScopeNotice';

function today() { return new Date().toISOString().slice(0, 10); }

export default function Zero2Review() {
  const { state, tasks, mastery, planStatus, loadingReview, startAutomaticReview, finishTask, skipTask, rebuildPlan, pausePlan, resumePlan, refreshDashboard } = useZero2ReviewStore();
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    let cancelled = false;
    void (async () => {
      const [sessions, plans] = await Promise.all([listReviewSessions(), listActiveReviewPlans()]);
      if (cancelled) return;
      const latest = sessions[0];
      if (latest) await useZero2ReviewStore.getState().restore(latest.id);
      const plan = plans.find((item) => item.goalId === 'learn-agent-interview') ?? plans[0];
      if (plan && !cancelled) await refreshDashboard(plan.id, today());
      if (!plan && !cancelled) await rebuildPlan(dailyMinutes, today(), 'learn-agent-interview');
      if (!cancelled && !useZero2ReviewStore.getState().state?.response) await startAutomaticReview(dailyMinutes, today(), 'learn-agent-interview');
    })();
    return () => { cancelled = true; };
  }, [dailyMinutes, rebuildPlan, refreshDashboard, startAutomaticReview]);
  const generatePlan = () => void rebuildPlan(dailyMinutes, today(), 'learn-agent-interview');
  const rejected = state?.stage === 'rejected';
  return <div className="content-frame-reading review-page space-y-4">
    <ReviewHeader stage={state?.stage} dailyMinutes={dailyMinutes} />
    <section className="review-question card flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-[var(--color-primary)]" />今日复习已自动安排</div><p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">系统会根据到期时间、薄弱主题和课程顺序选择内容。知识讲解与来源只读，无需填写问题或提交答案。</p></div>
      <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]"><Clock3 className="h-3.5 w-3.5" />每日<input aria-label="每日学习时间" className="input-field h-9 w-20 text-sm" type="number" min={10} max={240} value={dailyMinutes} onChange={(event) => setDailyMinutes(Number(event.target.value) || 30)} />分钟</label>
      <button className="btn-primary shrink-0 text-xs" disabled={loadingReview} onClick={() => void startAutomaticReview(dailyMinutes, today(), 'learn-agent-interview')}>{loadingReview ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{state?.response ? '换一个复习主题' : '生成今日复习'}</button>
    </section>
    {state?.clarification && !rejected && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{state.clarification}</div>}
    {rejected && <OutOfScopeNotice message={state.clarification || '该问题不属于 zero2Agent 复习范围。'} />}
    {state?.error && <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">{state.error}</div>}
    <ReviewConversation response={state?.response} />
    <div className="grid gap-4 lg:grid-cols-2"><TodayTaskList tasks={tasks} onSkip={(id) => void skipTask(id)} onFinish={(id) => void finishTask(id)} /><MasteryPanel mastery={mastery} /></div>
    <ReviewPlanPanel tasks={tasks} dailyMinutes={dailyMinutes} planStatus={planStatus} onRebuild={generatePlan} onPause={() => void pausePlan()} onResume={() => void resumePlan()} />
  </div>;
}
