import { create } from 'zustand';
import { handleZero2Input, restoreZero2Session, submitZero2Answer, type OrchestratorState } from '../lib/zero2review/orchestrator';

interface Zero2ReviewStore { state: OrchestratorState | null; input: string; answer: string; setInput: (input: string) => void; setAnswer: (answer: string) => void; submit: () => Promise<void>; submitAnswer: () => Promise<void>; restore: (sessionId: string) => Promise<void>; reset: () => void; }
export const useZero2ReviewStore = create<Zero2ReviewStore>((set, get) => ({
  state: null, input: '', answer: '', setInput: (input) => set({ input }), setAnswer: (answer) => set({ answer }),
  submit: async () => { const { input, state } = get(); if (!input.trim()) return; set({ state: await handleZero2Input(input, state?.sessionId), input: '', answer: '' }); },
  submitAnswer: async () => { const { state, answer } = get(); if (!state) return; set({ state: await submitZero2Answer(state, answer), answer: '' }); },
  restore: async (sessionId) => { set({ state: await restoreZero2Session(sessionId) }); },
  reset: () => set({ state: null, input: '', answer: '' }),
}));
