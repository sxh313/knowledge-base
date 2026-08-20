import type {
  AIModelBindings,
  AIModelProfile,
  AppSettings,
  RetrievalSettings,
} from '../db/schema';

export const DEFAULT_MODEL_PROFILES: AIModelProfile[] = [
  {
    id: 'local-dsv4',
    name: '本地 dsv4',
    kind: 'chat',
    baseUrl: 'http://61.172.167.64:4900/v1',
    modelId: 'dsv4',
    apiKey: '',
    enabled: true,
  },
  {
    id: 'local-bge-small-zh',
    name: '本地 BGE-small-zh',
    kind: 'embedding',
    baseUrl: 'http://61.172.167.64:4901/v1',
    modelId: 'BAAI/bge-small-zh-v1.5',
    apiKey: '',
    enabled: false,
    dimension: 512,
  },
];

export const DEFAULT_MODEL_BINDINGS: AIModelBindings = {
  answerModelId: 'local-dsv4',
  embeddingModelId: 'local-bge-small-zh',
  rerankerModelId: 'local-dsv4',
  reviewTutorModelId: 'local-dsv4',
  evaluatorModelId: 'local-dsv4',
  plannerModelId: 'local-dsv4',
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

