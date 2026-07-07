"use client";
/**
 * 页面样式说明
 * 最大宽度700px
 * title高50px
 * 输入框70px
 * icon32px
 */

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
export default function PageView() {
  // useChat接受一个对象，对象里面有个transport， transport时一个对象 DefaultChatTransport
  /**
   * status状态
   * 1.ready: 准备，空闲，
   * 2.submitted: 已提交，等待响应
   * 3.streaming：通信中
   * 4.error: 报错
   */
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chatV2" }),
  });
  const [input, setInput] = useState("");
  return (
    <div
      style={{
        maxWidth: "700px",
        height: "90vh",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: "50px",
          lineHeight: "50px",
          borderBottom: "1px solid #ccc",
        }}
      >
        📚 AI 知识库助手
      </div>
      <div style={{ flex: 1, padding: "16px 0" }}>
        {messages.length === 0 && (
          <div style={{ color: "#999", textAlign: "center", marginTop: 80 }}>
            <p>你好！我是知识库助手。</p>
            <p>
              可以问我关于 TypeScript、React、Next.js、AI SDK、RAG 等技术问题。
            </p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: "flex",
              flexDirection: message.role === "user" ? "row-reverse" : "row",
              columnGap: "8px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                width: "35px",
                height: "35px",
                borderRadius: "50%",
                textAlign: "center",
                lineHeight: "35px",
                color: message.role === "user" ? "#fff" : "#000",
                background: message.role === "user" ? "#0070f3" : "#f7f7f7",
              }}
            >
              {message.role === "user" ? "你" : "AI"}
            </div>
            <div
              style={{
                maxWidth: "80%",
                color: message.role === "user" ? "#fff" : "#000",
                background: message.role === "user" ? "#0070f3" : "#f7f7f7",
                borderRadius: "8px",
                padding: "6px",
              }}
            >
              {message.parts.map((p, index) => {
                if (p.type === "text") {
                  return (
                    <div
                      key={index}
                      style={{
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {p.text}
                    </div>
                  );
                }
                if (p.type.startsWith("tool-") && "state" in p) {
                  return ["input-streaming", "input-available"].includes(
                    p.state,
                  ) ? (
                    <div key={index}>正在检索数据库</div>
                  ) : p.state === "output-available" ? (
                    <div key={index}>数据库检索完毕</div>
                  ) : (
                    <div key={index}>数据库检索出错</div>
                  );
                }
              })}
              {status === "submitted" && "AI思考中"}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          height: "50px",
          paddingTop: "16px",
          borderTop: "1px solid #ccc",
        }}
      >
        <form
          style={{
            display: "flex",
            gap: 8,
          }}
          onSubmit={(e) => {
            {
              /* 一定要禁止默认行为 */
            }
            e.preventDefault();
            ["submitted", "streaming"].includes(status)
              ? stop()
              : sendMessage({ text: input });
            setInput("");
          }}
        >
          <input
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
              outline: "none",
            }}
            type="text"
            value={input}
            disabled={status !== "ready"}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: ["submitted", "streaming"].includes(status)
                ? "#ff4444"
                : "#0070f3",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
            }}
            type="submit"
          >
            {/**空闲和报错的时候，可以发送；已提交和输入中，可以停止 */}
            {["submitted", "streaming"].includes(status) ? "停止" : "发送"}
          </button>
        </form>
      </div>
    </div>
  );
}
