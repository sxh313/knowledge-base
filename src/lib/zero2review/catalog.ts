import type { Zero2TopicCandidate } from './types';

export interface Zero2CatalogTopic {
  id: string;
  path: string;
  title: string;
  module: string;
  order: number;
  moduleOrder?: number;
  topicOrder?: number;
  keywords?: string[];
  prerequisiteIds?: string[];
  estimatedMinutes?: number;
}

let catalogPromise: Promise<Zero2CatalogTopic[]> | null = null;

export function loadZero2Catalog(): Promise<Zero2CatalogTopic[]> {
  if (!catalogPromise) {
    const url = `${import.meta.env.BASE_URL || '/'}zero2agent-kb.json`;
    catalogPromise = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`zero2Agent 索引加载失败: ${response.status}`);
        return response.json() as Promise<{ documents?: Zero2CatalogTopic[] }>;
      })
      .then((data) => (data.documents ?? []).map((doc, index) => ({ ...doc, order: doc.order ?? index })))
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

export async function getTopicById(topicId: string): Promise<Zero2CatalogTopic | undefined> {
  return (await loadZero2Catalog()).find((topic) => topic.id === topicId);
}

export async function validateTopicIds(topicIds: string[]): Promise<string[]> {
  const valid = new Set((await loadZero2Catalog()).map((topic) => topic.id));
  return Array.from(new Set(topicIds.filter((id) => valid.has(id))));
}

export async function getTopicCandidates(ids: string[]): Promise<Zero2CatalogTopic[]> {
  const wanted = new Set(ids);
  return (await loadZero2Catalog()).filter((topic) => wanted.has(topic.id));
}

export async function resolveTopicCandidates(candidates: Zero2TopicCandidate[]): Promise<Zero2CatalogTopic[]> {
  return getTopicCandidates(candidates.map((candidate) => candidate.topicId));
}

export async function getPrerequisites(topicId: string): Promise<Zero2CatalogTopic[]> {
  const topic = await getTopicById(topicId);
  if (!topic?.prerequisiteIds?.length) return [];
  return getTopicCandidates(topic.prerequisiteIds);
}
