import { useState, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Play, Pause, RotateCcw, Timer, Coffee, Settings2, X, EyeOff } from 'lucide-react';
import { usePomodoroStore } from '../stores/pomodoroStore';
import { useJournalStore } from '../stores/journalStore';
import { useViewModeStore } from '../stores/viewModeStore';
import { useLocation } from 'react-router-dom';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 当前正在编辑的文档 id（从 URL 解析） */
function currentEditingId(): string | null {
  const m = location.pathname.match(/\/edit\/([^/]+)/);
  if (!m) return null;
  const id = m[1];
  return id === 'new' ? null : id;
}

const POS_KEY = 'pomodoro-pos';
function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) { const p = JSON.parse(raw); if (p && typeof p.x === 'number' && typeof p.y === 'number') return p; }
  } catch { /* ignore */ }
  return null;
}
function savePos(p: { x: number; y: number } | null) {
  try { if (p) localStorage.setItem(POS_KEY, JSON.stringify(p)); else localStorage.removeItem(POS_KEY); } catch { /* ignore */ }
}

export default function PomodoroWidget() {
  const {
    phase, remaining, isRunning, focusMinutes, breakMinutes,
    todayMinutes, totalSessions,
    start, pause, reset, tick, switchPhase, setDurations,
  } = usePomodoroStore();
  const [expanded, setExpanded] = useState(false);
  const visible = usePomodoroStore((s) => s.visible);
  const setVisible = usePomodoroStore((s) => s.setVisible);
  const isMobile = useViewModeStore((s) => s.isMobile);
  const location = useLocation();
  // 可拖动位置（持久化）
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => loadPos());
  const posRef = useRef(pos); posRef.current = pos;
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const movedRef = useRef(false);

  const onDragStart = (e: ReactPointerEvent) => {
    const root = (e.currentTarget as HTMLElement).closest('.pomo-root') as HTMLElement | null;
    const rect = root?.getBoundingClientRect();
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: rect?.left ?? 0, oy: rect?.top ?? 0 };
    movedRef.current = false;
  };
  useEffect(() => {
    if (!isMobile || !pos) return;
    const maxX = window.innerWidth - 132;
    const maxY = window.innerHeight - 128;
    const next = {
      x: Math.max(8, Math.min(maxX, pos.x)),
      y: Math.max(8, Math.min(maxY, pos.y)),
    };
    if (next.x !== pos.x || next.y !== pos.y) {
      setPos(next);
      savePos(next);
    }
  }, [isMobile, pos]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
      const maxX = window.innerWidth - (isMobile ? 132 : 60);
      const maxY = window.innerHeight - (isMobile ? 128 : 60);
      const x = Math.max(8, Math.min(maxX, d.ox + dx));
      const y = Math.max(8, Math.min(maxY, d.oy + dy));
      setPos({ x, y });
    };
    const onUp = () => {
      if (dragRef.current) savePos(posRef.current);
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [isMobile]);
  const [showSettings, setShowSettings] = useState(false);
  const [fMin, setFMin] = useState(String(focusMinutes));
  const [bMin, setBMin] = useState(String(breakMinutes));
  const lastPhaseRef = useRef(phase);

  // 每秒 tick
  useEffect(() => {
    const timer = setInterval(() => {
      const justFinished = tick();
      if (justFinished) {
        // 专注完成：把时长累加到当前编辑文档（仅当 store 的 currentEntry 正是当前文档）
        if (lastPhaseRef.current === 'focus') {
          const id = currentEditingId();
          if (id) {
            const { currentEntry, update } = useJournalStore.getState();
            if (currentEntry?.id === id) {
              update(id, { timeSpentMinutes: (currentEntry.timeSpentMinutes ?? 0) + focusMinutes }).catch(() => {});
            }
          }
        }
      }
      lastPhaseRef.current = usePomodoroStore.getState().phase;
    }, 1000);
    return () => clearInterval(timer);
  }, [tick, focusMinutes]);

  // 进入时尝试请求通知权限（占位，实际在展开时请求）
  useEffect(() => {
    return;
  }, []);

  const handleExpand = () => {
    setExpanded(true);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  };

  const saveDurations = () => {
    const f = Math.max(1, Math.min(120, parseInt(fMin) || 25));
    const b = Math.max(1, Math.min(60, parseInt(bMin) || 5));
    setDurations(f, b);
    setShowSettings(false);
  };

  const phaseColor = phase === 'focus' ? 'var(--color-primary)' : 'var(--color-success)';
  const totalSec = phase === 'focus' ? focusMinutes * 60 : breakMinutes * 60;
  const progress = totalSec > 0 ? (1 - remaining / totalSec) : 0;

  if (!visible) return null;
  return (
    <div
      className="pomo-root fixed z-30 select-none"
      style={isMobile
        ? (pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : location.pathname === '/ai' ? { right: 12, top: 58, bottom: 'auto' } : { right: 16, bottom: 'calc(8.5rem + env(safe-area-inset-bottom))' })
        : (pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : { right: 16, top: location.pathname === '/ai' ? 64 : 60, bottom: 'auto' })}
    >
      {/* 展开面板 */}
      {expanded && (
        <div className="mb-2 max-h-[calc(100vh-10rem)] w-[calc(100vw-1.5rem)] max-w-72 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl animate-slide-up sm:w-72">
          {/* 头部（可拖动） */}
          <div className="flex items-center justify-between px-4 py-2.5 cursor-move touch-none" style={{ background: phaseColor }} onPointerDown={onDragStart}>
            <div className="flex items-center gap-2 text-white">
              {phase === 'focus' ? <Timer className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}
              <span className="text-sm font-medium">{phase === 'focus' ? '专注中' : '休息中'}</span>
            </div>
            <button className="text-white/80 hover:text-white" onClick={() => setExpanded(false)} title="收起">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 计时圆环 */}
          <div className="flex flex-col items-center px-4 py-4">
            <div className="relative h-32 w-32">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-surface-2)" strokeWidth="6" />
                <circle
                  cx="50" cy="50" r="44" fill="none"
                  stroke={phaseColor} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 44}`}
                  strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress)}`}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums text-[var(--color-text)]">{formatTime(remaining)}</span>
                <span className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
                  {isRunning ? '计时中…' : '已暂停'}
                </span>
              </div>
            </div>

            {/* 今日统计 */}
            <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
              <span>今日专注 <b className="text-[var(--color-text)]">{todayMinutes}</b> 分钟</span>
              <span>·</span>
              <span>完成 <b className="text-[var(--color-text)]">{totalSessions}</b> 个番茄</span>
            </div>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-center gap-2 px-4 pb-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full text-white shadow-md active:scale-90 transition-transform"
              style={{ background: phaseColor }}
              onClick={isRunning ? pause : start}
              title={isRunning ? '暂停' : '开始'}
            >
              {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <button className="btn-ghost p-2 rounded-full" onClick={reset} title="重置">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button className="btn-ghost p-2 rounded-full" onClick={() => setShowSettings(s => !s)} title="设置时长">
              <Settings2 className="h-4 w-4" />
            </button>
            <button className="btn-ghost p-2 rounded-full" onClick={() => setVisible(false)} title="隐藏番茄钟">
              <EyeOff className="h-4 w-4" />
            </button>
          </div>

          {/* 时长设置 */}
          {showSettings && (
            <div className="border-t border-[var(--color-border)] px-4 py-3 space-y-2 animate-slide-down">
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--color-text-secondary)] w-16">专注(分)</label>
                <input className="input-field text-sm flex-1" type="number" min={1} max={120} value={fMin} onChange={e => setFMin(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--color-text-secondary)] w-16">休息(分)</label>
                <input className="input-field text-sm flex-1" type="number" min={1} max={60} value={bMin} onChange={e => setBMin(e.target.value)} />
              </div>
              <button className="btn-primary text-xs w-full py-1.5" onClick={saveDurations}>保存</button>
            </div>
          )}

          {/* 切换阶段 */}
          <div className="flex border-t border-[var(--color-border)]">
            <button
              className={`flex-1 py-2 text-xs transition-colors ${phase === 'focus' ? 'text-white font-medium' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'}`}
              style={phase === 'focus' ? { background: phaseColor } : {}}
              onClick={() => switchPhase('focus')}
            >
              专注
            </button>
            <button
              className={`flex-1 py-2 text-xs transition-colors ${phase === 'break' ? 'text-white font-medium' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'}`}
              style={phase === 'break' ? { background: phaseColor } : {}}
              onClick={() => switchPhase('break')}
            >
              休息
            </button>
          </div>
        </div>
      )}

      {/* 收起态：浮动小按钮 */}
      {!expanded && (
        <div
          onPointerDown={onDragStart}
          onPointerUp={() => { if (!movedRef.current) handleExpand(); }}
          className="flex touch-none items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 shadow-lg hover:shadow-xl transition-all cursor-move"
          title="番茄钟（拖动可移动，点击展开）"
        >
          <Timer className="h-4 w-4" style={{ color: phaseColor }} />
          <span className="text-sm font-medium tabular-nums" style={{ color: phaseColor }}>
            {formatTime(remaining)}
          </span>
          {isRunning && <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: phaseColor }} />}
          <button
            className="ml-1 rounded-full p-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); setVisible(false); }}
            title="隐藏番茄钟"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
