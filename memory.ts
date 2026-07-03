import * as readline from "node:readline";
import { ToolLoopAgent } from "ai";
import { createAlibaba } from "@ai-sdk/alibaba";
import "dotenv/config";

const alibaba = createAlibaba({
  baseURL: process.env.AI_gateway_url,
  apiKey: process.env.alibaba_api_key,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const agent = new ToolLoopAgent({
  model: alibaba("qwen3.7-max"),
});

type Message = { role: "user" | "assistant"; content: string };
const history: Message[] = [];

const chat = async (userInput: string) => {
  history.push({ role: "user", content: userInput });
  const result = await agent.generate({ messages: history });
  history.push({ role: "assistant", content: result.text });
  return result.text;
};

const ask = () => {
  rl.question("你：", async (input) => {
    const trimmed = input.trim();
    if (trimmed === "q") {
      rl.close();
      process.exit(0);
    }
    console.log("===输入===\n", trimmed, "\n");
    const text = await chat(trimmed);
    console.log("===\n", text, "\n");
    ask();
  });
};
ask();
