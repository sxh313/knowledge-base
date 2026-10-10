import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('构建指标检查失败：dist/index.html 不存在，请先执行 npm run build');
  process.exitCode = 1;
} else {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else files.push({ path: path.relative(dist, fullPath).replaceAll(path.sep, '/'), bytes: fs.statSync(fullPath).size });
    }
  };
  walk(dist);
  const assets = files.filter((file) => file.path.startsWith('assets/'));
  const js = assets.filter((file) => file.path.endsWith('.js')).sort((a, b) => b.bytes - a.bytes);
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const precacheBytes = files
    .filter((file) => !file.path.startsWith('sw.js') && !file.path.startsWith('workbox-'))
    .reduce((sum, file) => sum + file.bytes, 0);
  const report = {
    version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
    totalDistBytes: totalBytes,
    precacheCandidateBytes: precacheBytes,
    assetCount: assets.length,
    largestJavaScript: js.slice(0, 5),
  };
  const maxBytes = 45 * 1024 * 1024;
  if (precacheBytes > maxBytes) {
    console.error(`构建指标检查失败：预缓存候选 ${(precacheBytes / 1024 / 1024).toFixed(1)}MB 超过 45MB`);
    process.exitCode = 1;
  } else {
    console.log(`构建指标：v${report.version}，预缓存候选 ${(precacheBytes / 1024 / 1024).toFixed(1)}MB，资源 ${assets.length} 个`);
    console.log(JSON.stringify(report, null, 2));
  }
}
