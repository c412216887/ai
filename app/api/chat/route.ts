import {
  createAgentUIStreamResponse,
  type UIMessage,
  ToolLoopAgent,
  tool,
  isStepCount,
} from "ai";
import { createAlibaba } from "@ai-sdk/alibaba";
import { z } from "zod";
import { searchKnowledge, initKnowledgeBase } from "@/lib/knowledge";

const alibaba = createAlibaba({
  apiKey: process.env.alibaba_api_key,
  baseURL: process.env.AI_gateway_url,
  embeddingBaseURL: process.env.embedding_gateway_url,
});

const agent = new ToolLoopAgent({
  model: alibaba("qwen3.7-max"),
  instructions: `你是一个专业的知识库助手，帮助用户查询和理解技术文档。

回答规则：
- 优先使用 searchKnowledge 工具检索相关文档再回答
- 回答要基于检索到的文档内容，不要编造信息
- 如果文档中没有相关内容，直接告知用户
- 回答结尾注明参考了哪些文档（文档标题）
- 用中文回答，保持专业简洁`,

  tools: {
    searchKnowledge: tool({
      description: "在知识库中搜索与问题相关的文档内容",
      inputSchema: z.object({
        query: z.string().describe("搜索关键词或问题"),
        topK: z.number().describe("返回最相关的文档数量，默认 3").optional(),
      }),
      async *execute({ query, topK = 3 }) {
        yield { status: "pending", message: "正在查询中。。。" };
        const results = await searchKnowledge(query, topK);
        if (results.length === 0) {
          yield {
            status: "fail",
            found: false,
            message: "知识库中没有找到相关内容",
          };
        }
        yield {
          status: "success",
          found: true,
          results: results.map((r) => ({
            title: r.title,
            content: r.content,
            similarity: Math.round(r.similarity * 100) / 100,
          })),
        };
      },
    }),
  },

  stopWhen: isStepCount(10),
});

initKnowledgeBase().catch(console.error);

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  console.log("收到消息:", JSON.stringify(messages, null, 2));
  try {
    const response = await createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      onError: (error) => {
        console.error("Agent 错误:", error);
        return String(error);
      },
    });
    return response;
  } catch (e) {
    console.error("POST 错误:", e);
    throw e;
  }
}
