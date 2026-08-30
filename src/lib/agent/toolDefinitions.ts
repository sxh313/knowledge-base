// ──── 模型原生工具调用定义 ────
// 将 Agent 操作子集映射为 OpenAI 兼容的 function calling 工具定义；
// 模型返回 toolCalls 后由本地映射回 AgentOp，仍走完整校验链
// （validateAgentPlan → checkPlanPermission → previewPlan → 用户确认 → applyPlan），
// 不因原生调用绕过安全闭环。

import type { ToolCall, ToolDefinition } from '../ai/client';
import type { AgentOp, AgentOpType } from './tools';

function def(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): ToolDefinition {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
  };
}

const str = { type: 'string' };
const strArray = { type: 'array', items: { type: 'string' } };

/** 暴露给模型的工具集合（与安全校验链共用同一套 AgentOp 语义） */
export const AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  def('search_notes', '搜索知识库笔记，返回标题与命中片段', { query: str }, ['query']),
  def('read_document', '读取一篇笔记的完整内容（journalId 与 title 至少提供一个）', { journalId: str, title: str }, []),
  def('create_document', '新建一篇笔记（写入前会先展示预览，由用户确认）', { newTitle: str, content: str, subject: str, tags: strArray }, ['newTitle', 'content']),
  def('edit_document', '用新的完整内容替换一篇笔记（需要给出修改后的全文）', { journalId: str, title: str, content: str }, ['content']),
  def('append_content', '在笔记末尾追加内容', { journalId: str, title: str, content: str }, ['content']),
  def('patch_journal', '精确替换笔记中的第一处匹配文本', { journalId: str, title: str, findText: str, replaceText: str }, ['findText', 'replaceText']),
  def('add_tags', '为笔记添加标签', { journalId: str, title: str, tags: strArray }, ['tags']),
  def('remove_tags', '移除笔记的标签', { journalId: str, title: str, tags: strArray }, ['tags']),
  def('rename_document', '重命名笔记', { journalId: str, title: str, newName: str }, ['newName']),
  def('move_document', '移动笔记到目标分类', { journalId: str, title: str, newSubject: str }, ['newSubject']),
  def('delete_document', '删除笔记（高风险，默认被权限策略禁止）', { journalId: str, title: str }, []),
];

/** 工具名 → AgentOp 类型 的映射表 */
const TOOL_TO_OP_TYPE: Record<string, AgentOpType> = {
  search_notes: 'search',
  read_document: 'read',
  create_document: 'create',
  edit_document: 'edit',
  append_content: 'append',
  patch_journal: 'patchJournal',
  add_tags: 'addTags',
  remove_tags: 'removeTags',
  rename_document: 'rename',
  move_document: 'move',
  delete_document: 'delete',
};

/** 允许从工具参数复制到 AgentOp 的字段白名单（其余字段一律丢弃） */
const OP_FIELD_WHITELIST = new Set([
  'journalId', 'title', 'content', 'newTitle', 'subject', 'tags',
  'findText', 'replaceText', 'newName', 'newSubject', 'query', 'note',
]);

/**
 * 把模型的一次工具调用映射为 AgentOp；未知工具、参数非 JSON 对象时返回 null。
 * 映射后的 op 仍需经过 validateAgentPlan / checkPlanPermission / previewPlan 完整校验。
 */
export function mapToolCallToOp(call: ToolCall): AgentOp | null {
  const opType = TOOL_TO_OP_TYPE[call.function?.name];
  if (!opType) return null;
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.function?.arguments || '{}');
  } catch {
    return null;
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const op: Record<string, unknown> = { type: opType };
  for (const [key, value] of Object.entries(args)) {
    if (OP_FIELD_WHITELIST.has(key) && value != null) op[key] = value;
  }
  return op as unknown as AgentOp;
}

/** 把一批工具调用映射为 AgentOp 列表（跳过无法映射的调用） */
export function mapToolCallsToOps(calls: ToolCall[]): AgentOp[] {
  return calls.map(mapToolCallToOp).filter((op): op is AgentOp => op != null);
}