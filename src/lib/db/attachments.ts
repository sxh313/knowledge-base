import { db, type Attachment } from './schema';

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function putAttachment(a: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & { id?: string }): Promise<Attachment> {
  const now = Date.now();
  const existing = a.id ? await db.attachments.get(a.id) : undefined;
  const record: Attachment = { ...a, id: a.id ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  await db.attachments.put(record);
  return record;
}

export async function getAttachment(id: string) {
  const attachment = await db.attachments.get(id);
  return attachment?.deletedAt ? undefined : attachment;
}

export async function getAttachmentsForJournal(journalId: string) {
  return db.attachments.where('journalId').equals(journalId).filter((attachment) => !attachment.deletedAt).toArray();
}

export async function deleteAttachment(id: string) {
  const existing = await db.attachments.get(id);
  if (!existing || existing.deletedAt) return;
  const now = Date.now();
  await db.attachments.put({ ...existing, deletedAt: now, updatedAt: now });
}

export async function deleteAttachmentsForJournal(journalId: string) {
  const now = Date.now();
  await db.attachments.where('journalId').equals(journalId).modify({ deletedAt: now, updatedAt: now });
}
