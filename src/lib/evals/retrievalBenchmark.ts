import { rankLexicalChunks } from '../ai/retrieval';
import type { RetrievalBenchmarkCase } from './retrievalDataset';

export interface RetrievalBenchmarkMetrics {
  recallAtK: number;
  citationCoverage: number;
  unsupportedAnswerRate: number;
  averageLatencyMs: number;
}

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function citedChunkIds(answer: string, rankedIds: string[]): string[] {
  const indexes = [...answer.matchAll(/\[(\d+)]/g)].map((match) => Number(match[1]) - 1);
  return Array.from(new Set(indexes.map((index) => rankedIds[index]).filter(Boolean)));
}

export function runRetrievalBenchmark(cases: RetrievalBenchmarkCase[]): RetrievalBenchmarkMetrics {
  const recalls: number[] = [];
  const citationCoverages: number[] = [];
  const unsupported: number[] = [];
  const latencies: number[] = [];

  for (const item of cases) {
    const startedAt = performance.now();
    const ranked = rankLexicalChunks(item.query, item.corpus, item.topK);
    latencies.push(performance.now() - startedAt);
    const rankedIds = ranked.map((chunk) => chunk.chunkId);
    const relevant = new Set(item.relevantChunkIds);
    const retrievedRelevant = rankedIds.filter((id) => relevant.has(id));
    const cited = citedChunkIds(item.answer, rankedIds);
    recalls.push(retrievedRelevant.length / Math.max(1, relevant.size));
    citationCoverages.push(cited.filter((id) => relevant.has(id)).length / Math.max(1, relevant.size));
    unsupported.push(Number(cited.length === 0 || cited.some((id) => !relevant.has(id))));
  }

  return {
    recallAtK: average(recalls),
    citationCoverage: average(citationCoverages),
    unsupportedAnswerRate: average(unsupported),
    averageLatencyMs: average(latencies),
  };
}
