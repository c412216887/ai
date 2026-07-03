"use client";
/**
 * 页面样式说明
 * 最大宽度700px
 * title高50px
 * 输入框70px
 * icon32px
 */

import { useChat } from "@ai-sdk/react";
import { useState } from "react";
export default function PageView() {
  const { messages, sendMessage, stop } = useChat();
  const [input, setInput] = useState("");
  return (
    <div style={{ maxWidth: "700px", display: "flex" }}>
      <div style={{ height: "50px" }}>📚 AI 知识库助手</div>
      <div style={{ flex: 1 }}>
        {messages.map((message) => (
          <div key={message.id}>
            {message.parts.map((p) =>
              p.type === "text" ? <div>{p.text}</div> : null,
            )}
          </div>
        ))}
      </div>
      <div style={{ height: "70px" }}>
        <form onSubmit={(e) => {}}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit">发送</button>
        </form>
      </div>
    </div>
  );
}
