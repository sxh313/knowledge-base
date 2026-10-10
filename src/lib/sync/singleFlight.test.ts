import { describe, expect, it } from 'vitest';
import { createSingleFlight } from './singleFlight';

describe('single flight', () => {
  it('shares concurrent work and allows a later call after completion', async () => {
    const run = createSingleFlight();
    let calls = 0;
    let release!: (value: number) => void;
    const pending = new Promise<number>((resolve) => { release = resolve; });
    const operation = () => { calls += 1; return pending; };
    const first = run(operation);
    const second = run(operation);
    expect(first).toBe(second);
    release(7);
    await expect(first).resolves.toBe(7);
    await expect(run(async () => { calls += 1; return 8; })).resolves.toBe(8);
    expect(calls).toBe(2);
  });
});
