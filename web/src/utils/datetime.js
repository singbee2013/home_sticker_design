/**
 * 后端 / SQLite 常见为「无时区的 UTC 时间」字符串；浏览器若按本地解析会偏 8 小时。
 * 此处将无时区 ISO 视为 UTC，再用 Asia/Shanghai 展示。
 */
function normalizeApiDatetimeToIsoUtc(s) {
  const trimmed = String(s).trim()
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) return trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
  const t = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return trimmed
  return `${t}Z`
}

export function formatDateTimeBeijing(v) {
  if (v == null || v === '') return '-'
  const d = new Date(normalizeApiDatetimeToIsoUtc(v))
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
