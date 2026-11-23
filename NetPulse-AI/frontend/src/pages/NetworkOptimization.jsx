import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Gauge,
  ListChecks,
  Play,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  XCircle,
} from 'lucide-react'
import {
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
  EvidenceList,
  IntelStatusAlert,
  MethodFootnote,
  SeverityBadge,
} from '../components/IntelligenceUI'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import { formatDateTime, formatNumber, relativeTime, titleCase } from '../lib/utils'
import { api, downloadCsv, getErrorMessage } from '../services/api'

const CATEGORY_TONE = {
  packet_loss: 'danger',
  latency: 'warning',
  jitter: 'info',
  availability: 'plum',
}

function RecommendationCard({ item, manager, updating, onStatus }) {
  return (
    <article className="panel overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={item.severity} />
          <Badge tone={CATEGORY_TONE[item.category] || 'neutral'}>{item.category_label || titleCase(item.category)}</Badge>
          <Badge tone={item.status === 'Planned' ? 'success' : 'info'} dot>{item.status}</Badge>
          <Badge tone="neutral">{item.access_point_name || 'Network-wide'}</Badge>
        </div>
        <h3 className="mt-2 text-[12px] font-semibold text-app">{item.title}</h3>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{item.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-subtle">
          <span>{item.data_points} live measurements</span>
          <span>Updated {relativeTime(item.updated_at || item.generated_at)}</span>
          <span>Advisory only</span>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
          <EvidenceList evidence={item.evidence} title="Measured basis" />
          <div className="rounded-lg border border-app bg-[var(--bg-soft)] p-3">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.16em] text-subtle">
              <ListChecks className="h-3 w-3 text-accent" /> Suggested actions
            </p>
            <ol className="space-y-1.5">
              {(item.actions || []).map((action, index) => (
                <li key={action} className="flex items-start gap-2 text-[9.5px] leading-relaxed text-muted">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-accent/25 bg-accent/10 font-mono text-[8px] text-accent">{index + 1}</span>
                  <span>{action}</span>
                </li>
              ))}
              {!item.actions?.length && <li className="text-[9.5px] text-subtle">No actions were generated.</li>}
            </ol>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_170px]">
          <div className="rounded-lg border border-app bg-accent/[0.03] p-2.5">
            <p className="text-[8.5px] uppercase tracking-[0.1em] text-subtle">Expected impact</p>
            <p className="mt-1 text-[10px] text-app">
              {item.expected_impact_pct != null
                ? `${formatNumber(item.expected_impact_pct)}% modelled improvement`
                : 'Not estimated — the engine does not fabricate expected gains.'}
            </p>
          </div>
          <ConfidenceMeter value={item.confidence} label="Advisory confidence" />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-app bg-accent/[0.02] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-subtle">{item.fingerprint || `recommendation #${item.id}`}</span>
        {manager ? (
          <div className="flex flex-wrap gap-2">
            {item.status === 'Advisory' && (
              <Button size="sm" icon={CheckCircle2} loading={updating} onClick={() => onStatus(item.id, 'Planned')}>Mark planned</Button>
            )}
            {item.status === 'Planned' && (
              <Button size="sm" icon={SlidersHorizontal} loading={updating} onClick={() => onStatus(item.id, 'Advisory')}>Return to advisory</Button>
            )}
            <Button size="sm" variant="danger" icon={XCircle} loading={updating} onClick={() => onStatus(item.id, 'Dismissed')}>Dismiss</Button>
          </div>
        ) : <Badge tone="neutral">Read-only</Badge>}
      </div>
    </article>
  )
}

export default function NetworkOptimization() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [scanning, setScanning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [category, setCategory] = useState('All')
  const { data, loading, error, reload, refreshing, lastUpdated } = useApi('/intelligence/optimization', { pollMs: 60000 })

  const recommendations = data?.recommendations || []
  const summary = data?.summary || {}
  const categories = summary.categories || {}
  const manager = hasRole('analyst')
  const filtered = category === 'All' ? recommendations : recommendations.filter((item) => item.category === category)

  async function runScan() {
    setScanning(true)
    try {
      const response = await api.post('/intelligence/optimization/scan')
      toast(response.data.message, response.data.status === 'insufficient_data' ? 'warning' : 'success', 'Optimisation scan')
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Optimisation scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function updateStatus(id, status) {
    setUpdatingId(id)
    try {
      await api.patch(`/intelligence/optimization/${id}`, { status })
      toast(`Recommendation #${id} marked ${status.toLowerCase()}`, 'success')
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Could not update recommendation')
    } finally {
      setUpdatingId(null)
    }
  }

  async function exportCsv() {
    setExporting(true)
    try {
      await downloadCsv('/intelligence/export.csv?kind=optimization', 'netpulse-optimisation.csv')
      toast('Optimisation advice exported as CSV', 'success')
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
        eyebrow="Performance advisory"
        title="Network optimization"
        description="Measured-performance recommendations for loss, latency, jitter and availability. Advice is advisory only: NetPulse AI never changes device configuration and never invents expected gains."
        actions={
          <>
            <RefreshStamp lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} />
            <Button size="sm" icon={Download} loading={exporting} onClick={exportCsv}>Export CSV</Button>
            {manager && <Button size="sm" variant="primary" icon={Play} loading={scanning} onClick={runScan}>Run optimisation scan</Button>}
          </>
        }
      />

      <IntelStatusAlert
        status={data?.status}
        message={data?.message}
        available={data?.available_points}
        required={data?.minimum_required}
        windowHours={data?.window_hours}
        onRun={manager ? runScan : null}
        running={scanning}
        runLabel="Generate advice"
        notRunTitle="Telemetry is ready — advice not generated yet"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Advisory items" value={summary.total ?? 0} hint={`${summary.high ?? 0} high · ${summary.medium ?? 0} medium`} icon={Sparkles} accent="wine" loading={loading} />
        <StatCard label="High priority" value={summary.high ?? 0} hint="Measured threshold breaches" icon={TrendingDown} accent="rust" loading={loading} />
        <StatCard label="Categories" value={Object.keys(categories).length} hint={Object.keys(categories).map(titleCase).join(' · ') || 'No categories yet'} icon={Gauge} accent="ochre" loading={loading} />
        <StatCard label="Live telemetry" value={data?.available_points ?? 0} hint={data?.minimum_required != null ? `${data.minimum_required} required in ${data?.window_hours || 24}h window` : 'Measurements available'} icon={Settings2} accent="sage" loading={loading} />
      </div>

      <section className="panel overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-app p-4 lg:flex-row lg:items-center">
          <SectionHeader icon={Sparkles} title="Optimisation advisory" subtitle="Referenced to measured averages and observation counts" />
          <div className="flex flex-wrap gap-1.5">
            {['All', ...Object.keys(categories)].map((option) => (
              <button
                key={option}
                onClick={() => setCategory(option)}
                className={cn(
                  'rounded-full border px-2.5 py-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] transition',
                  category === option ? 'border-accent/40 bg-accent/10 text-accent' : 'border-app text-subtle hover:border-accent/25 hover:text-app',
                )}
              >
                {option === 'All' ? 'All' : titleCase(option)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3 p-4">
          {filtered.map((item) => (
            <RecommendationCard
              key={item.id}
              item={item}
              manager={manager}
              updating={updatingId === item.id}
              onStatus={updateStatus}
            />
          ))}
          {!filtered.length && (
            <EmptyState
              icon={Sparkles}
              title={recommendations.length ? 'No recommendations in this category' : data?.status === 'insufficient_data' ? 'Not enough telemetry for advice' : 'No optimisation advice yet'}
              description={recommendations.length ? 'Choose another category or review all advisory items.' : data?.message || 'Run the advisory scan after collecting live measurements.'}
              action={manager ? <Button size="sm" variant="primary" icon={Play} loading={scanning} onClick={runScan}>Run optimisation scan</Button> : null}
            />
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <div className="panel p-4">
          <SectionHeader icon={ListChecks} title="Advisory engine" subtitle="Thresholds and inputs behind every recommendation" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ['Packet loss', 'Average loss above the configured threshold produces a loss advisory.'],
              ['Latency', 'Average latency above the configured threshold produces a latency advisory.'],
              ['Jitter', 'Average jitter above 15 ms produces a stability advisory.'],
              ['Availability', 'Online probe ratio below 80% produces an availability advisory.'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-lg border border-app bg-accent/[0.03] p-2.5">
                <p className="text-[10px] font-semibold text-app">{title}</p>
                <p className="mt-1 text-[9px] leading-relaxed text-subtle">{text}</p>
              </div>
            ))}
          </div>
          <InfoNote className="mt-3">Each item is de-duplicated by category and scope. Planned items remain visible; dismissed items leave the advisory feed.</InfoNote>
        </div>
        <div className="panel p-4">
          <SectionHeader icon={Gauge} title="Engine status" subtitle="Last measured window only" />
          <dl className="mt-3 space-y-2 text-[10px]">
            {[
              ['Method', data?.method || '—'],
              ['Window', `${data?.window_hours || 24} hours`],
              ['Minimum points', data?.minimum_required ?? 8],
              ['Latest advice', summary.latest_at ? formatDateTime(summary.latest_at) : 'Not run yet'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3">
                <dt className="text-subtle">{label}</dt>
                <dd className="max-w-[62%] text-right font-medium text-app">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[8.5px] uppercase tracking-[0.08em] text-subtle">
              <span>Telemetry availability</span>
              <span>{data?.available_points ?? 0} / {data?.minimum_required ?? 8}</span>
            </div>
            <ProgressBar
              value={data?.minimum_required ? Math.min(100, ((data?.available_points || 0) / data.minimum_required) * 100) : 0}
              tone={(data?.available_points || 0) >= (data?.minimum_required || 8) ? 'sage' : 'ochre'}
            />
          </div>
          <Link to="/monitoring" className="mt-3 flex items-center justify-between rounded-lg border border-app bg-accent/[0.03] px-3 py-2.5 text-[10px] font-medium text-muted transition hover:border-accent/25 hover:text-app">
            Collect live telemetry <ArrowRight className="h-3 w-3 text-accent" />
          </Link>
        </div>
      </div>

      <MethodFootnote
        method={data?.method}
        generatedAt={data?.generated_at}
        disclaimer={data?.disclaimer}
      />
    </div>
  )
}
