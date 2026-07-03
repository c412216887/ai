import { generateText, stepCountIs, tool } from "ai";
import { createAlibaba } from "@ai-sdk/alibaba";
import { z } from "zod";
import "dotenv/config";

const alibaba = createAlibaba({
  baseURL: process.env.AI_gateway_url,
  apiKey: process.env.alibaba_api_key,
});

async function main() {
  const { text, steps } = await generateText({
    model: alibaba("qwen3.7-max"),
    prompt: "我有 1000 美元，能换多少人民币？",
    tools: {
      getExchangeRate: tool({
        description: "用于查询币种之间的汇率",
        inputSchema: z.object({
          from: z.string().describe("源币种, 例如 USD(美元), CNY(人民币)"),
          to: z.string().describe("目标币种, 例如 USD(美元), CNY(人民币)"),
        }),
        execute: async ({ from, to }) => {
          if (from === to) {
            return 1;
          }
          if (from === "USD" && to === "CNY") {
            return 7.0;
          }
          if (from === "CNY" && to === "USD") {
            return 0.14;
          }
          return 0;
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });
  console.log("text:", text);
  for (const step of steps) {
    console.log(`\n--- 第 ${step.stepNumber} 步 ---`);
    console.log("结束原因:", step.finishReason);

    for (const part of step.content) {
      if (part.type === "tool-call") {
        console.log("调用工具:", part.toolName);
        console.log("传入参数:", part.input);
      }
      if (part.type === "tool-result") {
        console.log("工具结果:", part.output);
      }
      if (part.type === "text") {
        console.log("模型回答:", part.text);
      }
    }
  }
}
main().catch(console.error);
