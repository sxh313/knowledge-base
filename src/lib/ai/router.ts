import type { ChatMessage } from './client';
import { chatCompletion } from './client';
import { getSettings } from '../db/queries';
import { MODEL_MAP, TASK_MODELS, type TaskType } from './providers';

export interface RouteResult {
  content: string;
  model: string;
  provider: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export async function routeAI(
  task: TaskType,
  messages: ChatMessage[],
  onToken?: (token: string) => void,
): Promise<RouteResult> {
  const settings = await getSettings();
  const modelIds = TASK_MODELS[task];
  let lastError: string | null = null;

  for (const modelId of modelIds) {
    const entry = MODEL_MAP[modelId];
    if (!entry) continue;

    const prov = settings.aiProviders[entry.provider];
    if (!prov?.enabled || !prov.apiKey) {
      lastError = `[${entry.provider}] 未配置`;
      continue;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const result = await chatCompletion(
        { name: entry.provider, baseUrl: prov.baseUrl, apiKey: prov.apiKey, enabled: true },
        entry.model,
        messages,
        { stream: !!onToken, onToken, signal: controller.signal },
      );
      clearTimeout(timeout);
      return { content: result.content, model: entry.model, provider: entry.provider, usage: result.usage };
    } catch (err) {
      lastError = `${entry.provider}/${entry.model}: ${(err as Error).message}`;
      console.warn(`AI failover: ${lastError}`);
      continue;
    }
  }
  throw new Error(`All AI endpoints failed. Last error: ${lastError}`);
}

export function getSystemPrompt(task: TaskType): string {
  const prompts: Record<TaskType, string> = {
    summarize: 'You are a learning assistant. Summarize the key points of the following notes in concise Chinese, listing key knowledge items.',
    explain: 'You are a patient tutor. Explain the following concepts in simple terms with practical examples.',
    generateCards: 'You are a flashcard creation expert. Convert the following content into Anki-style flashcards. Return as JSON array.',
    codeReview: 'You are a senior code reviewer. Review the code for bugs, performance issues, and security risks.',
    codeExplain: 'You are a programming tutor. Explain how the following code works line by line.',
    tagSuggest: 'You are a knowledge management assistant. Recommend 3-5 tags for the following notes. Return as JSON string array.',
    qa: 'You are a QA assistant based on study notes. Answer questions based on the notes provided.',
    sentiment: 'Analyze the sentiment of the following journal entry. Return as JSON with score (0-1) and analysis.',
    imageAnalysis: 'Analyze the content of this image and extract key information for learning purposes.',
  };
  return prompts[task] || prompts.explain;
}
