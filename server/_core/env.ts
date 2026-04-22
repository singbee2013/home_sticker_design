export const ENV = {
  appId: process.env.VITE_APP_ID ?? "decor_ai",
  cookieSecret: process.env.JWT_SECRET ?? "decor_ai_secret",
  databaseUrl: process.env.DATABASE_URL ?? "",
  dbMaintenancePassword: process.env.DB_MAINTENANCE_PASSWORD ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // OpenAI (legacy, kept for backward compat)
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  /** Image API model for ChatGPT Images / gpt-image family (default gpt-image-2) */
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
  // Google Gemini (text/vision + 2.5 Flash Image generation)
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // Silicon Flow (FLUX image generation, supports Alipay)
  siliconflowApiKey: process.env.SILICONFLOW_API_KEY ?? "",
  /** Base URL without trailing slash, e.g. https://api.siliconflow.cn/v1 */
  siliconflowApiBase: (process.env.SILICONFLOW_API_BASE ?? "https://api.siliconflow.cn/v1").replace(
    /\/+$/,
    "",
  ),
  // Alibaba Cloud SMS (手机验证码登录)
  aliyunSmsAccessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID ?? "",
  aliyunSmsAccessKeySecret: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET ?? "",
  aliyunSmsSignName: process.env.ALIYUN_SMS_SIGN_NAME ?? "",
  aliyunSmsTemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE ?? "",
  // Alibaba Cloud OSS
  ossRegion: process.env.OSS_REGION ?? "oss-cn-hangzhou",
  ossAccessKeyId: process.env.OSS_ACCESS_KEY_ID ?? "",
  ossAccessKeySecret: process.env.OSS_ACCESS_KEY_SECRET ?? "",
  ossBucket: process.env.OSS_BUCKET ?? "",
  ossEndpoint: process.env.OSS_ENDPOINT ?? "https://oss-cn-hangzhou.aliyuncs.com",
  // Runway Gen-3
  runwayApiKey: process.env.RUNWAY_API_KEY ?? "",
  // Legacy Manus (kept for backward compat, can be empty in standalone mode)
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
