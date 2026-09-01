import { create } from 'zustand';
import { handleZero2Input, restoreZero2Session, submitZero2Answer, finishTask, skipTask, correctAttemptScore, createZero2ReviewOrchestrator, type OrchestratorState } from '../lib/zero2review/orchestrator';
import { getReviewPlan, listReviewTasks, listTopicMastery, updateReviewPlan } from '../lib/zero2review/repository';
import { getTopicById } from '../lib/zero2review/catalog';
import type { Zero2Mastery, Zero2ReviewTask } from '../lib/db/schema';

interface Zero2ReviewStore { state: OrchestratorState | null; input: string; answer: string; tasks: Zero2ReviewTask[]; mastery: Zero2Mastery[]; planId?: string; planStatus?: 'active' | 'paused' | 'completed'; currentTopicId?: string; error?: string; loadingReview: boolean; setInput: (input: string) => void; setAnswer: (answer: string) => void; submit: () => Promise<void>; submitAnswer: () => Promise<void>; correctScore: (score: 0 | 1 | 2 | 3 | 4) => Promise<void>; startAutomaticReview: (dailyMinutes: number, date: string, goalId?: string) => Promise<void>; restore: (sessionId: string) => Promise<void>; refreshDashboard: (planId: string, fromDate?: string) => Promise<void>; rebuildPlan: (dailyMinutes: number, date: string, goalId?: string) => Promise<void>; pausePlan: () => Promise<void>; resumePlan: () => Promise<void>; skipTask: (taskId: string) => Promise<void>; finishTask: (taskId: string) => Promise<void>; reset: () => void; }
export const useZero2ReviewStore = create<Zero2ReviewStore>((set, get) => ({
  state: null, input: '', answer: '', tasks: [], mastery: [], planStatus: undefined, loadingReview: false, setInput: (input) => set({ input }), setAnswer: (answer) => set({ answer }),
  submit: async () => { const { input, state } = get(); if (!input.trim()) return; const next = await handleZero2Input(input, state?.sessionId); set({ state: next, input: '', answer: '', error: next.error, currentTopicId: next.question?.topicId, mastery: await listTopicMastery() }); },
  submitAnswer: async () => { const { state, answer } = get(); if (!state) return; const next = await submitZero2Answer(state, answer); set({ state: next, answer: '', error: next.error, currentTopicId: next.question?.topicId, mastery: await listTopicMastery() }); },
  correctScore: async (score) => { const { state } = get(); if (!state?.attemptId || !state.evaluation) return; const topicId = state.question?.topicId || state.response?.topicIds[0]; if (!topicId) return; await correctAttemptScore(topicId, state.attemptId, score); set({ mastery: await listTopicMastery(), state: { ...state, evaluation: { ...state.evaluation, score } } }); },
  startAutomaticReview: async (dailyMinutes, date, goalId) => {
    set({ loadingReview: true, error: undefined });
    try {
      let available = get().tasks.filter((task) => task.status === 'todo');
      if (available.length === 0) {
        await get().rebuildPlan(dailyMinutes, date, goalId);
        available = get().tasks.filter((task) => task.status === 'todo');
      }
      const currentTopicId = get().currentTopicId;
      const task = available.find((item) => item.topicId !== currentTopicId) ?? available[0];
      if (!task) { set({ error: '今天没有可复习内容，请重新生成今日计划。' }); return; }
      const topic = await getTopicById(task.topicId);
      const title = topic?.title || task.topicId;
      const next = await handleZero2Input(`请基于课程原文讲解今日复习主题“${title}”，包括核心概念、适用边界和一个实际例子。`, undefined, { readOnly: true });
      set({ state: next, error: next.error, currentTopicId: task.topicId, mastery: await listTopicMastery() });
    } finally {
      set({ loadingReview: false });
    }
  },
  restore: async (sessionId) => {
    const restored = await restoreZero2Session(sessionId);
    const state = restored ? { ...restored, stage: restored.response ? 'complete' as const : restored.stage, question: undefined, response: restored.response ? { ...restored.response, diagnosticQuestion: undefined } : undefined } : null;
    set({ state, currentTopicId: restored?.question?.topicId, error: state?.error });
  },
  refreshDashboard: async (planId, fromDate) => { const [tasks, mastery, plan] = await Promise.all([listReviewTasks(planId, fromDate), listTopicMastery(), getReviewPlan(planId)]); set({ tasks, mastery, planId, planStatus: plan?.status }); },
  rebuildPlan: async (dailyMinutes, date, goalId) => { const tasks = await createZero2ReviewOrchestrator().rebuildPlan(dailyMinutes, date, goalId); const mastery = await listTopicMastery(); set({ tasks, mastery, planId: tasks[0]?.planId, planStatus: 'active' }); },
  pausePlan: async () => { const { planId } = get(); if (!planId) return; await updateReviewPlan(planId, { status: 'paused' }); set({ planStatus: 'paused' }); },
  resumePlan: async () => { const { planId } = get(); if (!planId) return; await updateReviewPlan(planId, { status: 'active' }); set({ planStatus: 'active' }); },
  skipTask: async (taskId) => { await skipTask(taskId); set((store) => ({ tasks: store.tasks.map((task) => task.id === taskId ? { ...task, status: 'skipped' } : task) })); },
  finishTask: async (taskId) => { await finishTask(taskId); set((store) => ({ tasks: store.tasks.map((task) => task.id === taskId ? { ...task, status: 'done' } : task) })); },
  reset: () => set({ state: null, input: '', answer: '', tasks: [], mastery: [], planId: undefined, planStatus: undefined, error: undefined, currentTopicId: undefined }),
}));
