import { AlertTriangle, CheckCircle2, DatabaseZap, Info, ShieldAlert } from 'lucide-react'
import { Alert, Badge, ProgressBar, cn } from './ui'
import { formatNumber, relativeTime } from '../lib/utils'

export const SEVERITY_TONE = {
  Critical: 'danger',
  High: 'warning',
  Medium: 'info',
  Low: 'success',
}

export function SeverityBadge({ severity, dot = true }) {
  return (
    <Badge tone={SEVERITY_TONE[severity] || 'neutral'} dot={dot}>
      {severity || 'Unknown'}
    </Badge>
  )
}

export function ConfidenceMeter({ value, label = 'Confidence', className = '' }) {
  const pct = value == null ? null : Math.max(0, Math.min(100, Number(value) * 100))
  return (
    <div className={cn('min-w-[120px]', className)}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.1em] text-subtle">
        <span>{label}</span>
        <span className="font-mono font-semibold text-app">{pct == null ? '—' : `${formatNumber(pct, 0)}%`}</span>
      </div>
      <ProgressBar value={pct || 0} tone={pct != null && pct >= 70 ? 'sage' : 'ochre'} />
    </div>
  )
}

/**
 * Explicit state banner for engines that refuse to invent results. The engines
 * return insufficient_data / not_run / ready, and the dashboard mirrors that
 * state rather than substituting placeholder values.
 */
export function IntelStatusAlert({
  status,
  message,
  stale = false,
  available,
  required,
  windowHours,
  onRun,
  running = false,
  runLabel = 'Run analysis',
  notRunTitle = 'Analysis not run yet',
}) {
  if ((status === 'ready' || status === 'clear') && !stale) return null

  const insufficient = status === 'insufficient_data'
  const tone = insufficient || stale ? 'warning' : status === 'not_run' ? 'info' : 'success'
  const title = insufficient
    ? 'Insufficient telemetry for an estimate'
    : stale
      ? 'Results are stale'
      : status === 'not_run'
        ? notRunTitle
        : 'Analysis status'
  const Icon = insufficient ? DatabaseZap : stale ? AlertTriangle : status === 'clear' ? CheckCircle2 : Info

  return (
    <Alert
      tone={tone}
      title={title}
      action={
        onRun ? (
          <button
            type="button"
            onClick={onRun}
            disabled={running}
            className="btn-secondary btn-sm shrink-0"
          >
            {running ? 'Running…' : runLabel}
          </button>
        ) : null
      }
    >
      <p>{message}</p>
      {available != null && required != null && (
        <div className="mt-2 max-w-md">
          <div className="mb-1 flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.08em]">
            <span>Live measurements available</span>
            <span className="font-semibold">{available} / {required}</span>
          </div>
          <ProgressBar value={required ? Math.min(100, (available / required) * 100) : 0} tone={insufficient ? 'ochre' : 'sage'} />
          {windowHours ? <p className="mt-1 text-[9px] opacity-80">Observation window: last {windowHours} hours. Simulated records are excluded.</p> : null}
        </div>
      )}
    </Alert>
  )
}

function formatEvidenceValue(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Renders evidence arrays ({label,value,source}) or plain evidence objects. */
export function EvidenceList({ evidence, title = 'Measured evidence', className = '' }) {
  if (!evidence) return null
  const items = Array.isArray(evidence)
    ? evidence
    : Object.entries(evidence).map(([key, value]) => ({
        label: key.replaceAll('_', ' '),
        value: formatEvidenceValue(value),
        source: null,
      }))
  if (!items.length) return null

  return (
    <div className={cn('rounded-lg border border-app bg-[var(--bg-soft)] p-3', className)}>
      <p className="mb-2 font-mono text-[8.5px] font-bold uppercase tracking-[0.16em] text-subtle">{title}</p>
      <dl className="space-y-1.5">
        {items.slice(0, 12).map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex flex-col gap-0.5 text-[10px] sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <dt className="shrink-0 capitalize text-subtle">{String(item.label || '').replaceAll('_', ' ')}</dt>
            <dd className="min-w-0 break-words text-right font-medium text-app">
              {formatEvidenceValue(item.value)}
              {item.source ? <span className="ml-1.5 font-mono text-[8.5px] font-normal text-subtle">({item.source})</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function MethodFootnote({ method, modelVersion, generatedAt, disclaimer, safetyNote, className = '' }) {
  return (
    <div className={cn('space-y-2 border-t border-app pt-3 text-[9.5px] leading-relaxed text-subtle', className)}>
      {disclaimer && (
        <p className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
          <span>{disclaimer}</span>
        </p>
      )}
      {safetyNote && (
        <p className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
          <span>{safetyNote}</span>
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[8.5px] uppercase tracking-[0.08em]">
        <span>Method · {method || '—'}</span>
        {modelVersion && <span>Model · {modelVersion}</span>}
        {generatedAt && <span>Generated · {relativeTime(generatedAt)}</span>}
      </p>
    </div>
  )
}

export function SnapshotStamp({ generatedAt, label = 'Snapshot' }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-subtle">
      <DatabaseZap className="h-3 w-3 text-accent" />
      {label} · {relativeTime(generatedAt)}
    </span>
  )
}
