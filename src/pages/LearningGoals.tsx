import { useEffect, useMemo, useState } from 'react';
import { Bell, BookOpen, Check, Clock3, ListChecks, Plus, Target } from 'lucide-react';
import {
  createAgentCourseGoal,
  createLearningGoal,
  createTasksForGoal,
  listLearningGoals,
  listLearningTasks,
  updateLearningTask,
  type LearningGoal,
  type LearningTask,
} from '../lib/agent/learning';
import { buildAgentCourseTasks, learningLocalDate, loadAgentCourse } from '../lib/agent/coursePlanner';
import { showToast } from '../lib/ui/toast';

function sourceHref(source: NonNullable<LearningTask['sourceRefs']>[number]): string {
  return source.sourceUrl || `/source/zero2agent?topicId=${encodeURIComponent(source.sourceId || '')}`;
}

export default function LearningGoals() {
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [tasks, setTasks] = useState<LearningTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [deadline, setDeadline] = useState('');
  const [agentCourse, setAgentCourse] = useState(true);
  const [preview, setPreview] = useState<LearningTask[] | null>(null);

  const reload = async () => {
    const nextGoals = await listLearningGoals();
    setGoals(nextGoals);
    setTasks((await Promise.all(nextGoals.map((goal) => listLearningTasks(goal.id)))).flat());
    setLoading(false);
  };

  useEffect(() => { void reload().catch(() => setLoading(false)); }, []);

  const groups = useMemo(
    () => goals.map((goal) => ({ goal, tasks: tasks.filter((task) => task.goalId === goal.id) })),
    [goals, tasks],
  );
  const today = learningLocalDate();

  const finish = async (task: LearningTask) => {
    const status = task.status === 'done' ? 'todo' : 'done';
    await updateLearningTask(task.id, { status });
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item));
  };

  const addGoal = async () => {
    if (!title.trim()) return;
    if (agentCourse) {
      await createAgentCourseGoal({ title, dailyMinutes, deadline: deadline || undefined, level: '未设置' });
    } else {
      const goal = await createLearningGoal({ title, dailyMinutes, deadline: deadline || undefined, level: '未设置' });
      await createTasksForGoal(goal, [], [goal.title]);
    }
    setTitle('');
    setDeadline('');
    setDailyMinutes(30);
    await reload();
  };

  const previewPlan = async () => {
    if (!title.trim() || !agentCourse) return;
    const draft: LearningGoal = { id: 'preview', title, dailyMinutes, deadline: deadline || undefined, level: '预览', status: 'active', createdAt: 0, updatedAt: 0 };
    setPreview(buildAgentCourseTasks(draft, await loadAgentCourse()));
  };

  const shiftOverdue = async (plan: LearningTask[]) => {
    const overdue = plan.filter((task) => task.date < today && task.status === 'todo').sort((a, b) => a.date.localeCompare(b.date));
    await Promise.all(overdue.map((task, index) => {
      const date = new Date(`${today}T12:00:00`);
      date.setDate(date.getDate() + index);
      return updateLearningTask(task.id, { date: date.toISOString().slice(0, 10) });
    }));
    showToast('success', '已顺延未完成任务', '课程内容保持不变，日期已重新排到今天起。');
    await reload();
  };

  const enableNotifications = async () => {
    if (!('Notification' in window)) { showToast('warning', '当前环境不支持桌面通知'); return; }
    if (Notification.permission !== 'granted') await Notification.requestPermission();
    showToast(Notification.permission === 'granted' ? 'success' : 'warning', Notification.permission === 'granted' ? '每日任务提醒已开启' : '未获得通知权限');
  };

  return (
    <div className="content-frame animate-fade-in space-y-5">
      <header className="page-hero">
        <div className="page-hero-copy"><div className="flex items-center gap-2"><Target className="h-5 w-5 text-[var(--color-primary)]" /><div><h1 className="text-xl font-bold">学习与复习</h1><p className="text-xs text-[var(--color-text-secondary)]">系统依据内置 Agent 课程自动安排；你只需查看当天任务并完成学习。</p></div></div></div>
        <button className="btn-ghost inline-flex items-center gap-1 text-xs" onClick={() => void enableNotifications()} type="button"><Bell className="h-3.5 w-3.5" />开启每日提醒</button>
      </header>

      <div className="card learning-goal-form p-4">
        <label className="learning-field learning-title-field"><span>目标</span><input className="input-field text-sm" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：一周学完 Agent 基础" /></label>
        <label className="learning-field"><span><Clock3 className="h-3.5 w-3.5" />每日时间</span><input className="input-field text-sm" type="number" min={10} value={dailyMinutes} onChange={(event) => setDailyMinutes(Number(event.target.value) || 30)} /></label>
        <label className="learning-field"><span>截止日期</span><input className="input-field text-sm" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
        <div className="flex gap-2"><button className="btn-secondary text-sm" onClick={() => void previewPlan()} type="button">预览计划</button><button className="btn-primary learning-create-button flex items-center justify-center gap-1 text-sm" onClick={() => void addGoal()} type="button"><Plus className="h-4 w-4" />确认生成</button></div>
        <label className="col-span-full flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text-secondary)]"><input type="checkbox" checked={agentCourse} onChange={(event) => setAgentCourse(event.target.checked)} /><ListChecks className="h-3.5 w-3.5 text-[var(--color-primary)]" />使用内置 Agent 课程自动排期；课程原文与练习资料始终只读。</label>
      </div>

      {preview && <div className="card p-4 text-sm"><div className="font-medium">计划预览 · 共 {preview.length} 天</div><p className="mt-1 text-xs text-[var(--color-text-secondary)]">确认前可继续调整目标、日期和每日时长。</p><ol className="mt-3 space-y-1 text-xs text-[var(--color-text-secondary)]">{preview.slice(0, 6).map((task) => <li key={task.id}>{task.date} · {task.title}</li>)}{preview.length > 6 && <li>…其余 {preview.length - 6} 天</li>}</ol></div>}
      <p className="px-1 text-xs text-[var(--color-text-tertiary)]">提醒说明：应用打开时会在设定时间提示今日任务；若希望软件关闭后仍准时提醒，需要桌面端后台服务或系统级定时任务。</p>
      {loading && <div className="card p-5 text-sm text-[var(--color-text-secondary)]">正在加载课程学习计划…</div>}

      {groups.map(({ goal, tasks: plan }) => {
        const done = plan.filter((task) => task.status === 'done').length;
        const progress = plan.length ? Math.round(done / plan.length * 100) : 0;
        const todayTask = plan.find((task) => task.date === today && task.status !== 'done');
        const overdue = plan.filter((task) => task.date < today && task.status === 'todo');
        return (
          <section key={goal.id} className="card space-y-4 p-4">
            <div><div className="flex items-center gap-2"><h2 className="font-semibold">{goal.title}</h2>{goal.planKind === 'agent-course' && <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-primary)]">自动课程计划</span>}</div><p className="mt-1 text-xs text-[var(--color-text-secondary)]">每天约 {goal.dailyMinutes} 分钟 · 课程已自动拆为 {plan.length} 天 · 进度 {done}/{plan.length}</p></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${progress}%` }} /></div>
            {todayTask && <div className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary-light)]/30 px-3 py-2 text-sm"><span className="mr-2 text-xs font-semibold text-[var(--color-primary)]">今日任务</span>{todayTask.title}<span className="ml-2 text-xs text-[var(--color-text-secondary)]">约 {todayTask.minutes} 分钟</span></div>}
            {overdue.length >= 2 && <div className="flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-[var(--color-text-secondary)]"><span>连续有 {overdue.length} 项未完成任务，建议放慢节奏，避免计划积压。</span><button className="btn-secondary text-xs" onClick={() => void shiftOverdue(plan)} type="button">自动顺延</button></div>}
            <div className="space-y-2">
              {plan.map((task) => (
                <article key={task.id} className="rounded-lg border border-[var(--color-border)] px-3 py-3 text-sm">
                  <div className="flex gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${task.status === 'done' ? 'bg-emerald-500' : 'bg-[var(--color-primary)]'}`} /><div className="min-w-0 flex-1"><div className={`font-medium ${task.status === 'done' ? 'text-[var(--color-text-tertiary)] line-through' : ''}`}>{task.title}</div><div className="mt-1 text-xs text-[var(--color-text-secondary)]">{task.date} · 约 {task.minutes} 分钟 · 内容只读</div><p className="mt-2 text-xs text-[var(--color-text-secondary)]">{task.summary}</p><p className="mt-2 rounded-md bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-text-secondary)]"><b>课程练习：</b>{task.exercise}</p><p className="mt-2 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text-secondary)]"><b>复习提示：</b>{task.quizPrompt}</p>{task.sourceRefs?.length ? <div className="mt-2 flex flex-wrap gap-2">{task.sourceRefs.map((source) => <a key={source.path} className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline" href={sourceHref(source)} target={source.sourceUrl ? '_blank' : undefined} rel={source.sourceUrl ? 'noreferrer' : undefined}><BookOpen className="h-3 w-3" />{source.title}</a>)}</div> : null}</div><button className="btn-ghost h-8 shrink-0 px-2 text-xs" onClick={() => void finish(task)} title="标记完成" type="button"><Check className="h-3.5 w-3.5" />{task.status === 'done' ? '已完成' : '完成'}</button></div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
