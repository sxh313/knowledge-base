import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve(process.argv[2] || process.env.ZERO2LEETCODE_ROOT || path.resolve(process.cwd(), '..', 'zero2Leetcode'));
const outputPath = path.resolve(process.argv[3] || 'public/zero2leetcode-kb.json');
const copyRoot = path.resolve(process.argv[4] || 'public/zero2leetcode');
const includedRoots = [
  '00_python_basics',
  '01_data_structures',
  '02_algorithms',
  '03_leetcode_practice',
  '04_real_interviews',
  '05_interview',
];
const moduleNames = {
  '00_python_basics': 'Python 基础',
  '01_data_structures': '数据结构',
  '02_algorithms': '算法',
  '03_leetcode_practice': 'LeetCode 刷题',
  '04_real_interviews': '真实面试',
  '05_interview': '面试准备',
};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && /\.md$/i.test(entry.name) ? [full] : [];
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
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1];
  return heading?.trim() || path.basename(filePath, path.extname(filePath));
}

function slugifyHeading(value) {
  return value.trim().toLowerCase().replace(/[`*_~]/g, '').replace(/[^\p{Letter}\p{Number}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function searchTerms(text) {
  const terms = new Set();
  const lower = String(text || '').toLowerCase();
  for (const term of lower.match(/[a-z0-9]+/g) || []) if (term.length >= 2) terms.add(term);
  for (const run of String(text || '').match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) terms.add(run);
    for (let i = 0; i < run.length - 1; i += 1) terms.add(run.slice(i, i + 2));
  }
  return [...terms];
}

function splitSection(content, startOffset, maxLength = 900) {
  const clean = content.trim();
  if (!clean) return [];
  if (clean.length <= maxLength) return [{ content: clean, startOffset }];
  const chunks = [];
  for (let cursor = 0; cursor < clean.length;) {
    let end = Math.min(clean.length, cursor + maxLength);
    if (end < clean.length) {
      const boundary = Math.max(clean.lastIndexOf('\n\n', end), clean.lastIndexOf('。', end));
      if (boundary > cursor + Math.floor(maxLength * 0.55)) end = boundary + (clean.startsWith('\n\n', boundary) ? 2 : 1);
    }
    const part = clean.slice(cursor, end).trim();
    if (part) chunks.push({ content: part, startOffset: startOffset + cursor });
    if (end >= clean.length) break;
    cursor = Math.max(cursor + 1, end);
  }
  return chunks;
}

function sectionsOf(markdown) {
  const source = markdown.replace(/\r\n?/g, '\n');
  const sections = [];
  const stack = [];
  let body = [];
  let bodyStart = 0;
  let offset = 0;
  const flush = () => {
    const content = body.join('\n').trim();
    if (content) {
      const headingPath = stack.map((item) => item.title);
      const heading = headingPath.at(-1);
      for (const part of splitSection(content, bodyStart)) {
        sections.push({ heading, headingPath, anchor: heading ? slugifyHeading(heading) : undefined, unitType: headingPath.length ? 'section' : 'root', content: part.content, startOffset: part.startOffset, searchTerms: searchTerms(`${heading || ''} ${part.content}`) });
      }
    }
    body = [];
  };
  for (const line of source.split('\n')) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      const level = match[1].length;
      while (stack.length >= level) stack.pop();
      stack.push({ level, title: match[2].trim() });
      bodyStart = offset + line.length + 1;
    } else {
      if (!body.length) bodyStart = offset;
      body.push(line);
    }
    offset += line.length + 1;
  }
  flush();
  return sections;
}

const files = includedRoots.flatMap((root) => {
  const directory = path.join(sourceRoot, root);
  if (!fs.existsSync(directory)) throw new Error(`Missing zero2Leetcode directory: ${root}`);
  return walk(directory);
});
const docs = files.map((filePath) => {
  const relativePath = path.relative(sourceRoot, filePath).split(path.sep).join('/');
  const content = fs.readFileSync(filePath, 'utf8');
  const root = relativePath.split('/')[0];
  return {
    id: `zero2leetcode:${relativePath}`,
    path: relativePath,
    title: titleOf(content, filePath),
    module: moduleNames[root] || root,
    content,
    contentPlain: plainText(content),
    sections: sectionsOf(content),
    sourceUrl: `https://github.com/ranxi2001/zero2Leetcode/blob/main/${relativePath}`,
    localPath: `/zero2leetcode/${relativePath}`,
    sourceKind: 'markdown',
  };
}).sort((a, b) => a.path.localeCompare(b.path));

const searchIndex = Object.create(null);
let chunkIndex = 0;
for (const doc of docs) {
  for (const section of doc.sections) {
    section.chunkIndex = chunkIndex;
    for (const term of searchTerms(`${doc.title} ${doc.module} ${(section.headingPath || []).join(' ')} ${section.content}`)) (searchIndex[term] ||= []).push(chunkIndex);
    chunkIndex += 1;
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.rmSync(copyRoot, { recursive: true, force: true });
for (const [order, doc] of docs.entries()) {
  const destination = path.join(copyRoot, doc.path);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, doc.path), destination);
  doc.order = order;
}
const licensePath = path.join(sourceRoot, 'LICENSE-EPL-2.0.txt');
if (fs.existsSync(licensePath)) fs.copyFileSync(licensePath, path.join(copyRoot, 'LICENSE-EPL-2.0.txt'));
fs.writeFileSync(path.join(copyRoot, 'ATTRIBUTION.md'), '# zero2Leetcode 内置刷题知识库\n\n本知识库导入自 [ranxi2001/zero2Leetcode](https://github.com/ranxi2001/zero2Leetcode)，仅包含其 00–05 学习目录。\n\n原项目采用 Eclipse Public License 2.0；许可证文本见同目录 `LICENSE-EPL-2.0.txt`。\n');
fs.writeFileSync(outputPath, JSON.stringify({ version: 1, source: 'zero2Leetcode', repository: 'https://github.com/ranxi2001/zero2Leetcode', license: 'EPL-2.0', generatedAt: new Date().toISOString(), documentCount: docs.length, searchIndex, documents: docs }));
console.log(`Generated ${docs.length} zero2Leetcode documents -> ${outputPath}; copied source -> ${copyRoot}`);
