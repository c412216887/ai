import { createAlibaba } from '@ai-sdk/alibaba';
import { embedMany, embed, cosineSimilarity } from 'ai';

const alibaba = createAlibaba({
  apiKey: process.env.alibaba_api_key,
  baseURL: process.env.AI_gateway_url,
  embeddingBaseURL: process.env.embedding_gateway_url,
});

const embeddingModel = alibaba.embedding('text-embedding-v4');

export interface Document {
  id: string;
  title: string;
  content: string;
}

export interface DocumentChunk {
  id: string;
  docId: string;
  title: string;
  content: string;
  embedding: number[];
}

const RAW_DOCUMENTS: Document[] = [
  {
    id: 'doc-1',
    title: 'TypeScript 简介',
    content: `TypeScript 是由微软开发的开源编程语言，是 JavaScript 的超集。
TypeScript 在 JavaScript 的基础上添加了静态类型系统，可以在编译阶段发现潜在错误。
TypeScript 支持最新的 ECMAScript 特性，并可以编译为任意版本的 JavaScript。
主要优点包括：类型安全、更好的 IDE 支持、代码可维护性更高、适合大型项目开发。
TypeScript 由 Anders Hejlsberg 主导设计，他也是 C# 和 Delphi 的设计者。`,
  },
  {
    id: 'doc-2',
    title: 'React 核心概念',
    content: `React 是由 Meta（原 Facebook）开发的用于构建用户界面的 JavaScript 库。
React 采用组件化开发模式，每个组件负责渲染一部分 UI。
React 使用虚拟 DOM 技术，通过 diff 算法高效更新真实 DOM。
React 18 引入了并发模式（Concurrent Mode），支持可中断渲染。
Hooks 是 React 16.8 引入的特性，允许在函数组件中使用状态和其他 React 特性。
常用 Hooks：useState 管理状态，useEffect 处理副作用，useCallback 缓存函数，useMemo 缓存计算结果。`,
  },
  {
    id: 'doc-3',
    title: 'Next.js 框架介绍',
    content: `Next.js 是基于 React 的全栈 Web 框架，由 Vercel 开发和维护。
Next.js 支持多种渲染模式：服务端渲染（SSR）、静态生成（SSG）、增量静态再生（ISR）。
App Router 是 Next.js 13 引入的新路由系统，基于 React Server Components。
Next.js 内置了图片优化、字体优化、代码分割等性能优化功能。
API Routes 允许在同一项目中编写后端接口，无需单独的服务器。`,
  },
  {
    id: 'doc-4',
    title: 'AI SDK 核心概念',
    content: `Vercel AI SDK 是一个 TypeScript 工具包，用于构建 AI 驱动的应用。
generateText 用于一次性文本生成，适合批处理和脚本场景。
streamText 用于流式输出，适合聊天界面等需要实时响应的场景。
Tool Calling（工具调用）允许 LLM 调用外部函数获取数据或执行操作。
ToolLoopAgent 是封装了模型、工具和指令的可复用 Agent 类。
Embedding 将文本转换为向量，用于语义搜索和 RAG 场景。`,
  },
  {
    id: 'doc-5',
    title: 'RAG 技术原理',
    content: `RAG（Retrieval-Augmented Generation）是检索增强生成技术。
RAG 解决了 LLM 无法访问私有数据和实时信息的问题。
RAG 流程分两阶段：离线建库（文档向量化存储）和在线检索（查询时搜索相关内容）。
余弦相似度是衡量两个向量相似程度的常用指标，值域为 -1 到 1，越接近 1 越相似。
向量数据库（如 pgvector、Pinecone）专门用于高效存储和检索向量数据。
切块策略影响检索质量，通常使用带重叠的固定大小切块。`,
  },
  {
    id: 'doc-6',
    title: 'Node.js 运行时',
    content: `Node.js 是基于 Chrome V8 引擎的 JavaScript 运行时环境。
Node.js 使用事件驱动、非阻塞 I/O 模型，适合高并发场景。
npm 是 Node.js 的包管理器，pnpm 和 yarn 是常用的替代方案。
tsx 是基于 esbuild 的 TypeScript 执行工具，无需编译直接运行 .ts 文件。
Node.js 25 支持原生 ES Module，使用 import/export 语法。`,
  },
  {
    id: 'doc-7',
    title: '大语言模型基础',
    content: `大语言模型（LLM）是基于 Transformer 架构的深度学习模型。
LLM 通过预测下一个 token 来生成文本，本质是概率模型。
Token 是 LLM 处理文本的基本单位，中文约 1.5 个字符对应 1 个 token。
Temperature 控制生成的随机性，值越高越创意，值越低越确定。
System Prompt（系统提示）用于设定模型的角色和行为规则。
Function Calling 即 Tool Calling，允许模型输出结构化的工具调用意图。`,
  },
  {
    id: 'doc-8',
    title: '多 Agent 系统设计',
    content: `多 Agent 系统由一个 Orchestrator（编排者）和多个专业 Subagent 组成。
Orchestrator 负责任务分解和结果汇总，Subagent 负责具体执行。
每个 Subagent 有独立的 context 窗口，避免主 Agent context 膨胀。
Subagent 通过 Tool 的形式暴露给主 Agent，主 Agent 通过调用工具委托任务。
abortSignal 需要从主 Agent 透传到子 Agent，确保取消信号能正确传播。
多 Agent 适合需要并行处理或 context 隔离的复杂任务场景。`,
  },
];

let vectorStore: DocumentChunk[] = [];
let isInitialized = false;

export async function initKnowledgeBase() {
  if (isInitialized) return;

  console.log('🔧 初始化知识库，向量化文档中...');

  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: RAW_DOCUMENTS.map(d => `${d.title}\n${d.content}`),
    providerOptions: { alibaba: { textType: 'document' } },
  });

  vectorStore = RAW_DOCUMENTS.map((doc, i) => ({
    id: `chunk-${doc.id}`,
    docId: doc.id,
    title: doc.title,
    content: doc.content,
    embedding: embeddings[i] as number[],
  }));

  isInitialized = true;
  console.log(`✅ 知识库就绪，共 ${vectorStore.length} 篇文档`);
}

export async function searchKnowledge(
  query: string,
  topK = 3,
): Promise<{ title: string; content: string; similarity: number }[]> {
  await initKnowledgeBase();

  const { embedding: queryEmbedding } = await embed({
    model: embeddingModel,
    value: query,
    providerOptions: { alibaba: { textType: 'query' } },
  });

  return vectorStore
    .map(chunk => ({
      title: chunk.title,
      content: chunk.content,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
