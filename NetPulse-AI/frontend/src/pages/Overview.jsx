import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock3,
  Cpu,
  Gauge,
  Info,
  Radar,
  RefreshCw,
  Router,
  ShieldCheck,
  Smartphone,
  Ticket,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import ChartTooltip from '../components/ChartTooltip'
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
  StatusBadge,
  cn,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import { formatNumber, formatShortDate, formatTime, parseApiDate, relativeTime } from '../lib/utils'
import { api, getErrorMessage } from '../services/api'

const ALERT_TONES = {
  Critical: 'danger',
  High: 'warning',
  Medium: 'info',
}

export default function Overview() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [running, setRunning] = useState(false)
  const { data, loading, error, reload, refreshing, lastUpdated } = useApi('/dashboard/overview', {
    params: { hours: 24 },
    pollMs: 20000,
  })

  async function runLiveCheck() {
    setRunning(true)
    try {
      const response = await api.post('/monitoring/run')
      toast(response.data.message, 'success', 'Live probe complete')
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Probe failed')
    } finally {
      setRunning(false)
    }
  }

  if (loading && !data) return <PageSkeleton cards={4} />
  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />

  const summary = data?.summary || {}
  const latest = data?.latest_measurement
  const series = (data?.series || []).map((point) => ({
    ...point,
    label: `${formatShortDate(point.timestamp)} ${formatTime(point.timestamp).slice(0, 5)}`,
  }))
  const alerts = data?.recent_alerts || []
  const anomalies = data?.anomaly_breakdown || {}
  const tickets = data?.ticket_breakdown || {}
  const monitoring = data?.monitoring || {}
  const online = latest?.is_online
  const health = summary.network_health_pct
  const lastCycle = parseApiDate(monitoring.last_cycle_at)
  const freshnessPct = lastCycle
    ? Math.max(0, Math.min(100, 100 - ((Date.now() - lastCycle.getTime()) / 1000 / Math.max(monitoring.interval_seconds || 60, 1)) * 100))
    : 0

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Network command center"
        title="Overview"
        description="Live operational health from authorized local probes, AI anomaly observations and issue automation."
        actions={
          <>
            <RefreshStamp lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} />
            {hasRole('analyst') && (
              <Button variant="primary" size="sm" icon={Radar} loading={running} onClick={runLiveCheck}>
                Run live check
              </Button>
            )}
          </>
        }
      />

      {latest && !latest.is_online && (
        <Alert tone="danger" title="Latest live probe is offline">
          No ICMP replies were received at {relativeTime(latest.recorded_at)}. Open Smart Troubleshooting for safe diagnostic steps.
          <Link to="/troubleshooting" className="ml-2 inline-flex items-center gap-1 font-semibold underline">Investigate <ArrowRight className="h-3 w-3" /></Link>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <section className="panel relative overflow-hidden p-5">
          <div className="login-grid pointer-events-none absolute inset-0 opacity-40" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="eyebrow">Live health index</p>
              <h2 className="mt-1 text-[13px] font-semibold text-app">Network state</h2>
            </div>
            <Badge tone={online === false ? 'danger' : online ? 'success' : 'neutral'} dot>
              {online === false ? 'Offline' : online ? 'Operational' : 'Awaiting data'}
            </Badge>
          </div>
          <div className="relative mt-3 flex justify-center">
            <HealthRing value={health} size={164} />
          </div>
          <div className="relative mt-2 grid grid-cols-2 gap-2">
            <div className="panel-raised p-2.5">
              <p className="text-[9px] uppercase tracking-wider text-subtle">Latency</p>
              <p className="mt-0.5 font-mono text-[13px] font-semibold text-app">{latest?.latency_ms != null ? `${formatNumber(latest.latency_ms)} ms` : '—'}</p>
            </div>
            <div className="panel-raised p-2.5">
              <p className="text-[9px] uppercase tracking-wider text-subtle">Loss</p>
              <p className="mt-0.5 font-mono text-[13px] font-semibold text-app">{latest ? `${formatNumber(latest.packet_loss_pct)}%` : '—'}</p>
            </div>
          </div>
          <div className="relative mt-3 flex items-center justify-between border-t border-app pt-3 text-[9.5px] text-subtle">
            <span className="flex items-center gap-1.5"><Wifi className="h-3 w-3 text-accent" /> {latest?.probe_target || 'No probe yet'}</span>
            <span>{latest ? relativeTime(latest.recorded_at) : '—'}</span>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-app p-5 sm:flex-row sm:items-start">
            <SectionHeader
              icon={Activity}
              title="Latency & packet loss"
              subtitle="24-hour live measurement trend. Simulated records are excluded."
            />
            <div className="flex gap-3 text-[9.5px] text-subtle">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Latency (ms)</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-danger" /> Loss (%)</span>
            </div>
          </div>
          <div className="p-4">
            {series.length ? (
              <div className="h-[270px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.26} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 5" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={40} tick={{ fontSize: 9 }} />
                    <YAxis yAxisId="latency" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} width={38} />
                    <YAxis yAxisId="loss" orientation="right" domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 9 }} width={32} unit="%" />
                    <Tooltip content={<ChartTooltip />} />
                    <Area yAxisId="latency" type="monotone" dataKey="latency_ms" name="Latency" stroke="var(--accent)" strokeWidth={2} fill="url(#latencyFill)" connectNulls={false} dot={false} />
                    <Line yAxisId="loss" type="monotone" dataKey="packet_loss_pct" name="Packet loss" stroke="var(--danger)" strokeWidth={1.4} dot={false} strokeDasharray="4 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={Radar}
                compact
                title="Waiting for the first live measurement"
                description="Start a real probe from this page or allow the background scheduler to collect telemetry. No chart values are fabricated."
                action={hasRole('analyst') ? <Button variant="primary" size="sm" icon={Radar} loading={running} onClick={runLiveCheck}>Run first live check</Button> : null}
              />
            )}
          </div>
          <div className="grid grid-cols-2 border-t border-app sm:grid-cols-4">
            {[
              { label: 'Avg latency', value: summary.average_latency_ms != null ? `${formatNumber(summary.average_latency_ms)} ms` : '—', icon: Gauge },
              { label: 'Avg packet loss', value: summary.packet_loss_pct != null ? `${formatNumber(summary.packet_loss_pct)}%` : '—', icon: Zap },
              { label: '24h uptime', value: summary.uptime_pct != null ? `${formatNumber(summary.uptime_pct)}%` : '—', icon: Clock3 },
              { label: 'Live samples', value: series.length, icon: Cpu },
            ].map((metric, index) => (
              <div key={metric.label} className={cn('p-3.5', index !== 0 && 'border-l border-app')}>
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-subtle"><metric.icon className="h-3 w-3" />{metric.label}</div>
                <p className="mt-1 font-mono text-[13px] font-semibold text-app">{metric.value}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Online access points" value={`${summary.online_access_points ?? '—'}/${summary.total_access_points ?? '—'}`} hint={`${summary.simulated_access_points || 0} simulated records`} icon={Router} accent="sage" />
        <StatCard label="Network health" value={health != null ? formatNumber(health, 0) : null} unit="%" hint="Uptime + AP availability" icon={ShieldCheck} accent="wine" />
        <StatCard label="Uptime (24h)" value={summary.uptime_pct != null ? formatNumber(summary.uptime_pct, 1) : null} unit="%" hint="Successful live probes" icon={Clock3} accent="gold" />
        <StatCard label="Open issues" value={summary.open_issues ?? 0} hint={`${tickets.open ?? 0} open · ${tickets.in_progress ?? 0} in progress`} icon={Ticket} accent="ochre" onClick={() => navigate('/issues')} />
        <StatCard label="AI anomalies" value={summary.anomalies ?? 0} hint={`${anomalies.Critical || 0} critical in window`} icon={Bot} accent="plum" onClick={() => navigate('/anomalies')} />
        <StatCard label="Device governance" value={`${summary.known_devices ?? 0}/${(summary.known_devices || 0) + (summary.unknown_devices || 0)}`} hint={`${summary.unknown_devices || 0} unrecognized`} icon={Smartphone} accent="rust" onClick={() => navigate('/devices')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_.85fr]">
        <section className="panel">
          <div className="flex items-center justify-between border-b border-app p-4">
            <SectionHeader icon={AlertTriangle} title="Recent alerts" subtitle="AI anomalies, priority tickets and unrecognized devices" />
            <Badge tone={alerts.length ? 'warning' : 'success'}>{alerts.length} in view</Badge>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {alerts.slice(0, 6).map((alert) => (
              <button
                key={`${alert.kind}-${alert.id}`}
                onClick={() => navigate(alert.path)}
                className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-accent/[0.025]"
              >
                <span className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                  alert.severity === 'Critical' ? 'border-danger/20 bg-danger/10 text-danger' : alert.severity === 'High' ? 'border-warning/20 bg-warning/10 text-warning' : 'border-app bg-accent/[0.03] text-accent',
                )}>
                  {alert.kind === 'ai_anomaly' ? <Bot className="h-3.5 w-3.5" /> : alert.kind === 'ticket' ? <Ticket className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold text-app">{alert.title}</p>
                    <Badge tone={ALERT_TONES[alert.severity] || 'neutral'}>{alert.severity}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-muted">{alert.message}</p>
                  <p className="mt-1 text-[9px] text-subtle">{relativeTime(alert.created_at)}</p>
                </div>
                <ArrowUpRight className="mt-2 h-3.5 w-3.5 text-subtle transition group-hover:text-accent" />
              </button>
            ))}
            {!alerts.length && (
              <EmptyState icon={CheckCircle2} title="No active operational alerts" description="New AI anomalies, priority tickets and unrecognized devices will surface here." compact />
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel relative overflow-hidden p-4">
            <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-plum/10 blur-3xl" />
            <SectionHeader icon={Bot} title="AI anomaly pulse" subtitle="Isolation Forest · statistical, explainable" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {['Critical', 'High', 'Medium', 'Low'].map((level) => (
                <div key={level} className="panel-raised p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase tracking-wider text-subtle">{level}</span>
                    <span className={cn('h-1.5 w-1.5 rounded-full', level === 'Critical' ? 'bg-danger' : level === 'High' ? 'bg-warning' : level === 'Medium' ? 'bg-accent' : 'bg-neutral')} />
                  </div>
                  <p className="mt-1 font-mono text-lg font-semibold text-app">{anomalies[level] ?? 0}</p>
                </div>
              ))}
            </div>
            <Link to="/anomalies" className="mt-3 flex items-center justify-between rounded-lg border border-app bg-accent/[0.03] px-3 py-2.5 text-[10px] font-medium text-muted transition hover:border-plum/25 hover:text-app">
              Review anomaly explanations <ArrowRight className="h-3 w-3 text-plum" />
            </Link>
            <InfoNote className="mt-3">AI findings are observations, not guaranteed failure predictions.</InfoNote>
          </section>

          <section className="panel p-4">
            <SectionHeader icon={Radar} title="Probe configuration" subtitle="Real measurements from the application host" />
            <dl className="mt-4 space-y-2.5 text-[10px]">
              {[
                ['Target', monitoring.target || '1.1.1.1'],
                ['Interval', monitoring.interval_seconds ? `${monitoring.interval_seconds}s` : '—'],
                ['Scheduler', monitoring.enabled ? 'Active' : 'Disabled'],
                ['Last cycle', monitoring.last_cycle_at ? relativeTime(monitoring.last_cycle_at) : 'Awaiting first cycle'],
                ['Discovery', monitoring.last_device_scan_at ? relativeTime(monitoring.last_device_scan_at) : 'Pending'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-subtle">{label}</dt>
                  <dd className="truncate text-right font-medium text-app">{value}</dd>
                </div>
              ))}
            </dl>
            {monitoring.last_error && <Alert tone="warning" className="mt-3">{monitoring.last_error}</Alert>}
            {monitoring.last_cycle_at && (
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-[9px] text-subtle"><span>Probe freshness</span><span>{relativeTime(monitoring.last_cycle_at)}</span></div>
                <ProgressBar value={freshnessPct} tone="wine" />
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app pt-3 text-[9.5px] text-subtle">
        <span className="flex items-center gap-1.5"><Info className="h-3 w-3" /> {data?.disclaimer}</span>
        <span>Window: {data?.window_hours || 24}h · Generated {relativeTime(data?.generated_at)}</span>
      </div>
    </div>
  )
}
