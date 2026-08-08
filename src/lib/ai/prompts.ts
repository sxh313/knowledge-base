export interface PromptInput {
  content: string;
  title?: string;
  tags?: string[];
  subject?: string;
}

export function buildMessages(
  taskType: 'summarize' | 'explain' | 'generateCards' | 'codeReview' | 'codeExplain' | 'tagSuggest' | 'qa',
  input: PromptInput,
  userQuestion?: string,
) {
  const systemPrompts: Record<string, string> = {
    summarize: 'You are a professional learning assistant. Summarize the key points of the following notes. List 3-5 key knowledge items with brief explanations in Chinese.',
    explain: 'You are a patient tutor. Explain the following concepts in simple terms. Use analogies, give examples, point out common misconceptions.',
    generateCards: 'You are a flashcard creation expert. Convert the following notes into Anki-style flashcards. Each card has front (question/concept) and back (answer/explanation). Output strictly as JSON array: [{"front":"...","back":"..."}]. Generate 3-8 cards.',
    codeReview: 'You are a senior code reviewer. Review the code for bugs, performance issues, security risks, and suggest improvements in Chinese.',
    codeExplain: 'You are a programming tutor. Explain the code: first overview, then line-by-line explanation of key logic. Use beginner-friendly language.',
    tagSuggest: 'You are a knowledge management assistant. Recommend 3-5 tags for the following notes. Return as JSON string array: ["tag1","tag2","tag3"]',
    qa: 'You are a QA assistant based on study notes. Answer questions based on the provided content. If not covered, state that clearly.',
  };

  const system = systemPrompts[taskType] || systemPrompts.explain;
  let userContent = '';
  if (input.title) userContent += `## Title: ${input.title}\n`;
  if (input.subject) userContent += `## Subject: ${input.subject}\n`;
  if (input.tags?.length) userContent += `## Tags: ${input.tags.join(', ')}\n\n`;
  userContent += `---\n\n${input.content}`;
  if (userQuestion) userContent += `\n\n---\n\nUser Question: ${userQuestion}`;

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: userContent },
  ];
}

export function parseJSONResponse<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1].trim()) as T; }
      catch { return null; }
    }
    return null;
  }
}
