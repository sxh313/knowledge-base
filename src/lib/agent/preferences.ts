import { getUserPreference, setUserPreference } from '../db/userPreferences';

export interface AgentPreferences {
  language: 'zh-CN' | 'en';
  detail: 'concise' | 'balanced' | 'detailed';
  defaultPlanOnly: boolean;
  maxCards: number;
  tagStyle: 'zh' | 'en' | 'mixed';
}

export const DEFAULT_AGENT_PREFERENCES: AgentPreferences = {
  language: 'zh-CN', detail: 'balanced', defaultPlanOnly: true, maxCards: 10, tagStyle: 'zh',
};
const KEY = 'zhiyu-agent-preferences';
export async function getAgentPreferences(): Promise<AgentPreferences> {
  return getUserPreference('agent', DEFAULT_AGENT_PREFERENCES, KEY);
}
export async function saveAgentPreferences(patch: Partial<AgentPreferences>): Promise<AgentPreferences> {
  const current = await getAgentPreferences();
  const next = { ...current, ...patch, maxCards: Math.max(1, Math.min(50, Number(patch.maxCards ?? current.maxCards))) };
  return setUserPreference('agent', next);
}
export async function resetAgentPreferences(): Promise<AgentPreferences> {
  return setUserPreference('agent', DEFAULT_AGENT_PREFERENCES);
}
