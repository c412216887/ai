import {
  createAgentUIStreamResponse,
  ToolLoopAgent,
  tool,
  type UIMessage,
  embedMany,
  embed,
  cosineSimilarity,
} from "ai";
import { createAlibaba } from "@ai-sdk/alibaba";
import "dotenv/config";
import { RAW_DOCUMENTS } from "@/lib/knowledge";
import z from "zod";

const alibaba = createAlibaba({
  baseURL: process.env.AI_gateway_url,
  embeddingBaseURL: process.env.embedding_gateway_url,
  apiKey: process.env.alibaba_api_key,
});

// 1. 将文档转为向量数据并存储
const { embeddings } = await embedMany({
  model: alibaba.embedding("text-embedding-v4"),
  values: RAW_DOCUMENTS.map((doc) => `${doc.title}\n${doc.content}`),
  providerOptions: {
    alibaba: {
      textType: "document",
    },
  },
});
const vectorStore = RAW_DOCUMENTS.map((doc, index) => ({
  text: doc,
  vector: embeddings[index]!,
}));

async function searchKnowledge(query: string, topK = 3) {
  const { embedding } = await embed({
    model: alibaba.embedding("text-embedding-v4"),
    value: query,
    providerOptions: {
      alibaba: {
        textType: "query",
      },
    },
  });
  return vectorStore
    .map((vector) => ({
      ...vector,
      similary: cosineSimilarity(vector.vector, embedding),
    }))
    .sort((a, b) => b.similary - a.similary)
    .slice(0, topK);
}

// 2. 将问题转为向量

// 3. 比较相似性，拿出接近1的两篇文章

// 4. 喂给推理模型，作答
const agent = new ToolLoopAgent({
  model: alibaba("qwen3.7-max"),
  instructions: `你是一个知识库助手，帮助用户查询并理解技术文档。
  回答规则：
  - 优先使用SearchKnowledge工具检索相关文献再作答，
  - 回答要根据检索到的文档内容，不要编造信息，
  - 如果文档中没有相关内容，直接告知用户
  - 回答结尾注明参考了哪些文档（文档标题）
  - 使用中文回答，保持专业性
  `,
  tools: {
    searchKnowledge: tool({
      description: `在知识库中检索于问题相关的文档内容`,
      inputSchema: z.object({
        query: z.string().describe("用户提出的问题"),
        topK: z
          .number()
          .min(1)
          .default(3)
          .describe("返回最相关的文档数，默认是3")
          .optional(),
      }),
      async execute({ query, topK = 3 }) {
        const documents = await searchKnowledge(query, topK);
        return documents.map((doc) => doc.text);
      },
    }),
  },
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  console.log(messages);
  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  });
}
