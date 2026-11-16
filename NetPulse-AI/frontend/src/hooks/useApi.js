import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getErrorMessage } from '../services/api'

/**
 * Small data-fetching hook. Polls with a silent refresh so charts and tables
 * stay current without flashing loading states.
 */
export function useApi(path, { params, pollMs = 0, enabled = true } = {}) {
  const paramsKey = params ? JSON.stringify(params) : ''
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled))
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const mountedRef = useRef(true)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false)
      return undefined
    }
    let cancelled = false

    async function load(background = false) {
      if (!background) setLoading(!hasLoadedRef.current)
      if (background) setRefreshing(true)
      try {
        const response = await api.get(path, { params: paramsKey ? JSON.parse(paramsKey) : undefined })
        if (!cancelled && mountedRef.current) {
          setData(response.data)
          setError('')
          setLastUpdated(new Date())
          hasLoadedRef.current = true
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setError(getErrorMessage(err))
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    load(false)
    let timer
    if (pollMs > 0) {
      timer = window.setInterval(() => load(true), pollMs)
    }
    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
    }
  }, [path, paramsKey, pollMs, enabled, reloadKey])

  const reload = useCallback(() => setReloadKey((value) => value + 1), [])

  return { data, loading, refreshing, error, reload, setData, lastUpdated }
}
