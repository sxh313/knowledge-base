import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const version = packageJson.version;
const failures = [];

if (!new RegExp(`当前版本：\\*\\*v${version}\\*\\*`).test(read('README.md'))) {
  failures.push(`README.md 未声明当前版本 v${version}`);
}
if (!read('CHANGELOG.md').split(/\r?\n/).some((line) => line.startsWith(`## [${version}]`))) {
  failures.push(`CHANGELOG.md 缺少 v${version} 的发布记录`);
}

const schema = read('src/lib/db/schema.ts');
const schemaVersions = [...schema.matchAll(/this\.version\((\d+)\)/g)].map((match) => Number(match[1]));
const schemaVersion = Math.max(...schemaVersions);
const architecture = read('docs/架构说明.md');
if (!new RegExp(`schema 版本为 ${schemaVersion}`).test(architecture)) {
  failures.push(`docs/架构说明.md 未同步 schema v${schemaVersion}`);
}

const routeScript = read('scripts/test-app.cjs');
const requiredRoutes = ['/', '/ai', '/agent', '/learning', '/zero2-review', '/source/zero2agent', '/source/zero2leetcode', '/edit/new'];
for (const route of requiredRoutes) {
  if (!routeScript.includes(`'${route}'`)) failures.push(`scripts/test-app.cjs 缺少冒烟路由 ${route}`);
}

if (failures.length) {
  console.error(['发布一致性检查失败：', ...failures.map((failure) => `- ${failure}`)].join('\n'));
  process.exitCode = 1;
} else {
  console.log(`发布一致性检查通过：v${version}，Dexie schema v${schemaVersion}`);
}
