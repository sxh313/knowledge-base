import type { Zero2ReviewTask } from '../../lib/db/schema';
import ReviewTopicLink from './ReviewTopicLink';

export default function TodayTaskList({ tasks, onSkip, onFinish }: { tasks: Zero2ReviewTask[]; onSkip: (id: string) => void; onFinish: (id: string) => void }) {
  const completed = tasks.filter((task) => task.status === 'done').length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  return (
    <section className="card review-panel space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div><p className="panel-eyebrow">TODAY / 复习节奏</p><h2 className="font-semibold">今天的复习内容</h2></div>
        <span className="text-xs text-[var(--color-text-tertiary)]">{completed}/{tasks.length} 已完成</span>
      </div>
      <div className="review-progress"><span style={{ width: `${progress}%` }} /></div>
      {tasks.length === 0 ? (
        <div className="review-empty">
          <p className="text-sm text-[var(--color-text-secondary)]">还没有今日计划。</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">生成计划后，会按到期、薄弱和前置知识排出下一步。</p>
        </div>
      ) : tasks.map((task) => (
        <div key={task.id} className="review-task-row flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm">
          <span aria-label={task.status === 'done' ? '已掌握' : task.status === 'skipped' ? '已跳过' : '待训练'} className={`h-2 w-2 rounded-full ${task.status === 'done' ? 'bg-emerald-500' : task.status === 'skipped' ? 'bg-gray-400' : 'bg-[var(--color-primary)]'}`} />
          <div className={`min-w-[12rem] flex-1 ${task.status !== 'todo' ? 'opacity-70' : ''}`}>
            <ReviewTopicLink topicId={task.topicId} muted={task.status !== 'todo'} />
          </div>
          <span className="text-xs text-[var(--color-text-tertiary)]">{task.estimatedMinutes} 分钟</span>
          {task.status === 'todo' && <>
            <button className="btn-ghost text-xs" onClick={() => onSkip(task.id)}>跳过</button>
            <button className="btn-ghost text-xs" onClick={() => onFinish(task.id)}>完成</button>
          </>}
        </div>
      ))}
    </section>
  );
}
