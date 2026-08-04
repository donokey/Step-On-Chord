/** 时间工具：mm:ss(.ff) 字符串解析与格式化 */

/** '01:23' / '01:23.45' / 秒数 → 秒；无法解析返回 null */
export function parseTimeString(value?: string | number | null): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (!value) return null
  const text = value.trim()
  const match = /^(\d{1,3}):(\d{2})(?:\.(\d+))?$/.exec(text)
  if (match) {
    const fraction = match[3] ? Number(`0.${match[3]}`) : 0
    return Number(match[1]) * 60 + Number(match[2]) + fraction
  }
  const numeric = Number(text)
  return Number.isFinite(numeric) ? numeric : null
}

/** 秒 → 'mm:ss' */
export function formatTime(seconds: number): string {
  const bounded = Math.max(0, seconds)
  const m = Math.floor(bounded / 60)
  const s = Math.floor(bounded % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
