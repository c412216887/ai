import { createAlibaba } from "@ai-sdk/alibaba";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { streamText, type ToolSet, isStepCount } from "ai";
import "dotenv/config";

const alibaba = createAlibaba({
  baseURL: process.env.AI_gateway_url,
  apiKey: process.env.alibaba_api_key,
});

async function main() {
  const mcpClient = await createMCPClient({
    transport: new Experimental_StdioMCPTransport({
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/ewan/Desktop/Ewan/ai-agent",
      ],
    }),
  });

  const tools = await mcpClient.tools() as ToolSet;
  console.log("可用工具:", Object.keys(tools), "\n");

  const result = streamText({
    model: alibaba("qwen3.7-max"),
    tools,
    stopWhen: isStepCount(10),
    prompt: "列出项目目录下的所有 .ts 文件，告诉我有哪些",
    onError: ({ error }) => console.error("错误:", error),
    async onEnd() {
      await mcpClient.close();
    },
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}

main();
