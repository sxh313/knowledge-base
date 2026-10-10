import { describe, expect, it } from 'vitest';
import { AGENT_ACCEPTANCE_CASES, RAG_ACCEPTANCE_CASES } from './acceptanceDataset';
import { evaluateAgentAcceptance, evaluateRAGAcceptance, QUALITY_THRESHOLDS } from './qualityMetrics';
import { RETRIEVAL_BENCHMARK_CASES } from './retrievalDataset';
import { runRetrievalBenchmark } from './retrievalBenchmark';

describe('RAG / Agent 持续质量门禁', () => {
  it('固定验收集覆盖正常回答、错误引用和核心知识库场景', () => {
    expect(RAG_ACCEPTANCE_CASES.length).toBeGreaterThanOrEqual(6);
    const metrics = evaluateRAGAcceptance(RAG_ACCEPTANCE_CASES);
    expect(metrics.queryTermRecall).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.ragQueryTermRecall);
    expect(metrics.groundingDecisionAccuracy).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.ragGroundingDecisionAccuracy);
    expect(metrics.citationWhitelistBlockRate).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.ragCitationWhitelistBlockRate);
  });

  it('固定验收集持续检查意图路由、计划结构和危险操作拦截', () => {
    expect(AGENT_ACCEPTANCE_CASES.length).toBeGreaterThanOrEqual(8);
    const metrics = evaluateAgentAcceptance(AGENT_ACCEPTANCE_CASES);
    expect(metrics.intentAccuracy).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.agentIntentAccuracy);
    expect(metrics.planSafetyAccuracy).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.agentPlanSafetyAccuracy);
    expect(metrics.unsafePlanBlockRate).toBe(1);
  });

  it('离线检索集记录 Recall@K、引用覆盖率、无依据回答率和平均延迟', () => {
    const metrics = runRetrievalBenchmark(RETRIEVAL_BENCHMARK_CASES);
    console.info('[retrieval-benchmark]', JSON.stringify(metrics));
    expect(RETRIEVAL_BENCHMARK_CASES.length).toBeGreaterThanOrEqual(6);
    expect(metrics.recallAtK).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.retrievalRecallAtK);
    expect(metrics.citationCoverage).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.retrievalCitationCoverage);
    expect(metrics.unsupportedAnswerRate).toBeLessThanOrEqual(QUALITY_THRESHOLDS.retrievalUnsupportedAnswerRate);
    expect(metrics.averageLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
