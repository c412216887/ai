import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const app = express();
app.use(express.json());

function createServer() {
  const server = new McpServer({ name: 'http-mcp-server', version: '1.0.0' });

  server.registerTool(
    'add',
    {
      description: '计算两个数字之和',
      inputSchema: { a: z.number(), b: z.number() },
    },
    async ({ a, b }) => ({
      content: [{ type: 'text', text: `${a} + ${b} = ${a + b}` }],
    }),
  );

  server.registerTool(
    'getTime',
    { description: '获取当前时间', inputSchema: {} },
    async () => ({
      content: [{ type: 'text', text: new Date().toLocaleString('zh-CN') }],
    }),
  );

  return server;
}

app.post('/mcp', async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = 3100;
app.listen(PORT, () => {
  console.log(`MCP HTTP Server 运行在 http://localhost:${PORT}/mcp`);
});
