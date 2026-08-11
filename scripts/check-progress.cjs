// 查看指定 run 的 job/step 进度
const fs = require('fs');
const path = require('path');
const txt = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const token = (txt.match(/VITE_SYNC_TOKEN=(.+)$/m) || [])[1]?.trim() || '';
const H = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' };

const runId = process.argv[2];
if (!runId) { console.error('用法: node scripts/check-progress.cjs <runId>'); process.exit(1); }

(async () => {
  const r = await (await fetch(`https://api.github.com/repos/sxh313/knowledge-base/actions/runs/${runId}`, { headers: H })).json();
  const created = new Date(r.created_at);
  const elapsed = Math.round((Date.now() - created) / 1000);
  console.log(`run ${r.id} | ${r.head_branch} | ${r.status} | 已运行 ${elapsed}s`);
  const jobs = await (await fetch(r.jobs_url, { headers: H })).json();
  for (const j of jobs.jobs || []) {
    console.log(`job: ${j.name} ${j.status}`);
    for (const s of j.steps || []) {
      const st = s.status === 'completed' ? (s.conclusion || 'ok') : (s.started_at ? 'RUNNING' : 'waiting');
      console.log(`  [${st}] ${s.name}`);
    }
  }
})().catch((e) => console.error('ERR:', e.message));
