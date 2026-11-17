import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

const ToastContext = createContext(null)
const icons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}
const tones = {
  success: 'border-[#ccff00]/40 bg-[#101400]/95 text-[#d8ff4d]',
  error: 'border-[#ff4d6d]/40 bg-[#1a0a0e]/95 text-[#ff8fa3]',
  warning: 'border-[#ffb020]/40 bg-[#1a1203]/95 text-[#ffd166]',
  info: 'border-[#a855f7]/40 bg-[#120a1c]/95 text-[#d8b4fe]',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)

  const dismiss = useCallback((id) => {
    setToasts((items) => items.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (message, type = 'info', title) => {
      const id = nextId.current++
      setToasts((items) => [...items.slice(-3), { id, message, type, title }])
      window.setTimeout(() => dismiss(id), 5000)
      return id
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((item) => {
          const Icon = icons[item.type] || Info
          return (
            <div
              key={item.id}
              className={`pointer-events-auto flex animate-fade-up items-start gap-3 border p-3.5 shadow-2xl backdrop-blur ${tones[item.type] || tones.info}`}
              role="status"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                {item.title && <p className="text-xs font-semibold">{item.title}</p>}
                <p className="text-[11px] leading-relaxed opacity-90">{item.message}</p>
              </div>
              <button onClick={() => dismiss(item.id)} className="opacity-60 transition hover:opacity-100" aria-label="Dismiss notification">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
