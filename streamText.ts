import { streamText } from "ai";
import {createAlibaba } from "@ai-sdk/alibaba"
import "dotenv/config"

const alibaba = createAlibaba({
  baseURL: process.env.AI_gateway_url,
  apiKey: process.env.alibaba_api_key
})

async function main() {
  const result = streamText({
    model: alibaba('qwen3.7-max'),
    prompt: '写一首关于程序员的短诗',
  })
  for await(const chunk of result.textStream) {
    process.stdout.write(chunk)
  }
}
main()