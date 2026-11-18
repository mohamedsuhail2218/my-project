import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, getErrorMessage, TOKEN_KEY, USER_KEY, waitForWarmUp } from '../services/api'

const AuthContext = createContext(null)
const ROLE_LEVEL = { viewer: 10, analyst: 20, admin: 30 }

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)))
  const [error, setError] = useState('')

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  useEffect(() => {
    const onUnauthorized = () => {
      clearSession()
      setError('Your session expired. Please sign in again.')
    }
    window.addEventListener('netpulse:unauthorized', onUnauthorized)
    return () => window.removeEventListener('netpulse:unauthorized', onUnauthorized)
  }, [clearSession])

  useEffect(() => {
    let cancelled = false
    async function validate() {
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const response = await api.get('/auth/me')
        if (!cancelled) {
          setUser(response.data)
          localStorage.setItem(USER_KEY, JSON.stringify(response.data))
          setError('')
        }
      } catch {
        if (!cancelled) clearSession()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    validate()
    return () => {
      cancelled = true
    }
  }, [token, clearSession])

  const login = useCallback(async (email, password) => {
    setError('')
    try {
      // If the serverless API is still starting, let the warm-up finish first
      // instead of failing the first sign-in attempt.
      await waitForWarmUp()
      const response = await api.post('/auth/login', { email, password }, { netpulseRetry: true })
      const payload = response.data
      localStorage.setItem(TOKEN_KEY, payload.access_token)
      localStorage.setItem(USER_KEY, JSON.stringify(payload.user))
      setToken(payload.access_token)
      setUser(payload.user)
      return payload.user
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      throw new Error(message)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // Token is stateless; clearing the browser session is enough.
    }
    clearSession()
  }, [clearSession])

  const hasRole = useCallback(
    (required) => (ROLE_LEVEL[user?.role] || 0) >= (ROLE_LEVEL[required] || 99),
    [user],
  )

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      error,
      setError,
      login,
      logout,
      hasRole,
      isAuthenticated: Boolean(token && user),
    }),
    [token, user, loading, error, login, logout, hasRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
