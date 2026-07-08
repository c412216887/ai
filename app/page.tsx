"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useState, useRef, useEffect } from "react";

const STORAGE_KEY = "chat-history";

function loadHistory(): UIMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: UIMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {}
}

export default function Page() {
  const [initialMessages] = useState<UIMessage[]>(() =>
    typeof window !== "undefined" ? loadHistory() : []
  );

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    messages: initialMessages,
    onFinish: ({ messages: allMessages }) => {
      saveHistory(allMessages);
    },
  });

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
    setMessages([]);
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, borderBottom: "1px solid #eee", paddingBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          📚 AI 知识库助手
        </h1>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            style={{ fontSize: 12, color: "#999", background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
          >
            清空对话
          </button>
        )}
      </div>

      <div style={{ minHeight: 400, marginBottom: 16 }}>
        {messages.length === 0 && (
          <div style={{ color: "#999", textAlign: "center", marginTop: 80 }}>
            <p>你好！我是知识库助手。</p>
            <p>可以问我关于 TypeScript、React、Next.js、AI SDK、RAG 等技术问题。</p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              marginBottom: 16,
              display: "flex",
              flexDirection: m.role === "user" ? "row-reverse" : "row",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: m.role === "user" ? "#0070f3" : "#f0f0f0",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, flexShrink: 0,
              color: m.role === "user" ? "#fff" : "#333",
            }}>
              {m.role === "user" ? "你" : "AI"}
            </div>

            <div style={{
              maxWidth: "80%",
              background: m.role === "user" ? "#0070f3" : "#f7f7f7",
              color: m.role === "user" ? "#fff" : "#333",
              borderRadius: 12,
              padding: "10px 14px",
              lineHeight: 1.6,
              fontSize: 14,
            }}>
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{part.text}</span>;
                }
                if (part.type.startsWith("tool-") && "state" in part) {
                  if (part.state === "input-streaming" || part.state === "input-available") {
                    return <span key={i} style={{ color: "#888", fontStyle: "italic", fontSize: 12 }}>🔍 正在搜索知识库...</span>;
                  }
                  if (part.state === "output-available") {
                    return <span key={i} style={{ color: "#52c41a", fontSize: 12 }}>✅ 搜索完成，生成回答中...</span>;
                  }
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {status === "submitted" && (
          <div style={{ color: "#999", fontSize: 13, paddingLeft: 40 }}>AI 思考中...</div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, borderTop: "1px solid #eee", paddingTop: 16 }}>
        <input
          type="text"
          value={input}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (input.trim() && status === "ready") {
                sendMessage({ text: input });
                setInput("");
              }
            }
          }}
          disabled={status !== "ready"}
          placeholder="输入问题，按 Enter 发送..."
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 8,
            border: "1px solid #ddd", fontSize: 14, outline: "none",
          }}
        />
        {(status === "streaming" || status === "submitted") ? (
          <button
            onClick={stop}
            style={{
              padding: "10px 18px", borderRadius: 8, border: "none",
              background: "#ff4444", color: "#fff", cursor: "pointer", fontSize: 14,
            }}
          >
            停止
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (input.trim()) {
                sendMessage({ text: input });
                setInput("");
              }
            }}
            disabled={status !== "ready"}
            style={{
              padding: "10px 18px", borderRadius: 8, border: "none",
              background: "#0070f3", color: "#fff", cursor: "pointer", fontSize: 14,
            }}
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}
