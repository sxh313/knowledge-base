import type { RetrievedChunk } from '../ai/retrieval';
import type { AgentIntent } from '../agent/intent';
import type { AgentPlan } from '../agent/tools';

export interface RAGAcceptanceCase {
  id: string;
  query: string;
  expectedTerms: string[];
  chunks: RetrievedChunk[];
  answer: string;
  shouldBeGrounded: boolean;
}

const personal = (id: string, title: string, content: string): RetrievedChunk => ({
  source: 'personal', sourceId: id, journalId: id, chunkId: `${id}:0`, title,
  heading: title, headingPath: [title], content, score: 1,
});

/** 来自产品真实工作流的固定验收样例；不依赖任何默认模型，可在 CI 中持续运行。 */
export const RAG_ACCEPTANCE_CASES: RAGAcceptanceCase[] = [
  {
    id: 'rag-definition', query: 'RAG 是什么', expectedTerms: ['rag'],
    chunks: [personal('rag-1', 'RAG 基础', 'RAG 会先检索相关资料，再把资料作为上下文交给生成模型。')],
    answer: 'RAG 会先检索资料，再基于检索上下文生成回答。[1]', shouldBeGrounded: true,
  },
  {
    id: 'incremental-index', query: '个人笔记修改后向量如何更新', expectedTerms: ['向量', '更新'],
    chunks: [personal('index-1', '增量索引', '保存笔记时只为内容哈希发生变化的分块重新生成向量。')],
    answer: '保存时比较分块内容哈希，只重建发生变化的向量。[1]', shouldBeGrounded: true,
  },
  {
    id: 'agent-undo', query: 'Agent 撤销为什么会冲突', expectedTerms: ['agent', '撤销', '冲突'],
    chunks: [personal('undo-1', '安全撤销', '撤销前比较执行后哈希；如果之后被修改，就拒绝覆盖并报告冲突。')],
    answer: '如果执行后的文档又被修改，当前哈希不匹配，系统会拒绝覆盖。[1]', shouldBeGrounded: true,
  },
  {
    id: 'review-plan', query: '复习计划怎么避免过载', expectedTerms: ['复习', '计划'],
    chunks: [personal('review-1', '复习安排', '计划应限制每日新卡片和到期卡片数量，并优先处理逾期内容。')],
    answer: '应限制每天的卡片量，并优先处理逾期内容。[1]', shouldBeGrounded: true,
  },
  {
    id: 'citation-whitelist', query: '引用白名单有什么用', expectedTerms: ['引用'],
    chunks: [personal('cite-1', '引用校验', '回答只能引用本次检索结果中的编号，未知编号必须被移除。')],
    answer: '系统允许模型引用任何不存在的来源。[9]', shouldBeGrounded: false,
  },
  {
    id: 'inbox-batch', query: '收集箱如何批量整理', expectedTerms: ['收集箱', '批量', '整理'],
    chunks: [personal('inbox-1', '收集箱流程', '先聚类相似素材，再让用户一次确认分类与标签后批量归档。')],
    answer: '先聚类相似素材，再一次确认分类和标签并批量归档。[1]', shouldBeGrounded: true,
  },
];

export interface AgentAcceptanceCase {
  id: string;
  instruction: string;
  expectedIntent: AgentIntent;
  plan: AgentPlan;
  shouldPass: boolean;
}

export const AGENT_ACCEPTANCE_CASES: AgentAcceptanceCase[] = [
  { id: 'chat', instruction: '什么是渐进式总结？', expectedIntent: 'chat', plan: { ops: [{ type: 'search', query: '渐进式总结' }] }, shouldPass: true },
  { id: 'plan', instruction: '帮我制定整理这些笔记的计划', expectedIntent: 'plan', plan: { ops: [{ type: 'search', query: '待整理笔记' }] }, shouldPass: true },
  { id: 'batch', instruction: '批量给这些笔记加上 RAG 标签', expectedIntent: 'batch', plan: { ops: [{ type: 'addTags', journalId: 'j1', tags: ['RAG'], evidence: [{ journalId: 'j1', reason: '检索片段明确讨论 RAG' }] }] }, shouldPass: true },
  { id: 'execute', instruction: '确认执行刚才的计划', expectedIntent: 'execute', plan: { ops: [{ type: 'read', journalId: 'j1' }] }, shouldPass: true },
  { id: 'unsafe-delete', instruction: '删除这篇笔记', expectedIntent: 'plan', plan: { ops: [{ type: 'delete', journalId: 'j1' }] }, shouldPass: false },
  { id: 'unsafe-empty-search', instruction: '搜索一下', expectedIntent: 'chat', plan: { ops: [{ type: 'search', query: '' }] }, shouldPass: false },
  { id: 'unsafe-oversize', instruction: '新建一篇超长笔记', expectedIntent: 'plan', plan: { ops: [{ type: 'create', newTitle: '过长', content: 'x'.repeat(50001) }] }, shouldPass: false },
  { id: 'safe-create', instruction: '新建一篇标题为今日总结的笔记', expectedIntent: 'plan', plan: { ops: [{ type: 'create', newTitle: '今日总结', content: '今日完成复习。' }] }, shouldPass: true },
];
