import { db } from '../schema';

export async function listActiveLearningTaskRecords() {
  return db.learningTasks.filter((task) => !task.deletedAt).toArray();
}

export async function listActiveReviewTaskRecords() {
  return db.zero2ReviewTasks.filter((task) => !task.deletedAt).toArray();
}
