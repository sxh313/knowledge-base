import type { LearningGoal, LearningTask } from '../db/schema';

export interface CourseDocument {
  id: string;
  path: string;
  title: string;
  module: string;
  sourceUrl?: string;
  localPath?: string;
  moduleOrder?: number;
  topicOrder?: number;
  estimatedMinutes?: number;
}

interface CourseBundle { documents?: CourseDocument[] }

const AGENT_PREFIXES = ['learn-agent-basic/', 'learn-langgraph/', 'learn-claude-code/', 'learn-openclaw/'];
let agentCoursePromise: Promise<CourseDocument[]> | null = null;

function localDate(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function nextDate(start: string, days: number): string {
  const date = new Date(`${start}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function loadAgentCourse(): Promise<CourseDocument[]> {
  if (!agentCoursePromise) {
    agentCoursePromise = fetch(`${import.meta.env.BASE_URL || '/'}zero2agent-kb.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`课程索引加载失败：${response.status}`);
        return response.json() as Promise<CourseBundle>;
      })
      .then((bundle) => (bundle.documents ?? [])
        .filter((doc) => AGENT_PREFIXES.some((prefix) => doc.path.startsWith(prefix)))
        .sort((a, b) => (a.moduleOrder ?? 99) - (b.moduleOrder ?? 99) || (a.topicOrder ?? 99) - (b.topicOrder ?? 99) || a.path.localeCompare(b.path)))
      .catch((error) => { agentCoursePromise = null; throw error; });
  }
  return agentCoursePromise;
}

/** 给 Agent 问答使用的紧凑课程目录；只包含规划所需结构，不注入课程全文。 */
export function formatAgentCourseCatalog(documents: CourseDocument[]): string {
  if (!documents.length) return '（课程目录为空）';
  return documents
    .map((document, index) => `${index + 1}. [${document.module}] [${document.title}](/source/zero2agent?topicId=${encodeURIComponent(document.id)})（${document.estimatedMinutes ?? 10} 分钟）`)
    .join('\n');
}

function exerciseFor(documents: CourseDocument[]): string {
  const names = documents.map((doc) => doc.title).join('、');
  return `用自己的话说明「${names}」解决了什么问题；再写一个适用场景或容易踩坑的边界条件。`;
}

export function buildAgentCourseTasks(goal: LearningGoal, documents: CourseDocument[], startDate = localDate()): LearningTask[] {
  if (!documents.length) return [];
  const availableDays = goal.deadline
    ? Math.max(1, Math.ceil((new Date(`${goal.deadline}T12:00:00`).getTime() - new Date(`${startDate}T12:00:00`).getTime()) / 86_400_000) + 1)
    : documents.length;
  const groupSize = Math.max(1, Math.ceil(documents.length / availableDays));
  const now = Date.now();
  return Array.from({ length: Math.ceil(documents.length / groupSize) }, (_, index) => {
    const unit = documents.slice(index * groupSize, (index + 1) * groupSize);
    const primary = unit[0];
    return {
      id: `${goal.id}:agent-course:${index}`,
      goalId: goal.id,
      date: nextDate(startDate, index),
      title: `第 ${index + 1} 天 · ${primary.module} · ${primary.title}`,
      minutes: goal.dailyMinutes,
      sourceIds: unit.map((doc) => doc.id),
      sourceRefs: unit.map((doc) => ({ title: doc.title, path: doc.path, sourceUrl: doc.sourceUrl, localPath: doc.localPath })),
      summary: unit.length === 1 ? `阅读并理解「${primary.title}」的核心概念与实现思路。` : `完成 ${unit.length} 个连续小节：${unit.map((doc) => doc.title).join('、')}。`,
      exercise: exerciseFor(unit),
      learningStage: 'reading' as const,
      quizPrompt: `不用查看资料，回答：${primary.title} 的核心作用是什么？`,
      order: index + 1,
      status: 'todo' as const,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export { localDate as learningLocalDate };
