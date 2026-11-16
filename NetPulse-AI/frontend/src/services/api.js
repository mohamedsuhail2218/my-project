import axios from 'axios'

export const TOKEN_KEY = 'netpulse_token'
export const USER_KEY = 'netpulse_user'

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
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      window.dispatchEvent(new CustomEvent('netpulse:unauthorized'))
    }
    return Promise.reject(error)
  },
)

export function getErrorMessage(error) {
  if (!error) return 'An unexpected error occurred.'
  if (!error.response) {
    return error.code === 'ECONNABORTED'
      ? 'The request took too long. The server may be busy.'
      : 'Cannot reach the NetPulse API. Confirm the backend is running on port 8000.'
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
