import { createOpenAI } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { RAW_DOCUMENTS } from '../lib/knowledge.js';
import fs from 'fs';
import 'dotenv/config';

const ollamaClient = createOpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
});

console.log('正在向量化文档（使用本地 Ollama）...');

const { embeddings } = await embedMany({
  model: ollamaClient.embedding('nomic-embed-text'),
  values: RAW_DOCUMENTS.map(d => `${d.title}\n${d.content}`),
});

const vectors = RAW_DOCUMENTS.map((doc, i) => ({
  id: `chunk-${doc.id}`,
  docId: doc.id,
  title: doc.title,
  content: doc.content,
  embedding: embeddings[i],
}));

fs.writeFileSync('./lib/vectors.json', JSON.stringify(vectors, null, 2));
console.log(`✅ 生成完毕，共 ${vectors.length} 篇，已写入 lib/vectors.json`);
