import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  DatabaseZap,
  Download,
  Gauge,
  LineChart,
  Play,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Wifi,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  InfoNote,
  PageHeader,
  PageSkeleton,
  ProgressBar,
  RefreshStamp,
  SectionHeader,
  StatCard,
  cn,
} from '../components/ui'
import {
  ConfidenceMeter,
  IntelStatusAlert,
  MethodFootnote,
  SeverityBadge,
} from '../components/IntelligenceUI'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import { formatDateTime, formatNumber, relativeTime } from '../lib/utils'
import { api, downloadCsv, getErrorMessage } from '../services/api'

const WEIGHTS = [
  { key: 'availability', label: 'Probe availability', max: 40, hint: 'Offline probes carry the largest weight' },
  { key: 'packet_loss', label: 'Packet loss', max: 25, hint: 'Measured loss vs configured threshold' },
  { key: 'latency', label: 'Latency level', max: 20, hint: 'Mean round-trip time vs twice the threshold' },
  { key: 'jitter', label: 'Jitter', max: 15, hint: 'Stability relative to a 30 ms guideline' },
]

function scoreTone(score) {
  if (score >= 75) return 'rust'
  if (score >= 50) return 'ochre'
  if (score >= 25) return 'wine'
  return 'sage'
}

function FeatureGrid({ item }) {
  const features = item.features || {}
  const components = features.components || {}
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Mean latency', features.mean_latency_ms != null ? `${formatNumber(features.mean_latency_ms)} ms` : '—'],
          ['Mean packet loss', features.mean_packet_loss_pct != null ? `${formatNumber(features.mean_packet_loss_pct, 2)}%` : '—'],
          ['Mean jitter', features.mean_jitter_ms != null ? `${formatNumber(features.mean_jitter_ms)} ms` : '—'],
          ['Online probes', features.online_ratio_pct != null ? `${formatNumber(features.online_ratio_pct)}%` : '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-app bg-accent/[0.03] p-2.5">
            <p className="text-[8.5px] uppercase tracking-[0.1em] text-subtle">{label}</p>
            <p className="mt-1 font-mono text-[12px] font-semibold text-app">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {WEIGHTS.map((weight) => {
          const value = Number(components[weight.key] || 0)
          return (
            <div key={weight.key} className="rounded-lg border border-app bg-[var(--bg-soft)] p-2.5">
              <div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.08em] text-subtle">
                <span>{weight.label}</span>
                <span className="font-mono text-app">{formatNumber(value)} / {weight.max}</span>
              </div>
              <ProgressBar value={(value / weight.max) * 100} tone={value / weight.max >= 0.65 ? 'rust' : value > 0 ? 'ochre' : 'sage'} className="mt-1.5" />
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-subtle">
        <span>Window points: <span className="font-mono text-app">{features.window_points ?? '—'}</span></span>
        <span>Recent points: <span className="font-mono text-app">{features.recent_points ?? '—'}</span></span>
        <span>Latency trend: <span className="font-mono text-app">{features.latency_trend_pct != null ? `${formatNumber(features.latency_trend_pct)}%` : 'needs 4+ readings'}</span></span>
        <span>Primary driver: <span className="capitalize text-app">{String(features.primary_driver || '—').replaceAll('_', ' ')}</span></span>
      </div>
    </div>
  )
}

function PredictionCard({ item, expanded, onToggle }) {
  const features = item.features || {}
  return (
    <article className="panel overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-accent/[0.02]">
        <span className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
          item.severity === 'Critical' ? 'border-danger/25 bg-danger/10 text-danger'
            : item.severity === 'High' ? 'border-warning/25 bg-warning/10 text-warning'
              : item.severity === 'Medium' ? 'border-accent/25 bg-accent/10 text-accent'
                : 'border-success/25 bg-success/10 text-success',
        )}>
          <TrendingUp className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-app">
              {item.scope === 'network' ? 'Network-wide' : item.access_point_name || `Access point #${item.access_point_id}`}
            </span>
            <SeverityBadge severity={item.severity} />
            <Badge tone="neutral">{item.horizon_hours}h horizon</Badge>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-subtle">
            <span>Risk {formatNumber(item.risk_score, 0)}/100</span>
            <span>Confidence {formatNumber(item.confidence * 100, 0)}%</span>
            <span>{item.data_points} live points</span>
            <span>{relativeTime(item.predicted_at)}</span>
          </span>
          <span className="mt-1.5 line-clamp-2 block text-[10px] leading-relaxed text-muted">{item.explanation}</span>
        </span>
        <span className="mt-1 shrink-0 text-subtle">{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
      </button>
      <div className="flex items-center gap-3 border-t border-app px-4 py-2.5">
        <ProgressBar value={item.risk_score} tone={scoreTone(item.risk_score)} className="flex-1" />
        <span className="font-mono text-[10px] font-semibold text-app">{formatNumber(item.risk_score, 0)} / 100</span>
      </div>
      {expanded && (
        <div className="space-y-3 border-t border-app p-4">
          <FeatureGrid item={item} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-app bg-[var(--bg-soft)] p-2.5">
              <p className="text-[8.5px] uppercase tracking-[0.1em] text-subtle">Thresholds in force</p>
              <p className="mt-1 text-[10px] text-app">
                Latency {features.latency_threshold_ms != null ? `${formatNumber(features.latency_threshold_ms, 0)} ms` : '—'} ·
                loss {features.packet_loss_threshold_pct != null ? `${formatNumber(features.packet_loss_threshold_pct, 1)}%` : '—'}
              </p>
            </div>
            <ConfidenceMeter value={item.confidence} label="Model confidence" />
          </div>
          <MethodFootnote method={item.method} modelVersion={item.model_version} />
        </div>
      )}
    </article>
  )
}

export default function PredictiveAnalytics() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [running, setRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const { data, loading, error, reload, refreshing, lastUpdated } = useApi('/intelligence/predictions', { pollMs: 60000 })

  const predictions = data?.predictions || []
  const summary = data?.summary || {}
  const highest = summary.highest_risk
  const manager = hasRole('analyst')

  async function runAnalysis() {
    setRunning(true)
    try {
      const response = await api.post('/intelligence/predictions/run')
      toast(response.data.message, response.data.status === 'insufficient_data' ? 'warning' : 'success', 'Risk analysis')
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Risk analysis failed')
    } finally {
      setRunning(false)
    }
  }

  async function exportCsv() {
    setExporting(true)
    try {
      await downloadCsv('/intelligence/export.csv?kind=predictions', 'netpulse-failure-risk.csv')
      toast('Prediction feed exported as CSV', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  if (loading && !data) return <PageSkeleton cards={4} />
  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />

  const available = data?.available_points
  const required = data?.minimum_required

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Predictive intelligence"
        title="Predictive analytics"
        description="Explainable failure-risk estimates computed locally from measured availability, packet loss, latency and jitter. The engine reports insufficient telemetry rather than inventing a forecast."
        actions={
          <>
            <RefreshStamp lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} />
            <Button size="sm" icon={Download} loading={exporting} onClick={exportCsv}>Export CSV</Button>
            {manager && <Button size="sm" variant="primary" icon={Play} loading={running} onClick={runAnalysis}>Run risk analysis</Button>}
          </>
        }
      />

      <IntelStatusAlert
        status={data?.status}
        message={data?.message}
        stale={data?.stale}
        available={available}
        required={required}
        windowHours={data?.window_hours}
        onRun={manager ? runAnalysis : null}
        running={running}
        runLabel="Generate estimates"
        notRunTitle="Telemetry is ready — analysis not run yet"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Highest failure risk"
          value={summary.highest_risk ? formatNumber(summary.highest_risk.risk_score, 0) : null}
          unit={summary.highest_risk ? '/ 100' : ''}
          hint={summary.highest_risk ? `${summary.highest_severity} · ${summary.highest_risk.scope === 'network' ? 'network-wide' : summary.highest_risk.access_point_name || 'access point'}` : 'No estimate yet'}
          icon={TrendingUp}
          accent="rust"
          loading={loading}
        />
        <StatCard
          label="Scopes at risk"
          value={summary.at_risk ?? 0}
          hint={`${summary.total ?? 0} scope(s) assessed · risk ≥ 50`}
          icon={ShieldAlert}
          accent="ochre"
          loading={loading}
        />
        <StatCard
          label="Average risk"
          value={summary.average_risk != null ? formatNumber(summary.average_risk, 0) : null}
          unit={summary.average_risk != null ? '/ 100' : ''}
          hint="Across current estimates"
          icon={Gauge}
          accent="wine"
          loading={loading}
        />
        <StatCard
          label="Live telemetry"
          value={available ?? 0}
          hint={required != null ? `${required} required in ${data?.window_hours || 72}h window` : 'Measurements available'}
          icon={DatabaseZap}
          accent="sage"
          loading={loading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <section className="panel">
          <div className="flex flex-col justify-between gap-2 border-b border-app p-4 sm:flex-row sm:items-center">
            <SectionHeader icon={LineChart} title="Failure risk by scope" subtitle="Weighted statistical estimate over the next 24 hours" />
            {data?.latest_at && <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-subtle">Latest {relativeTime(data.latest_at)}</span>}
          </div>
          <div className="divide-y divide-[var(--border)]">
            {predictions.map((item) => {
              const score = Number(item.risk_score || 0)
              return (
                <button
                  key={item.id}
                  onClick={() => setExpanded(item.id)}
                  className="flex w-full flex-col gap-2 px-4 py-3.5 text-left transition hover:bg-accent/[0.025]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <SeverityBadge severity={item.severity} />
                      <span className="truncate text-[11px] font-semibold text-app">
                        {item.scope === 'network' ? 'Network-wide' : item.access_point_name || `Access point #${item.access_point_id}`}
                      </span>
                    </div>
                    <span className="font-display text-[20px] leading-none text-app">{formatNumber(score, 0)}<span className="ml-0.5 text-[9px] font-body font-normal text-subtle">/100</span></span>
                  </div>
                  <ProgressBar value={score} tone={scoreTone(score)} />
                  <div className="flex flex-wrap justify-between gap-2 font-mono text-[8.5px] uppercase tracking-[0.08em] text-subtle">
                    <span>{item.data_points} measurements · confidence {formatNumber(item.confidence * 100, 0)}%</span>
                    <span>{relativeTime(item.predicted_at)}</span>
                  </div>
                </button>
              )
            })}
            {!predictions.length && (
              <EmptyState
                icon={BrainCircuit}
                title={data?.status === 'insufficient_data' ? 'Not enough telemetry to estimate risk' : 'No risk estimates generated'}
                description={data?.message || 'Run live monitoring to gather real measurements, then generate risk estimates.'}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link to="/monitoring" className="btn-secondary btn-sm"><Activity className="h-3.5 w-3.5" /> Live monitoring</Link>
                    {manager && <Button size="sm" variant="primary" icon={Play} loading={running} onClick={runAnalysis}>Run analysis</Button>}
                  </div>
                }
              />
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel p-4">
            <SectionHeader icon={BrainCircuit} title="How the model scores risk" subtitle="Transparent local model · no external LLM" />
            <div className="mt-4 space-y-3">
              {WEIGHTS.map((weight) => (
                <div key={weight.key}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-app">{weight.label}</span>
                    <span className="font-mono text-[9px] text-subtle">{weight.max} pts max</span>
                  </div>
                  <ProgressBar value={(weight.max / 40) * 100} tone="wine" />
                  <p className="mt-1 text-[8.5px] leading-relaxed text-subtle">{weight.hint}</p>
                </div>
              ))}
            </div>
            <dl className="mt-4 space-y-2 border-t border-app pt-3 text-[10px]">
              {[
                ['Observation window', `${data?.window_hours || 72} hours`],
                ['Minimum measurements', required ?? 8],
                ['Estimate horizon', '24 hours'],
                ['Engine', data?.method || 'Weighted threshold model'],
                ['Model version', data?.model_version || '—'],
                ['Latest run', data?.latest_at ? formatDateTime(data.latest_at) : 'Not run yet'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <dt className="text-subtle">{label}</dt>
                  <dd className="max-w-[62%] text-right font-medium text-app">{value}</dd>
                </div>
              ))}
            </dl>
            <InfoNote className="mt-3">
              {available == null ? 'Telemetry count unavailable.' : `${available} live measurements are in the current window. Simulated records are excluded.`}
            </InfoNote>
          </section>

          <section className="panel p-4">
            <SectionHeader icon={Sparkles} title="Primary risk driver" subtitle={highest ? 'From the highest current estimate' : 'Available after the first estimate'} />
            {highest?.features ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] capitalize text-muted">
                    {String(highest.features.primary_driver || 'none').replaceAll('_', ' ')}
                  </span>
                  <Badge tone={highest.severity === 'Critical' ? 'danger' : highest.severity === 'High' ? 'warning' : 'info'}>{highest.severity}</Badge>
                </div>
                <ProgressBar value={highest.risk_score} tone={scoreTone(highest.risk_score)} />
                <p className="text-[9.5px] leading-relaxed text-subtle">{highest.explanation}</p>
              </div>
            ) : (
              <EmptyState compact icon={Wifi} title="No driver yet" description="Run monitoring and analysis to surface the dominant measured contributor." />
            )}
          </section>
        </div>
      </div>

      {predictions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader icon={TrendingUp} title="Risk assessments" subtitle="Expand an assessment to inspect every weighted component" />
            <Badge tone={data?.stale ? 'warning' : 'success'}>{data?.stale ? 'Stale' : 'Current'}</Badge>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {predictions.map((item) => (
              <PredictionCard
                key={item.id}
                item={item}
                expanded={expanded === item.id}
                onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
              />
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col justify-between gap-2 border-t border-app pt-3 sm:flex-row sm:items-center">
        <Alert tone="info" className="flex-1 border-0 bg-transparent p-0">
          <span className="text-[9.5px] leading-relaxed">{data?.disclaimer}</span>
        </Alert>
        <Link to="/root-cause" className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-accent hover:underline">
          Investigate probable causes <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
