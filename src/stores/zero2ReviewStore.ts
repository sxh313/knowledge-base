import { create } from 'zustand';
import { handleZero2Input, restoreZero2Session, submitZero2Answer, finishTask, skipTask, correctAttemptScore, createZero2ReviewOrchestrator, type OrchestratorState } from '../lib/zero2review/orchestrator';
import { getReviewPlan, listReviewTasks, listTopicMastery, updateReviewPlan } from '../lib/zero2review/repository';
import type { Zero2Mastery, Zero2ReviewTask } from '../lib/db/schema';

interface Zero2ReviewStore { state: OrchestratorState | null; input: string; answer: string; tasks: Zero2ReviewTask[]; mastery: Zero2Mastery[]; planId?: string; planStatus?: 'active' | 'paused' | 'completed'; currentTopicId?: string; error?: string; setInput: (input: string) => void; setAnswer: (answer: string) => void; submit: () => Promise<void>; submitAnswer: () => Promise<void>; correctScore: (score: 0 | 1 | 2 | 3 | 4) => Promise<void>; restore: (sessionId: string) => Promise<void>; refreshDashboard: (planId: string, fromDate?: string) => Promise<void>; rebuildPlan: (dailyMinutes: number, date: string, goalId?: string) => Promise<void>; pausePlan: () => Promise<void>; resumePlan: () => Promise<void>; skipTask: (taskId: string) => Promise<void>; finishTask: (taskId: string) => Promise<void>; reset: () => void; }
export const useZero2ReviewStore = create<Zero2ReviewStore>((set, get) => ({
  state: null, input: '', answer: '', tasks: [], mastery: [], planStatus: undefined, setInput: (input) => set({ input }), setAnswer: (answer) => set({ answer }),
  submit: async () => { const { input, state } = get(); if (!input.trim()) return; const next = await handleZero2Input(input, state?.sessionId); set({ state: next, input: '', answer: '', error: next.error, currentTopicId: next.question?.topicId, mastery: await listTopicMastery() }); },
  submitAnswer: async () => { const { state, answer } = get(); if (!state) return; const next = await submitZero2Answer(state, answer); set({ state: next, answer: '', error: next.error, currentTopicId: next.question?.topicId, mastery: await listTopicMastery() }); },
  correctScore: async (score) => { const { state } = get(); if (!state?.attemptId || !state.evaluation) return; const topicId = state.question?.topicId || state.response?.topicIds[0]; if (!topicId) return; await correctAttemptScore(topicId, state.attemptId, score); set({ mastery: await listTopicMastery(), state: { ...state, evaluation: { ...state.evaluation, score } } }); },
  restore: async (sessionId) => { const state = await restoreZero2Session(sessionId); set({ state, currentTopicId: state?.question?.topicId, error: state?.error }); },
  refreshDashboard: async (planId, fromDate) => { const [tasks, mastery, plan] = await Promise.all([listReviewTasks(planId, fromDate), listTopicMastery(), getReviewPlan(planId)]); set({ tasks, mastery, planId, planStatus: plan?.status }); },
  rebuildPlan: async (dailyMinutes, date, goalId) => { const tasks = await createZero2ReviewOrchestrator().rebuildPlan(dailyMinutes, date, goalId); const mastery = await listTopicMastery(); set({ tasks, mastery, planId: tasks[0]?.planId, planStatus: 'active' }); },
  pausePlan: async () => { const { planId } = get(); if (!planId) return; await updateReviewPlan(planId, { status: 'paused' }); set({ planStatus: 'paused' }); },
  resumePlan: async () => { const { planId } = get(); if (!planId) return; await updateReviewPlan(planId, { status: 'active' }); set({ planStatus: 'active' }); },
  skipTask: async (taskId) => { await skipTask(taskId); set((store) => ({ tasks: store.tasks.map((task) => task.id === taskId ? { ...task, status: 'skipped' } : task) })); },
  finishTask: async (taskId) => { await finishTask(taskId); set((store) => ({ tasks: store.tasks.map((task) => task.id === taskId ? { ...task, status: 'done' } : task) })); },
  reset: () => set({ state: null, input: '', answer: '', tasks: [], mastery: [], planId: undefined, planStatus: undefined, error: undefined, currentTopicId: undefined }),
}));
