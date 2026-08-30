import { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Plus, RotateCcw, SkipForward, Target, Brain } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  createLearningGoal,
  createTasksForGoal,
  listLearningGoals,
  listLearningTasks,
  updateLearningGoal,
  updateLearningTask,
  type LearningGoal,
  type LearningTask,
} from '../lib/agent/learning';

export default function LearningGoals() {
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [tasks, setTasks] = useState<LearningTask[]>([]);
  const [title, setTitle] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [deadline, setDeadline] = useState('');

  const reload = async () => {
    const nextGoals = await listLearningGoals();
    setGoals(nextGoals);
    setTasks((await Promise.all(nextGoals.map((goal) => listLearningTasks(goal.id)))).flat());
  };
  useEffect(() => { void reload(); }, []);

  const grouped = useMemo(() => goals.map((goal) => ({ goal, tasks: tasks.filter((task) => task.goalId === goal.id) })), [goals, tasks]);

  const addGoal = async () => {
    if (!title.trim()) return;
    const goal = await createLearningGoal({ title, dailyMinutes, deadline: deadline || undefined, level: '未设置' });
    await createTasksForGoal(goal, [], [goal.title]);
    setTitle(''); setDeadline(''); setDailyMinutes(30); await reload();
  };

  const setTaskStatus = async (task: LearningTask, status: LearningTask['status']) => {
    await updateLearningTask(task.id, { status });
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item));
  };

  const postpone = async (task: LearningTask) => {
    const next = new Date(`${task.date}T12:00:00`);
    next.setDate(next.getDate() + 1);
    const date = next.toISOString().slice(0, 10);
    await updateLearningTask(task.id, { date, status: 'todo' });
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, date, status: 'todo' } : item));
  };

  return (
    <div className="content-frame animate-fade-in space-y-5">
      <div className="page-hero">
        <div className="page-hero-copy">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-[var(--color-primary)]" />
            <div><h1 className="text-xl font-bold">学习目标</h1><p className="text-xs text-[var(--color-text-secondary)]">把目标拆成每天可调整的学习任务</p></div>
          </div><Link className="btn-ghost inline-flex items-center gap-1 text-xs" to="/zero2-review"><Brain className="h-3.5 w-3.5" />用 zero2Agent 制定计划</Link>
        </div>
      </div>
      <div className="card learning-goal-form p-4">
        <label className="learning-field learning-title-field"><span>目标</span><input className="input-field text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：两周掌握 RAG 基础" /></label>
        <label className="learning-field"><span><Clock3 className="h-3.5 w-3.5" />每日时间</span><div className="flex items-center gap-2"><input className="input-field text-sm" type="number" min={10} value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value) || 30)} /><span className="text-xs text-[var(--color-text-secondary)]">分钟</span></div></label>
        <label className="learning-field"><span>截止日期</span><input className="input-field text-sm" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
        <button className="btn-primary learning-create-button flex items-center justify-center gap-1 whitespace-nowrap text-sm" onClick={addGoal}><Plus className="h-4 w-4" />创建目标</button>
        <div className="learning-preview rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">计划预览：{deadline ? `将在 ${Math.max(1, Math.ceil((new Date(`${deadline}T12:00:00`).getTime() - Date.now()) / 86400000))} 天内` : '按每天的节奏'}完成「{title.trim() || '你的学习目标'}」，每天约 {dailyMinutes} 分钟。创建后可以调整日期、暂停或顺延任务。</div>
      </div>
      {grouped.length === 0 && <div className="empty-state compact-empty"><Target className="h-5 w-5 text-[var(--color-primary)]" /><p className="text-sm font-medium text-[var(--color-text)]">还没有学习目标</p><p className="text-xs text-[var(--color-text-secondary)]">可以先从每天 30 分钟开始，之后随时调整节奏。</p><button className="btn-secondary mt-2 text-xs" onClick={() => setTitle('每天 30 分钟学习一个主题')}>使用示例目标</button></div>}
      {grouped.map(({ goal, tasks: goalTasks }) => (
        <section key={goal.id} className="space-y-2">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold">{goal.title}</h2><p className="text-xs text-[var(--color-text-secondary)]">每天 {goal.dailyMinutes} 分钟{goal.deadline ? ` · 截止 ${goal.deadline}` : ''}</p></div><button className="btn-ghost text-xs" onClick={async () => { await updateLearningGoal(goal.id, { status: goal.status === 'paused' ? 'active' : 'paused' }); await reload(); }}>{goal.status === 'paused' ? '继续' : '暂停'}</button></div>
          <div className="space-y-1.5">
            {goalTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${task.status === 'done' ? 'bg-emerald-500' : task.status === 'skipped' ? 'bg-gray-400' : 'bg-[var(--color-primary)]'}`} />
                <input className="w-28 bg-transparent text-xs text-[var(--color-text-secondary)]" type="date" value={task.date} onChange={async (e) => { await updateLearningTask(task.id, { date: e.target.value }); setTasks((current) => current.map((item) => item.id === task.id ? { ...item, date: e.target.value } : item)); }} />
                <span className={`flex-1 ${task.status !== 'todo' ? 'text-[var(--color-text-tertiary)] line-through' : ''}`}>{task.title}</span><span className="text-xs text-[var(--color-text-tertiary)]">{task.minutes} 分钟</span>
                <button className="btn-ghost p-1" onClick={() => setTaskStatus(task, task.status === 'done' ? 'todo' : 'done')} title="完成/恢复" aria-label="完成或恢复任务"><Check className="h-3.5 w-3.5" /></button>
                <button className="btn-ghost p-1" onClick={() => setTaskStatus(task, task.status === 'skipped' ? 'todo' : 'skipped')} title="跳过" aria-label="跳过任务"><SkipForward className="h-3.5 w-3.5" /></button>
                <button className="btn-ghost p-1" onClick={() => postpone(task)} title="顺延一天" aria-label="顺延一天"><RotateCcw className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
