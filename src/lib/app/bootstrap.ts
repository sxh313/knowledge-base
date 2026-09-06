import { ensureIndexesRebuilt } from '../db/repositories/maintenance';
import { checkDailyLearningReminder } from '../agent/learningReminder';
import { recordDiagnostic } from '../observability/diagnostics';

export interface ApplicationBootstrapDependencies {
  loadSettings: () => Promise<void>;
  loadAllJournals: () => Promise<void>;
}

export interface ApplicationBootstrapResult {
  indexesRebuilt: boolean;
}

let bootstrapPromise: Promise<ApplicationBootstrapResult> | null = null;

/** Runs the local-first startup sequence once per renderer lifetime. */
export function bootstrapApplication(
  dependencies: ApplicationBootstrapDependencies,
): Promise<ApplicationBootstrapResult> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const startedAt = Date.now();
    await dependencies.loadSettings();
    await dependencies.loadAllJournals();
    const indexesRebuilt = await ensureIndexesRebuilt();
    if (indexesRebuilt) await dependencies.loadAllJournals();
    await checkDailyLearningReminder().catch(() => undefined);
    recordDiagnostic({ category: 'bootstrap', operation: 'application-start', outcome: 'success', durationMs: Date.now() - startedAt });
    return { indexesRebuilt };
  })().catch((error) => {
    recordDiagnostic({ category: 'bootstrap', operation: 'application-start', outcome: 'failure', message: error instanceof Error ? error.message : String(error) });
    bootstrapPromise = null;
    throw error;
  });
  return bootstrapPromise;
}

export function resetApplicationBootstrap(): void {
  bootstrapPromise = null;
}
