import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const baseUrl = (process.env.EMBEDDING_BASE_URL || 'http://61.172.167.64:4901/v1').replace(/\/+$/, '');
const model = process.env.EMBEDDING_MODEL || 'BAAI/bge-small-zh-v1.5';
const apiKey = process.env.EMBEDDING_API_KEY || '';
const batchSize = Math.max(1, Number(process.env.EMBEDDING_BATCH_SIZE || 32));
const sourcePath = process.env.ZERO2AGENT_KB_PATH || 'public/zero2agent-kb.json';
const outputPath = process.env.ZERO2AGENT_EMBEDDINGS_PATH || 'public/zero2agent-embeddings.json';

const kb = JSON.parse(await readFile(sourcePath, 'utf8'));
const items = [];
for (const document of kb.documents ?? []) {
  for (const section of document.sections ?? []) {
    const chunkId = `${document.id}:${section.startOffset}`;
    items.push({
      chunkId,
      text: section.content,
      textHash: createHash('sha256').update(section.content).digest('hex'),
    });
  }
}

if (!items.length) throw new Error(`没有找到可向量化的 Markdown 分块：${sourcePath}`);

async function embed(texts) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, input: texts }),
  });
  if (!response.ok) throw new Error(`Embedding HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const json = await response.json();
  const rows = (json.data ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (rows.length !== texts.length) throw new Error(`Embedding 返回数量异常：需要 ${texts.length}，得到 ${rows.length}`);
  return rows.map((row) => {
    if (!Array.isArray(row.embedding)) throw new Error('Embedding 响应缺少 embedding 数组');
    const vector = row.embedding.map(Number);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return norm > 0 ? vector.map((value) => value / norm) : vector;
  });
}

const outputItems = [];
for (let offset = 0; offset < items.length; offset += batchSize) {
  const batch = items.slice(offset, offset + batchSize);
  const vectors = await embed(batch.map((item) => item.text));
  vectors.forEach((vector, index) => outputItems.push({
    chunkId: batch[index].chunkId,
    textHash: batch[index].textHash,
    vector,
  }));
  console.log(`Embedding ${Math.min(offset + batch.length, items.length)}/${items.length}`);
}

const dimension = outputItems[0]?.vector.length ?? 0;
await writeFile(outputPath, `${JSON.stringify({
  version: 1,
  model,
  dimension,
  generatedAt: new Date().toISOString(),
  items: outputItems,
}, null, 2)}\n`, 'utf8');
console.log(`完成：${outputItems.length} 个分块，${dimension} 维，写入 ${outputPath}`);

