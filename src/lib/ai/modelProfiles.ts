import type {
  AIModelBindings,
  AIModelProfile,
  AppSettings,
  RetrievalSettings,
} from '../db/schema';

/** 默认不注入任何远程地址或模型；只有客户明确配置后才允许发送数据。 */
export const DEFAULT_MODEL_PROFILES: AIModelProfile[] = [];

export const DEFAULT_MODEL_BINDINGS: AIModelBindings = {
  answerModelId: '',
  embeddingModelId: undefined,
  rerankerModelId: undefined,
  reviewTutorModelId: '',
  evaluatorModelId: '',
  plannerModelId: '',
};

export const DEFAULT_RETRIEVAL_SETTINGS: RetrievalSettings = {
  vectorEnabled: true,
  rerankEnabled: true,
  queryRewriteEnabled: false,
  lexicalWeight: 0.35,
  vectorWeight: 0.65,
  candidateTopK: 30,
  rerankTopK: 8,
  rerankTimeoutMs: 10000,
};

export function getModelProfile(settings: AppSettings, id?: string): AIModelProfile | undefined {
  if (!id) return undefined;
  return (settings.modelProfiles ?? []).find((profile) => profile.id === id && profile.enabled);
}

export function getChatProfile(settings: AppSettings, id?: string): AIModelProfile | undefined {
  const profile = getModelProfile(settings, id);
  return profile?.kind === 'chat' ? profile : undefined;
}

export function getEmbeddingProfile(settings: AppSettings): AIModelProfile | undefined {
  const profile = getModelProfile(settings, settings.modelBindings?.embeddingModelId);
  return profile?.kind === 'embedding' ? profile : undefined;
}

export function getRetrievalSettings(settings: AppSettings): RetrievalSettings {
  return { ...DEFAULT_RETRIEVAL_SETTINGS, ...(settings.retrieval ?? {}) };
}
