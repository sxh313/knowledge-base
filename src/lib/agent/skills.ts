export type SkillStatus = 'ready' | 'on-demand' | 'guarded';

export interface SkillDescriptor {
  id: string;
  name: string;
  description: string;
  status: SkillStatus;
  stage: 'registry' | 'guard' | 'checkpoint';
}

/** 轻量 Harness Registry：只描述本地可用能力，不执行外部脚本或上传用户内容。 */
export const SKILL_REGISTRY: SkillDescriptor[] = [
  { id: 'rag-retrieval', name: '知识检索', description: '问题重写、分块召回和来源定位', status: 'ready', stage: 'registry' },
  { id: 'document-editor', name: '文档操作', description: '新建、编辑、追加、移动和标签计划', status: 'guarded', stage: 'guard' },
  { id: 'quality-review', name: '质量检查', description: '重复、摘要、孤立文档和断链分析', status: 'ready', stage: 'registry' },
  { id: 'study-planner', name: '学习计划', description: '基于复习记录生成可编辑建议', status: 'on-demand', stage: 'checkpoint' },
  { id: 'conflict-review', name: '冲突复核', description: '对比本地/远端版本并生成合并草案', status: 'guarded', stage: 'guard' },
  { id: 'local-model', name: '本地模型', description: 'Ollama、LM Studio、vLLM、LocalAI', status: 'on-demand', stage: 'checkpoint' },
];

export function getSkillRegistryState() {
  return {
    skills: SKILL_REGISTRY,
    checkpoint: '每次写入前必须经过计划校验、真实 diff、用户确认和 contentHash 检查',
    guard: '高风险操作默认不勾选；删除和整体编辑必须显式批准',
  };
}
