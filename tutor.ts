import { createOpenAI } from '@ai-sdk/openai';
import { ToolLoopAgent, tool, isStepCount } from 'ai';
import { z } from 'zod';
import * as readline from 'readline';

// ── OpenAI 客户端 ──────────────────────────────────────────────────
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL, // 支持代理/中转
});

// ── 工具：搜索 AI SDK 文档 ─────────────────────────────────────────
const searchDocsTool = tool({
  description: '搜索 Vercel AI SDK 官方文档，获取最新 API 和教程内容',
  inputSchema: z.object({
    query: z.string().describe('搜索关键词，如 "generateText" 或 "tool calling"'),
  }),
  execute: async ({ query }) => {
    const url = `https://ai-sdk.dev/api/search-docs?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return { error: `搜索失败: ${res.status}` };
    const data = (await res.json()) as { results: { url: string; title: string; description: string }[] };
    return data.results.slice(0, 5).map(r => ({
      title: r.title,
      description: r.description,
      url: r.url,
    }));
  },
});

// ── 工具：获取具体文档页内容 ──────────────────────────────────────
const fetchDocTool = tool({
  description: '获取 AI SDK 文档某一页的完整 Markdown 内容',
  inputSchema: z.object({
    path: z.string().describe('文档路径，如 /docs/ai-sdk-core/generating-text 或完整 URL'),
  }),
  execute: async ({ path }) => {
    const url = path.startsWith('http')
      ? path.endsWith('.md') ? path : path + '.md'
      : `https://ai-sdk.dev${path.endsWith('.md') ? path : path + '.md'}`;
    const res = await fetch(url);
    if (!res.ok) return { error: `获取失败: ${res.status}`, url };
    const text = await res.text();
    // 截取前 6000 字符避免 token 爆炸
    return { content: text.slice(0, 6000), url, truncated: text.length > 6000 };
  },
});

// ── 课程大纲 ──────────────────────────────────────────────────────
const CURRICULUM = [
  {
    id: 1,
    title: '第一课：你的第一次 LLM 调用',
    topic: 'generateText basics',
    docPath: '/docs/ai-sdk-core/generating-text',
    goal: '理解 generateText 和 streamText，写出第一个调用 LLM 的 TypeScript 脚本',
  },
  {
    id: 2,
    title: '第二课：结构化输出',
    topic: 'generateObject structured output zod',
    docPath: '/docs/ai-sdk-core/generating-structured-data',
    goal: '用 generateObject + Zod schema 让 LLM 返回类型安全的 JSON',
  },
  {
    id: 3,
    title: '第三课：Tool Calling —— 给 LLM 装上手脚',
    topic: 'tool calling tools execute',
    docPath: '/docs/ai-sdk-core/tools-and-tool-calling',
    goal: '理解 Tool 的结构和执行流程，写出带工具的 LLM 调用',
  },
  {
    id: 4,
    title: '第四课：ToolLoopAgent —— 真正的 Agent',
    topic: 'ToolLoopAgent building agents',
    docPath: '/docs/agents/building-agents',
    goal: '用 ToolLoopAgent 封装一个多步骤自主 Agent',
  },
  {
    id: 5,
    title: '第五课：Memory —— 让 Agent 记住东西',
    topic: 'memory persistent agent',
    docPath: '/docs/agents/memory',
    goal: '实现跨轮次对话记忆，理解短期与长期记忆的区别',
  },
  {
    id: 6,
    title: '第六课：Next.js 全栈集成',
    topic: 'useChat createAgentUIStreamResponse Next.js',
    docPath: '/docs/ai-sdk-ui',
    goal: '在 Next.js 中搭建带流式响应的 AI 聊天界面',
  },
  {
    id: 7,
    title: '第七课：RAG —— 让 Agent 读你的文档',
    topic: 'embeddings RAG vector search',
    docPath: '/docs/ai-sdk-core/embeddings',
    goal: '理解 Embedding 原理，构建基于私有文档的问答 Agent',
  },
  {
    id: 8,
    title: '第八课：多 Agent 系统',
    topic: 'subagents multi-agent orchestration',
    docPath: '/docs/agents/subagents',
    goal: '设计 Orchestrator + 专家 Agent 的协作架构',
  },
];

// ── Tutor Agent ───────────────────────────────────────────────────
const tutorAgent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  instructions: `你是一位专业的 AI Agent 工程师培训讲师，名叫 Atlas。

你的学生是一位有 TypeScript 基础的开发者，目标是成为 Agent 工程师。

教学风格：
- 先讲概念（用类比，不用堆术语）
- 再给代码示例（真实可运行的，有注释）
- 最后布置一个练习任务
- 用中文教学，代码和技术名词保持英文
- 回答要聚焦，不要一次性塞太多内容

使用工具获取最新文档后再教学，确保内容准确。
当学生说"继续"、"下一课"或"我会了"时，进入下一课。
当学生有问题时，结合文档详细解答，然后回到当前课程。`,
  tools: {
    searchDocs: searchDocsTool,
    fetchDoc: fetchDocTool,
  },
  stopWhen: isStepCount(15),
});

// ── 对话历史 + 状态 ────────────────────────────────────────────────
type Message = { role: 'user' | 'assistant'; content: string };
let messages: Message[] = [];
let currentLesson = 0;

async function chat(userInput: string): Promise<string> {
  messages.push({ role: 'user', content: userInput });

  const result = await tutorAgent.generate({ messages });

  const reply = result.text;
  messages.push({ role: 'assistant', content: reply });
  return reply;
}

// ── 启动第一课 ────────────────────────────────────────────────────
async function startLesson(lessonIndex: number) {
  const lesson = CURRICULUM[lessonIndex];
  if (!lesson) {
    console.log('\n🎉 恭喜！你已完成全部 8 课！你现在是一名 Agent 工程师了。\n');
    process.exit(0);
  }

  currentLesson = lessonIndex;
  const prompt = `请开始教学：${lesson.title}
文档路径：${lesson.docPath}
本课目标：${lesson.goal}
请先用 fetchDoc 工具获取最新文档内容，然后开始教学。`;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📚 ${lesson.title}`);
  console.log(`${'─'.repeat(50)}\n`);

  const reply = await chat(prompt);
  console.log(`Atlas: ${reply}\n`);
}

// ── 主交互循环 ────────────────────────────────────────────────────
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   AI Agent 工程师培训课程  —  讲师: Atlas    ║');
  console.log('║   共 8 课 | 输入 "下一课" 推进 | q 退出     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // 开始第一课
  await startLesson(0);

  const ask = () => {
    rl.question('你: ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { ask(); return; }
      if (trimmed.toLowerCase() === 'q') {
        console.log('\n👋 下次继续！\n');
        rl.close();
        return;
      }

      // 检测是否要进入下一课
      const nextTriggers = ['下一课', '继续', '我会了', '学完了', 'next', '下一个'];
      const goNext = nextTriggers.some(t => trimmed.includes(t));

      if (goNext) {
        await startLesson(currentLesson + 1);
      } else {
        // 正常问答
        console.log('\nAtlas: 思考中...\n');
        const reply = await chat(trimmed);
        console.log(`Atlas: ${reply}\n`);
      }

      ask();
    });
  };

  ask();
}

main().catch(console.error);
