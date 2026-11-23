import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Bot,
  CheckCheck,
  Inbox,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Stethoscope,
  Ticket,
  TrendingUp,
} from 'lucide-react'
import { Badge, Spinner, cn } from './ui'
import { useApi } from '../hooks/useApi'
import { relativeTime } from '../lib/utils'
import { api, getErrorMessage } from '../services/api'
import { useToast } from '../context/ToastContext'

const KIND_ICONS = {
  prediction: TrendingUp,
  security: ShieldAlert,
  root_cause: Stethoscope,
  optimization: Sparkles,
  anomaly: Bot,
  ticket: Ticket,
  device: Smartphone,
}

const TONES = {
  Critical: 'border-danger/25 bg-danger/10 text-danger',
  High: 'border-warning/25 bg-warning/10 text-warning',
  Medium: 'border-accent/25 bg-accent/10 text-accent',
  Low: 'border-info/25 bg-info/10 text-info',
}

export default function NotificationCenter({ open, onClose, onChanged }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data, loading, reload } = useApi('/notifications', {
    params: { limit: 30 },
    pollMs: open ? 30000 : 0,
    enabled: open,
  })
  const notifications = data?.notifications || []
  const unread = data?.unread || 0

  async function markAll() {
    try {
      await api.post('/notifications/read-all')
      reload()
      onChanged?.()
      toast('All notifications marked as read', 'success')
    } catch (error) {
      toast(getErrorMessage(error), 'error')
    }
  }

  async function openNotification(item) {
    if (!item.is_read) {
      try {
        await api.post(`/notifications/${item.id}/read`)
        onChanged?.()
      } catch {
        /* Navigation is more important than the read receipt. */
      }
    }
    navigate(item.path || '/')
    onClose()
  }

  if (!open) return null

  return (
    <>
      <button className="fixed inset-0 z-30 cursor-default" aria-label="Close notifications" onClick={onClose} />
      <div
        className="panel absolute right-0 top-11 z-40 w-[min(380px,calc(100vw-2rem))] animate-fade-up overflow-hidden"
        role="dialog"
        aria-label="Notification center"
      >
        <div className="flex items-center justify-between gap-3 border-b border-app px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold text-app">
              <Bell className="h-3.5 w-3.5 text-accent" /> Notification center
            </p>
            <p className="mt-0.5 text-[9.5px] text-subtle">Predictions, security findings, RCA and optimisation</p>
          </div>
          <Badge tone={unread ? 'warning' : 'success'}>{unread ? `${unread} unread` : 'All read'}</Badge>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[10px] text-subtle">
              <Spinner className="h-3.5 w-3.5" /> Loading notifications
            </div>
          ) : (
            notifications.map((item) => {
              const Icon = KIND_ICONS[item.kind] || Bell
              return (
                <button
                  key={item.id}
                  onClick={() => openNotification(item)}
                  className={cn(
                    'flex w-full items-start gap-2.5 border-b border-app px-4 py-3 text-left transition last:border-0 hover:bg-accent/[0.04]',
                    !item.is_read && 'bg-accent/[0.025]',
                  )}
                >
                  <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border', TONES[item.severity] || 'border-app text-muted')}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className={cn('text-[11px] leading-snug', item.is_read ? 'font-medium text-muted' : 'font-semibold text-app')}>
                        {item.title}
                      </span>
                      {!item.is_read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[9.5px] leading-relaxed text-subtle">{item.message}</span>
                    <span className="mt-1 block font-mono text-[8.5px] uppercase tracking-[0.08em] text-subtle">
                      {item.severity} · {relativeTime(item.created_at)}
                    </span>
                  </span>
                </button>
              )
            })
          )}
          {!loading && !notifications.length && (
            <div className="flex flex-col items-center px-4 py-9 text-center">
              <Inbox className="h-6 w-6 text-accent" />
              <p className="mt-2 text-[11px] font-medium text-app">No notifications</p>
              <p className="mt-0.5 text-[9.5px] text-subtle">Autonomous findings will appear here after the next scan.</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-app bg-[var(--bg-soft)] px-4 py-2.5">
          <button
            onClick={markAll}
            disabled={!unread}
            className="inline-flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted transition hover:text-accent disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
          <button onClick={onClose} className="text-[9.5px] uppercase tracking-[0.1em] text-subtle transition hover:text-app">
            Close
          </button>
        </div>
      </div>
    </>
  )
}
