import { listLearningGoals, listLearningTasks } from './learning';
import { learningLocalDate } from './coursePlanner';
import { showToast } from '../ui/toast';

const KEY_PREFIX = 'zhiyu-learning-reminder:';

function isDue(time: string, now: Date): boolean {
  const [hours, minutes] = (time || '09:00').split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() >= (Number.isFinite(hours) ? hours : 9) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

/** 应用运行时检查一次；每个目标每天至多通知一次。 */
export async function checkDailyLearningReminder(now = new Date()): Promise<void> {
  if (typeof window === 'undefined') return;
  const today = learningLocalDate(now);
  const goals = await listLearningGoals();
  await Promise.all(goals.filter((goal) => goal.status === 'active' && goal.reminderEnabled && isDue(goal.reminderTime ?? '09:00', now)).map(async (goal) => {
    const key = `${KEY_PREFIX}${goal.id}:${today}`;
    if (localStorage.getItem(key)) return;
    const task = (await listLearningTasks(goal.id)).find((item) => item.date === today && item.status === 'todo');
    if (!task) return;
    localStorage.setItem(key, '1');
    const body = `${task.title} · ${task.minutes} 分钟`;
    showToast('info', '今日学习任务已准备好', body, 7000);
    if ('Notification' in window && Notification.permission === 'granted') new Notification('知屿 · 今日学习任务', { body });
  }));
}
