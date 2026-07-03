import { createAlibaba } from "@ai-sdk/alibaba";
import { tool, ToolLoopAgent } from "ai";
import { z } from "zod";
import "dotenv/config";

const alibaba = createAlibaba({
  baseURL: process.env.AI_gateway_url,
  embeddingBaseURL: process.env.embedding_gateway_url,
  apiKey: process.env.alibaba_api_key,
});

const prosAgent = new ToolLoopAgent({
  model: alibaba("qwen3.7-max"),
  instructions: `你是一名技术分析人员，专门分析某技术的优点`,
});

const consAgent = new ToolLoopAgent({
  model: alibaba("qwen3.7-max"),
  instructions: `你是一名技术分析人员，专门分析某个技术的缺点`,
});

const agent = new ToolLoopAgent({
  model: alibaba("qwen3.7-max"),
  instructions: `你是一名技术选型助手，负责专门分析技术的优缺点，给出引入建议，分析时，先调用analyzeProps获取优点，在调用analyzeCons获取缺点，最后综合给出建议`,
  tools: {
    analyzePros: tool({
      description: `用来分析技术的优点`,
      inputSchema: z.object({
        technology: z.string().describe("技术的名称"),
      }),
      async execute({ technology }, { abortSignal }) {
        console.log(`🚀 开始分析优点 =====\n`);
        const { text } = await prosAgent.generate({
          prompt: `分析技术：${technology} 的优点`,
          abortSignal: abortSignal!,
        });
        return text;
      },
    }),
    analyzeCons: tool({
      description: `分析技术的缺点`,
      inputSchema: z.object({
        technology: z.string().describe(`技术名称`),
      }),
      async execute({ technology }, { abortSignal }) {
        console.log(`🚀 开始分析缺点 =====\n`);
        const { text } = await consAgent.generate({
          prompt: `分析技术${technology} 的缺点`,
          abortSignal: abortSignal!,
        });
        return text;
      },
    }),
  },
});

async function main() {
  const { textStream } = await agent.stream({
    prompt: `帮我分析 TypeScript 的优缺点，然后给出是否值得引入的建议`,
  });
  for await (const chunk of textStream) {
    process.stdout.write(chunk);
  }
}
main();
