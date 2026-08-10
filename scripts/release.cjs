// 发布到 GitHub Releases:创建 tag + Release + 上传安装包资产
// 用法: node scripts/release.cjs
// 读取 .env.local 的 VITE_SYNC_TOKEN / VITE_SYNC_OWNER / VITE_SYNC_REPO
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// 读取 .env.local
function readEnv() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) throw new Error('缺少 .env.local(需含 VITE_SYNC_TOKEN)');
  const txt = fs.readFileSync(p, 'utf-8');
  const get = (k) => {
    const m = txt.match(new RegExp(`^\\s*${k}=(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  };
  return {
    token: get('VITE_SYNC_TOKEN'),
    owner: get('VITE_SYNC_OWNER') || 'sxh313',
    repo: get('VITE_SYNC_REPO') || 'knowledge-base',
  };
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const version = pkg.version;
const tag = `v${version}`;

// 安装包路径(从 release 目录找 Setup exe)
const setupPath = findSetupExe();
function findSetupExe() {
  const dir = path.join(ROOT, 'release');
  if (!fs.existsSync(dir)) throw new Error('缺少 release/ 目录,请先 npm run exe 打包');
  // 匹配英文名(knowledge-base-setup-1.0.0.exe)或中文名(知识库 Setup 1.0.0.exe)
  const exe = fs.readdirSync(dir).find((f) => /(setup|Setup).*\.exe$/.test(f) && !f.endsWith('.blockmap'));
  if (!exe) throw new Error('release/ 中未找到 Setup 安装包');
  return path.join(dir, exe);
}

async function api(token, method, url, body, isUpload = false) {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };
  if (isUpload) {
    // 上传资产必须显式指定二进制 Content-Type + Content-Length
    headers['Content-Type'] = 'application/octet-stream';
    headers['Content-Length'] = body.length;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    method,
    headers,
    body: isUpload ? body : (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = data && typeof data === 'object' ? (data.message || JSON.stringify(data)) : text;
    throw new Error(`GitHub API ${method} ${url} 失败: ${res.status} ${msg}`);
  }
  return data;
}

async function main() {
  const { token, owner, repo } = readEnv();
  if (!token) throw new Error('VITE_SYNC_TOKEN 为空');
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const uploadBase = `https://uploads.github.com/repos/${owner}/${repo}`;

  console.log(`📦 发布版本 ${tag}(${pkg.productName || 'knowledge-base'})`);

  // 1. 检查/创建 tag(refs/tags/vX.Y.Z)
  let tagSha = null;
  try {
    const ref = await api(token, 'GET', `${base}/git/ref/tags/${tag}`);
    tagSha = ref.object.sha;
  } catch {
    // tag 不存在,创建轻量 tag(指向当前分支 HEAD)
    const head = await api(token, 'GET', `${base}/git/ref/heads/${process.env.GIT_BRANCH || 'knowledge-base'}`);
    const created = await api(token, 'POST', `${base}/git/refs`, { ref: `refs/tags/${tag}`, sha: head.object.sha });
    tagSha = created.object.sha;
    console.log(`✅ 已创建 tag ${tag} -> ${tagSha.slice(0,7)}`);
  }

  // 2. 创建 Release(若已存在则复用)
  let releaseId = null;
  try {
    const r = await api(token, 'POST', `${base}/releases`, {
      tag_name: tag,
      name: tag,
      body: releaseBody(),
      draft: false,
      prerelease: false,
    });
    releaseId = r.id;
    console.log(`✅ 已创建 Release ${tag}`);
  } catch {
    // 可能已存在,查找现有 release
    const rel = await api(token, 'GET', `${base}/releases/tags/${tag}`);
    releaseId = rel.id;
    console.log(`ℹ️ Release ${tag} 已存在,复用 id=${releaseId}`);
  }

  // 3. 上传资产:安装包 + latest.yml(自动更新必需,文件名与 latest.yml 的 url 一致)
  const uploadAsset = async (filePath, assetName) => {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath);
    console.log(`⏫ 上传 ${assetName} (${(stat.size/1024/1024).toFixed(1)} MB)...`);
    const asset = await api(token, 'POST', `${uploadBase}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`, content, true);
    console.log(`✅ 已上传资产: ${asset.name}`);
    return asset;
  };

  // 安装包要用英文名(与 latest.yml 的 url 匹配),electron-updater 才找得到
  const setupBaseName = path.basename(setupPath, '.exe');
  const setupAssetName = 'knowledge-base-setup-' + version + '.exe';
  await uploadAsset(setupPath, setupAssetName);

  // 上传 latest.yml(electron-updater 更新的元数据源)
  const latestYml = path.join(ROOT, 'release', 'latest.yml');
  if (fs.existsSync(latestYml)) {
    await uploadAsset(latestYml, 'latest.yml');
  }

  console.log(`\n🎉 发布完成: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
}

function releaseBody() {
  return `# 知识库 v${version}

本地优先的 AI 增强型知识管理工具桌面版。

## 安装
- 下载 **知识库 Setup ${version}.exe** 并运行安装
- 或使用便携版(win-unpacked,解压即用)

## 功能
- 富文本 + Markdown 双模式编辑,自动保存
- AI 助手(RAG 全库问答)、知识卡片(FSRS 间隔复习)
- 双向链接、知识图谱、高级搜索
- 云同步(推送到 GitHub 私有仓库)
- 番茄钟、PWA 离线支持

## 说明
- 所有数据本地存储于 IndexedDB,API Key 加密保存在本地
- 支持云同步与多设备
`;
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});