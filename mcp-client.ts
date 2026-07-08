import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { streamText, type ToolSet, isStepCount } from 'ai';
import { createAlibaba } from '@ai-sdk/alibaba';
import 'dotenv/config';

const alibaba = createAlibaba({
  baseURL: process.env.AI_gateway_url,
  apiKey: process.env.alibaba_api_key,
});

const mcpClient = await createMCPClient({
  transport: new Experimental_StdioMCPTransport({
    command: 'npx',
    args: ['tsx', './mcp-server.ts'],
  }),
});

const tools = await mcpClient.tools() as ToolSet;
console.log('Server 提供的工具:', Object.keys(tools), '\n');

const result = streamText({
  model: alibaba('qwen3.7-max'),
  tools,
  stopWhen: isStepCount(10),
  prompt: '现在几点了？另外帮我算一下 123 + 456，再把"你好世界"反转一下',
  onError: ({ error }) => console.error('错误:', error),
  async onEnd() {
    await mcpClient.close();
  },
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
