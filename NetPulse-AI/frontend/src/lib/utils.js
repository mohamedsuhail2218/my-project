export function parseApiDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  let text = String(value)
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(text)) text += 'Z'
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value, options = {}) {
  const date = parseApiDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options,
  }).format(date)
}

export function formatTime(value) {
  const date = parseApiDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatShortDate(value) {
  const date = parseApiDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
  }).format(date)
}

export function relativeTime(value) {
  const date = parseApiDate(value)
  if (!date) return 'never'
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'just now'
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return formatter.format(Math.round(seconds / 3600), 'hour')
  if (abs < 604800) return formatter.format(Math.round(seconds / 86400), 'day')
  return formatShortDate(value)
}

export function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function truncate(value, length = 120) {
  if (!value) return ''
  return value.length > length ? `${value.slice(0, length)}…` : value
}

export function statusTone(status) {
  switch (status) {
    case 'online':
    case 'approved':
    case 'Resolved':
    case 'passed':
    case 'Low':
      return 'success'
    case 'offline':
    case 'failed':
    case 'Critical':
      return 'danger'
    case 'Open':
    case 'High':
    case 'warning':
      return 'warning'
    case 'In Progress':
    case 'Medium':
      return 'info'
    case 'simulated':
      return 'plum'
    default:
      return 'neutral'
  }
}

export function titleCase(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 }
export const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 }
