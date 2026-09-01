import type { Zero2ReviewTask } from '../../lib/db/schema';
import ReviewTopicLink from './ReviewTopicLink';

export default function ReviewPlanPanel({ tasks, dailyMinutes, planStatus, onRebuild, onPause, onResume }: { tasks: Zero2ReviewTask[]; dailyMinutes: number; planStatus?: 'active' | 'paused' | 'completed'; onRebuild: () => void; onPause: () => void; onResume: () => void }) {
  const used = tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">计划与预算</h2>
          <p className="text-xs text-[var(--color-text-secondary)]">预计 {used} / {dailyMinutes} 分钟；状态：{planStatus === 'paused' ? '已暂停' : planStatus === 'completed' ? '已完成' : '进行中'}。</p>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">计划会参考到期任务、最近失分和课程前置关系，可随时重新规划。</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs" onClick={onRebuild}>生成今日计划</button>
          {planStatus === 'paused' ? <button className="btn-primary text-xs" onClick={onResume}>恢复计划</button> : <button className="btn-ghost text-xs" onClick={onPause}>暂停计划</button>}
        </div>
      </div>
      {tasks.filter((task) => task.recommendationReason).slice(0, 5).map((task) => (
        <div key={task.id} className="rounded border border-[var(--color-border)] p-2 text-xs">
          <ReviewTopicLink topicId={task.topicId} compact />
          <div className="mt-1 pl-5 text-[var(--color-text-secondary)]">{task.recommendationReason}</div>
        </div>
      ))}
    </section>
  );
}
