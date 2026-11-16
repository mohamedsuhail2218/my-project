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
  success: 'border-sage-400/30 bg-[#20281a]/95 text-sage-300',
  error: 'border-rust-400/30 bg-[#2c1815]/95 text-rust-300',
  warning: 'border-ochre-400/30 bg-[#2b2113]/95 text-ochre-300',
  info: 'border-wine-400/30 bg-[#2a191e]/95 text-wine-300',
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
              className={`pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl border p-3.5 shadow-2xl backdrop-blur ${tones[item.type] || tones.info}`}
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
