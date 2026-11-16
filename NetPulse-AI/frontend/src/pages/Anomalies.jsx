import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  FlaskConical,
  Gauge,
  Info,
  Radar,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  TrendingUp,
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
  SectionHeader,
  Select,
  StatusBadge,
  cn,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import { formatDateTime, formatNumber, relativeTime } from '../lib/utils'
import { api, getErrorMessage } from '../services/api'

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low']
const SEVERITY_TONE = { Critical: 'danger', High: 'warning', Medium: 'info', Low: 'success' }
const SEVERITY_COLOR = { Critical: 'rust', High: 'ochre', Medium: 'wine', Low: 'sage' }

function FeatureGrid({ anomaly }) {
  const z = anomaly.features?.robust_z || {}
  const medians = anomaly.features?.baseline_medians || {}
  const items = [
    ['Latency', anomaly.features?.latency_ms, 'ms', z.latency, medians.latency_ms],
    ['Packet loss', anomaly.features?.packet_loss_pct, '%', z.packet_loss, medians.packet_loss_pct],
    ['Jitter', anomaly.features?.jitter_ms, 'ms', z.jitter, medians.jitter_ms],
  ]
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {items.map(([label, value, unit, robustZ, baseline]) => (
        <div key={label} className="rounded-lg border border-app bg-accent/[0.03] p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[9px] uppercase tracking-wider text-subtle">{label}</p>
            <span className={cn('text-[9px] font-medium', (robustZ || 0) >= 4.5 ? 'text-danger' : (robustZ || 0) >= 3 ? 'text-warning' : 'text-success')}>
              z {robustZ != null ? formatNumber(robustZ) : '—'}
            </span>
          </div>
          <p className="mt-1 font-mono text-[12px] font-semibold text-app">{value != null ? `${formatNumber(value, 2)} ${unit}` : '—'}</p>
          <p className="mt-0.5 text-[8.5px] text-subtle">Baseline median {baseline != null ? `${formatNumber(baseline)} ${unit}` : '—'}</p>
        </div>
      ))}
    </div>
  )
}

function AnomalyCard({ anomaly, expanded, onToggle }) {
  const score = Math.abs(Number(anomaly.anomaly_score) || 0)
  return (
    <div className={cn('rounded-xl border bg-accent/[0.02] transition', anomaly.severity === 'Critical' ? 'border-danger/20' : 'border-app')}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-3.5 text-left">
        <span className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
          anomaly.severity === 'Critical' ? 'border-danger/20 bg-danger/10 text-danger' : anomaly.severity === 'High' ? 'border-warning/20 bg-warning/10 text-warning' : 'border-accent/20 bg-accent/10 text-accent',
        )}>
          <ShieldAlert className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={anomaly.severity} />
            <Badge tone={anomaly.used_sample_baseline ? 'plum' : 'success'}>{anomaly.used_sample_baseline ? 'Sample-fitted model' : 'Real-history model'}</Badge>
            <span className="text-[9px] text-subtle">{formatDateTime(anomaly.detected_at)}</span>
          </span>
          <span className="mt-1.5 block line-clamp-2 text-[11px] leading-relaxed text-muted">{anomaly.explanation}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-3 text-[9px] text-subtle">
            <span className="font-mono">score {formatNumber(anomaly.anomaly_score, 3)}</span>
            <span>Measurement #{anomaly.measurement_id || '—'}</span>
            <span>{anomaly.access_point_id ? `AP #${anomaly.access_point_id}` : 'Host probe'}</span>
            <span>{relativeTime(anomaly.detected_at)}</span>
          </span>
        </span>
        {expanded ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-subtle" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-subtle" />}
      </button>
      {expanded && (
        <div className="border-t border-app px-3.5 py-3.5">
          <FeatureGrid anomaly={anomaly} />
          <div className="mt-3 rounded-lg border border-app bg-accent/[0.03] p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold text-app"><Info className="h-3 w-3 text-accent" /> Why this was flagged</p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted">{anomaly.explanation}</p>
            <p className="mt-2 text-[9px] leading-relaxed text-subtle">
              Model: {anomaly.model_version} · Raw forest score {formatNumber(anomaly.features?.model_raw_score, 4)}. This is a statistical outlier statement, not a fault prediction.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Anomalies() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [severity, setSeverity] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const { data, loading, error, reload, lastUpdated } = useApi('/anomalies', { params: { limit: 200 }, pollMs: 30000 })
  const modelInfo = useApi('/anomalies/model-info', { pollMs: 60000 })

  const allAnomalies = data?.anomalies || []
  const summary = data?.summary || {}
  const filtered = useMemo(
    () => (severity ? allAnomalies.filter((item) => item.severity === severity) : allAnomalies),
    [allAnomalies, severity],
  )
  const maxSeverityCount = Math.max(1, ...SEVERITIES.map((level) => summary[level] || 0))

  async function detect() {
    setDetecting(true)
    try {
      const response = await api.post('/anomalies/detect')
      toast(response.data.message, response.data.anomalies_found ? 'warning' : 'success', 'Anomaly detection complete')
      reload()
      modelInfo.reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Detection failed')
    } finally {
      setDetecting(false)
    }
  }

  if (loading && !data) return <PageSkeleton cards={4} />
  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Machine learning operations"
        title="AI anomaly detection"
        description="Isolation Forest evaluates real latency, packet-loss and jitter observations for statistical outliers. Every finding includes an explanation and detection timestamp."
        actions={
          hasRole('analyst') ? <Button variant="primary" size="sm" icon={ScanSearch} loading={detecting} onClick={detect}>Run detection</Button> : null
        }
      />

      <Alert tone="info" title="Interpret AI responsibly">
        An anomaly is an unusual statistical observation, not proof of a fault and not a guaranteed prediction of future network failure. Validate findings with live checks and rule-based troubleshooting.
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SEVERITIES.map((level) => (
          <div key={level} className={cn('panel p-4', level === 'Critical' && 'border-danger/15')}>
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-subtle">{level} severity</p>
              <StatusBadge status={level} />
            </div>
            <p className="mt-2 font-display text-[24px] font-bold text-app">{summary[level] ?? 0}</p>
            <ProgressBar value={((summary[level] || 0) / maxSeverityCount) * 100} tone={SEVERITY_COLOR[level]} className="mt-2" />
            <p className="mt-1.5 text-[9.5px] text-subtle">All recorded anomaly events</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <section className="panel">
          <div className="flex flex-col justify-between gap-3 border-b border-app p-4 sm:flex-row sm:items-center">
            <SectionHeader icon={BrainCircuit} title="Detected anomalies" subtitle={`${filtered.length} event(s) shown · ${data?.window?.total ?? 0} in the last 24h`} />
            <div className="flex items-center gap-2">
              <Select value={severity} onChange={(event) => setSeverity(event.target.value)} className="w-[135px]">
                <option value="">All severities</option>
                {SEVERITIES.map((level) => <option key={level} value={level}>{level}</option>)}
              </Select>
            </div>
          </div>
          <div className="space-y-2.5 p-4">
            {filtered.map((anomaly) => (
              <AnomalyCard key={anomaly.id} anomaly={anomaly} expanded={expanded === anomaly.id} onToggle={() => setExpanded((value) => (value === anomaly.id ? null : anomaly.id))} />
            ))}
            {!filtered.length && (
              <EmptyState
                icon={FlaskConical}
                title={allAnomalies.length ? 'No anomalies match this severity' : 'No anomaly events recorded'}
                description={allAnomalies.length ? 'Choose another severity filter.' : 'Run detection against the latest real measurements. The detector will use the labelled synthetic baseline until enough live observations exist.'}
                action={hasRole('analyst') ? <Button variant="primary" icon={ScanSearch} loading={detecting} onClick={detect}>Run first detection</Button> : null}
              />
            )}
          </div>
          <div className="border-t border-app px-4 py-3">
            <InfoNote>{data?.disclaimer}</InfoNote>
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel p-4">
            <SectionHeader icon={Cpu} title="Model configuration" subtitle="Interpretable Isolation Forest" />
            <div className="mt-3 space-y-2.5 text-[10px]">
              {[
                ['Algorithm', modelInfo.data?.algorithm || 'Isolation Forest'],
                ['Version', modelInfo.data?.model_version || '—'],
                ['Contamination', modelInfo.data?.contamination ?? '—'],
                ['Real observations', modelInfo.data?.real_live_measurements ?? '—'],
                ['Minimum for real fit', modelInfo.data?.minimum_real_samples ?? '—'],
                ['Cold-start regime', modelInfo.data?.cold_start_mode || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2 border-b border-app pb-2 last:border-0 last:pb-0">
                  <span className="text-subtle">{label}</span>
                  <span className="text-right font-medium text-app">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(modelInfo.data?.features || []).map((feature) => <span key={feature} className="code-chip">{feature}</span>)}
            </div>
            {modelInfo.data?.cold_start_note && <InfoNote className="mt-3">{modelInfo.data.cold_start_note}</InfoNote>}
          </section>

          <section className="panel p-4">
            <SectionHeader icon={Sparkles} title="Detection workflow" subtitle="How the pipeline works" />
            <ol className="mt-3 space-y-3">
              {[
                ['01', 'Collect', 'Live probes persist latency, loss and jitter.'],
                ['02', 'Fit', 'The forest fits real history or a labelled cold-start baseline.'],
                ['03', 'Score', 'Recent live observations receive anomaly scores.'],
                ['04', 'Explain', 'Robust deviations generate a plain-language explanation.'],
                ['05', 'Escalate', 'High and Critical events can open issue tickets.'],
              ].map(([number, title, text]) => (
                <li key={number} className="flex gap-3">
                  <span className="font-mono text-[9px] text-accent">{number}</span>
                  <div><p className="text-[10.5px] font-semibold text-app">{title}</p><p className="mt-0.5 text-[9.5px] leading-relaxed text-subtle">{text}</p></div>
                </li>
              ))}
            </ol>
          </section>

          <div className="rounded-xl border border-accent/15 bg-accent/[0.04] p-3.5">
            <p className="flex items-center gap-2 text-[10px] font-semibold text-accent"><Gauge className="h-3.5 w-3.5" /> Operational takeaway</p>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-subtle">Use the explanation to investigate, not to assume failure. Pair AI findings with the deterministic rule engine and live measurements.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-app pt-3 text-[9px] text-subtle">
        <span className="flex items-center gap-1.5"><Database className="h-3 w-3" /> {data?.summary?.total ?? 0} anomaly events retained</span>
        <span>Updated {relativeTime(lastUpdated)}</span>
      </div>
    </div>
  )
}
