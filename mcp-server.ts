import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'my-local-server',
  version: '1.0.0',
});

server.registerTool(
  'add',
  {
    description: '计算两个数字之和',
    inputSchema: { a: z.number().describe('第一个数'), b: z.number().describe('第二个数') },
  },
  async ({ a, b }) => ({
    content: [{ type: 'text', text: `${a} + ${b} = ${a + b}` }],
  }),
);

server.registerTool(
  'getTime',
  { description: '获取当前时间', inputSchema: {} },
  async () => ({
    content: [{ type: 'text', text: `当前时间：${new Date().toLocaleString('zh-CN')}` }],
  }),
);

server.registerTool(
  'reverseString',
  {
    description: '将字符串反转',
    inputSchema: { text: z.string().describe('要反转的字符串') },
  },
  async ({ text }) => ({
    content: [{ type: 'text', text: `反转结果：${text.split('').reverse().join('')}` }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('MCP Server 已启动\n');
