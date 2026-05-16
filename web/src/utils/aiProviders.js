/** Shared ordering / labels for AI provider dropdowns (Gemini first when available). */

export function sortProvidersGeminiFirst(names) {
  const list = [...(names || [])]
  const ix = list.indexOf('gemini')
  if (ix > 0) {
    list.splice(ix, 1)
    list.unshift('gemini')
  }
  return list
}

export function defaultProviderIfGeminiAvailable(names) {
  const list = names || []
  return list.includes('gemini') ? 'gemini' : (list[0] || 'gemini')
}

/** Human label; avoid bare "Gemini" (Chrome auto-translates to 双子座). */
export function providerLabel(p) {
  const map = {
    mock: 'Mock（离线占位）',
    gpt_image: 'GPT Image 2 Plus',
    stable_diffusion: 'Stable Diffusion',
    midjourney: 'Midjourney',
    gemini: 'Gemini · Google AI',
    siliconflow: 'SiliconFlow',
    wanxiang: '通义万相',
  }
  return map[p] || p
}

/** Short label for task list rows (no translation trigger). */
export function providerShortLabel(p) {
  if (p === 'gemini') return 'Gemini'
  return providerLabel(p)
}
