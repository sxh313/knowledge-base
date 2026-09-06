import { getAllJournals } from './journals';
import type { JournalEntry } from '../schema';

/** Read-only statistics source; aggregation stays in the stats domain/UI. */
export async function getActiveJournalsForStats(): Promise<JournalEntry[]> {
  return getAllJournals();
}
