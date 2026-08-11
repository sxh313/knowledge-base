// 获取 Android Build 工作流失败的日志
const fs = require('fs');
const path = require('path');
const txt = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const m = txt.match(/VITE_SYNC_TOKEN=(.+)$/m);
const token = m ? m[1].trim() : '';
const H = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' };

async function main() {
  // 找到最近失败的 run
  const runs = await (await fetch('https://api.github.com/repos/sxh313/knowledge-base/actions/runs?name=Android%20Build&per_page=1', { headers: H })).json();
  const run = runs.workflow_runs?.[0];
  if (!run) return console.log('无 run');
  console.log('run id:', run.id, run.status, run.conclusion);

  // 获取 jobs
  const jobs = await (await fetch(run.jobs_url, { headers: H })).json();
  for (const job of jobs.jobs || []) {
    console.log(`job: ${job.name} ${job.status}`);
    for (const step of job.steps || []) {
      console.log(`  step [${step.conclusion || '?'}] ${step.name}`);
    }
    // 下载失败 step 的日志
    if (job.conclusion === 'failure') {
      const logRes = await fetch(`https://api.github.com/repos/sxh313/knowledge-base/actions/jobs/${job.id}/logs`, { headers: H });
      if (logRes.ok) {
        const text = await logRes.text();
        const lines = text.split('\n').filter(Boolean);
        console.log('--- 失败日志(末尾) ---');
        console.log(lines.slice(-60).join('\n'));
      } else {
        console.log('日志获取失败', logRes.status);
      }
      break;
    }
  }
}
main().catch((e) => console.error(e.message));