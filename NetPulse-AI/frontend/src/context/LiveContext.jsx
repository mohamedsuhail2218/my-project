import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api, TOKEN_KEY } from '../services/api'

/**
 * One shared live feed for the whole dashboard.
 *
 * Long-lived deployments receive pushed snapshots over WebSocket. When the
 * socket cannot be established (serverless functions cannot hold one) the hook
 * automatically switches to short REST polling of `/live/snapshot`, so the UI
 * remains live without claiming a socket is connected.
 */
const LiveContext = createContext({
  snapshot: null,
  transport: 'connecting',
  connected: false,
  lastMessageAt: null,
  refresh: () => {},
})

const POLL_MS = 15000
const MAX_SOCKET_ATTEMPTS = 2

function socketUrl(token) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/live/ws?token=${encodeURIComponent(token)}`
}

export function LiveProvider({ children }) {
  const [snapshot, setSnapshot] = useState(null)
  const [transport, setTransport] = useState('connecting')
  const [connected, setConnected] = useState(false)
  const [lastMessageAt, setLastMessageAt] = useState(null)
  const pollTimer = useRef(null)
  const socketRef = useRef(null)
  const cancelledRef = useRef(false)

  const loadOnce = useCallback(async () => {
    try {
      const response = await api.get('/live/snapshot')
      if (!cancelledRef.current) {
        setSnapshot(response.data)
        setConnected(true)
        setLastMessageAt(new Date())
      }
    } catch {
      if (!cancelledRef.current) setConnected(false)
    }
  }, [])

  const startPolling = useCallback(() => {
    if (cancelledRef.current || pollTimer.current) return
    setTransport('polling')
    loadOnce()
    pollTimer.current = window.setInterval(loadOnce, POLL_MS)
  }, [loadOnce])

  useEffect(() => {
    cancelledRef.current = false
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setTransport('offline')
      return undefined
    }
    let attempts = 0
    let retryTimer

    function connect() {
      if (cancelledRef.current) return
      setTransport('connecting')
      let socket
      try {
        socket = new WebSocket(socketUrl(token))
      } catch {
        startPolling()
        return
      }
      socketRef.current = socket
      let opened = false

      socket.onopen = () => {
        opened = true
        attempts = 0
        setTransport('websocket')
        setConnected(true)
      }
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'snapshot') {
            setSnapshot(message)
            setConnected(true)
            setLastMessageAt(new Date())
          }
        } catch {
          /* Ignore malformed frames rather than breaking the dashboard. */
        }
      }
      socket.onerror = () => {
        try {
          socket.close()
        } catch {
          /* already closed */
        }
      }
      socket.onclose = () => {
        if (cancelledRef.current) return
        setConnected(false)
        if (!opened) attempts += 1
        if (attempts >= MAX_SOCKET_ATTEMPTS) {
          startPolling()
          return
        }
        setTransport('connecting')
        retryTimer = window.setTimeout(connect, 2500 * (attempts + 1))
      }
    }

    connect()
    return () => {
      cancelledRef.current = true
      if (retryTimer) window.clearTimeout(retryTimer)
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      try {
        socketRef.current?.close()
      } catch {
        /* already closed */
      }
    }
  }, [startPolling])

  return (
    <LiveContext.Provider
      value={{ snapshot, transport, connected, lastMessageAt, refresh: loadOnce }}
    >
      {children}
    </LiveContext.Provider>
  )
}

export function useLive() {
  return useContext(LiveContext)
}
