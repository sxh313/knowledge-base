import { db, type Category } from './schema';

export async function getCategories(): Promise<Category[]> {
  const categories = await db.categories.filter((category) => !category.deletedAt).toArray();
  return categories.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export async function createCategory(name: string): Promise<Category> {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('分类名称不能为空');
  const existing = (await db.categories.toArray()).find((category) => !category.deletedAt && category.name.toLocaleLowerCase() === normalized.toLocaleLowerCase());
  if (existing) return existing;
  const now = Date.now();
  const category: Category = { id: crypto.randomUUID(), name: normalized, createdAt: now, updatedAt: now };
  await db.categories.put(category);
  return category;
}

export async function renameCategory(id: string, name: string): Promise<Category> {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('分类名称不能为空');
  const category = await db.categories.get(id);
  if (!category || category.deletedAt) throw new Error('分类不存在');
  const duplicate = (await db.categories.toArray()).find((item) => item.id !== id && !item.deletedAt && item.name.toLocaleLowerCase() === normalized.toLocaleLowerCase());
  if (duplicate) throw new Error('已存在同名分类');
  const now = Date.now();
  const updated = { ...category, name: normalized, updatedAt: now };
  await db.transaction('rw', [db.categories, db.journals], async () => {
    await db.categories.put(updated);
    await db.journals.where('subject').equals(category.name).modify({ subject: normalized, updatedAt: now });
  });
  return updated;
}

export async function deleteCategory(id: string): Promise<void> {
  const category = await db.categories.get(id);
  if (!category || category.deletedAt) return;
  const now = Date.now();
  await db.transaction('rw', [db.categories, db.journals], async () => {
    await db.categories.put({ ...category, deletedAt: now, updatedAt: now });
    await db.journals.where('subject').equals(category.name).modify({ subject: '', updatedAt: now });
  });
}
