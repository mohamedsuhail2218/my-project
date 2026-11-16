import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Gauge,
  Globe2,
  Info,
  Network,
  Radio,
  Radar,
  RefreshCw,
  Router,
  Server,
  ShieldCheck,
  Signal,
  Timer,
  Wifi,
  WifiOff,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  InfoNote,
  PageHeader,
  PageSkeleton,
  RefreshStamp,
  SectionHeader,
  Select,
  StatusBadge,
  cn,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import { formatDateTime, formatNumber, formatShortDate, formatTime, relativeTime } from '../lib/utils'
import { api, getErrorMessage } from '../services/api'

const RANGES = [
  { value: 1, label: 'Last 1 hour' },
  { value: 6, label: 'Last 6 hours' },
  { value: 24, label: 'Last 24 hours' },
  { value: 168, label: 'Last 7 days' },
]

export default function NetworkMonitoring() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [hours, setHours] = useState(24)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')

  const history = useApi('/monitoring/history', { params: { hours, limit: 1000 }, pollMs: 25000 })
  const network = useApi('/monitoring/network-info')
  const scheduler = useApi('/monitoring/scheduler', { pollMs: 30000 })
  const settings = useApi('/settings')

  const measurements = history.data?.measurements || []
  const latest = measurements[measurements.length - 1]
  const onlineCount = measurements.filter((item) => item.is_online).length
  const latencies = measurements.filter((item) => item.latency_ms != null).map((item) => item.latency_ms)
  const avgLatency = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null
  const avgLoss = measurements.length ? measurements.reduce((sum, item) => sum + item.packet_loss_pct, 0) / measurements.length : null
  const uptime = measurements.length ? (onlineCount / measurements.length) * 100 : null

  const chartData = useMemo(
    () =>
      measurements.map((item) => ({
        ...item,
        label: `${formatShortDate(item.recorded_at)} ${formatTime(item.recorded_at).slice(0, 5)}`,
      })),
    [measurements],
  )

  async function runCheck() {
    setRunning(true)
    setRunError('')
    try {
      const response = await api.post('/monitoring/run')
      toast(response.data.message, response.data.measurement?.is_online ? 'success' : 'warning', 'Live network probe')
      history.reload()
      scheduler.reload()
    } catch (error) {
      const message = getErrorMessage(error)
      setRunError(message)
      toast(message, 'error', 'Probe could not run')
    } finally {
      setRunning(false)
    }
  }

  if (history.loading && !history.data) return <PageSkeleton cards={4} />
  if (history.error && !history.data) return <ErrorPanel message={history.error} onRetry={history.reload} />

  const interfaceList = network.data?.interfaces || []
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Live operations"
        title="Network monitoring"
        description="Measure actual connectivity, latency, jitter and packet loss from this host. Every stored point includes its collection timestamp and probe target."
        actions={
          <>
            <RefreshStamp lastUpdated={history.lastUpdated} refreshing={history.refreshing} onRefresh={history.reload} />
            <Select value={hours} onChange={(event) => setHours(Number(event.target.value))} className="w-[140px]">
              {RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
            </Select>
            {hasRole('analyst') && <Button variant="primary" size="sm" icon={Radar} loading={running} onClick={runCheck}>Run live check</Button>}
          </>
        }
      />

      {runError && <Alert tone="danger" title="Probe failed">{runError}</Alert>}
      {scheduler.data?.last_error && <Alert tone="warning" title="Background scheduler reported an issue">{scheduler.data.last_error}</Alert>}
      {latest && !latest.is_online && (
        <Alert tone="danger" title="Latest measurement is offline">
          The latest probe at {formatDateTime(latest.recorded_at)} recorded no ICMP replies. Use Smart Troubleshooting for safe diagnostic guidance.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Current status', value: latest ? (latest.is_online ? 'Online' : 'Offline') : 'No data', icon: latest?.is_online ? Wifi : WifiOff, accent: latest?.is_online ? 'sage' : 'rust', hint: latest ? `Last probe ${relativeTime(latest.recorded_at)}` : 'Run a live check to start' },
          { label: 'Average latency', value: avgLatency == null ? '—' : `${formatNumber(avgLatency)} ms`, icon: Gauge, accent: 'wine', hint: `${latencies.length} latency samples` },
          { label: 'Average packet loss', value: avgLoss == null ? '—' : `${formatNumber(avgLoss)}%`, icon: Signal, accent: 'ochre', hint: `Window ${hours}h` },
          { label: 'Probe success rate', value: uptime == null ? '—' : `${formatNumber(uptime)}%`, icon: ShieldCheck, accent: 'gold', hint: `${onlineCount}/${measurements.length} successful` },
        ].map((item) => (
          <div key={item.label} className="panel p-4">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-subtle">{item.label}</p>
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', `stat-accent-${item.accent}`)}><item.icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-2 font-display text-[24px] font-bold tracking-tight text-app">{item.value}</p>
            <p className="mt-1 text-[10px] text-subtle">{item.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <section className="panel overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-app p-4 sm:flex-row sm:items-center">
            <SectionHeader icon={Activity} title="Live latency timeline" subtitle={`Authorized ICMP probe to ${network.data?.probe_target || settings.data?.monitor_target || 'configured target'}`} />
            <div className="flex items-center gap-3 text-[9px] text-subtle">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Latency</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-danger" /> Offline</span>
            </div>
          </div>
          <div className="p-4">
            {chartData.length ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="monitorLatency" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 5" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={45} tick={{ fontSize: 9 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9 }} width={38} unit=" ms" />
                    <Tooltip content={<ChartTooltip unit=" ms" />} />
                    <Area type="monotone" dataKey="latency_ms" name="Latency" stroke="var(--accent)" strokeWidth={2} fill="url(#monitorLatency)" dot={false} connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={Radar} title="No live measurements in this window" description="Run a real probe or wait for the background scheduler. Simulated access points never contribute to this chart." compact />
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel p-4">
            <SectionHeader icon={Timer} title="Probe schedule" subtitle="Background monitoring state" />
            <div className="mt-3 space-y-2.5 text-[10px]">
              {[
                ['Scheduler', scheduler.data?.enabled ? 'Active' : 'Disabled'],
                ['Interval', scheduler.data?.interval_seconds ? `${scheduler.data.interval_seconds}s` : '—'],
                ['Target', scheduler.data?.target || '—'],
                ['Last cycle', scheduler.data?.last_cycle_at ? relativeTime(scheduler.data.last_cycle_at) : 'Awaiting'],
                ['Last device scan', scheduler.data?.last_device_scan_at ? relativeTime(scheduler.data.last_device_scan_at) : 'Awaiting'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-app pb-2 last:border-0 last:pb-0">
                  <span className="text-subtle">{label}</span>
                  <span className="text-right font-medium text-app">{value}</span>
                </div>
              ))}
            </div>
            <InfoNote className="mt-3">Measurements are stored only after a genuine operating-system probe returns.</InfoNote>
          </section>

          <section className="panel p-4">
            <SectionHeader icon={Gauge} title="Configured thresholds" subtitle="Used by monitoring and auto-ticketing" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="panel-raised p-2.5">
                <p className="text-[9px] uppercase tracking-wider text-subtle">Latency</p>
                <p className="mt-1 font-mono text-sm font-semibold text-app">{settings.data?.latency_threshold_ms ?? '—'} ms</p>
              </div>
              <div className="panel-raised p-2.5">
                <p className="text-[9px] uppercase tracking-wider text-subtle">Packet loss</p>
                <p className="mt-1 font-mono text-sm font-semibold text-app">{settings.data?.packet_loss_threshold_pct ?? '—'}%</p>
              </div>
            </div>
            <InfoNote className="mt-3">Thresholds can be adjusted in Settings. This page never changes network devices.</InfoNote>
          </section>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <section className="panel overflow-hidden">
          <div className="border-b border-app p-4">
            <SectionHeader icon={Signal} title="Packet loss history" subtitle="Each bar is an actual stored probe result" />
          </div>
          <div className="p-4">
            {chartData.length ? (
              <div className="h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 5" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={55} tick={{ fontSize: 9 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9 }} width={38} domain={[0, 100]} unit="%" />
                    <Tooltip content={<ChartTooltip unit="%" />} />
                    <Bar dataKey="packet_loss_pct" name="Packet loss" radius={[2, 2, 0, 0]}>
                      {chartData.map((item, index) => <Cell key={index} fill={item.is_online ? 'var(--success)' : 'var(--danger)'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState icon={Network} compact title="No packet-loss samples yet" />}
          </div>
        </section>

        <section className="panel p-4">
          <SectionHeader icon={Server} title="Host & interfaces" subtitle={network.data ? `${network.data.hostname} · ${network.data.platform}` : 'Reading host network details'} />
          <div className="mt-3 space-y-2">
            {interfaceList.slice(0, 6).map((iface) => (
              <div key={iface.name} className="rounded-lg border border-app bg-accent/[0.03] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10.5px] font-medium text-app">{iface.name}</span>
                  <Badge tone={iface.is_up ? 'success' : 'neutral'} dot>{iface.is_up ? 'Up' : 'Down'}</Badge>
                </div>
                <p className="mt-1 truncate font-mono text-[9px] text-subtle">{iface.addresses.join(' · ')}</p>
                {iface.speed_mbps && <p className="mt-0.5 text-[9px] text-subtle">{iface.speed_mbps} Mbps</p>}
              </div>
            ))}
            {!interfaceList.length && <p className="py-5 text-center text-[10px] text-subtle">No active IPv4/IPv6 interfaces reported.</p>}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-accent/15 bg-accent/[0.04] px-2.5 py-2 text-[9px] text-accent">
            <Radio className="h-3 w-3" /> Read-only host inspection via psutil
          </div>
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-app p-4 sm:flex-row sm:items-center">
          <SectionHeader icon={Clock3} title="Measurement history" subtitle={`${measurements.length} stored observation(s) in the last ${hours}h`} />
          <Badge tone="info">{history.data?.measurements?.[0]?.data_origin === 'live' ? 'Live probe data' : 'Live probe data'}</Badge>
        </div>
        {measurements.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Timestamp</th><th>Status</th><th>Latency</th><th>Packet loss</th><th>Jitter</th><th>Target</th><th>Origin</th><th>Error</th></tr>
              </thead>
              <tbody>
                {[...measurements].reverse().slice(0, 100).map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap font-mono text-[10px]">{formatDateTime(row.recorded_at)}</td>
                    <td><StatusBadge status={row.is_online ? 'online' : 'offline'}>{row.is_online ? 'Online' : 'Offline'}</StatusBadge></td>
                    <td className="font-mono text-app">{row.latency_ms != null ? `${formatNumber(row.latency_ms)} ms` : '—'}</td>
                    <td className="font-mono">{formatNumber(row.packet_loss_pct)}%</td>
                    <td className="font-mono">{row.jitter_ms != null ? `${formatNumber(row.jitter_ms)} ms` : '—'}</td>
                    <td><span className="code-chip">{row.probe_target}</span></td>
                    <td><Badge tone={row.data_origin === 'live' ? 'success' : 'plum'}>{row.data_origin}</Badge></td>
                    <td className="max-w-[180px] truncate text-[9.5px]" title={row.error_message || ''}>{row.error_message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Radar} title="No measurement history" description="The application does not generate fake values. Run your first authorized network probe to begin the timeline." />
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app pt-3 text-[9.5px] text-subtle">
        <span className="flex items-center gap-1.5"><Info className="h-3 w-3" /> ICMP may be blocked on some networks. A labelled TCP fallback is used only when the ping utility is unavailable.</span>
        <span>{measurements.length ? `Latest ${formatDateTime(latest?.recorded_at)}` : 'Awaiting first probe'}</span>
      </div>
    </div>
  )
}
