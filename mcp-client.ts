import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { generateText, type ToolSet, isStepCount } from 'ai';
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
console.log('Tools:', Object.keys(tools));

const { resources } = await mcpClient.listResources();
console.log('Resources:', resources.map(r => r.uri));

const { prompts } = await mcpClient.experimental_listPrompts();
console.log('Prompts:', prompts.map(p => p.name), '\n');

// 获取 code-review prompt，传入参数
const prompt = await mcpClient.experimental_getPrompt({
  name: 'code-review',
  arguments: {
    code: `function add(a, b) { return a + b }`,
    language: 'JavaScript',
  },
});

console.log('=== Prompt 内容 ===');
console.log(prompt.messages[0]?.content.text);
console.log('==================\n');

// 把 Prompt 返回的 messages 直接传给 LLM
const { text } = await generateText({
  model: alibaba('qwen3.7-max'),
  messages: prompt.messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: typeof m.content === 'string' ? m.content : m.content.text ?? '',
  })),
});

console.log('LLM 审查结果：\n', text);

await mcpClient.close();
