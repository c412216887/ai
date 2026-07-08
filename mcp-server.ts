import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'my-local-server',
  version: '1.0.0',
});

// ── Tools ──────────────────────────────────────────────────────────────────

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

// ── Resources ──────────────────────────────────────────────────────────────

const CONFIG_DATA = {
  appName: 'AI 知识库助手',
  version: '1.0.0',
  model: 'qwen3.7-max',
  maxTokens: 4096,
};

const TEAM_MEMBERS = [
  { name: '张伟', role: '前端工程师', skills: ['React', 'TypeScript'] },
  { name: '李娜', role: '后端工程师', skills: ['Go', 'PostgreSQL'] },
  { name: '王芳', role: '算法工程师', skills: ['Python', 'PyTorch'] },
];

// 注册固定资源
server.registerResource(
  'config',
  'config://app',
  { description: '应用配置信息', mimeType: 'application/json' },
  async () => ({
    contents: [{
      uri: 'config://app',
      mimeType: 'application/json',
      text: JSON.stringify(CONFIG_DATA, null, 2),
    }],
  }),
);

server.registerResource(
  'team',
  'data://team-members',
  { description: '团队成员信息', mimeType: 'application/json' },
  async () => ({
    contents: [{
      uri: 'data://team-members',
      mimeType: 'application/json',
      text: JSON.stringify(TEAM_MEMBERS, null, 2),
    }],
  }),
);

// 注册动态资源模板（URI 带参数）
server.registerResource(
  'member-detail',
  new ResourceTemplate('data://team-members/{name}', { list: undefined }),
  { description: '按姓名查询团队成员详情', mimeType: 'application/json' },
  async (uri, { name }) => {
    const member = TEAM_MEMBERS.find(m => m.name === decodeURIComponent(String(name)));
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: member
          ? JSON.stringify(member, null, 2)
          : JSON.stringify({ error: `未找到成员：${name}` }),
      }],
    };
  },
);

// ── Prompts ────────────────────────────────────────────────────────────────

server.registerPrompt(
  'code-review',
  {
    description: '代码审查 prompt，分析代码质量并给出改进建议',
    argsSchema: {
      code: z.string().describe('要审查的代码'),
      language: z.string().describe('编程语言').optional(),
    },
  },
  ({ code, language }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `请对以下${language ? ` ${language}` : ''}代码进行审查，重点关注：
1. 代码质量和可读性
2. 潜在的 bug 或安全问题
3. 性能优化建议

代码：
\`\`\`
${code}
\`\`\``,
      },
    }],
  }),
);

server.registerPrompt(
  'summarize',
  {
    description: '文本摘要 prompt',
    argsSchema: {
      text: z.string().describe('要摘要的文本'),
      length: z.enum(['short', 'medium', 'long']).describe('摘要长度').optional(),
    },
  },
  ({ text, length = 'medium' }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `请用${length === 'short' ? '一句话' : length === 'long' ? '详细' : '简洁'}的方式总结以下内容：\n\n${text}`,
      },
    }],
  }),
);

// ── 启动 ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('MCP Server 已启动（含 Tools + Resources + Prompts）\n');

