export type Zero2ReviewIntent =
  | 'review_question'
  | 'review_command'
  | 'review_meta'
  | 'ambiguous'
  | 'out_of_scope';

export type Zero2ReviewStage =
  | 'idle'
  | 'classifying'
  | 'clarifying'
  | 'retrieving'
  | 'answering'
  | 'awaiting_answer'
  | 'evaluating'
  | 'planning'
  | 'complete'
  | 'rejected'
  | 'error';

export interface Zero2SourceReference {
  source: 'zero2agent';
  sourceId: string;
  chunkId: string;
  title: string;
  path: string;
  heading?: string;
  headingPath?: string[];
  startOffset?: number;
  sourceUrl?: string;
  sourceAnchor?: string;
  localUrl?: string;
  sourceContentHash?: string;
  /** 已召回的原文片段，打开溯源弹窗时可立即展示。 */
  content?: string;
}

/** Stable public names used by the zero2review boundary. */
export type SourceReference = Zero2SourceReference;

export interface Zero2TopicCandidate {
  topicId: string;
  score: number;
  confidence: number;
  sourceCount: number;
}

export interface Zero2IntentDecision {
  kind: Zero2ReviewIntent;
  topicIds: string[];
  confidence: number;
  reason: string;
  clarification?: string;
}

export type ReviewIntentDecision = Zero2IntentDecision;

export interface Zero2ReviewQuestion {
  id: string;
  topicId: string;
  type: 'recall' | 'comparison' | 'boundary' | 'application' | 'diagnostic';
  prompt: string;
  sourceChunkIds: string[];
}

export type ReviewQuestion = Zero2ReviewQuestion;

export interface Zero2TutorResponse {
  answer: string;
  topicIds: string[];
  citations: Zero2SourceReference[];
  diagnosticQuestion?: Zero2ReviewQuestion;
}

export type TutorResponse = Zero2TutorResponse;

export type Zero2MistakeType = 'concept' | 'boundary' | 'comparison' | 'application' | 'terminology';

export interface Zero2EvaluationDraft {
  score: 0 | 1 | 2 | 3 | 4;
  correctPoints: string[];
  missingPoints: string[];
  mistakeTypes: Zero2MistakeType[];
  evidenceChunkIds: string[];
  nextQuestionType: Zero2ReviewQuestion['type'];
}

export type EvaluationDraft = Zero2EvaluationDraft;

export interface PersistableReviewMessage {
  sessionId: string;
  role: 'user' | 'assistant' | 'coach';
  intent: Extract<Zero2ReviewIntent, 'review_question' | 'review_command' | 'review_meta'>;
  content: string;
  topicIds: string[];
  citations: Zero2SourceReference[];
}

export interface Zero2AdaptivePolicy {
  mode: 'diagnose' | 'reinforce' | 'scaffold' | 'challenge';
  questionType: Zero2ReviewQuestion['type'];
  difficulty: 1 | 2 | 3 | 4 | 5;
  rationale: string;
  weakPoints: Zero2MistakeType[];
  recentScores: number[];
  learningContext?: Zero2LearningContext;
}

export interface Zero2LearningContext {
  weakPoints: string[];
  preferences: string[];
  prerequisites: string[];
  confirmedMastery: string[];
  lastReviewedAt?: number;
}

export interface Zero2ReviewContext {
  question: string;
  topicCandidates: Zero2TopicCandidate[];
  citations: Zero2SourceReference[];
}

export interface Zero2TopicPriority {
  topicId: string;
  total: number;
  weakness: number;
  prerequisiteGap: number;
  goalRelevance: number;
  overdue: number;
  recentInterest: number;
  lowEvidence: number;
  reasons: string[];
}
