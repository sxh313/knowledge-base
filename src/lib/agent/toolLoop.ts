// ──── Agent 多轮工具循环 ────
// 实现「search/read → AI → 下一步操作」的闭环：
// 当 AI 输出的计划只包含只读操作（read/search）时，执行这些工具，
// 把结构化结果重新注入 AI，让它决定下一步，最多循环 MAX_TOOL_ROUNDS 次。

import type { AgentPlan, AgentExecutionResult } from './tools';

/** 最多工具循环轮数，防止无限循环 */
export const MAX_TOOL_ROUNDS = 5;

/** 只读操作类型：可自动执行，无需用户确认 */
const READ_ONLY_TYPES = new Set(['read', 'search', 'findDuplicates', 'reviewQuality', 'createStudyPlan']);

/** 判断计划是否只包含只读操作（read/search） */
export function isReadOnlyPlan(plan: AgentPlan): boolean {
  return plan.ops.length > 0 && plan.ops.every((op) => READ_ONLY_TYPES.has(op.type));
}

/** 判断计划是否包含任何只读操作 */
export function hasReadOnlyOps(plan: AgentPlan): boolean {
  return plan.ops.some((op) => READ_ONLY_TYPES.has(op.type));
}

/**
 * 把只读工具的执行结果格式化为结构化文本，重新注入 AI。
 * - read：返回文档全文（带标题与 id）。
 * - search：返回带来源引用（文档 ID、标题、章节、匹配片段）的命中列表。
 */
export function formatToolResults(preview: AgentExecutionResult): string {
  const lines: string[] = [];
  for (const r of preview.results) {
    if (!r.ok) {
      lines.push(`[工具结果] ${r.op.type} 失败：${r.error || '未知错误'}`);
      continue;
    }
    if (r.op.type === 'read') {
      lines.push(
        `[工具结果 read] 文档「${r.title || ''}」(id=${r.journalId || ''}) 全文：\n${r.content || ''}`,
      );
    } else if (r.op.type === 'search') {
      const hits = r.searchResults ?? [];
      if (hits.length === 0) {
        lines.push(`[工具结果 search] 查询「${r.op.query || ''}」未找到匹配文档。`);
        continue;
      }
      lines.push(`[工具结果 search] 查询「${r.op.query || ''}」命中 ${hits.length} 篇文档：`);
      hits.forEach((h, i) => {
        const heading = h.heading ? `，章节「${h.heading}」` : '';
        lines.push(
          `${i + 1}. [${h.journalId}] ${h.title}（分类：${h.subject || '无'}${heading}）\n   匹配片段：${h.snippet}`,
        );
      });
    } else if (r.op.type === 'findDuplicates') {
      const groups = r.duplicateGroups ?? [];
      if (groups.length === 0) {
        lines.push('[工具结果 findDuplicates] 未发现明显重复文档。');
        continue;
      }
      lines.push(`[工具结果 findDuplicates] 发现 ${groups.length} 组疑似重复文档：`);
      groups.forEach((g, i) => {
        lines.push(
          `${i + 1}. ${g.items.map((it) => `「${it.title}」(${it.similarity.toFixed(2)})`).join('、')}\n   建议：${g.suggestion}`,
        );
      });
    } else if (r.op.type === 'reviewQuality') {
      const issues = r.qualityIssues ?? [];
      if (issues.length === 0) {
        lines.push('[工具结果 reviewQuality] 未发现问题，知识库质量良好。');
        continue;
      }
      lines.push(`[工具结果 reviewQuality] 发现 ${issues.length} 个质量问题：`);
      issues.slice(0, 20).forEach((i, idx) => {
        lines.push(`${idx + 1}. [${i.severity}] ${i.title}：${i.message}`);
      });
    } else if (r.op.type === 'createStudyPlan') {
      const plan = r.studyPlan ?? [];
      if (plan.length === 0) {
        lines.push('[工具结果 createStudyPlan] 暂无学习计划建议。');
        continue;
      }
      lines.push(`[工具结果 createStudyPlan] 生成 ${plan.length} 条学习计划建议：`);
      plan.forEach((p, i) => {
        lines.push(
          `${i + 1}. ${p.reviewInDays === 0 ? '今天' : `${p.reviewInDays} 天后`}复习「${p.title}」：${p.reason}`,
        );
      });
    }
  }
  return lines.join('\n\n');
}

/**
 * 构造「工具结果 → AI 下一步」的提示词。
 * 要求 AI 基于工具结果继续，若信息足够则输出最终写操作计划。
 */
export function buildToolResultPrompt(toolResults: string): string {
  return `以下是只读工具（read/search）返回的结果，请基于这些结果继续：

${toolResults}

请根据以上信息决定下一步：
- 如果信息已足够，直接输出最终的操作计划（create/edit/append/rename 等写操作）。
- 如果还需要读取更多文档或搜索更多内容，可以继续输出 read/search 操作。
- 只输出一个 JSON 对象：{"summary":"...","ops":[...]}，不要 markdown 围栏，不要多余文字。`;
}
