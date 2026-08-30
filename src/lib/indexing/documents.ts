import { db, type DocumentChunk, type DocumentLink, type JournalEntry } from '../db/schema';
import { extractWikilinks, markdownToPlainText } from '../markdownUtils';
import { rebuildSearchIndex, updateSearchEntry } from '../search/fuse';

const CHUNK_TARGET_LENGTH = 650;
const CHUNK_MAX_LENGTH = 800;

export type JournalCreateInput = Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt' | 'contentPlain' | 'contentHash'> &
  Partial<Pick<JournalEntry, 'contentPlain' | 'contentHash'>>;

export function normalizeMarkdown(content: string): string {
  return (content || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trimEnd();
}

export function normalizeJournalEntry(entry: JournalEntry): JournalEntry {
  const content = normalizeMarkdown(entry.content);
  return {
    ...entry,
    title: (entry.title || '无标题').trim() || '无标题',
    content,
    contentPlain: markdownToPlainText(content),
    aliases: Array.from(new Set((entry.aliases ?? []).map((alias) => alias.trim()).filter(Boolean))),
    tags: Array.from(new Set((entry.tags ?? []).map((tag) => tag.trim()).filter(Boolean))),
    subject: (entry.subject ?? '').trim(),
    status: entry.status ?? 'active',
    properties: entry.properties ?? {},
    folderPath: entry.folderPath?.trim() || undefined,
  };
}

export async function calculateContentHash(entry: Pick<JournalEntry, 'title' | 'content'>): Promise<string> {
  const bytes = new TextEncoder().encode(`${entry.title.trim()}\n${normalizeMarkdown(entry.content)}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface HeadingSection {
  heading?: string;
  content: string;
  startOffset: number;
}

function splitByHeadings(content: string): HeadingSection[] {
  const lines = content.split('\n');
  const sections: HeadingSection[] = [];
  let heading: string | undefined;
  let sectionLines: string[] = [];
  let offset = 0;
  let sectionStart = 0;

  const flush = () => {
    const sectionContent = sectionLines.join('\n').trim();
    if (sectionContent) sections.push({ heading, content: sectionContent, startOffset: sectionStart });
  };

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[2].trim();
      sectionLines = [];
      sectionStart = offset + line.length + 1;
    } else {
      sectionLines.push(line);
    }
    offset += line.length + 1;
  }
  flush();
  return sections.length > 0 ? sections : [{ content, startOffset: 0 }];
}

function splitLongSection(content: string): { content: string; offset: number }[] {
  if (content.length <= CHUNK_MAX_LENGTH) return [{ content, offset: 0 }];
  const paragraphs = content.split(/\n{2,}/);
  const chunks: { content: string; offset: number }[] = [];
  let current = '';
  let currentOffset = 0;
  let searchOffset = 0;

  const pushCurrent = () => {
    if (current.trim()) chunks.push({ content: current.trim(), offset: currentOffset });
    current = '';
  };

  for (const paragraph of paragraphs) {
    const paragraphOffset = content.indexOf(paragraph, searchOffset);
    searchOffset = Math.max(paragraphOffset, searchOffset) + paragraph.length;
    if (paragraph.length > CHUNK_MAX_LENGTH) {
      pushCurrent();
      for (let start = 0; start < paragraph.length; start += CHUNK_TARGET_LENGTH) {
        chunks.push({ content: paragraph.slice(start, start + CHUNK_MAX_LENGTH).trim(), offset: paragraphOffset + start });
      }
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > CHUNK_MAX_LENGTH) {
      pushCurrent();
      currentOffset = paragraphOffset;
      current = paragraph;
    } else {
      if (!current) currentOffset = paragraphOffset;
      current = candidate;
    }
  }
  pushCurrent();
  return chunks;
}

export function buildDocumentChunks(entry: JournalEntry): DocumentChunk[] {
  if (entry.deletedAt || !entry.content.trim()) return [];
  const createdAt = Date.now();
  let ordinal = 0;
  return splitByHeadings(entry.content).flatMap((section) =>
    splitLongSection(section.content).map((part) => {
      const startOffset = section.startOffset + Math.max(0, part.offset);
      const chunk: DocumentChunk = {
        id: `${entry.id}:${ordinal}`,
        journalId: entry.id,
        title: entry.title,
        heading: section.heading,
        content: part.content,
        contentPlain: markdownToPlainText(part.content),
        startOffset,
        endOffset: startOffset + part.content.length,
        ordinal,
        createdAt,
      };
      ordinal += 1;
      return chunk;
    }),
  );
}

function buildTitleLookup(entries: JournalEntry[]): Map<string, JournalEntry> {
  const lookup = new Map<string, JournalEntry>();
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    const names = [entry.title, ...(entry.aliases ?? [])];
    for (const name of names) {
      const key = name.trim().toLocaleLowerCase();
      if (key && !lookup.has(key)) lookup.set(key, entry);
    }
  }
  return lookup;
}

export function buildDocumentLinks(entry: JournalEntry, entries: JournalEntry[]): DocumentLink[] {
  if (entry.deletedAt) return [];
  const lookup = buildTitleLookup(entries);
  const createdAt = Date.now();
  let searchOffset = 0;
  return extractWikilinks(entry.content).map((linkText, index) => {
    const target = lookup.get(linkText.toLocaleLowerCase());
    const position = entry.content.indexOf(`[[${linkText}]]`, searchOffset);
    if (position >= 0) searchOffset = position + linkText.length + 4;
    return {
      id: `${entry.id}:${index}`,
      sourceId: entry.id,
      targetId: target?.id,
      targetTitle: target?.title ?? linkText,
      linkText,
      position: position >= 0 ? position : undefined,
      broken: !target,
      createdAt,
    };
  });
}

export async function prepareJournalEntry(entry: JournalEntry): Promise<JournalEntry> {
  const normalized = normalizeJournalEntry(entry);
  return { ...normalized, contentHash: await calculateContentHash(normalized) };
}

export async function persistJournalWithIndexes(entry: JournalEntry): Promise<JournalEntry> {
  const prepared = await prepareJournalEntry(entry);
  const existing = await db.journals.get(prepared.id);
  // 标题/别名是否变化：决定是否需要重建链接（[[链接]] 只依赖标题与别名）。
  // 编辑内容时标题/别名不变 → 跳过全表扫描与链接重建，只更新正文与分块，大幅降低自动保存开销。
  const titleChanged =
    !existing ||
    existing.title !== prepared.title ||
    JSON.stringify(existing.aliases ?? []) !== JSON.stringify(prepared.aliases ?? []);

  const chunks = buildDocumentChunks(prepared);
  const previousChunks = existing ? await db.documentChunks.where('journalId').equals(prepared.id).toArray() : [];
  const previousByOrdinal = new Map(previousChunks.map((chunk) => [chunk.ordinal, chunk]));
  for (const chunk of chunks) {
    const previous = previousByOrdinal.get(chunk.ordinal);
    // 标题、章节和正文均未变化时沿用已有向量，避免每次自动保存重复调用 Embedding。
    if (previous && previous.title === chunk.title && previous.heading === chunk.heading && previous.contentPlain === chunk.contentPlain) {
      chunk.embedding = previous.embedding;
      chunk.embeddingModelId = previous.embeddingModelId;
      chunk.embeddingContentHash = previous.embeddingContentHash;
      chunk.embeddedAt = previous.embeddedAt;
    }
  }

  await db.transaction('rw', db.journals, db.documentChunks, async () => {
    await db.journals.put(prepared);
    await db.documentChunks.where('journalId').equals(prepared.id).delete();
    if (chunks.length) await db.documentChunks.bulkPut(chunks);
  });

  if (titleChanged) {
    // 标题/别名变化：重建当前文档的链接，并刷新其他文档中原本失效的 [[链接]]
    const allEntries = await db.journals.toArray();
    const entriesForResolution = [...allEntries.filter((item) => item.id !== prepared.id), prepared];
    const links = buildDocumentLinks(prepared, entriesForResolution);
    await db.transaction('rw', db.documentLinks, async () => {
      await db.documentLinks.where('sourceId').equals(prepared.id).delete();
      if (links.length) await db.documentLinks.bulkPut(links);
    });
    await rebuildBrokenLinkSources();
  }
  // 搜索索引增量更新（仅更新当前文档，避免每次自动保存都全表 rebuild 的开销）
  updateSearchEntry(prepared);
  // 向量索引是可重建派生数据；保存先返回，后台仅为当前文档增量更新。
  void import('../ai/personalEmbeddings').then(({ syncPersonalChunkEmbeddings }) => syncPersonalChunkEmbeddings([prepared.id])).catch((error) => console.warn('Personal embedding index update skipped:', (error as Error).message));
  return prepared;
}

/**
 * 重建所有含断链(broken)的文档的链接：当新建文档或修改标题/别名后，
 * 其他文档中原本失效的 [[链接]] 可能变为可解析，需要刷新。
 * 开销小——只处理仍含 broken link 的源文档。
 */
export async function rebuildBrokenLinkSources(): Promise<void> {
  const broken = await db.documentLinks.filter((link) => link.broken).toArray();
  if (broken.length === 0) return;
  const sourceIds = Array.from(new Set(broken.map((link) => link.sourceId)));
  const allEntries = await db.journals.toArray();
  await db.transaction('rw', db.documentLinks, async () => {
    for (const sourceId of sourceIds) {
      const entry = allEntries.find((e) => e.id === sourceId);
      if (!entry || entry.deletedAt) continue;
      await db.documentLinks.where('sourceId').equals(sourceId).delete();
      const links = buildDocumentLinks(entry, allEntries);
      if (links.length) await db.documentLinks.bulkPut(links);
    }
  });
}

export async function rebuildDocumentIndexes(journalId?: string): Promise<void> {
  const allEntries = await db.journals.toArray();
  const targets = journalId ? allEntries.filter((entry) => entry.id === journalId) : allEntries;
  const preparedTargets = await Promise.all(targets.map(prepareJournalEntry));
  const preparedById = new Map(preparedTargets.map((entry) => [entry.id, entry]));
  const entriesForResolution = allEntries.map((entry) => preparedById.get(entry.id) ?? entry);

  await db.transaction('rw', db.journals, db.documentLinks, db.documentChunks, async () => {
    if (!journalId) {
      await db.documentLinks.clear();
      await db.documentChunks.clear();
    }
    for (const entry of preparedTargets) {
      await db.journals.put(entry);
      await db.documentLinks.where('sourceId').equals(entry.id).delete();
      await db.documentChunks.where('journalId').equals(entry.id).delete();
      const links = buildDocumentLinks(entry, entriesForResolution);
      const chunks = buildDocumentChunks(entry);
      if (links.length) await db.documentLinks.bulkPut(links);
      if (chunks.length) await db.documentChunks.bulkPut(chunks);
    }
  });
  await rebuildSearchIndex();
}
