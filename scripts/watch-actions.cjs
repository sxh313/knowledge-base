// 监控指定 workflow run,直到完成,输出最终结果 + 失败时打印失败日志
const fs = require('fs');
const path = require('path');
const txt = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const token = (txt.match(/VITE_SYNC_TOKEN=(.+)$/m) || [])[1]?.trim() || '';
const H = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' };

const runId = process.argv[2];
if (!runId) {
  console.error('用法: node scripts/watch-actions.cjs <runId>');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let lastStatus = '';
  while (true) {
    const res = await (await fetch(`https://api.github.com/repos/sxh313/knowledge-base/actions/runs/${runId}`, { headers: H })).json();
    const status = res.status; // queued | in_progress | completed
    if (status !== lastStatus) {
      const created = new Date(res.created_at);
      const elapsed = Math.round((Date.now() - created) / 1000);
      console.log(`[${new Date().toLocaleTimeString()}] ${status} (已运行 ${elapsed}s)`);
      lastStatus = status;
    }
    if (status === 'completed') {
      console.log('结论:', res.conclusion);
      if (res.conclusion !== 'success') {
        // 打印失败 job 的日志末尾
        const jobs = await (await fetch(res.jobs_url, { headers: H })).json();
        for (const job of jobs.jobs || []) {
          console.log(`job: ${job.name} ${job.conclusion}`);
          if (job.conclusion === 'failure') {
            const logRes = await fetch(`https://api.github.com/repos/sxh313/knowledge-base/actions/jobs/${job.id}/logs`, { headers: H });
            if (logRes.ok) {
              const text = await logRes.text();
              const lines = text.split('\n').filter(Boolean);
              console.log('--- 失败日志(末尾 60 行) ---');
              console.log(lines.slice(-60).join('\n'));
            } else {
              console.log('日志获取失败', logRes.status);
            }
          }
        }
      }
      return;
    }
    await sleep(20000); // 每 20s 查一次
  }
}

main().catch((e) => console.error(e.message));
