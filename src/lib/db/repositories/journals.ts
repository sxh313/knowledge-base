/** Public journal repository boundary. queries.ts remains a compatibility facade for older imports. */
export {
  createJournal,
  updateJournal,
  deleteJournal,
  getJournal,
  getAllJournals,
  getTrashedJournals,
  restoreJournal,
  purgeJournal,
  duplicateJournal,
  saveVersion,
  getVersions,
  deleteVersion,
  getBacklinks,
  getBrokenOutgoingLinks,
  searchJournalsByTags,
  getJournalsBySubject,
} from '../queries';
export type { BacklinkInfo } from '../queries';
