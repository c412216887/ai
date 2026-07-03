export declare global {
  namespace NodeJS {
    interface ProcessEnv {
      AI_gateway_url: string;
      embedding_gateway_url: string;
      alibaba_api_key: string;
    }
  }
}
