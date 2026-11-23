import { useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Fingerprint,
  LockKeyhole,
  Play,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  HealthRing,
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
import { formatDateTime, formatNumber, relativeTime } from '../lib/utils'
import { api, downloadCsv, getErrorMessage } from '../services/api'

const EVENT_LABELS = {
  unapproved_device: 'Unapproved device',
  authentication_failure_burst: 'Sign-in failure burst',
}
const STATUS_TONE = { Open: 'warning', Acknowledged: 'info', Resolved: 'success' }
const FILTERS = ['All', 'Open', 'Resolved']

function FindingCard({ event, manager, updating, onStatus }) {
  const resolved = event.status === 'Resolved'
  return (
    <article className={cn(
      'panel overflow-hidden border-l-2',
      event.severity === 'Critical' ? 'border-l-danger' : event.severity === 'High' ? 'border-l-warning' : 'border-l-accent',
    )}>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={event.severity} />
          <Badge tone={STATUS_TONE[event.status] || 'neutral'} dot>{event.status}</Badge>
          <Badge tone="info">{EVENT_LABELS[event.event_type] || event.event_type?.replaceAll('_', ' ')}</Badge>
          {event.is_simulated && <Badge tone="plum">Simulated</Badge>}
        </div>
        <h3 className="mt-2 text-[12px] font-semibold text-app">{event.title}</h3>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{event.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-subtle">
          <span>Source · {event.source}</span>
          <span>Detected {relativeTime(event.detected_at)}</span>
          {event.resolved_at && <span>Resolved {relativeTime(event.resolved_at)}</span>}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_170px]">
          <EvidenceList evidence={event.evidence} title="Observed evidence" />
          <div className="space-y-2">
            <ConfidenceMeter value={event.confidence} label="Finding confidence" />
            <div className="rounded-lg border border-warning/20 bg-warning/[0.05] p-2.5">
              <p className="flex items-center gap-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-warning">
                <ShieldAlert className="h-3 w-3" /> Recommended response
              </p>
              <p className="mt-1 text-[9.5px] leading-relaxed text-muted">{event.recommendation || 'Review the evidence and follow the local incident process.'}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-app bg-accent/[0.02] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-subtle">Fingerprint · {event.fingerprint || `event #${event.id}`}</span>
        {manager ? (
          <div className="flex flex-wrap gap-2">
            {event.status === 'Open' && (
              <Button size="sm" icon={CheckCircle2} loading={updating} onClick={() => onStatus(event.id, 'Acknowledged')}>Acknowledge</Button>
            )}
            {!resolved && (
              <Button size="sm" variant="primary" icon={ShieldCheck} loading={updating} onClick={() => onStatus(event.id, 'Resolved')}>Mark resolved</Button>
            )}
            {resolved && (
              <Button size="sm" icon={RotateCcw} loading={updating} onClick={() => onStatus(event.id, 'Open')}>Reopen</Button>
            )}
          </div>
        ) : <Badge tone="neutral">Read-only</Badge>}
      </div>
    </article>
  )
}

export default function Cybersecurity() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [scanning, setScanning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [filter, setFilter] = useState('All')
  const { data, loading, error, reload, refreshing, lastUpdated } = useApi('/intelligence/security', { pollMs: 60000 })

  const events = data?.events || []
  const summary = data?.summary || {}
  const manager = hasRole('analyst')
  const scanned = data?.status === 'ready'
  const posture = scanned ? summary.posture_score : null
  const filtered = filter === 'All'
    ? events
    : events.filter((item) => (filter === 'Open' ? ['Open', 'Acknowledged'].includes(item.status) : item.status === filter))
  const openFindings = events.filter((item) => ['Open', 'Acknowledged'].includes(item.status))

  async function runScan() {
    setScanning(true)
    try {
      const response = await api.post('/intelligence/security/scan')
      toast(response.data.message, 'success', 'Defensive scan complete')
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Security scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function updateStatus(id, status) {
    setUpdatingId(id)
    try {
      await api.patch(`/intelligence/security/${id}`, { status })
      toast(`Finding #${id} marked ${status.toLowerCase()}`, 'success')
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Could not update finding')
    } finally {
      setUpdatingId(null)
    }
  }

  async function exportCsv() {
    setExporting(true)
    try {
      await downloadCsv('/intelligence/export.csv?kind=security', 'netpulse-security-findings.csv')
      toast('Security findings exported as CSV', 'success')
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
        eyebrow="Defensive security intelligence"
        title="Cybersecurity"
        description="Findings are derived only from authorised local evidence: unapproved devices observed in the ARP cache and failure bursts in the sign-in audit. No offensive scanning is performed."
        actions={
          <>
            <RefreshStamp lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} />
            <Button size="sm" icon={Download} loading={exporting} onClick={exportCsv}>Export CSV</Button>
            {manager && <Button size="sm" variant="primary" icon={ScanSearch} loading={scanning} onClick={runScan}>Run defensive scan</Button>}
          </>
        }
      />

      <IntelStatusAlert
        status={data?.status}
        message={data?.message}
        onRun={manager ? runScan : null}
        running={scanning}
        runLabel="Run scan"
        notRunTitle="No defensive scan has run yet"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Posture score" value={posture != null ? formatNumber(posture, 0) : null} unit={posture != null ? '/ 100' : ''} hint={scanned ? `${summary.open ?? 0} open finding(s) deducted` : 'Awaiting defensive scan'} icon={ShieldCheck} accent="sage" loading={loading} />
        <StatCard label="Open findings" value={summary.open ?? 0} hint={`${summary.high ?? 0} high · ${summary.critical ?? 0} critical`} icon={ShieldAlert} accent="rust" loading={loading} />
        <StatCard label="Unapproved devices" value={summary.unapproved_devices ?? 0} hint="Observed in the local ARP cache" icon={Smartphone} accent="ochre" loading={loading} />
        <StatCard label="Failed sign-ins" value={summary.failed_logins_24h ?? 0} hint="Last 24 hours · sign-in audit" icon={LockKeyhole} accent="plum" loading={loading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
        <section className="panel overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-app p-4 lg:flex-row lg:items-center">
            <SectionHeader icon={Fingerprint} title="Security findings" subtitle="Evidence-backed observations with a recommended response" />
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
            {filtered.map((event) => (
              <FindingCard
                key={event.id}
                event={event}
                manager={manager}
                updating={updatingId === event.id}
                onStatus={updateStatus}
              />
            ))}
            {!filtered.length && (
              <EmptyState
                icon={scanned ? ShieldCheck : ScanSearch}
                title={events.length ? `No ${filter.toLowerCase()} findings` : scanned ? 'No defensive findings' : 'Defensive scan not run'}
                description={
                  events.length
                    ? 'Choose another filter to review the rest of the register.'
                    : scanned
                      ? 'The last scan found no unapproved devices or authentication failure bursts. Absence of findings is not a guarantee that the network is secure.'
                      : 'Run a scan to assess locally observable signals. It never performs port scans, packet capture or offensive actions.'
                }
                action={manager ? <Button size="sm" variant="primary" icon={ScanSearch} loading={scanning} onClick={runScan}>Run defensive scan</Button> : null}
              />
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel panel purple-band relative overflow-hidden p-4">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/15 blur-3xl" />
            <SectionHeader icon={ShieldCheck} title="Defensive posture" subtitle={data?.last_scan_at ? `Last scan ${relativeTime(data.last_scan_at)}` : 'Not scanned yet'} />
            <div className="mt-3 flex justify-center">
              <HealthRing value={posture} size={156} label="Posture" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="panel-raised p-2.5">
                <p className="text-[8.5px] uppercase tracking-wider text-subtle">Open</p>
                <p className="mt-0.5 font-mono text-[14px] font-semibold text-app">{summary.open ?? 0}</p>
              </div>
              <div className="panel-raised p-2.5">
                <p className="text-[8.5px] uppercase tracking-wider text-subtle">Resolved</p>
                <p className="mt-0.5 font-mono text-[14px] font-semibold text-app">{summary.resolved ?? 0}</p>
              </div>
            </div>
            {posture != null && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[8.5px] uppercase tracking-[0.08em] text-subtle">
                  <span>Posture score</span>
                  <span>{formatNumber(posture, 0)} / 100</span>
                </div>
                <ProgressBar value={posture} tone={posture >= 85 ? 'sage' : posture >= 60 ? 'ochre' : 'rust'} />
              </div>
            )}
            <p className="mt-3 text-[9px] leading-relaxed text-subtle">
              The score starts at 100 and deducts for open findings by severity. It is a local heuristic, not an industry certification.
            </p>
          </section>

          <section className="panel p-4">
            <SectionHeader icon={ScanSearch} title="Defensive coverage" subtitle="What this scanner can and cannot see" />
            <ul className="mt-3 space-y-2 text-[9.5px] leading-relaxed text-muted">
              {[
                ['ARP neighbour discovery', 'Unapproved devices observed recently on the local subnet.'],
                ['Sign-in audit', 'Repeated authentication failures recorded by this application.'],
                ['Access-point inventory', 'Approved/simulated state and last-seen timestamps.'],
                ['No offensive actions', 'No port scanning, exploitation, packet capture or automatic blocking.'],
              ].map(([title, text]) => (
                <li key={title} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span><span className="font-semibold text-app">{title}.</span> {text}</span>
                </li>
              ))}
            </ul>
            <InfoNote className="mt-3">An empty register means no locally observable evidence was found — it does not prove the network is secure.</InfoNote>
          </section>

          <section className="panel p-4">
            <SectionHeader icon={UserRound} title="Findings by severity" subtitle="Open and acknowledged observations" />
            <div className="mt-3 space-y-2">
              {['Critical', 'High', 'Medium', 'Low'].map((level) => {
                const count = openFindings.filter((item) => item.severity === level).length
                return (
                  <div key={level} className="flex items-center gap-3">
                    <span className="w-14 text-[9px] uppercase tracking-wider text-subtle">{level}</span>
                    <ProgressBar value={openFindings.length ? (count / openFindings.length) * 100 : 0} tone={level === 'Critical' ? 'rust' : level === 'High' ? 'ochre' : level === 'Medium' ? 'wine' : 'sage'} className="flex-1" />
                    <span className="w-4 text-right font-mono text-[9px] text-app">{count}</span>
                  </div>
                )
              })}
            </div>
            <Link to="/devices" className="mt-3 flex items-center justify-between rounded-lg border border-app bg-accent/[0.03] px-3 py-2.5 text-[10px] font-medium text-muted transition hover:border-accent/25 hover:text-app">
              Review device governance <ArrowRight className="h-3 w-3 text-accent" />
            </Link>
          </section>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-2 border-t border-app pt-3 sm:flex-row sm:items-start">
        <MethodFootnote
          method={data?.method}
          generatedAt={data?.generated_at}
          disclaimer={data?.disclaimer}
          className="flex-1 border-0 pt-0"
        />
        <span className="shrink-0 font-mono text-[8.5px] uppercase tracking-[0.08em] text-subtle">
          Last scan · {data?.last_scan_at ? formatDateTime(data.last_scan_at) : 'never'}
        </span>
      </div>
    </div>
  )
}
