import axios from 'axios'

export const TOKEN_KEY = 'netpulse_token'
export const USER_KEY = 'netpulse_user'

/**
 * The production API runs as a serverless function that is suspended when idle.
 * The first request after a quiet period can take a while (or briefly return a
 * gateway error) while the function starts. These helpers keep that start-up
 * invisible: safe requests are retried, and the app warms `/health` before the
 * user needs the API.
 */
const RETRY_STATUSES = [502, 503, 504]
const RETRY_DELAYS_MS = [900, 2500, 5000]

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(error) {
  const config = error.config
  if (!config || config.__netpulseNoRetry) return false
  if (error.code === 'ERR_CANCELED' || axios.isCancel(error)) return false
  const method = (config.method || 'get').toLowerCase()
  const safeMethod = method === 'get' || method === 'head'
  if (!safeMethod && config.netpulseRetry !== true) return false
  if (error.response) return RETRY_STATUSES.includes(error.response.status)
  // A request timeout already waited the full client timeout; retrying would
  // keep the user waiting for minutes. Network failures are cheap to retry.
  return error.code !== 'ECONNABORTED'
}

export const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (isRetryable(error)) {
      const attempts = error.config.__netpulseRetryCount || 0
      if (attempts < RETRY_DELAYS_MS.length) {
        error.config.__netpulseRetryCount = attempts + 1
        await delay(RETRY_DELAYS_MS[attempts])
        return api.request(error.config)
      }
    }
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      window.dispatchEvent(new CustomEvent('netpulse:unauthorized'))
    }
    return Promise.reject(error)
  },
)

let warmUpPromise = null
let apiWarm = false

/**
 * Ask the API to start before the first real request. Resolves to true when the
 * API answered, false when it is still unreachable; it never rejects.
 */
export function warmUpApi() {
  if (apiWarm) return Promise.resolve(true)
  if (!warmUpPromise) {
    warmUpPromise = api
      .get('/health', { timeout: 150000 })
      .then(() => {
        apiWarm = true
        return true
      })
      .catch(() => false)
      .finally(() => {
        warmUpPromise = null
      })
  }
  return warmUpPromise
}

/**
 * Wait for an in-flight warm-up only. When the API is already warm this returns
 * immediately, so login does not pay for an extra round trip.
 */
export function waitForWarmUp() {
  return warmUpPromise || Promise.resolve(apiWarm)
}

export function getErrorMessage(error) {
  if (!error) return 'An unexpected error occurred.'
  if (!error.response) {
    if (error.code === 'ECONNABORTED') {
      return 'The request took too long. Please try again in a moment.'
    }
    return 'Cannot reach the NetPulse API right now. Check your connection and try again.'
  }
  if (RETRY_STATUSES.includes(error.response.status)) {
    return 'The NetPulse API is starting up. Please try again in a moment.'
  }
  const detail = error.response.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || item.message || String(item)).join(', ')
  }
  if (detail && typeof detail === 'object') {
    return detail.message || JSON.stringify(detail)
  }
  const validation = error.response.data?.errors
  if (Array.isArray(validation) && validation.length) {
    return validation.map((item) => `${item.field}: ${item.message}`).join(' · ')
  }
  return `Request failed (${error.response.status})`
}

export async function downloadPdf(filename) {
  const response = await api.get(`/reports/download/${encodeURIComponent(filename)}`, {
    responseType: 'blob',
  })
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
