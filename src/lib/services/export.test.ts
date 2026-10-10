import { describe, expect, it } from 'vitest';
import { validateBackupPayload } from './export';

describe('backup validation', () => {
  it('accepts legacy-compatible payloads with the required journals array', () => {
    expect(() => validateBackupPayload({ version: 2, journals: [] })).not.toThrow();
  });

  it('rejects malformed arrays and unsupported versions before opening a transaction', () => {
    expect(() => validateBackupPayload({ version: 99, journals: [] })).toThrow(/版本/);
    expect(() => validateBackupPayload({ version: 5, journals: [], agentRuns: {} })).toThrow(/agentRuns/);
  });
});
