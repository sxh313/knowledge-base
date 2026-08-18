// ──── 简单的行级 diff ────
// 用于 Agent 操作预览：计算「修改前 → 修改后」的真实内容差异，
// 让用户能准确确认修改内容，而不是只看描述。

export type DiffLineType = 'same' | 'add' | 'remove';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

/**
 * 计算两个文本的行级 diff（LCS 算法）。
 * 返回按行排列的结果，每行标记为 same / add / remove。
 * 用于展示「新增/删除/未变」的变更预览。
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = (before || '').split('\n');
  const b = (after || '').split('\n');

  // 计算 LCS 长度矩阵
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // 回溯构建 diff
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'remove', text: a[i] });
      i++;
    } else {
      result.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: 'remove', text: a[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: 'add', text: b[j] });
    j++;
  }
  return result;
}

/** 统计 diff 中新增/删除的行数 */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === 'add') added++;
    else if (line.type === 'remove') removed++;
  }
  return { added, removed };
}

/** 把 diff 渲染成带 +/- 前缀的文本（供预览展示） */
export function formatDiffText(lines: DiffLine[], maxLines = 200): string {
  const shown = lines.slice(0, maxLines);
  const truncated = lines.length > maxLines;
  const out = shown
    .map((l) => {
      switch (l.type) {
        case 'add':
          return `+ ${l.text}`;
        case 'remove':
          return `- ${l.text}`;
        default:
          return `  ${l.text}`;
      }
    })
    .join('\n');
  return truncated ? `${out}\n…（共 ${lines.length} 行，仅显示前 ${maxLines} 行）` : out;
}
