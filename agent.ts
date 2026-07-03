import { ToolLoopAgent, tool } from "ai";
import { createAlibaba } from "@ai-sdk/alibaba";
import { z } from "zod";
import "dotenv/config";

const alibaba = createAlibaba({
  baseURL: process.env.AI_gateway_url,
  apiKey: process.env.alibaba_api_key,
});

async function main() {
  const agent = new ToolLoopAgent({
    model: alibaba("qwen3.7-max"),
    tools: {
      getStockPrice: tool({
        description: "接受股票代码，返回当前股票的价格",
        inputSchema: z.object({
          symbol: z.string().describe("股票代码"),
        }),
        execute({ symbol }) {
          return 138.5;
        },
      }),
      calculateReturn: tool({
        description: `接收买入价、当前价、股数，返回收益金额和收益率`,
        inputSchema: z.object({
          AAPL: z.number().min(0).describe("买入价"),
          TENCENT: z.number().min(0).describe("当前价"),
          count: z.number().min(1).describe("股数"),
        }),
        execute({ AAPL, TENCENT, count }) {
          return (TENCENT - AAPL) * count;
        },
      }),
    },
    onToolExecutionEnd({ toolCall, toolOutput, toolExecutionMs }) {
      console.log(
        `工具名称: ${toolCall.toolName}\n, 调用结果: ${toolOutput}\n, 执行时间(ms): ${toolExecutionMs}`,
      );
    },
    onEnd({ usage, steps }) {
      console.log(
        `\n一共执行了多少步${steps.length}, 消耗多少token：${usage.totalTokens}`,
      );
    },
  });
  const result = await agent.stream({
    prompt: `我以 150 元买入了 100 股阿里巴巴（BABA），现在价格多少？我赚了还是亏了？`,
  });
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}
main();
