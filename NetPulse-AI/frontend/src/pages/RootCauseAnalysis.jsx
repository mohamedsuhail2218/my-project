import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Download,
  GitBranch,
  ListChecks,
  Play,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
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
  RefreshStamp,
  SectionHeader,
  StatCard,
  cn,
} from '../components/ui'
import {
  ConfidenceMeter,
  EvidenceList,
  IntelStatusAlert,
  MethodFootnote,
  SeverityBadge,
} from '../components/IntelligenceUI'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import { formatDateTime, formatNumber, relativeTime } from '../lib/utils'
import { api, downloadCsv, getErrorMessage } from '../services/api'

const STATUS_TONE = { Open: 'warning', Acknowledged: 'info', Resolved: 'success' }
const FILTERS = ['All', 'Open', 'Acknowledged', 'Resolved']

function InvestigationCard({ item, manager, updating, onStatus }) {
  const resolved = item.status === 'Resolved'
  return (
    <article className={cn(
      'panel overflow-hidden border-l-2',
      item.severity === 'Critical' ? 'border-l-danger' : item.severity === 'High' ? 'border-l-warning' : 'border-l-accent',
    )}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={item.severity} />
            <Badge tone={STATUS_TONE[item.status] || 'neutral'} dot>{item.status}</Badge>
            <Badge tone="neutral">{item.access_point_name || 'Network-wide'}</Badge>
            {item.related_incident_ids?.length > 0 && <Badge tone="plum">{item.related_incident_ids.length} correlated record(s)</Badge>}
          </div>
          <h3 className="mt-2 text-[12.5px] font-semibold leading-snug text-app">{item.problem}</h3>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">{item.probable_cause}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-subtle">
            <span>Investigation #{item.id}</span>
            <span>{item.data_points} measurements in window</span>
            <span>Generated {relativeTime(item.generated_at)}</span>
            {item.resolved_at && <span>Resolved {relativeTime(item.resolved_at)}</span>}
          </div>
        </div>
        <ConfidenceMeter value={item.confidence} className="w-full sm:w-[140px]" />
      </div>

      <div className="grid gap-3 border-t border-app p-4 lg:grid-cols-2">
        <EvidenceList evidence={item.evidence} title="Evidence used by the engine" />
        <div className="rounded-lg border border-app bg-[var(--bg-soft)] p-3">
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.16em] text-subtle">
            <ListChecks className="h-3 w-3 text-accent" /> Recommended diagnostic steps
          </p>
          <ol className="space-y-1.5">
            {(item.recommended_actions || []).map((action, index) => (
              <li key={action} className="flex items-start gap-2 text-[10px] leading-relaxed text-muted">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-accent/25 bg-accent/10 font-mono text-[8px] text-accent">{index + 1}</span>
                <span>{action}</span>
              </li>
            ))}
            {!item.recommended_actions?.length && <li className="text-[10px] text-subtle">No diagnostic steps were produced.</li>}
          </ol>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-app bg-accent/[0.02] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-subtle">{item.method}</span>
        {manager ? (
          <div className="flex flex-wrap gap-2">
            {item.status === 'Open' && (
              <Button size="sm" variant="secondary" icon={CheckCircle2} loading={updating} onClick={() => onStatus(item.id, 'Acknowledged')}>
                Acknowledge
              </Button>
            )}
            {!resolved && (
              <Button size="sm" variant="primary" icon={ShieldCheck} loading={updating} onClick={() => onStatus(item.id, 'Resolved')}>
                Mark resolved
              </Button>
            )}
            {resolved && (
              <Button size="sm" variant="secondary" icon={RotateCcw} loading={updating} onClick={() => onStatus(item.id, 'Open')}>
                Reopen
              </Button>
            )}
          </div>
        ) : <Badge tone="neutral">Read-only</Badge>}
      </div>
    </article>
  )
}

export default function RootCauseAnalysis() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [running, setRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [filter, setFilter] = useState('All')
  const { data, loading, error, reload, refreshing, lastUpdated } = useApi('/intelligence/root-cause', { pollMs: 60000 })

  const investigations = data?.investigations || []
  const summary = data?.summary || {}
  const manager = hasRole('analyst')
  const filtered = filter === 'All' ? investigations : investigations.filter((item) => item.status === filter)

  async function runInvestigation() {
    setRunning(true)
    try {
      const response = await api.post('/intelligence/root-cause/run', {})
      const tone = response.data.status === 'ok' ? 'success' : response.data.status === 'clear' ? 'info' : 'warning'
      toast(response.data.message, tone, 'Root-cause analysis')
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Investigation failed')
    } finally {
      setRunning(false)
    }
  }

  async function updateStatus(id, status) {
    setUpdatingId(id)
    try {
      await api.patch(`/intelligence/root-cause/${id}`, { status })
      toast(`Investigation #${id} marked ${status.toLowerCase()}`, 'success')
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Could not update investigation')
    } finally {
      setUpdatingId(null)
    }
  }

  async function exportCsv() {
    setExporting(true)
    try {
      await downloadCsv('/intelligence/export.csv?kind=root-cause', 'netpulse-root-cause.csv')
      toast('Root-cause investigations exported as CSV', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  if (loading && !data) return <PageSkeleton cards={4} />
  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Correlated diagnostics"
        title="Root cause analysis"
        description="Rule-based investigations correlate persisted measurements, anomaly events and open tickets. Every hypothesis cites its evidence and confidence; no configuration is changed automatically."
        actions={
          <>
            <RefreshStamp lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} />
            <Button size="sm" icon={Download} loading={exporting} onClick={exportCsv}>Export CSV</Button>
            {manager && <Button size="sm" variant="primary" icon={Play} loading={running} onClick={runInvestigation}>Investigate latest</Button>}
          </>
        }
      />

      <IntelStatusAlert
        status={data?.status}
        message={data?.message}
        onRun={manager ? runInvestigation : null}
        running={running}
        runLabel="Investigate latest"
        notRunTitle="Evidence is ready — no investigation run yet"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open investigations" value={summary.open ?? 0} hint={`${summary.total ?? 0} total in the register`} icon={Stethoscope} accent="ochre" loading={loading} />
        <StatCard label="Critical & high" value={(summary.critical ?? 0) + (summary.high ?? 0)} hint={`${summary.critical ?? 0} critical · ${summary.high ?? 0} high`} icon={GitBranch} accent="rust" loading={loading} />
        <StatCard label="Resolved" value={summary.resolved ?? 0} hint="Acknowledged resolutions in the register" icon={ShieldCheck} accent="sage" loading={loading} />
        <StatCard label="Latest analysis" value={summary.latest_at ? relativeTime(summary.latest_at) : null} hint={summary.latest_at ? formatDateTime(summary.latest_at) : 'Not run yet'} icon={Activity} accent="wine" loading={loading} />
      </div>

      <Alert tone="info" title="Safe diagnostic guardrails">
        {data?.safety_note || 'Root-cause findings are diagnostic hypotheses. NetPulse AI never changes router, switch or access-point configuration automatically.'}
      </Alert>

      <section className="panel overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-app p-4 lg:flex-row lg:items-center">
          <SectionHeader icon={GitBranch} title="Investigation queue" subtitle="Probable causes, measured evidence and safe next steps" />
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <button
                key={option}
                onClick={() => setFilter(option)}
                className={cn(
                  'rounded-full border px-2.5 py-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] transition',
                  filter === option ? 'border-accent/40 bg-accent/10 text-accent' : 'border-app text-subtle hover:border-accent/25 hover:text-app',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3 p-4">
          {filtered.map((item) => (
            <InvestigationCard
              key={item.id}
              item={item}
              manager={manager}
              updating={updatingId === item.id}
              onStatus={updateStatus}
            />
          ))}
          {!filtered.length && (
            <EmptyState
              icon={Stethoscope}
              title={investigations.length ? `No ${filter.toLowerCase()} investigations` : 'No investigations yet'}
              description={
                investigations.length
                  ? 'Choose another status filter to review the rest of the register.'
                  : data?.status === 'insufficient_data'
                    ? data.message
                    : 'Run an investigation against the latest live measurement. The engine returns a clear state when no fault signature is present.'
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {manager && <Button size="sm" variant="primary" icon={Play} loading={running} onClick={runInvestigation}>Investigate latest</Button>}
                  <Link to="/monitoring" className="btn-secondary btn-sm"><Activity className="h-3.5 w-3.5" /> Live monitoring</Link>
                </div>
              }
            />
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <div className="panel p-4">
          <SectionHeader icon={ListChecks} title="How evidence becomes a hypothesis" subtitle="Deterministic rules, no black-box claims" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ['Connectivity failure', 'Probe offline → Critical. Check power, uplink, gateway and DNS.'],
              ['Congestion', 'Loss and latency both above threshold → High. Inspect load and QoS.'],
              ['Packet loss', 'Loss above threshold → High/Medium depending on magnitude.'],
              ['High latency', 'Latency above threshold → High/Medium depending on magnitude.'],
              ['Jitter', 'Jitter above 15 ms → Medium instability hypothesis.'],
              ['Correlated anomaly', 'A nearby anomaly without a threshold breach is reported as a hypothesis.'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-lg border border-app bg-accent/[0.03] p-2.5">
                <p className="text-[10px] font-semibold text-app">{title}</p>
                <p className="mt-1 text-[9px] leading-relaxed text-subtle">{text}</p>
              </div>
            ))}
          </div>
          <InfoNote className="mt-3">Confidence rises with correlated anomalies and falls when the source measurement is older than six hours.</InfoNote>
        </div>
        <div className="panel p-4">
          <SectionHeader icon={ShieldCheck} title="Engine status" subtitle="Persisted investigations only" />
          <dl className="mt-3 space-y-2 text-[10px]">
            {[
              ['Method', data?.method || '—'],
              ['Register', `${summary.total ?? 0} investigations`],
              ['Latest', summary.latest_at ? formatDateTime(summary.latest_at) : 'Not run yet'],
              ['Generated', data?.generated_at ? relativeTime(data.generated_at) : '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3">
                <dt className="text-subtle">{label}</dt>
                <dd className="max-w-[62%] text-right font-medium text-app">{value}</dd>
              </div>
            ))}
          </dl>
          <Link to="/issues" className="mt-4 flex items-center justify-between rounded-lg border border-app bg-accent/[0.03] px-3 py-2.5 text-[10px] font-medium text-muted transition hover:border-accent/25 hover:text-app">
            Review issue register <ArrowRight className="h-3 w-3 text-accent" />
          </Link>
        </div>
      </div>

      <MethodFootnote
        method={data?.method}
        generatedAt={data?.generated_at}
        disclaimer={data?.disclaimer}
        safetyNote={data?.safety_note}
      />
    </div>
  )
}
