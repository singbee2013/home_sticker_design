/**
 * 版本指纹：与控制台
 * `[...document.querySelectorAll('script[src*="/assets/index-"]')].map(s=>s.src)`
 * 一致，便于部署后判断是否为最新构建。
 */
function indexEntryScriptUrls() {
  return [...document.querySelectorAll('script[src*="/assets/index-"]')].map((s) => s.src)
}

function basenameFromUrl(url) {
  try {
    return new URL(url, location.href).pathname.split('/').filter(Boolean).pop() || url
  } catch {
    return url
  }
}

const indexJsUrls = indexEntryScriptUrls()
const indexJsFiles = indexJsUrls.map(basenameFromUrl)

globalThis.__DECORAI_BUILD__ = Object.freeze({
  /** 生产环境入口脚本的完整 URL 列表 */
  indexJsUrls,
  /** 仅文件名，例如 ["index-DFvjZEsf.js"] */
  indexJsFiles,
  /** 单行摘要，便于复制粘贴比对 */
  indexJsFingerprint: indexJsFiles.join(','),
  /** 与文档约定的控制台写法等价 */
  snapshotIndexScripts: indexEntryScriptUrls,
})

if (import.meta.env.PROD && indexJsUrls.length) {
  console.info('[DecorAI] 版本指纹 indexJs:', globalThis.__DECORAI_BUILD__.indexJsFingerprint)
}
