export type AIStage = 'idle' | 'retrieving' | 'reranking' | 'generating';

export interface AITimingMetrics {
  retrievalMs?: number;
  rerankMs?: number;
  webSearchMs?: number;
  generationMs?: number;
  firstTokenMs?: number;
  totalMs?: number;
}
