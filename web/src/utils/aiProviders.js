/** 全站统一的生图模型列表与展示名称（勿改写法，避免浏览器自动翻译）。 */

/** 内部 provider id，顺序即下拉框顺序 */
export const STANDARD_AI_PROVIDERS = ['gpt_image', 'gemini', 'siliconflow', 'wanxiang']

/** 界面展示文案（与产品要求一致） */
export const PROVIDER_DISPLAY_LABELS = {
  gpt_image: 'GPT Image 2 plus',
  gemini: 'Gemini nano banana',
  siliconflow: 'SiliconFlow',
  wanxiang: '通义万相',
}

export function providerLabel(providerId) {
  return PROVIDER_DISPLAY_LABELS[providerId] || providerId
}

export function providerShortLabel(providerId) {
  return providerLabel(providerId)
}

/** @deprecated 使用 sortProvidersStandard */
export function sortProvidersGeminiFirst(names) {
  return sortProvidersStandard(names)
}

export function sortProvidersStandard(names) {
  const set = new Set(names || STANDARD_AI_PROVIDERS)
  return STANDARD_AI_PROVIDERS.filter((p) => set.has(p))
}

/** @deprecated 使用 defaultStandardProvider */
export function defaultProviderIfGeminiAvailable(names) {
  return defaultStandardProvider(names)
}

export function defaultStandardProvider(names) {
  const list = sortProvidersStandard(names)
  return list[0] || STANDARD_AI_PROVIDERS[0]
}

/** 初始化各模块的生图模型下拉（固定 4 项） */
export function initStandardProviderList() {
  return [...STANDARD_AI_PROVIDERS]
}
