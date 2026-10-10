import { describe, expect, it } from 'vitest';
import { cancelAsyncTask, rejectAsyncTask, resolveAsyncTask, runningAsyncTask } from './asyncTask';

describe('async task state', () => {
  it('represents the full lifecycle without leaking an error into success', () => {
    const running = runningAsyncTask<string>(10);
    expect(running).toMatchObject({ status: 'running', startedAt: 10 });
    expect(resolveAsyncTask('done', 10)).toMatchObject({ status: 'success', value: 'done', startedAt: 10 });
    expect(rejectAsyncTask(new Error('failed'), 10)).toMatchObject({ status: 'error', error: 'failed', startedAt: 10 });
    expect(cancelAsyncTask(10)).toMatchObject({ status: 'cancelled', startedAt: 10 });
  });
});
