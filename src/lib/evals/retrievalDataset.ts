import type { RetrievedChunk } from '../ai/retrieval';

export interface RetrievalBenchmarkCase {
  id: string;
  query: string;
  corpus: RetrievedChunk[];
  relevantChunkIds: string[];
  answer: string;
  topK: number;
}

const chunk = (id: string, title: string, content: string): RetrievedChunk => ({
  source: 'personal', sourceId: id.split(':')[0], journalId: id.split(':')[0], chunkId: id,
  title, heading: title, content, score: 0,
});

const noise = [
  chunk('noise-ui:0', '界面颜色', '主题设置支持浅色、深色和跟随系统。'),
  chunk('noise-export:0', '导出格式', '文档可以导出为 Markdown 压缩包。'),
  chunk('noise-timer:0', '番茄钟', '专注计时结束后可以记录本次学习时长。'),
];

/** Small, fixed, model-free corpus that makes retrieval regressions reproducible in CI. */
export const RETRIEVAL_BENCHMARK_CASES: RetrievalBenchmarkCase[] = [
  {
    id: 'rag-definition', query: 'RAG 是什么', topK: 3,
    corpus: [noise[0], chunk('rag:0', 'RAG 基础', 'RAG 会先检索相关资料，再把资料作为上下文交给生成模型。'), noise[1]],
    relevantChunkIds: ['rag:0'], answer: 'RAG 先检索资料，再基于上下文生成回答。[1]',
  },
  {
    id: 'incremental-index', query: '个人笔记修改后向量如何更新', topK: 3,
    corpus: [noise[2], chunk('index:0', '增量索引', '保存笔记时比较内容哈希，只为变化的分块重新生成向量索引。'), noise[0]],
    relevantChunkIds: ['index:0'], answer: '系统比较内容哈希，只更新变化分块的向量。[1]',
  },
  {
    id: 'agent-undo', query: 'Agent 撤销为什么会冲突', topK: 3,
    corpus: [noise[1], chunk('undo:0', 'Agent 安全撤销', '撤销前比较执行后哈希；文档之后被修改时拒绝覆盖并报告冲突。'), noise[2]],
    relevantChunkIds: ['undo:0'], answer: '文档后续改动会造成哈希不匹配，因此拒绝覆盖。[1]',
  },
  {
    id: 'review-overload', query: '复习计划怎么避免过载', topK: 3,
    corpus: [noise[0], chunk('review:0', '复习计划', '限制每日新卡片和到期卡片数量，并优先处理逾期内容。'), noise[2]],
    relevantChunkIds: ['review:0'], answer: '限制每日任务量，并优先处理逾期内容。[1]',
  },
  {
    id: 'citation-validation', query: '引用白名单如何阻止幻觉', topK: 3,
    corpus: [noise[1], chunk('citation:0', '引用白名单', '回答只能引用本次检索结果中的编号，未知编号会被拒绝。'), noise[0]],
    relevantChunkIds: ['citation:0'], answer: '未知来源编号不在检索白名单中，因此会被拒绝。[1]',
  },
  {
    id: 'backup-recovery', query: '导入备份后为什么重建索引', topK: 3,
    corpus: [noise[2], chunk('backup:0', '备份恢复', '导入数据事务提交后重建双链、分块和搜索索引，保证恢复后的查询一致。'), noise[0]],
    relevantChunkIds: ['backup:0'], answer: '事务完成后重建双链、分块和搜索索引，以恢复查询一致性。[1]',
  },
];
