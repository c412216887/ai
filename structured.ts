import {generateText, Output} from 'ai'
import {createAlibaba} from '@ai-sdk/alibaba'
import {z} from 'zod'
import 'dotenv/config'

const alibaba = createAlibaba({
  baseURL: process.env.AI_gateway_url,
  apiKey: process.env.alibaba_api_key
})

const resume = `"这个手机电池续航真的很棒！"
"快递慢死了，等了一周"
"东西收到了，还可以吧"`

async function main() {
  const {output} = await generateText({
    model: alibaba('qwen3.7-max'),
    prompt: `对这三条评论进行分类，只能从正面/负面/中性三个类别中进行。返回结果为一个json，示例：{result : ['正面','负面','中性']}。评论：${resume}`,
    output: Output.object({
      schema: z.object({result: z.array(z.enum(['正面','负面','中性'])).describe('评论类别')})
    })
  })
  console.log('===回答===\n', output)
}
main()