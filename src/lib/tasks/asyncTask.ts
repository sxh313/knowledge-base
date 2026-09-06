export type AsyncTaskStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';

export interface AsyncTaskState<T = unknown> {
  status: AsyncTaskStatus;
  value?: T;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export function idleAsyncTask<T = unknown>(): AsyncTaskState<T> {
  return { status: 'idle' };
}

export function runningAsyncTask<T = unknown>(startedAt = Date.now()): AsyncTaskState<T> {
  return { status: 'running', startedAt };
}

export function resolveAsyncTask<T>(value: T, startedAt?: number): AsyncTaskState<T> {
  return { status: 'success', value, startedAt, finishedAt: Date.now() };
}

export function rejectAsyncTask<T = unknown>(error: unknown, startedAt?: number): AsyncTaskState<T> {
  return {
    status: 'error',
    error: error instanceof Error ? error.message : String(error || '任务失败'),
    startedAt,
    finishedAt: Date.now(),
  };
}

export function cancelAsyncTask<T = unknown>(startedAt?: number): AsyncTaskState<T> {
  return { status: 'cancelled', startedAt, finishedAt: Date.now() };
}
