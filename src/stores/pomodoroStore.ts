import { create } from 'zustand';

// ─── 番茄钟 ───
// 设备本地的专注计时记录，用 localStorage 持久化（不进云同步，避免迁移风险）。
// 每完成一个番茄（默认 25 分钟），把分钟数累加到当日统计。

export type PomodoroPhase = 'focus' | 'break';

interface PomodoroRecord {
  /** key = YYYY-MM-DD，value = 当日累计专注分钟数 */
  dailyMinutes: Record<string, number>;
}

const STORAGE_KEY = 'pomodoro-records';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadRecords(): PomodoroRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PomodoroRecord;
  } catch { /* ignore */ }
  return { dailyMinutes: {} };
}

function saveRecords(rec: PomodoroRecord) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch { /* ignore */ }
}

const VISIBLE_KEY = 'pomodoro-visible';
function loadVisible(): boolean {
  try {
    const v = localStorage.getItem(VISIBLE_KEY);
    return v === null ? true : v === '1';
  } catch { return true; }
}

interface PomodoroState {
  phase: PomodoroPhase;
  /** 剩余秒数 */
  remaining: number;
  isRunning: boolean;
  focusMinutes: number;   // 单次专注时长
  breakMinutes: number;   // 单次休息时长
  todayMinutes: number;   // 今日已专注分钟数
  totalSessions: number;  // 今日完成番茄数

  visible: boolean;        // 是否显示悬浮窗（可在设置里关闭）
  setVisible: (v: boolean) => void;

  start: () => void;
  pause: () => void;
  reset: () => void;
  tick: () => boolean;        // 每秒调用，返回是否刚完成一个阶段
  switchPhase: (p: PomodoroPhase) => void;
  setDurations: (focus: number, brk: number) => void;
  /** 累加专注时长（外部也可调用，如手动录入） */
  addFocusMinutes: (min: number) => void;
}

const records = loadRecords();
const tKey = todayKey();

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
  phase: 'focus',
  remaining: 25 * 60,
  isRunning: false,
  focusMinutes: 25,
  breakMinutes: 5,
  todayMinutes: records.dailyMinutes[tKey] ?? 0,
  totalSessions: Math.floor((records.dailyMinutes[tKey] ?? 0) / 25),
  visible: loadVisible(),

  start: () => set({ isRunning: true }),
  pause: () => set({ isRunning: false }),
  reset: () => set((s) => ({ remaining: s.phase === 'focus' ? s.focusMinutes * 60 : s.breakMinutes * 60, isRunning: false })),

  tick: () => {
    const s = get();
    if (!s.isRunning) return false;
    if (s.remaining <= 1) {
      // 阶段结束
      if (s.phase === 'focus') {
        // 完成一个专注番茄：累加时长并持久化
        const added = s.focusMinutes;
        const rec = loadRecords();
        const tk = todayKey();
        rec.dailyMinutes[tk] = (rec.dailyMinutes[tk] ?? 0) + added;
        saveRecords(rec);
        // 发送桌面通知
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🍅 番茄完成！', { body: `专注 ${added} 分钟，休息一下吧～` });
        }
        set({
          phase: 'break',
          remaining: s.breakMinutes * 60,
          isRunning: false,
          todayMinutes: rec.dailyMinutes[tk],
          totalSessions: Math.floor(rec.dailyMinutes[tk] / s.focusMinutes),
        });
        return true;
      } else {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('⏰ 休息结束', { body: '继续专注吧！' });
        }
        set({ phase: 'focus', remaining: s.focusMinutes * 60, isRunning: false });
        return true;
      }
    }
    set({ remaining: s.remaining - 1 });
    return false;
  },

  switchPhase: (p) => set((s) => ({ phase: p, isRunning: false, remaining: p === 'focus' ? s.focusMinutes * 60 : s.breakMinutes * 60 })),

  setDurations: (focus, brk) => set((s) => ({
    focusMinutes: focus,
    breakMinutes: brk,
    remaining: s.phase === 'focus' ? focus * 60 : brk * 60,
  })),

  setVisible: (v) => {
    try { localStorage.setItem(VISIBLE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
    set({ visible: v });
  },

  addFocusMinutes: (min) => {
    const rec = loadRecords();
    const tk = todayKey();
    rec.dailyMinutes[tk] = (rec.dailyMinutes[tk] ?? 0) + min;
    saveRecords(rec);
    set({ todayMinutes: rec.dailyMinutes[tk], totalSessions: Math.floor(rec.dailyMinutes[tk] / get().focusMinutes) });
  },
}));

/** 获取指定日期的专注分钟数（供统计页使用） */
export function getDailyFocusMinutes(): Record<string, number> {
  return loadRecords().dailyMinutes;
}

export { todayKey };
