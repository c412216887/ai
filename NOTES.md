# AI Agent 工程师学习笔记

> 技术栈：Vercel AI SDK v7 + TypeScript + Alibaba Qwen

---

## 工具链

### tsx vs tsc vs ts-node

| 工具 | 底层 | 类型检查 | 直接运行 | 速度 |
|---|---|---|---|---|
| `tsx` | esbuild (Go) | ❌ | ✅ | 极快（毫秒） |
| `tsc` | TS 编译器 | ✅ | ❌ | 慢（秒级） |
| `ts-node` | TS 编译器 | ✅（可关） | ✅ | 慢 |

**结论**：开发阶段用 `tsx`，提交前用 `tsc --noEmit` 做类型检查，生产构建用 `tsc`。`ts-node` 是上一代方案，新项目不用。

---

## 第一课：LLM 调用基础

### generateText

一次性生成，等待完整结果：

```ts
import { generateText } from 'ai';
import { createAlibaba } from '@ai-sdk/alibaba';

const alibaba = createAlibaba({ apiKey: process.env.alibaba_api_key });

const { text } = await generateText({
  model: alibaba('qwen-max'),
  prompt: '用一句话解释什么是机器学习',
});
```

结果对象常用字段：
- `result.text` — 最终生成的文本
- `result.usage` — token 用量 `{ inputTokens, outputTokens }`
- `result.finishReason` — 停止原因：`"stop"` | `"length"` | `"tool-calls"`

### streamText

流式输出，实时返回每个 chunk：

```ts
import { streamText } from 'ai';

const result = streamText({
  model: alibaba('qwen-max'),
  prompt: '写一首短诗',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

注意：`streamText` 不加 `await`，立即返回对象，等待在 `for await` 里。

### instructions vs prompt

```ts
await generateText({
  model: alibaba('qwen-max'),
  instructions: '你是一名严格的代码审查员',  // system prompt，设定角色
  prompt: '帮我审查这段代码',                // user message，实际输入
});
```

---

## 第二课：结构化输出

### 核心思路

用 Zod 定义数据结构，让 LLM 直接返回类型安全的对象，而不是需要手动解析的文字。

### Output.object()

```ts
import { generateText, Output } from 'ai';
import { z } from 'zod';

const { output } = await generateText({
  model: alibaba('qwen-max'),
  output: Output.object({
    schema: z.object({
      name: z.string().describe('姓名'),
      age: z.number().describe('年龄'),
      skills: z.array(z.string()).describe('技能列表'),
    }),
  }),
  prompt: '生成一个前端工程师的信息',
});

console.log(output.name);   // 类型安全，TypeScript 知道是 string
console.log(output.skills); // 类型安全，TypeScript 知道是 string[]
```

### 四种 Output 类型

| 类型 | 用途 |
|---|---|
| `Output.object()` | 返回一个对象（最常用） |
| `Output.array()` | 返回数组 |
| `Output.choice()` | 从给定选项中选一个（分类任务） |
| `Output.json()` | 返回任意 JSON，不验证结构 |

### .describe() 提升生成质量

在 schema 字段上加描述，告诉 LLM 每个字段的含义：

```ts
z.object({
  cookTime: z.number().describe('烹饪时间，单位：分钟'),
  difficulty: z.enum(['简单', '中等', '困难']).describe('制作难度'),
})
```

### ⚠️ Qwen 踩坑记录

**坑1：模型返回中文 key，schema 定义英文 key**

原因：prompt 用中文描述，模型用中文作为 JSON key。

修法：prompt 里明确指定英文 key，或 schema 也改成中文 key。

**坑2：Qwen 不支持嵌套对象 schema**

现象：`mostRecentJob: { company, position }` 这种嵌套结构，Qwen 会打平成 `mostRecentJob的公司`、`mostRecentJob的职位`。

修法：把嵌套拍平：

```ts
z.object({
  recentCompany: z.string(),   // ✅ 扁平
  recentPosition: z.string(),  // ✅ 扁平
})
```

**坑3：Output.array() 包装格式问题**

AI SDK 期望模型返回 `{ "elements": [...] }`，但 Qwen 直接返回 `[...]`。

修法：统一用 `Output.object()` 套一层数组：

```ts
Output.object({
  schema: z.object({
    results: z.array(z.enum(['正面', '负面', '中性'])),
  }),
})
```

**核心经验**：schema 设计要贴合模型的实际输出能力，越扁平越稳定。能力弱的模型避免嵌套对象、复杂联合类型。

### 结构化数据能流式输出吗？

可以，但有限制：
- `Output.object()` → 用 `partialOutputStream`，推来的是不完整的对象
- `Output.array()` → 用 `elementStream`，每次推来一个完整的元素
- `Output.choice()` → 不支持流式（就一个词，没意义）

实际场景里大多数不需要流式结构化输出，等完整结果处理更简单。

---

## 第三课：Tool Calling

### 核心概念

LLM 本身不能执行代码、查实时数据。Tool 解决这个问题：**你写执行逻辑，LLM 决定什么时候调用、传什么参数**。

### Tool 结构

```ts
import { tool } from 'ai';
import { z } from 'zod';

const weatherTool = tool({
  description: '获取某个城市的实时天气',  // LLM 靠这个判断要不要调用
  inputSchema: z.object({
    city: z.string().describe('城市名'),
  }),
  execute: async ({ city }) => {           // 你的真实逻辑
    return { temperature: 25, condition: '晴天' };
  },
});
```

### 执行流程

```
prompt → LLM 决定调用工具 + 生成参数
       → SDK 自动执行 execute()
       → 结果回传给 LLM
       → LLM 生成最终回答
```

### 使用方式

```ts
import { generateText, tool, isStepCount } from 'ai';

const { text, steps } = await generateText({
  model: alibaba('qwen-max'),
  tools: { weatherTool },
  stopWhen: isStepCount(5),  // 必须加，防止只跑一步就停
  prompt: '北京今天天气怎么样？',
});
```

### 查看工具调用过程

```ts
for (const step of steps) {
  for (const part of step.content) {
    if (part.type === 'tool-call') {
      console.log('调用工具:', part.toolName);
      console.log('传入参数:', part.input);
    }
    if (part.type === 'tool-result') {
      console.log('工具结果:', part.output);
    }
    if (part.type === 'text') {
      console.log('模型回答:', part.text);
    }
  }
}
```

**注意**：直接 `console.log(steps)` 只能看到顶层，`content: [[Object]]` 是折叠的，必须展开 `content` 数组才能看到工具调用细节。

### toolChoice 控制工具使用

```ts
toolChoice: 'auto'      // 默认，LLM 自己决定
toolChoice: 'required'  // 强制必须调用工具
toolChoice: 'none'      // 禁止调用工具
toolChoice: { type: 'tool', toolName: 'weather' }  // 强制指定工具
```

---

## 第四课：ToolLoopAgent

### 为什么需要 ToolLoopAgent

`generateText + tools` 是底层原语，每次调用都要重复写 model、instructions、tools 配置。`ToolLoopAgent` 把这些打包成可复用的对象。

```ts
import { ToolLoopAgent, isStepCount } from 'ai';

const agent = new ToolLoopAgent({
  model: alibaba('qwen-max'),
  instructions: '你是一个专业的理财顾问',
  tools: { getStockPrice, calculateReturn },
  stopWhen: isStepCount(10),
});

// 定义一次，到处用
const result = await agent.generate({ prompt: '...' });
```

### 三种调用方式

```ts
// 等待完整结果
const result = await agent.generate({ prompt: '...' });

// 流式输出
const result = await agent.stream({ prompt: '...' });
for await (const chunk of result.textStream) { ... }

// Next.js API Route（下一课讲）
return createAgentUIStreamResponse({ agent, uiMessages: messages });
```

### 生命周期回调

```ts
const result = await agent.generate({
  prompt: '...',
  onToolExecutionStart({ toolCall }) {
    console.log(`▶ 调用: ${toolCall.toolName}`, toolCall.input);
  },
  onToolExecutionEnd({ toolCall, toolExecutionMs }) {
    console.log(`✓ 完成: ${toolCall.toolName} (${toolExecutionMs}ms)`);
  },
  onEnd({ usage, steps }) {
    console.log(`共 ${steps.length} 步，${usage.totalTokens} tokens`);
  },
});
```

### generateText vs ToolLoopAgent 怎么选

| 场景 | 用什么 |
|---|---|
| 一次性脚本、测试 | `generateText` |
| 需要复用的 Agent | `ToolLoopAgent` |
| Next.js API Route | `ToolLoopAgent` |
| 自定义多步骤流程、动态换模型 | `generateText`（更灵活） |

**关系**：`generateText` 是积木，`ToolLoopAgent` 是用积木拼好的常用零件。大多数生产场景直接用 `ToolLoopAgent`。

---

## 第五课：Memory

### 三种 Memory 方案

| 方案 | 适合场景 |
|---|---|
| 对话历史（messages 数组） | 单次会话内记忆，零依赖 |
| Memory 服务（Mem0 等） | 跨会话持久记忆，接入简单 |
| 自定义 Tool | 生产级定制，完全控制存储 |

### 方案一：对话历史

```ts
type Message = { role: 'user' | 'assistant'; content: string };
const history: Message[] = [];

async function chat(userInput: string) {
  history.push({ role: 'user', content: userInput });
  const result = await agent.generate({ messages: history });
  history.push({ role: 'assistant', content: result.text });
  return result.text;
}
```

局限：历史越长 token 越多，超过 20 轮考虑截断。

### 命令行连续对话

```ts
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask() {
  rl.question('你: ', async (input) => {
    const trimmed = input.trim();
    if (trimmed === 'q') {
      rl.close();
      process.exit(0);  // 强制退出，避免进程挂起
    }
    const reply = await chat(trimmed);
    console.log(`\nAgent: ${reply}\n`);
    ask(); // 递归，实现连续对话
  });
}

ask();
```

---

## 第六课：Next.js 全栈集成

### 整体架构

```
浏览器 (useChat hook)
    ↕ HTTP 流式响应
Next.js API Route
    ↕
ToolLoopAgent
    ↕
LLM
```

### 后端 API Route

```ts
// app/api/chat/route.ts
import { createAgentUIStreamResponse, UIMessage } from 'ai';
import { ToolLoopAgent } from 'ai';

const agent = new ToolLoopAgent({
  model: alibaba('qwen-max'),
  instructions: '你是一个友好的助手',
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,  // 内部自动转换格式，不需要 convertToModelMessages
  });
}
```

### 前端 useChat

```tsx
'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function Page() {
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });
  const [input, setInput] = useState('');

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>
          <strong>{message.role === 'user' ? '你' : 'AI'}：</strong>
          {message.parts.map((part, i) =>
            part.type === 'text' ? <span key={i}>{part.text}</span> : null
          )}
        </div>
      ))}

      {status === 'streaming' && (
        <button onClick={stop}>停止</button>
      )}

      <form onSubmit={e => {
        e.preventDefault();
        if (input.trim()) {
          sendMessage({ text: input });
          setInput('');
        }
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={status !== 'ready'}  // 注意：是 !== 不是 ===
        />
        <button disabled={status !== 'ready'}>发送</button>
      </form>
    </div>
  );
}
```

### status 四个状态

| 状态 | 含义 |
|---|---|
| `ready` | 空闲，可以发消息 |
| `submitted` | 消息已发出，等待响应 |
| `streaming` | 正在接收流式数据 |
| `error` | 出错了 |

### 渲染消息用 parts 不用 content

```tsx
message.parts.map((part, i) => {
  if (part.type === 'text') return <span key={i}>{part.text}</span>;
  if (part.type === 'tool-invocation') return <div key={i}>工具调用中...</div>;
  return null;
})
```

一条消息可能包含文字 + 工具调用 + 工具结果，`parts` 把它们分开表示。

### convertToModelMessages 什么时候用

- 用 `createAgentUIStreamResponse` → **不需要**，内部自动转换
- 用 `streamText` 手动处理 → **需要**手动调用

### stop() 真的能停止后端吗

前端 `stop()` 只是断开 HTTP 连接，后端 LLM 调用默认**继续跑**。

- 用 `createAgentUIStreamResponse` → 自动绑定 `abortSignal`，stop() 真正有效
- 用 `streamText` 手动处理 → 需要手动传 `abortSignal: req.signal`

---

## 第七课：RAG（检索增强生成）

### 核心思路

LLM 不知道你的私有数据，RAG 的解法：**先搜索相关内容，再把内容塞进 prompt**。

### 向量 + 相似度

文字转成向量（数字数组），语义相近的文字向量距离近：

```ts
import { embed, embedMany, cosineSimilarity } from 'ai';

// 单个向量化
const { embedding } = await embed({
  model: alibaba.textEmbeddingModel('text-embedding-v3'),
  value: '苹果很好吃',
});
// embedding 是 1536 个数字组成的数组

// 批量向量化
const { embeddings } = await embedMany({
  model: alibaba.textEmbeddingModel('text-embedding-v3'),
  values: ['文档块1', '文档块2', '文档块3'],
});

// 相似度计算（-1 到 1，越接近 1 越相似）
const similarity = cosineSimilarity(embeddings[0], embeddings[1]);
```

### 完整 RAG 流程

```
阶段一（离线建库）：
文档 → 切块 → embedMany 向量化 → 存入内存/向量数据库

阶段二（每次查询）：
用户问题 → embed 向量化 → cosineSimilarity 找最相关的块
         → 拼进 prompt → LLM 生成回答
```

### cosineSimilarity 计算公式

余弦相似度衡量两个向量的**方向相似程度**，与向量长度无关：

```
cosine_similarity(A, B) = (A · B) / (|A| × |B|)

A · B  = A[0]×B[0] + A[1]×B[1] + ... + A[n]×B[n]  （点积）
|A|    = √(A[0]² + A[1]² + ... + A[n]²)             （模长）
```

- 结果范围：**-1 到 1**
- `1`  → 方向完全相同，语义极度相似
- `0`  → 方向垂直，语义无关
- `-1` → 方向相反，语义相反

为什么用余弦而不是欧氏距离？因为 Embedding 向量的**方向**代表语义，**长度**代表词频等无关因素。余弦只看方向，更准确。

### 切块策略（带重叠）

```ts
function splitWithOverlap(text: string, chunkSize = 500, overlap = 100) {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap;
  }
  return chunks;
}
```

### Alibaba Embedding 正确调用方式

```ts
const alibaba = createAlibaba({
  apiKey: process.env.alibaba_api_key,
  baseURL: process.env.AI_gateway_url,                        // Chat 用 MaaS 网关
  embeddingBaseURL: 'https://dashscope.aliyuncs.com/api/v1',  // Embedding 必须走标准地址
});

// RAG 场景区分 textType
// 存文档时用 document
await embedMany({
  model: alibaba.embedding('text-embedding-v4'),
  values: documents,
  providerOptions: { alibaba: { textType: 'document' } },
});

// 查询时用 query
await embed({
  model: alibaba.embedding('text-embedding-v4'),
  value: userQuestion,
  providerOptions: { alibaba: { textType: 'query' } },
});
```

### ⚠️ Alibaba Embedding 踩坑

**坑1：API Key 无效**

Embedding API 和 Chat API 走不同 endpoint，需要单独配 `embeddingBaseURL`。

**坑2：MaaS 网关 404**

`cn-beijing.maas.aliyuncs.com` 这类 MaaS 网关**不支持 Embedding**，必须用标准 DashScope 地址：
- 国内：`https://dashscope.aliyuncs.com/api/v1`
- 国际：`https://dashscope-intl.aliyuncs.com/api/v1`

**可用模型：**

| 模型 | 默认维度 | 支持维度 |
|---|---|---|
| `text-embedding-v4` | 1024 | 64~2048 |
| `text-embedding-v3` | 1024 | 512~1024 |

---

## useChat 补充知识

### message.parts 的所有 type

`parts` 是一条消息的内容组成，一条消息可以同时包含多种类型：

| type | 含义 | 常见场景 |
|---|---|---|
| `text` | 模型生成的文字 | 所有回答 |
| `reasoning` | 模型的思维链（CoT） | Qwen3、o1 等思考模型 |
| `tool-{工具名}` | 工具调用（动态命名）| 调用了工具的回答 |
| `file` | 文件（图片、文档等）| 多模态场景 |
| `source-url` | 网页来源引用 | Perplexity、Google 搜索模型 |
| `source-document` | 文档来源引用 | 带引用的 RAG 场景 |
| `step-start` | 多步骤的分隔标记 | Agent 多步执行 |
| `data-{自定义名}` | 自定义数据部分 | 服务端推送自定义数据 |
| `custom` | Provider 特有内容 | 特定模型的私有格式 |

### tool part 的四个 state

工具类型的 part（`tool-{名称}`）有独立的状态流转：

```
input-streaming  → LLM 正在生成工具参数（参数还没生成完）
input-available  → 参数生成完毕，工具开始执行
output-available → 工具执行完毕，有返回结果
output-error     → 工具执行出错
```

渲染示例：

```tsx
m.parts.map((part, i) => {
  if (part.type === 'text') {
    return <span key={i}>{part.text}</span>
  }

  if (part.type === 'reasoning') {
    return (
      <details key={i}>
        <summary>思考过程</summary>
        <pre>{part.text}</pre>
      </details>
    )
  }

  if (part.type.startsWith('tool-') && 'state' in part) {
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      return <span key={i}>🔍 正在搜索知识库...</span>
    }
    if (part.state === 'output-available') {
      return <span key={i}>✅ 已检索知识库</span>
    }
    if (part.state === 'output-error') {
      return <span key={i}>❌ 搜索失败</span>
    }
  }

  return null
})
```

### 流式事件 type（接口层）和 part type（UI 层）对应关系

接口返回的原始流事件和 `useChat` 整理后的 `parts` 是两层：

| 接口流事件 | 对应 part.type |
|---|---|
| `text-delta` | `text` |
| `reasoning-delta` | `reasoning` |
| `tool-call` + `tool-result` | `tool-{工具名}` |
| `source` | `source-url` / `source-document` |
| `file` | `file` |
| `start-step` | `step-start` |

`useChat` 把原始流事件收集整理成 `parts`，你渲染时只需要关心 `parts`，不需要自己处理流事件。

### textType 的作用（Embedding）

`textType` 告诉模型这段文字的用途，用于**非对称检索**优化：

```ts
textType: 'query'     // 用户的查询问题（问句腔）
textType: 'document'  // 知识库的文档内容（陈述腔）
```

模型用不同编码策略处理两种文本，使语义相关的问题和文档向量距离更近，提升搜索精度。只有两个值，默认是 `document`。

不同提供商的类似参数：

| 提供商 | 参数名 | 额外支持的值 |
|---|---|---|
| 阿里云 | `textType` | `query` / `document` |
| Cohere | `inputType` | + `classification` / `clustering` |
| Voyage | `inputType` | `query` / `document` |
| OpenAI | 无 | 不需要区分 |

### useChat 常用返回值速查

| 返回值 | 用途 |
|---|---|
| `messages` | 完整对话历史，渲染 UI |
| `status` | `ready/submitted/streaming/error`，控制按钮禁用 |
| `sendMessage` | 发消息，可带文件和额外参数 |
| `stop` | 打断正在生成的回答 |
| `regenerate` | 重新生成最后一条回答 |
| `setMessages` | 本地改消息，不触发请求 |
| `error` | 出错时有值 |
| `addToolOutput` | 前端执行完工具后手动回传结果 |

### ToolLoopAgent 不要跨文件 export

`ToolLoopAgent` 实例的泛型参数包含了工具的完整类型，其中引用了 `@ai-sdk/provider` 内部的 `JSONObject`，该类型没有公开导出。跨文件 export 时 TypeScript 无法生成 `.d.ts`，报错：

```
The inferred type of 'xxx' cannot be named without a reference to 'JSONObject'
```

**解决方案**：把 `ToolLoopAgent` 实例定义在使用它的文件里（通常是 `route.ts`），不要单独抽到 `lib/agent.ts` 再 export。

---

## 进阶能力

### A：MCP（Model Context Protocol）

#### 是什么

标准化工具协议。工具服务化，任何 Agent 都能接入同一个 MCP 服务器，类似 USB 之于外设——统一接口，即插即用。

社区已有大量现成 MCP Server：文件系统、GitHub、数据库、浏览器、Slack...

#### 两种传输方式

```ts
// HTTP（生产推荐）
const mcpClient = await createMCPClient({
  transport: { type: 'http', url: 'https://mcp-server.example.com/mcp' },
});

// stdio（本地开发）
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
const mcpClient = await createMCPClient({
  transport: new Experimental_StdioMCPTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  }),
});
```

#### 完整用法

```ts
import { createMCPClient } from '@ai-sdk/mcp';           // ← 从 @ai-sdk/mcp 导入
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { streamText, type ToolSet, isStepCount } from 'ai';

const mcpClient = await createMCPClient({ transport: ... });

const tools = await mcpClient.tools() as ToolSet;  // 类型转换解决版本兼容问题
console.log('可用工具:', Object.keys(tools));

const result = streamText({
  model: alibaba('qwen-max'),
  tools,
  stopWhen: isStepCount(10),
  prompt: '...',
  async onEnd() {
    await mcpClient.close();  // 用完必须关闭
  },
});
```

#### ⚠️ 踩坑记录

**坑1：导入路径**
- `createMCPClient` → `@ai-sdk/mcp`（不是 `ai`）
- `Experimental_StdioMCPTransport` → `@ai-sdk/mcp/mcp-stdio`

**坑2：tools 类型不兼容**
`@ai-sdk/mcp` v2 和 `ai` v7 内部类型有差异，用 `as ToolSet` 解决：
```ts
const tools = await mcpClient.tools() as ToolSet;
```

**坑3：`exactOptionalPropertyTypes: true` 会导致类型报错**
在 `tsconfig.json` 中移除该选项即可。

#### 自己写 MCP Server

MCP 底层是 **JSON-RPC 2.0** 协议，通信格式是 JSON 消息。Server 和 Client 用什么语言、什么库都无所谓，只要遵守同一协议格式。

**官方 SDK：**

| 语言 | 包 |
|---|---|
| TypeScript | `@modelcontextprotocol/sdk` |
| Python | `mcp` |
| Java / Kotlin | `io.modelcontextprotocol:kotlin-sdk` |
| C# | `ModelContextProtocol` |

**用 `@modelcontextprotocol/sdk` 写 Server：**

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });

// 注册工具（registerTool 是新 API，server.tool 已弃用）
server.registerTool(
  'add',
  {
    description: '计算两数之和',
    inputSchema: { a: z.number(), b: z.number() },
  },
  async ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdio 模式禁止用 console.log（污染通信管道），用 process.stderr.write 打日志
process.stderr.write('MCP Server 已启动\n');
```

**Client 连接自己的 Server：**

```ts
const mcpClient = await createMCPClient({
  transport: new Experimental_StdioMCPTransport({
    command: 'npx',
    args: ['tsx', './mcp-server.ts'],  // Client 启动时自动拉起 Server 进程
  }),
});
```

#### MCP 协议约定的方法（所有 Server 必须支持）

```
initialize                         → 握手，协商版本和能力
notifications/initialized          → Client 告知初始化完成

tools/list                         → 列出所有工具
tools/call                         → 调用某个工具

resources/list                     → 列出所有资源
resources/read                     → 读取资源内容
resources/subscribe                → 订阅资源变更

prompts/list                       → 列出所有 prompt 模板
prompts/get                        → 获取某个 prompt

notifications/tools/list_changed   → 工具列表变更通知
notifications/resources/updated    → 资源内容更新通知
```

这些方法名是全球统一约定，不是某个库发明的，就像 HTTP 的 GET/POST 一样。

---

### B：WorkflowAgent

`ToolLoopAgent` 全部在内存跑，进程崩溃丢数据。`WorkflowAgent` 是持久化 Agent，每步都有检查点。

| | ToolLoopAgent | WorkflowAgent |
|---|---|---|
| 包 | `ai` | `@ai-sdk/workflow` |
| 进程崩溃 | 丢失 | 自动恢复 |
| 工具失败 | 手动处理 | 自动重试 |
| 依赖 | 无 | Vercel Workflow 平台 |

**选型标准：**
- 任务超过 15 分钟 → WorkflowAgent
- 需要跨进程等待人工审批 → WorkflowAgent
- 其他场景 → ToolLoopAgent 就够

学习阶段用 ToolLoopAgent，生产长任务再考虑 WorkflowAgent。

---

### C：流式工具结果（Preliminary Tool Results）

解决工具执行空白期问题：工具跑完前就能向前端推送进度。

#### 核心：把 execute 改成 async generator

```ts
tool({
  description: '搜索知识库',
  inputSchema: z.object({ query: z.string() }),

  async *execute({ query }) {
    // 第1次 yield → output-available（中间状态）
    yield { status: 'loading' as const, text: '搜索中...' };

    const results = await searchKnowledge(query);

    // 最后1次 yield → output-available（最终结果，传给 LLM）
    yield { status: 'success' as const, results };
  },
})
```

**规则：**
- 每次 `yield` 都产生一次 `output-available`
- 后一次替换前一次（同一个 part，更新不追加）
- 最后一次 yield 的值传给 LLM，中间的 LLM 看不到
- `as const` 必须加，确保类型精确

#### 前端渲染

```tsx
if (part.type.startsWith('tool-') && 'state' in part) {
  if (part.state === 'output-available') {
    const output = part.output as { status: 'loading' | 'success'; results?: unknown[] };

    if (output.status === 'loading') {
      return <div key={i}>🔍 搜索中...</div>;
    }
    return <div key={i}>✅ 搜索完毕</div>;
  }
}
```

---

### D：Agent 可观测性

#### 方式一：生命周期回调（开发调试用）

```ts
new ToolLoopAgent({
  model: alibaba('qwen3.7-max'),
  onToolExecutionStart({ toolCall }) {
    console.log(`▶ ${toolCall.toolName}`, toolCall.input);
  },
  onToolExecutionEnd({ toolCall, toolExecutionMs }) {
    console.log(`✓ ${toolCall.toolName} ${toolExecutionMs}ms`);
  },
  onEnd({ usage, steps }) {
    console.log(`完成 | ${steps.length} 步 | ${usage.totalTokens} tokens`);
  },
});
```

#### 方式二：OpenTelemetry（生产推荐）

```bash
pnpm add @ai-sdk/otel
```

```ts
// instrumentation.ts（项目根目录，Next.js 自动加载）
import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';

export function register() {
  registerTelemetry(new OpenTelemetry());
  // 注册后所有 AI SDK 调用自动采集，不需要改业务代码
}
```

#### 接入 Langfuse（免费 LLM 监控平台）

```ts
import { LangfuseExporter } from 'langfuse-vercel';

registerTelemetry(
  new OpenTelemetry({
    exporter: new LangfuseExporter({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
    }),
  }),
);
```

能看到完整调用链路：每步耗时、token 用量、工具调用详情。

#### 自定义 Telemetry（写到自己的数据库）

```ts
import type { Telemetry } from 'ai';

class MyLogger implements Telemetry {
  async onEnd({ usage, steps }) {
    await db.insert({ tokens: usage.totalTokens, steps: steps.length });
  }
  async onToolExecutionEnd({ toolCall, toolExecutionMs }) {
    console.log(`${toolCall.toolName}: ${toolExecutionMs}ms`);
  }
}

registerTelemetry(new MyLogger());
```

#### 关闭特定调用

```ts
await generateText({
  model: alibaba('qwen3.7-max'),
  prompt: sensitiveData,
  telemetry: { isEnabled: false },  // 这次不采集
});
```

#### 使用 Ollama 本地 Embedding

```ts
import { createOpenAI } from '@ai-sdk/openai';

const ollamaClient = createOpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',  // 随意填，本地不验证
});

const embeddingModel = ollamaClient.embedding('nomic-embed-text');
// 维度：768，完全免费，本地运行
// 启动：ollama serve & ollama pull nomic-embed-text
```

---

## 学习路线总览

```
第一课：generateText / streamText    → LLM 调用基础
第二课：Output.object() + Zod        → 结构化输出
第三课：tool + isStepCount           → Tool Calling
第四课：ToolLoopAgent                → 封装可复用 Agent
第五课：messages 历史 / Memory 服务  → 让 Agent 记忆
第六课：useChat + API Route          → 全栈 Web 应用
第七课：embed + cosineSimilarity     → RAG 知识库
第八课：多 Agent 系统                → Subagent 编排

进阶 A：MCP                         → 标准化工具协议
进阶 B：WorkflowAgent               → 持久化 Agent（生产长任务）
进阶 C：流式工具结果                 → 工具执行进度推送
进阶 D：可观测性                     → OpenTelemetry + Langfuse
```
