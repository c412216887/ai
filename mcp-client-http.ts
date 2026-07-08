import { createMCPClient } from '@ai-sdk/mcp';
import { streamText, type ToolSet, isStepCount } from 'ai';
import { createAlibaba } from '@ai-sdk/alibaba';
import 'dotenv/config';

const alibaba = createAlibaba({
  baseURL: process.env.AI_gateway_url,
  apiKey: process.env.alibaba_api_key,
});

const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: 'http://localhost:3100/mcp',
  },
});

const tools = await mcpClient.tools() as ToolSet;
console.log('Tools:', Object.keys(tools));

const result = streamText({
  model: alibaba('qwen3.7-max'),
  tools,
  stopWhen: isStepCount(5),
  prompt: '现在几点了？再帮我算 999 + 1',
  async onEnd() {
    await mcpClient.close();
  },
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
console.log();
