import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve(process.argv[2] || process.env.ZERO2AGENT_ROOT || path.resolve(process.cwd(), '..', 'zero2Agent'));
const outputPath = path.resolve(process.argv[3] || 'public/zero2agent-kb.json');
const copyRoot = path.resolve(process.argv[4] || 'public/zero2agent');
const excluded = new Set(['AGENTS.md', 'THIRD_PARTY_NOTICES.md']);
const curriculumPath = path.resolve('scripts/zero2agent-curriculum.json');
const curriculum = fs.existsSync(curriculumPath)
  ? JSON.parse(fs.readFileSync(curriculumPath, 'utf8'))
  : {};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.claude' || entry.name === '.git' || entry.name === 'assets') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!entry.isFile() || !/\.md$/i.test(entry.name) || excluded.has(entry.name)) return [];
    return [full];
  });
}

function plainText(markdown) {
  return markdown
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|\[\]()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleOf(markdown, filePath) {
  const frontmatterTitle = markdown.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  if (frontmatterTitle) return frontmatterTitle.trim();
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1];
  if (heading) return heading.trim();
  return path.basename(filePath, path.extname(filePath));
}

function slugifyHeading(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function searchTerms(text) {
  const terms = new Set();
  const lower = String(text || '').toLowerCase();
  for (const term of lower.match(/[a-z0-9]+/g) || []) if (term.length >= 2) terms.add(term);
  for (const run of String(text || '').match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) terms.add(run);
    for (let i = 0; i < run.length - 1; i++) terms.add(run.slice(i, i + 2));
  }
  return [...terms];
}

function splitSection(content, startOffset, maxLength = 900, overlap = 120) {
  const clean = content.trim();
  if (!clean) return [];
  if (clean.length <= maxLength) return [{ content: clean, startOffset }];

  const chunks = [];
  let cursor = 0;
  while (cursor < clean.length) {
    let end = Math.min(clean.length, cursor + maxLength);
    if (end < clean.length) {
      const paragraphBreak = clean.lastIndexOf('\n\n', end);
      const sentenceBreak = clean.lastIndexOf('。', end);
      const candidate = Math.max(paragraphBreak, sentenceBreak);
      if (candidate > cursor + Math.floor(maxLength * 0.55)) end = candidate + (candidate === paragraphBreak ? 2 : 1);
    }
    const part = clean.slice(cursor, end).trim();
    if (part) chunks.push({ content: part, startOffset: startOffset + cursor });
    if (end >= clean.length) break;
    const next = Math.max(cursor + 1, end - overlap);
    cursor = next;
  }
  return chunks;
}

/**
 * 将 Markdown 按标题层级切成可引用片段。
 * 每个片段携带完整 headingPath，长章节在段落/句号边界切分，避免旧实现的重复片段。
 */
function sectionsOf(markdown) {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  // Frontmatter is build metadata, never learning evidence. Strip it before
  // heading parsing while retaining the original offsets for source links.
  const frontmatter = /^---\n[\s\S]*?\n---\n?/.exec(normalized);
  const contentStartOffset = frontmatter ? frontmatter[0].length : 0;
  const source = frontmatter ? normalized.slice(contentStartOffset) : normalized;
  const lines = source.split('\n');
  const sections = [];
  const headingStack = [];
  let body = [];
  let bodyStart = 0;
  let offset = contentStartOffset;

  const flush = () => {
    const content = body.join('\n').trim();
    if (content) {
      // frontmatter 是构建元数据，不是学习内容，不应进入 RAG 上下文。
      if (headingStack.length === 0 && /^---\s*[\s\S]*?---\s*$/.test(content)) {
        body = [];
        return;
      }
      const headingPath = headingStack.map((item) => item.title);
      const heading = headingPath.at(-1);
      const anchor = heading ? slugifyHeading(heading) : undefined;
      const questionHeading = [...headingPath].reverse().find((item) => /^Q\s*[：:]/i.test(item));
      const question = questionHeading ? questionHeading.replace(/^Q\s*[：:]\s*/i, '').trim() : undefined;
      const unitType = question ? 'qa' : headingPath.length ? 'section' : 'root';
      // 章节内按段落/句号切分，不制造重复上下文；标题路径会在每个片段中保留语义。
      for (const part of splitSection(content, bodyStart, 900, 0)) {
        sections.push({ heading, headingPath, anchor, question, unitType, content: part.content, startOffset: part.startOffset, searchTerms: searchTerms(`${heading || ''} ${question || ''} ${part.content}`) });
      }
    }
    body = [];
  };

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      const level = match[1].length;
      while (headingStack.length >= level) headingStack.pop();
      headingStack.push({ level, title: match[2].trim() });
      bodyStart = offset + line.length + 1;
    } else {
      if (body.length === 0) bodyStart = offset;
      body.push(line);
    }
    offset += line.length + 1;
  }
  flush();
  return sections;
}

const docs = walk(sourceRoot).map((filePath) => {
  const relativePath = path.relative(sourceRoot, filePath).split(path.sep).join('/');
  const content = fs.readFileSync(filePath, 'utf8');
  const directory = path.posix.dirname(relativePath);
  const moduleName = directory === '.' ? '根目录' : directory.split('/')[0];
  const slug = relativePath.endsWith('/index.md')
    ? relativePath.slice(0, -'/index.md'.length)
    : relativePath.slice(0, -'.md'.length);
  const webPath = relativePath.endsWith('/index.md')
    ? relativePath.slice(0, -'index.md'.length)
    : relativePath;
  const topicKey = relativePath.endsWith('/index.md')
    ? relativePath.slice(0, -'/index.md'.length)
    : relativePath.slice(0, -'.md'.length);
  const custom = curriculum[topicKey] || {};
  const moduleOrder = Number(custom.moduleOrder ?? 0);
  const topicOrder = Number(custom.topicOrder ?? Number(relativePath.match(/(?:^|\/)0*(\d+)-/)?.[1] ?? 0));
  return {
    id: `zero2agent:${relativePath}`,
    path: relativePath,
    title: titleOf(content, filePath),
    module: moduleName,
    slug,
    content,
    contentPlain: plainText(content),
    sections: sectionsOf(content),
    sourceUrl: `https://onefly.top/zero2Agent/${webPath}`,
    localPath: `/zero2agent/${relativePath}`,
    sourceKind: 'markdown',
    moduleOrder,
    topicOrder,
    keywords: custom.keywords || [],
    prerequisiteIds: custom.prerequisites || [],
    estimatedMinutes: Number(custom.estimatedMinutes ?? 30),
  };
}).sort((a, b) => a.path.localeCompare(b.path));

const ids = new Set(docs.map((doc) => doc.id));
for (const doc of docs) {
  doc.prerequisiteIds = doc.prerequisiteIds.map((prerequisiteId) => {
    if (ids.has(prerequisiteId)) return prerequisiteId;
    const normalized = prerequisiteId.endsWith('/index.md') ? prerequisiteId : `${prerequisiteId}/index.md`;
    if (!ids.has(normalized)) throw new Error(`Unknown zero2Agent prerequisite: ${doc.id} -> ${prerequisiteId}`);
    return normalized;
  });
}
const visiting = new Set();
const visited = new Set();
const byId = new Map(docs.map((doc) => [doc.id, doc]));
function visit(id, chain = []) {
  if (visiting.has(id)) throw new Error(`zero2Agent prerequisite cycle: ${[...chain, id].join(' -> ')}`);
  if (visited.has(id)) return;
  visiting.add(id);
  for (const prerequisiteId of byId.get(id).prerequisiteIds) visit(prerequisiteId, [...chain, id]);
  visiting.delete(id);
  visited.add(id);
}
for (const doc of docs) visit(doc.id);

// 构建倒排索引：查询词 -> 可命中的 chunkId。运行时先用它缩小候选集，
// 再对候选分块做完整打分，避免每次遍历全部课程正文。
const searchIndex = Object.create(null);
let chunkIndex = 0;
for (const doc of docs) {
  for (const section of doc.sections || []) {
    const chunkId = `${doc.id}:${section.startOffset}`;
    section.chunkIndex = chunkIndex++;
    const terms = searchTerms(`${doc.title} ${doc.module} ${(section.headingPath || []).join(' ')} ${section.question || ''} ${section.content}`);
    for (const term of terms) {
      (searchIndex[term] ||= []).push(section.chunkIndex);
    }
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
// 将参与 RAG 的原文一起复制到 public，确保离线/无网络时仍能定位来源。
fs.rmSync(copyRoot, { recursive: true, force: true });
for (const [index, doc] of docs.entries()) {
  const destination = path.join(copyRoot, doc.path);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, doc.path), destination);
  doc.order = index;
}
fs.writeFileSync(outputPath, JSON.stringify({
  version: 1,
  source: 'zero2Agent',
  generatedAt: new Date().toISOString(),
  documentCount: docs.length,
  searchIndex,
  documents: docs,
}, null, 0));
console.log(`Generated ${docs.length} documents -> ${outputPath}; copied source -> ${copyRoot}`);
