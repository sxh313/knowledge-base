import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDiagnostics, listDiagnostics, recordDiagnostic } from './diagnostics';

describe('diagnostics', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem(key: string) { return values.get(key) ?? null; },
      setItem(key: string, value: string) { values.set(key, value); },
      removeItem(key: string) { values.delete(key); },
    });
    vi.stubGlobal('crypto', { randomUUID: () => 'diagnostic-id' });
    clearDiagnostics();
  });

  it('redacts credentials and returns newest events first', () => {
    recordDiagnostic({ category: 'ai', operation: 'test', outcome: 'failure', message: 'apiKey=secret-value' });
    const [event] = listDiagnostics();
    expect(event.id).toBe('diagnostic-id');
    expect(event.message).toContain('[redacted]');
    expect(event.message).not.toContain('secret-value');
  });
});
