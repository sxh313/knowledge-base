export type DiagnosticCategory = 'ai' | 'sync' | 'indexing' | 'bootstrap' | 'ui';
export type DiagnosticOutcome = 'success' | 'failure' | 'cancelled';

export interface DiagnosticEvent {
  id: string;
  category: DiagnosticCategory;
  operation: string;
  outcome: DiagnosticOutcome;
  message?: string;
  durationMs?: number;
  createdAt: number;
  version: string;
  platform: string;
}

const STORAGE_KEY = 'zhiyu-diagnostics-v1';
const MAX_EVENTS = 100;
const MAX_MESSAGE_LENGTH = 180;

function redact(value: string): string {
  return value
    .replace(/(api[-_]?key|authorization|token|bearer)\s*[:=]\s*[^\s,;]+/gi, '$1:[redacted]')
    .replace(/\b(?:sk|tvly)-[A-Za-z0-9_-]{10,}\b/g, '[redacted-secret]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function readEvents(): DiagnosticEvent[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed as DiagnosticEvent[] : [];
  } catch {
    return [];
  }
}

function writeEvents(events: DiagnosticEvent[]): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS))); } catch { /* diagnostics must never break app flow */ }
}

function platformName(): string {
  if (typeof window === 'undefined') return 'unknown';
  if (window.electronAPI?.isElectron) return 'electron';
  return /Android/i.test(navigator.userAgent) ? 'android' : 'web';
}

export function recordDiagnostic(input: Omit<DiagnosticEvent, 'id' | 'createdAt' | 'version' | 'platform'>): void {
  const event: DiagnosticEvent = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown',
    platform: platformName(),
    message: input.message ? redact(input.message) : undefined,
    durationMs: input.durationMs !== undefined ? Math.max(0, Math.round(input.durationMs)) : undefined,
  };
  writeEvents([...readEvents(), event]);
}

export function listDiagnostics(limit = 30): DiagnosticEvent[] {
  return readEvents().slice(-Math.max(1, Math.min(100, limit))).reverse();
}

export function clearDiagnostics(): void {
  writeEvents([]);
}
