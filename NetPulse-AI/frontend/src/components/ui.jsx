import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Inbox,
  Info,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { statusTone } from '../lib/utils'

export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function Spinner({ className = 'h-4 w-4' }) {
  return <Loader2 className={cn('animate-spin', className)} aria-hidden="true" />
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  className = '',
  disabled,
  type = 'button',
  ...props
}) {
  const variants = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger' }
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(variants[variant] || variants.secondary, size === 'sm' && 'btn-sm', className)}
      {...props}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : Icon ? <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : null}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, className = '', ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('inline-flex h-8 w-8 items-center justify-center border border-app text-muted transition hover:border-accent/50 hover:bg-accent/5 hover:text-accent', className)}
      {...props}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

export function PageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <div className="mb-6 animate-fade-up">
      <div className="panel relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-[rgba(168,85,247,0.28)] blur-[80px]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-[var(--accent)] via-[rgba(34,211,238,0.26)] to-transparent" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            {eyebrow && (
              <p className="eyebrow mb-2.5 flex items-center gap-2">
                <span className="inline-block h-2 w-2 bg-accent" />
                {eyebrow}
              </p>
            )}
            <h1 className="font-display text-[38px] leading-[0.88] text-app sm:text-[56px]">{title}</h1>
            {description && <p className="mt-3 max-w-2xl text-[11.5px] leading-relaxed text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}

export function SectionHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 flex h-7 w-7 items-center justify-center border border-accent/35 bg-accent/[0.06] text-accent">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <div>
          <h2 className="panel-heading">{title}</h2>
          {subtitle && <p className="mt-1 text-[10.5px] leading-relaxed text-subtle">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function Badge({ children, tone = 'neutral', dot = false, className = '' }) {
  return (
    <span className={cn('badge', `badge-${tone}`, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function StatusBadge({ status, children }) {
  const label = children ?? status
  return <Badge tone={statusTone(status)} dot>{label}</Badge>
}

export function StatCard({ label, value, unit, hint, icon: Icon, accent = 'wine', trend, loading = false, onClick }) {
  const valueText = value === null || value === undefined ? '—' : value
  return (
    <div
      className={cn('panel relative overflow-hidden p-4', onClick && 'cursor-pointer transition hover:border-accent/25')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => event.key === 'Enter' && onClick() : undefined}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent opacity-60" />
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-subtle">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center', `stat-accent-${accent}`)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      {loading ? (
        <div className="skeleton mt-3 h-8 w-24" />
      ) : (
        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span className="font-display text-[31px] leading-none text-app">{valueText}</span>
          {unit && <span className="text-[11px] font-medium text-subtle">{unit}</span>}
        </div>
      )}
      <div className="mt-1 flex min-h-[15px] items-center justify-between gap-2">
        {hint && <p className="text-[10px] leading-snug text-subtle">{hint}</p>}
        {trend}
      </div>
    </div>
  )
}

export function HealthRing({ value, size = 150, label = 'Network health' }) {
  const safe = value === null || value === undefined ? null : Math.max(0, Math.min(100, Number(value)))
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = safe === null ? circumference : circumference - (safe / 100) * circumference
  const color = safe === null ? 'var(--neutral)' : safe >= 90 ? 'var(--success)' : safe >= 70 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="var(--border-strong)" strokeWidth="9" opacity="0.55" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 800ms ease, stroke 400ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-[28px] font-bold tracking-tight text-app">
          {safe === null ? '—' : `${safe.toFixed(0)}%`}
        </span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-subtle">{label}</span>
      </div>
    </div>
  )
}

export function ProgressBar({ value, tone = 'wine', className = '' }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0))
  const colors = {
    wine: 'from-accent to-accent',
    sage: 'from-success to-success',
    ochre: 'from-warning to-warning',
    rust: 'from-danger to-danger',
    plum: 'from-plum to-plum',
    gold: 'from-gold to-gold',
  }
  return (
    <div className={cn('h-1.5 overflow-hidden bg-neutral/15', className)}>
      <div className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700', colors[tone] || colors.wine)} style={{ width: `${safe}%` }} />
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 text-center', compact ? 'py-8' : 'py-14')}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center border border-accent/25 bg-accent/[0.04] text-accent">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-app">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-[11px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Alert({ tone = 'info', title, children, action, className = '' }) {
  const palette = {
    info: 'border-accent/20 bg-accent/[0.06] text-accent',
    warning: 'border-warning/20 bg-warning/[0.06] text-warning',
    danger: 'border-danger/20 bg-danger/[0.06] text-danger',
    success: 'border-success/20 bg-success/[0.06] text-success',
  }
  const Icon = tone === 'danger' || tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info
  return (
    <div className={cn('flex items-start gap-3 border px-3.5 py-3 text-[11px] leading-relaxed', palette[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5 opacity-85' : ''}>{children}</div>
      </div>
      {action}
    </div>
  )
}

export function ErrorPanel({ message, onRetry }) {
  return (
    <div className="panel flex flex-col items-center gap-3 p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-app">Unable to load data</h3>
        <p className="mt-1 max-w-lg text-[11px] text-muted">{message}</p>
      </div>
      {onRetry && (
        <Button icon={RefreshCw} onClick={onRetry} size="sm">
          Retry
        </Button>
      )}
    </div>
  )
}

export function PageSkeleton({ cards = 4 }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, index) => (
          <div key={index} className="panel p-4">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-4 h-8 w-20" />
            <div className="skeleton mt-2 h-2.5 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="panel h-80 p-5 lg:col-span-2"><div className="skeleton h-full w-full" /></div>
        <div className="panel h-80 p-5"><div className="skeleton h-full w-full" /></div>
      </div>
    </div>
  )
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', icon: Icon }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={cn('modal-panel animate-fade-up', widths[size])} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-app bg-[var(--panel-solid)] px-5 py-4">
          <div className="flex items-start gap-3">
            {Icon && (
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center border border-accent/35 bg-accent/[0.06] text-accent">
                <Icon className="h-4 w-4" />
              </span>
            )}
            <div>
              <h2 className="text-base font-semibold text-app">{title}</h2>
              {subtitle && <p className="mt-0.5 text-[10.5px] text-subtle">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-subtle transition hover:bg-accent/5 hover:text-accent" aria-label="Close dialog">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-app bg-[var(--panel-solid)] px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', loading = false, danger = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-xs leading-relaxed text-muted">{message}</p>
    </Modal>
  )
}

export function Field({ label, hint, error, required, children, className = '' }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="label">{label}{required && <span className="ml-0.5 text-danger">*</span>}</span>}
      {children}
      {error ? <span className="mt-1 block text-[10px] text-danger">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={cn('search-box min-w-[180px]', className)}>
      <Search className="h-3.5 w-3.5" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="input py-2 text-xs" />
    </div>
  )
}

export function Select({ value, onChange, children, className = '', ...props }) {
  return (
    <div className={cn('relative', className)}>
      <select value={value} onChange={onChange} className="input appearance-none py-2 pr-8 text-xs" {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
    </div>
  )
}

export function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-xs font-medium text-app">{label}</p>
        {description && <p className="mt-0.5 text-[10.5px] leading-snug text-subtle">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 border transition-colors disabled:opacity-40',
          checked ? 'border-[var(--accent-fill)] bg-[var(--accent-fill)]' : 'border-neutral/30 bg-neutral/20',
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-3.5 w-3.5 shadow transition-transform',
          checked ? 'translate-x-[18px] bg-[var(--accent-ink)]' : 'translate-x-0.5 bg-white',
        )} />
      </button>
    </div>
  )
}

export function InfoNote({ children, className = '' }) {
  return (
    <p className={cn('flex items-start gap-2 text-[10.5px] leading-relaxed text-subtle', className)}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function RefreshStamp({ lastUpdated, refreshing, onRefresh }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-subtle">
      {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString('en-GB', { hour12: false })}</span>}
      <button onClick={onRefresh} className="inline-flex items-center gap-1 rounded px-1.5 py-1 transition hover:bg-accent/5 hover:text-accent" aria-label="Refresh data">
        <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
      </button>
    </div>
  )
}
