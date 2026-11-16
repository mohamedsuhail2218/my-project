import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  Download,
  FileBarChart,
  FileCheck2,
  FileText,
  Gauge,
  Loader2,
  Radar,
  RefreshCw,
  Router,
  ShieldCheck,
  Sparkles,
  Ticket,
  Timer,
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
  SectionHeader,
  Select,
  StatCard,
  cn,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import { formatBytes, formatDateTime, formatNumber, relativeTime } from '../lib/utils'
import { api, downloadPdf, getErrorMessage } from '../services/api'

const REPORT_OPTIONS = [
  { type: 'executive', title: 'Executive report', description: 'Network snapshot, recent probes, AP inventory, AI events and tickets.', icon: FileBarChart, accent: 'wine' },
  { type: 'uptime', title: 'Uptime report', description: 'Live probe success rate and network availability observations.', icon: Clock3, accent: 'sage' },
  { type: 'latency', title: 'Latency report', description: 'Latency statistics, recent observations and selected window.', icon: Activity, accent: 'gold' },
  { type: 'packet_loss', title: 'Packet-loss report', description: 'Loss distribution, maximums and probe-level detail.', icon: Gauge, accent: 'ochre' },
  { type: 'access_points', title: 'Access point report', description: 'Registered AP inventory and per-device performance.', icon: Router, accent: 'plum' },
  { type: 'anomalies', title: 'AI anomaly report', description: 'Isolation Forest findings with explanations and severity.', icon: Bot, accent: 'plum' },
  { type: 'issues', title: 'Issue management report', description: 'Ticket register, priorities, statuses and resolution timestamps.', icon: Ticket, accent: 'rust' },
  { type: 'testing', title: 'Automated testing report', description: 'Latest pytest run, pass/fail counts and suite details.', icon: FileCheck2, accent: 'sage' },
]

const RANGES = [
  { value: 24, label: 'Last 24 hours' },
  { value: 168, label: 'Last 7 days' },
  { value: 720, label: 'Last 30 days' },
  { value: 2160, label: 'Last 90 days' },
]

export default function Reports() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [reportType, setReportType] = useState('executive')
  const [hours, setHours] = useState(168)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [error, setError] = useState('')
  const reports = useApi('/reports', { pollMs: 60000 })
  const dashboard = useApi('/dashboard/overview', { params: { hours: 24 }, pollMs: 60000 })

  const selected = useMemo(() => REPORT_OPTIONS.find((option) => option.type === reportType), [reportType])
  const summary = dashboard.data?.summary || {}
  const generated = reports.data || []

  async function generate(event) {
    event.preventDefault()
    setGenerating(true)
    setError('')
    try {
      const response = await api.post('/reports/generate', { report_type: reportType, hours })
      toast(`${response.data.title} generated`, 'success', `${formatBytes(response.data.size_bytes)} PDF ready`)
      reports.reload()
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      toast(message, 'error', 'Report generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function download(filename) {
    setDownloading(filename)
    try {
      await downloadPdf(filename)
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Download failed')
    } finally {
      setDownloading('')
    }
  }

  if (reports.loading && !reports.data) return <PageSkeleton cards={4} />
  if (reports.error && !reports.data) return <ErrorPanel message={reports.error} onRetry={reports.reload} />

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Analytics & exports"
        title="Reports"
        description="Generate professional PDF reports from persisted monitoring observations, AI events, issue history and automated test results."
        actions={<Badge tone="info">{generated.length} report(s) available</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Network health" value={summary.network_health_pct != null ? formatNumber(summary.network_health_pct, 0) : null} unit="%" hint="24-hour live window" icon={ShieldCheck} accent="wine" loading={dashboard.loading} />
        <StatCard label="Live uptime" value={summary.uptime_pct != null ? formatNumber(summary.uptime_pct, 1) : null} unit="%" hint="Probe success rate" icon={Activity} accent="sage" loading={dashboard.loading} />
        <StatCard label="AI anomalies" value={summary.anomalies ?? 0} hint="Last 24 hours" icon={Bot} accent="plum" loading={dashboard.loading} />
        <StatCard label="Open issues" value={summary.open_issues ?? 0} hint="Open + in progress tickets" icon={Ticket} accent="ochre" loading={dashboard.loading} />
      </div>

      {error && <Alert tone="danger" title="Could not generate report">{error}</Alert>}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="panel p-4">
          <SectionHeader icon={Sparkles} title="Report studio" subtitle="Choose a report, scope it to a time window, then generate a PDF from real stored data." />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {REPORT_OPTIONS.map((option) => (
              <button
                key={option.type}
                onClick={() => setReportType(option.type)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 text-left transition',
                  reportType === option.type ? 'border-accent/35 bg-accent/[0.06] shadow-glow' : 'border-app bg-accent/[0.02] hover:border-accent/20',
                )}
              >
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', `stat-accent-${option.accent}`)}><option.icon className="h-4 w-4" /></span>
                <span className="min-w-0">
                  <span className="block text-[10.5px] font-semibold text-app">{option.title}</span>
                  <span className="mt-0.5 block text-[9px] leading-relaxed text-subtle">{option.description}</span>
                </span>
              </button>
            ))}
          </div>
          <form onSubmit={generate} className="mt-4 flex flex-col gap-3 rounded-xl border border-app bg-accent/[0.03] p-3.5 sm:flex-row sm:items-end">
            <div className="flex-1">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-subtle">Selected report</p>
              <p className="mt-1 text-[11px] font-medium text-app">{selected?.title}</p>
            </div>
            <div className="w-full sm:w-[150px]">
              <label className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-subtle">Time window</label>
              <Select value={hours} onChange={(event) => setHours(Number(event.target.value))}>
                {RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
              </Select>
            </div>
            {hasRole('analyst') ? (
              <Button type="submit" variant="primary" icon={FileText} loading={generating}>Generate PDF</Button>
            ) : <Badge tone="neutral">Read-only role</Badge>}
          </form>
          <InfoNote className="mt-3">PDF reports include the generation timestamp and a clear note about simulated records and AI limitations. No chart values are invented.</InfoNote>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-app p-4">
            <SectionHeader icon={FileBarChart} title="Generated reports" subtitle="Stored PDFs from this workspace" />
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={reports.reload} />
          </div>
          <div className="max-h-[465px] overflow-y-auto">
            {generated.map((report) => (
              <div key={report.filename} className="flex items-center gap-3 border-b border-app px-4 py-3 last:border-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger"><FileText className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10.5px] font-semibold text-app">{report.title}</p>
                  <p className="mt-0.5 text-[8.5px] text-subtle">{formatBytes(report.size_bytes)} · {formatDateTime(report.generated_at)}</p>
                </div>
                <Button size="sm" variant="ghost" icon={Download} loading={downloading === report.filename} onClick={() => download(report.filename)} aria-label={`Download ${report.title}`} />
              </div>
            ))}
            {!generated.length && (
              <EmptyState icon={FileBarChart} compact title="No PDF reports generated" description="Generate your first report using the studio. Files are saved in the project reports directory." />
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: CheckCircle2, title: 'Real observations only', text: 'Network metrics are computed from stored live probes. Simulated AP checks are labelled and excluded from health.' },
          { icon: Bot, title: 'AI transparency', text: 'Anomaly reports include model version, baseline mode and explanation text — never a guaranteed failure forecast.' },
          { icon: FileCheck2, title: 'Testing evidence', text: 'The testing report summarises the latest persisted pytest run; Playwright evidence is available separately.' },
        ].map((item) => (
          <div key={item.title} className="panel flex items-start gap-3 p-3.5">
            <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div><p className="text-[10.5px] font-semibold text-app">{item.title}</p><p className="mt-1 text-[9.5px] leading-relaxed text-subtle">{item.text}</p></div>
          </div>
        ))}
      </div>
    </div>
  )
}
