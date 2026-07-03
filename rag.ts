import { embed, embedMany, cosineSimilarity, generateText } from "ai";
import { createAlibaba } from "@ai-sdk/alibaba";
import "dotenv/config";

const alibaba = createAlibaba({
  baseURL: process.env.AI_gateway_url,
  embeddingBaseURL: "https://dashscope.aliyuncs.com/api/v1",
  apiKey: process.env.alibaba_api_key,
});

const embeddingModel = alibaba.embedding("text-embedding-v4");

const documents = [
  "张伟是公司的前端负责人，擅长 React 和 TypeScript。",
  "李娜是后端工程师，主要使用 Go 语言开发微服务。",
  "公司使用 PostgreSQL 作为主数据库，Redis 做缓存。",
  "每周五下午3点是全体技术周会。",
];

const { embeddings } = await embedMany({
  model: embeddingModel,
  values: documents,
  providerOptions: {
    alibaba: { textType: "document" },
  },
});

const vectorStore = documents.map((doc, idx) => ({
  text: doc,
  embedding: embeddings[idx],
}));

async function ragQuery(question: string) {
  const { embedding: questionEmbeding } = await embed({
    model: embeddingModel,
    value: question,
  });
  const ranked = vectorStore
    .map((store) => ({
      text: store.text,
      similarity: cosineSimilarity(store.embedding!, questionEmbeding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 2);
  const context = ranked.map((r) => r.text).join("\n");
  const { text } = await generateText({
    model: alibaba("qwen3.7-max"),
    prompt: `根据以下资料回答问题，资料之外的内容不要编造：
资料：
${context}
问题：${question}`,
  });
  return { answer: text, sources: ranked };
}
const result = await ragQuery("谁负责前端开发？");
console.log("回答:", result.answer);
console.log("来源:", result.sources);
