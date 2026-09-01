import { describe, expect, it } from 'vitest';
import { buildAgentCourseTasks, formatAgentCourseCatalog, type CourseDocument } from './coursePlanner';
import type { LearningGoal } from '../db/schema';

const goal: LearningGoal = {
  id: 'agent-goal', title: '一周学完 Agent', dailyMinutes: 30, level: '初学者', planKind: 'agent-course', status: 'active', createdAt: 0, updatedAt: 0,
};
const documents: CourseDocument[] = [
  { id: 'zero2agent:basic', path: 'learn-agent-basic/01.md', title: '什么是 Agent', module: 'Agent 基础', moduleOrder: 1, topicOrder: 1, sourceUrl: 'https://example.com/1' },
  { id: 'zero2agent:tools', path: 'learn-agent-basic/02.md', title: '工具调用', module: 'Agent 基础', moduleOrder: 1, topicOrder: 2, sourceUrl: 'https://example.com/2' },
  { id: 'zero2agent:graph', path: 'learn-langgraph/01.md', title: 'LangGraph 入门', module: 'LangGraph', moduleOrder: 2, topicOrder: 1, sourceUrl: 'https://example.com/3' },
];

describe('Agent 课程规划器', () => {
  it('为每个课程单元生成带资料和练习的日任务', () => {
    const tasks = buildAgentCourseTasks(goal, documents, '2030-01-01');
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({ date: '2030-01-01', minutes: 30, sourceIds: ['zero2agent:basic'], order: 1 });
    expect(tasks[0].sourceRefs?.[0].title).toBe('什么是 Agent');
    expect(tasks[0].exercise).toContain('什么是 Agent');
  });

  it('在截止日期较短时合并连续课程，而不是丢弃课程', () => {
    const tasks = buildAgentCourseTasks({ ...goal, deadline: '2030-01-02' }, documents, '2030-01-01');
    expect(tasks).toHaveLength(2);
    expect(tasks.flatMap((task) => task.sourceIds)).toEqual(documents.map((doc) => doc.id));
  });

  it('向 Agent 提供可规划的课程标题、模块和 topicId', () => {
    const catalog = formatAgentCourseCatalog(documents);
    expect(catalog).toContain('[Agent 基础] [什么是 Agent]');
    expect(catalog).toContain('/source/zero2agent?topicId=zero2agent%3Abasic');
    expect(catalog).not.toContain('undefined');
  });
});
