import { validateRAGAnswer } from '../ai/answerValidation';
import { rewriteQuery } from '../ai/retrieval';
import { classifyAgentIntent } from '../agent/intent';
import { validateAgentPlan } from '../agent/tools';
import type { AgentAcceptanceCase, RAGAcceptanceCase } from './acceptanceDataset';

export const QUALITY_THRESHOLDS = {
  ragQueryTermRecall: 0.8,
  ragGroundingDecisionAccuracy: 0.9,
  ragCitationWhitelistBlockRate: 1,
  agentIntentAccuracy: 0.75,
  agentPlanSafetyAccuracy: 1,
  retrievalRecallAtK: 0.9,
  retrievalCitationCoverage: 0.9,
  retrievalUnsupportedAnswerRate: 0,
} as const;

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function evaluateRAGAcceptance(cases: RAGAcceptanceCase[]) {
  const termRecall = cases.map((item) => {
    const query = rewriteQuery(item.query).toLowerCase();
    return item.expectedTerms.filter((term) => query.includes(term.toLowerCase())).length / item.expectedTerms.length;
  });
  const validations = cases.map((item) => validateRAGAnswer(item.answer, item.chunks, 'strict'));
  const invalidCases = cases.map((item, index) => ({ item, result: validations[index] })).filter(({ item }) => !item.shouldBeGrounded);
  return {
    queryTermRecall: average(termRecall),
    groundingDecisionAccuracy: average(cases.map((item, index) => Number(validations[index].grounded === item.shouldBeGrounded))),
    citationWhitelistBlockRate: average(invalidCases.map(({ result }) => Number(result.invalidReferences.length > 0 && !result.grounded))),
    averageFactCoverage: average(validations.filter((result) => result.grounded).map((result) => result.coverage)),
  };
}

export function evaluateAgentAcceptance(cases: AgentAcceptanceCase[]) {
  return {
    intentAccuracy: average(cases.map((item) => Number(classifyAgentIntent(item.instruction) === item.expectedIntent))),
    planSafetyAccuracy: average(cases.map((item) => Number(validateAgentPlan(item.plan).ok === item.shouldPass))),
    unsafePlanBlockRate: average(cases.filter((item) => !item.shouldPass).map((item) => Number(!validateAgentPlan(item.plan).ok))),
  };
}
