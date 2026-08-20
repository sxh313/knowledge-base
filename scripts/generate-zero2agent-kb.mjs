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
    .replace(/\[[^\]]*\]\([^)]*\)/g, '$1')
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

function sectionsOf(markdown) {
  const sections = [];
  let heading;
  let lines = [];
  let startOffset = 0;
  let offset = 0;
  const flush = () => {
    const content = lines.join('\n').trim();
    if (!content) return;
    for (let i = 0; i < content.length; i += 700) sections.push({ heading, content: content.slice(i, i + 800).trim(), startOffset: startOffset + i });
  };
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) { flush(); heading = match[2].trim(); lines = []; startOffset = offset + line.length + 1; }
    else { if (lines.length === 0) startOffset = offset; lines.push(line); }
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
  documents: docs,
}, null, 0));
console.log(`Generated ${docs.length} documents -> ${outputPath}; copied source -> ${copyRoot}`);
