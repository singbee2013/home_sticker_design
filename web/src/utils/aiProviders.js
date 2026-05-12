/** Shared ordering / default for AI provider dropdowns (Gemini first when available). */

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
