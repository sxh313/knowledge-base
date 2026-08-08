export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export function semanticSearch(
  queryVector: number[],
  items: { id: string; label: string; vector: number[] }[],
  topK = 10,
): { id: string; label: string; score: number }[] {
  return items
    .map(v => ({ id: v.id, label: v.label, score: cosineSimilarity(queryVector, v.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
