import { create } from 'zustand';
import { handleZero2Input, restoreZero2Session, submitZero2Answer, finishTask, skipTask, createZero2ReviewOrchestrator, type OrchestratorState } from '../lib/zero2review/orchestrator';
import { listReviewTasks, listTopicMastery } from '../lib/zero2review/repository';
import type { Zero2Mastery, Zero2ReviewTask } from '../lib/db/schema';

interface Zero2ReviewStore { state: OrchestratorState | null; input: string; answer: string; tasks: Zero2ReviewTask[]; mastery: Zero2Mastery[]; setInput: (input: string) => void; setAnswer: (answer: string) => void; submit: () => Promise<void>; submitAnswer: () => Promise<void>; restore: (sessionId: string) => Promise<void>; refreshDashboard: (planId: string, fromDate?: string) => Promise<void>; rebuildPlan: (dailyMinutes: number, date: string, goalId?: string) => Promise<void>; skipTask: (taskId: string) => Promise<void>; finishTask: (taskId: string) => Promise<void>; reset: () => void; }
export const useZero2ReviewStore = create<Zero2ReviewStore>((set, get) => ({
  state: null, input: '', answer: '', tasks: [], mastery: [], setInput: (input) => set({ input }), setAnswer: (answer) => set({ answer }),
  submit: async () => { const { input, state } = get(); if (!input.trim()) return; set({ state: await handleZero2Input(input, state?.sessionId), input: '', answer: '' }); },
  submitAnswer: async () => { const { state, answer } = get(); if (!state) return; set({ state: await submitZero2Answer(state, answer), answer: '' }); },
  restore: async (sessionId) => { set({ state: await restoreZero2Session(sessionId) }); },
  refreshDashboard: async (planId, fromDate) => { const [tasks, mastery] = await Promise.all([listReviewTasks(planId, fromDate), listTopicMastery()]); set({ tasks, mastery }); },
  rebuildPlan: async (dailyMinutes, date, goalId) => { const tasks = await createZero2ReviewOrchestrator().rebuildPlan(dailyMinutes, date, goalId); const mastery = await listTopicMastery(); set({ tasks, mastery }); },
  skipTask: async (taskId) => { await skipTask(taskId); set((store) => ({ tasks: store.tasks.map((task) => task.id === taskId ? { ...task, status: 'skipped' } : task) })); },
  finishTask: async (taskId) => { await finishTask(taskId); set((store) => ({ tasks: store.tasks.map((task) => task.id === taskId ? { ...task, status: 'done' } : task) })); },
  reset: () => set({ state: null, input: '', answer: '', tasks: [], mastery: [] }),
}));
