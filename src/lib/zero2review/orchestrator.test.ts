import { describe, expect, it, vi } from 'vitest';
import { createZero2ReviewOrchestrator } from './orchestrator';

describe('zero2 review orchestrator boundaries', () => {
  it('does not retrieve out-of-scope input', async () => {
    const retrieve = vi.fn();
    const orchestrator = createZero2ReviewOrchestrator({ retrieve });
    const result = await orchestrator.handleInput('帮我修改简历');
    expect(result.stage).toBe('rejected');
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('does not retrieve control commands or change learning state', async () => {
    const retrieve = vi.fn();
    const orchestrator = createZero2ReviewOrchestrator({ retrieve });
    const result = await orchestrator.handleInput('今天复习什么');
    expect(result.stage).toBe('complete');
    expect(retrieve).not.toHaveBeenCalled();
  });
});
