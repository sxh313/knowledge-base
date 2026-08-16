// ──── Agent 状态管理 ────
// 编排 Agent 流程：检索相关文档 → 调用 AI 生成操作计划 → 预览 → 应用。

import { create } from 'zustand';
import type { ChatMessage } from '../lib/ai/client';
import { routeAI } from '../lib/ai/router';
import { getJournal } from '../lib/db/queries';
import { retrieve } from '../lib/ai/retrieval';
import { buildAgentSystemPrompt } from '../lib/agent/prompt';
import { previewPlan, applyPlan } from '../lib/agent/executor';
import {
  parseAgentPlan,
  toDocRef,
  type AgentPlan,
  type AgentExecutionResult,
  type AgentDocRef,
} from '../lib/agent/tools';
import type { JournalEntry } from '../lib/db/schema';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 用户消息附带的操作计划（AI 生成，待确认） */
  plan?: AgentPlan;
  /** 预览结果 */
  preview?: AgentExecutionResult;
  /** 应用结果 */
  applied?: AgentExecutionResult;
  /** 是否已应用 */
  appliedAt?: number;
}

interface AgentStore {
  isProcessing: boolean;
  error: string | null;
  messages: AgentMessage[];
  /** 当前待确认的计划 */
  pendingPlan: AgentPlan | null;
  /** 当前待确认计划的预览 */
  pendingPreview: AgentExecutionResult | null;
  /** 当前待确认计划对应的用户消息索引 */
  pendingMsgIndex: number | null;

  clear: () => void;
  /** 发送用户指令，触发 AI 生成计划并预览 */
  run: (instruction: string, attachedContent?: string) => Promise<void>;
  /** 应用当前待确认的计划 */
  applyPending: () => Promise<void>;
  /** 取消当前待确认的计划 */
  cancelPending: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  isProcessing: false,
  error: null,
  messages: [],
  pendingPlan: null,
  pendingPreview: null,
  pendingMsgIndex: null,

  clear: () => set({ messages: [], pendingPlan: null, pendingPreview: null, pendingMsgIndex: null, error: null }),

  run: async (instruction, attachedContent) => {
    const text = attachedContent
      ? `${instruction}\n\n【用户提供的文件内容】\n${attachedContent}`
      : instruction;
    const userMsg: AgentMessage = { role: 'user', content: text };
    set((s) => ({ messages: [...s.messages, userMsg], isProcessing: true, error: null }));

    try {
      // 1. 检索相关文档作为上下文
      let docRefs: AgentDocRef[] = [];
      try {
        const chunks = await retrieve(instruction, { kind: 'all' }, 8);
        const ids = Array.from(new Set(chunks.map((c) => c.journalId)));
        const entries: JournalEntry[] = [];
        for (const id of ids) {
          const entry = await getJournal(id);
          if (entry && !entry.deletedAt) entries.push(entry);
        }
        docRefs = entries.map((e) => toDocRef(e));
      } catch {
        docRefs = [];
      }

      // 2. 构造 system prompt 并调用 AI
      const timeStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      const sysPrompt = buildAgentSystemPrompt(docRefs, timeStr);
      // 多轮对话记忆：把之前的对话历史传给 AI，让它能「接着上次继续改」
      const history: ChatMessage[] = get()
        .messages.slice(0, -1) // 去掉刚加入的当前用户消息
        .map((m) => ({ role: m.role, content: m.content }));
      const baseMessages: ChatMessage[] = [
        { role: 'system', content: sysPrompt },
        ...history,
        { role: 'user', content: text },
      ];

      // 3. 调用 AI 并解析操作计划；解析失败时自动重试一次（纠正格式）
      let raw = '';
      let plan: AgentPlan | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await routeAI('qa', baseMessages);
        raw = result.content;
        plan = parseAgentPlan(raw);
        if (plan && plan.ops.length > 0) break;
        if (attempt === 0) {
          // 追加纠正提示，要求只输出 JSON
          baseMessages.push(
            { role: 'assistant', content: raw },
            {
              role: 'user',
              content:
                '你刚才的输出不是有效的操作计划 JSON。请只输出一个 JSON 对象（不要 markdown 围栏、不要多余文字），格式为 {"summary":"...","ops":[...]}。',
            },
          );
        }
      }

      if (!plan || plan.ops.length === 0) {
        // AI 没有生成可执行计划，当作普通回答展示
        const assistantMsg: AgentMessage = { role: 'assistant', content: raw };
        set((s) => ({ messages: [...s.messages, assistantMsg], isProcessing: false }));
        return;
      }

      // 4. 预览计划（不写入）
      const preview = await previewPlan(plan);
      const msgIndex = get().messages.length;
      const assistantMsg: AgentMessage = {
        role: 'assistant',
        content: plan.summary || '我准备执行以下操作，请确认：',
        plan,
        preview,
      };
      set((s) => ({
        messages: [...s.messages, assistantMsg],
        pendingPlan: plan,
        pendingPreview: preview,
        pendingMsgIndex: msgIndex,
        isProcessing: false,
      }));
    } catch (e) {
      set({ isProcessing: false, error: (e as Error).message });
    }
  },

  applyPending: async () => {
    const { pendingPlan, pendingMsgIndex } = get();
    if (!pendingPlan) return;
    set({ isProcessing: true, error: null });
    try {
      const applied = await applyPlan(pendingPlan);
      set((s) => ({
        messages: s.messages.map((m, i) =>
          i === pendingMsgIndex ? { ...m, applied, appliedAt: Date.now() } : m,
        ),
        pendingPlan: null,
        pendingPreview: null,
        pendingMsgIndex: null,
        isProcessing: false,
      }));
    } catch (e) {
      set({ isProcessing: false, error: (e as Error).message });
    }
  },

  cancelPending: () => {
    const { pendingMsgIndex } = get();
    set((s) => ({
      messages: s.messages.map((m, i) =>
        i === pendingMsgIndex ? { ...m, plan: undefined, preview: undefined } : m,
      ),
      pendingPlan: null,
      pendingPreview: null,
      pendingMsgIndex: null,
    }));
  },
}));
