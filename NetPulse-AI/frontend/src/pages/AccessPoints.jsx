import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Eye,
  Gauge,
  History,
  Info,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Radar,
  RefreshCw,
  Router,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
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
  ConfirmModal,
  EmptyState,
  ErrorPanel,
  Field,
  InfoNote,
  Modal,
  PageHeader,
  PageSkeleton,
  SearchInput,
  SectionHeader,
  Select,
  StatusBadge,
  cn,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import { formatDateTime, formatNumber, formatShortDate, formatTime, relativeTime, statusTone } from '../lib/utils'
import { api, getErrorMessage } from '../services/api'

const EMPTY_FORM = {
  name: '',
  location: '',
  ip_address: '',
  mac_address: '',
  vendor: '',
  model: '',
  is_simulated: false,
  notes: '',
}

function MeasurementSource({ value }) {
  return <Badge tone={value === 'live' ? 'success' : 'plum'}>{value === 'live' ? 'Live' : 'Simulation'}</Badge>
}

function AccessPointForm({ open, onClose, accessPoint, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    setError('')
    setForm(
      accessPoint
        ? {
            name: accessPoint.name,
            location: accessPoint.location,
            ip_address: accessPoint.ip_address,
            mac_address: accessPoint.mac_address || '',
            vendor: accessPoint.vendor || '',
            model: accessPoint.model || '',
            is_simulated: accessPoint.is_simulated,
            notes: accessPoint.notes || '',
          }
        : EMPTY_FORM,
    )
  }, [open, accessPoint])

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const payload = { ...form, mac_address: form.mac_address || null, vendor: form.vendor || null, model: form.model || null, notes: form.notes || null }
    try {
      if (accessPoint) await api.patch(`/access-points/${accessPoint.id}`, payload)
      else await api.post('/access-points', payload)
      toast(accessPoint ? 'Access point configuration updated' : 'Access point registered', 'success')
      onSaved()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={accessPoint ? 'Edit access point' : 'Register access point'}
      subtitle={accessPoint ? 'Only administrators can modify configuration history.' : 'Only register devices you are authorized to monitor.'}
      icon={Router}
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" form="access-point-form" loading={saving}>{accessPoint ? 'Save changes' : 'Register device'}</Button>
        </>
      }
    >
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      <form id="access-point-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Access point name" required>
          <input className="input" value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Library Floor 2 AP" required maxLength={120} />
        </Field>
        <Field label="Location" required>
          <input className="input" value={form.location} onChange={(event) => update('location', event.target.value)} placeholder="Building / floor / room" required maxLength={160} />
        </Field>
        <Field label="Management IP address" required hint="Authorized management IP only. Never enter a third-party network.">
          <input className="input font-mono" value={form.ip_address} onChange={(event) => update('ip_address', event.target.value)} placeholder="192.168.1.2" required />
        </Field>
        <Field label="MAC address" hint="Optional. Format: AA:BB:CC:DD:EE:FF">
          <input className="input font-mono" value={form.mac_address} onChange={(event) => update('mac_address', event.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
        </Field>
        <Field label="Vendor">
          <input className="input" value={form.vendor} onChange={(event) => update('vendor', event.target.value)} placeholder="TP-Link / Cisco / Ubiquiti" maxLength={100} />
        </Field>
        <Field label="Model">
          <input className="input" value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="Archer AX55" maxLength={100} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea className="input min-h-[74px]" value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Authorized management details, maintenance window, etc." maxLength={2000} />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-warning/20 bg-warning/[0.04] p-3 sm:col-span-2">
          <input type="checkbox" checked={form.is_simulated} onChange={(event) => update('is_simulated', event.target.checked)} className="mt-0.5 h-4 w-4 accent-warning" />
          <span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-warning"><AlertTriangle className="h-3.5 w-3.5" /> Demonstration / simulated record</span>
            <span className="mt-1 block text-[10px] leading-relaxed text-subtle">
              Simulated checks are clearly labelled, stored with origin “simulation”, and excluded from live health, uptime and auto-ticketing. Use RFC 5737 documentation addresses such as 192.0.2.10.
            </span>
          </span>
        </label>
      </form>
    </Modal>
  )
}

function AccessPointDetail({ accessPointId, onClose }) {
  const detail = useApi(`/access-points/${accessPointId}`, { enabled: Boolean(accessPointId) })
  const performance = useApi(`/access-points/${accessPointId}/performance`, { params: { hours: 24 }, enabled: Boolean(accessPointId), pollMs: 30000 })
  const ap = detail.data
  const points = (performance.data?.points || []).map((point) => ({
    ...point,
    label: `${formatShortDate(point.timestamp)} ${formatTime(point.timestamp).slice(0, 5)}`,
  }))

  if (!accessPointId) return null

  return (
    <Modal open={Boolean(accessPointId)} onClose={onClose} title={ap?.name || 'Access point details'} subtitle={ap ? `${ap.location} · ${ap.ip_address}` : 'Loading configuration and performance'} icon={Router} size="xl">
      {detail.loading && !ap ? (
        <div className="flex h-48 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-accent" /></div>
      ) : detail.error ? (
        <Alert tone="danger">{detail.error}</Alert>
      ) : !ap ? (
        <Alert tone="warning">Access point details are not available.</Alert>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ap.status} />
            <Badge tone={ap.is_simulated ? 'plum' : 'success'}>{ap.is_simulated ? 'Simulated demo record' : 'Real registered device'}</Badge>
            <span className="text-[10px] text-subtle">Checked {relativeTime(ap.last_checked_at)}</span>
          </div>

          {ap.is_simulated && <Alert tone="warning" title="This is a simulation record">Generated check values are labelled and excluded from network health. Add a real authorized AP to collect availability measurements.</Alert>}

          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: 'Uptime', value: performance.data?.uptime_pct != null ? `${formatNumber(performance.data.uptime_pct)}%` : '—' },
              { label: 'Avg latency', value: performance.data?.average_latency_ms != null ? `${formatNumber(performance.data.average_latency_ms)} ms` : '—' },
              { label: 'Avg loss', value: performance.data?.average_packet_loss_pct != null ? `${formatNumber(performance.data.average_packet_loss_pct)}%` : '—' },
              { label: 'Checks (24h)', value: performance.data?.measurements ?? 0 },
            ].map((metric) => (
              <div key={metric.label} className="panel-raised p-3">
                <p className="text-[9px] uppercase tracking-wider text-subtle">{metric.label}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-app">{metric.value}</p>
              </div>
            ))}
          </div>

          <div>
            <SectionHeader icon={Activity} title="24-hour performance" subtitle="Stored AP availability checks only" />
            {points.length ? (
              <div className="mt-3 h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="apPerf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 5" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={40} tick={{ fontSize: 9 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9 }} width={36} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="latency_ms" name="Latency" stroke="var(--accent)" strokeWidth={2} fill="url(#apPerf)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState icon={Radar} compact title="No availability checks yet" description="Run Check Now to collect the first observation for this access point." />}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <SectionHeader icon={Info} title="Registered details" />
              <dl className="mt-3 space-y-2 text-[10.5px]">
                {[
                  ['IP address', ap.ip_address],
                  ['MAC address', ap.mac_address || 'Not recorded'],
                  ['Vendor', ap.vendor || 'Not recorded'],
                  ['Model', ap.model || 'Not recorded'],
                  ['Created', formatDateTime(ap.created_at)],
                  ['Last checked', ap.last_checked_at ? formatDateTime(ap.last_checked_at) : 'Never'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-app pb-2 last:border-0">
                    <dt className="text-subtle">{label}</dt><dd className="text-right font-medium text-app">{value}</dd>
                  </div>
                ))}
              </dl>
              {ap.notes && <p className="mt-3 rounded-lg border border-app bg-accent/[0.03] p-2.5 text-[10px] leading-relaxed text-muted">{ap.notes}</p>}
            </div>
            <div>
              <SectionHeader icon={History} title="Configuration history" subtitle="Admin changes are recorded" />
              <div className="mt-3 max-h-[210px] space-y-2 overflow-y-auto pr-1">
                {(ap.history || []).slice().reverse().map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-app bg-accent/[0.03] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={entry.change_type === 'created' ? 'success' : 'info'}>{entry.change_type}</Badge>
                      <span className="text-[9px] text-subtle">{formatDateTime(entry.changed_at)}</span>
                    </div>
                    <p className="mt-1.5 break-words text-[9.5px] leading-relaxed text-muted">
                      {Object.keys(entry.changes || {}).length
                        ? Object.entries(entry.changes).map(([key, value]) => `${key}: ${typeof value === 'object' && value?.to ? `${value.from ?? '—'} → ${value.to}` : String(value)}`).join(' · ')
                        : 'Initial registration record'}
                    </p>
                  </div>
                ))}
                {!(ap.history || []).length && <p className="py-4 text-[10px] text-subtle">No configuration history.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function AccessPoints() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const { data, loading, error, reload, lastUpdated } = useApi('/access-points', { pollMs: 30000 })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [checkingId, setCheckingId] = useState(null)

  const accessPoints = data || []
  const stats = useMemo(() => ({
    total: accessPoints.length,
    real: accessPoints.filter((ap) => !ap.is_simulated).length,
    online: accessPoints.filter((ap) => !ap.is_simulated && ap.status === 'online').length,
    offline: accessPoints.filter((ap) => !ap.is_simulated && ap.status === 'offline').length,
    simulated: accessPoints.filter((ap) => ap.is_simulated).length,
  }), [accessPoints])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return accessPoints.filter((ap) => {
      if (filter === 'real' && ap.is_simulated) return false
      if (filter === 'simulated' && !ap.is_simulated) return false
      if (filter === 'online' && ap.status !== 'online') return false
      if (filter === 'offline' && ap.status !== 'offline') return false
      if (!term) return true
      return [ap.name, ap.location, ap.ip_address, ap.vendor, ap.model].some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [accessPoints, filter, search])

  async function checkNow(ap) {
    setCheckingId(ap.id)
    try {
      const response = await api.post(`/access-points/${ap.id}/check`)
      toast(response.data.message, ap.is_simulated ? 'info' : response.data.measurement?.is_online ? 'success' : 'warning', ap.name)
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Check failed')
    } finally {
      setCheckingId(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      await api.delete(`/access-points/${deleting.id}`)
      toast('Access point deleted', 'success')
      setDeleting(null)
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Delete failed')
    } finally {
      setDeleteLoading(false)
    }
  }

  if (loading && !data) return <PageSkeleton cards={4} />
  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventory & availability"
        title="Access points"
        description="Register authorized access points, collect management-plane availability checks and keep a configuration audit trail. Simulated records are clearly labelled."
        actions={
          hasRole('admin') ? <Button variant="primary" size="sm" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>Add access point</Button> : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Registered', value: stats.total, hint: 'Real + simulated records', icon: Router, accent: 'wine' },
          { label: 'Real access points', value: stats.real, hint: 'Included in health', icon: Wifi, accent: 'gold' },
          { label: 'Online', value: stats.online, hint: 'Availability probe success', icon: CheckCircle2, accent: 'sage' },
          { label: 'Offline', value: stats.offline, hint: 'Latest probe failed', icon: WifiOff, accent: 'rust' },
          { label: 'Simulated', value: stats.simulated, hint: 'Excluded from live health', icon: Server, accent: 'plum' },
        ].map((stat) => (
          <div key={stat.label} className="panel p-4">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-subtle">{stat.label}</p>
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', `stat-accent-${stat.accent}`)}><stat.icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-2 font-display text-[24px] font-bold text-app">{stat.value}</p>
            <p className="mt-1 text-[10px] text-subtle">{stat.hint}</p>
          </div>
        ))}
      </div>

      <Alert tone="info" title="Authorized monitoring only">
        Add only access points owned or administered by your organization. NetPulse does not scan subnets or attempt to log in to devices. Availability checks use a single authorized probe.
      </Alert>

      <section className="panel overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-app p-4 md:flex-row md:items-center">
          <SectionHeader icon={Router} title="Access point inventory" subtitle={`${filtered.length} record(s) · ${formatNumber(stats.online)} online real AP(s)`} />
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, IP, vendor…" />
            <Select value={filter} onChange={(event) => setFilter(event.target.value)} className="w-[138px]">
              <option value="all">All records</option>
              <option value="real">Real only</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="simulated">Simulated</option>
            </Select>
            <span className="text-[9px] text-subtle">Updated {lastUpdated ? relativeTime(lastUpdated) : '—'}</span>
          </div>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Access point</th><th>Network</th><th>Type</th><th>Status</th><th>Last checked</th><th className="text-right">Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((ap) => (
                  <tr key={ap.id}>
                    <td>
                      <button onClick={() => setDetailId(ap.id)} className="text-left">
                        <p className="text-[11px] font-semibold text-app hover:text-accent">{ap.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[9.5px] text-subtle"><MapPin className="h-2.5 w-2.5" />{ap.location}</p>
                      </button>
                    </td>
                    <td>
                      <p className="font-mono text-[10px] text-app">{ap.ip_address}</p>
                      <p className="mt-0.5 font-mono text-[9px] text-subtle">{ap.mac_address || 'No MAC recorded'}</p>
                    </td>
                    <td><Badge tone={ap.is_simulated ? 'plum' : 'neutral'}>{ap.is_simulated ? 'Simulated' : 'Real'}</Badge></td>
                    <td><StatusBadge status={ap.status} /></td>
                    <td><span className="text-[10px]">{ap.last_checked_at ? relativeTime(ap.last_checked_at) : 'Never'}</span></td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {hasRole('analyst') && <Button size="sm" variant="secondary" icon={Radar} loading={checkingId === ap.id} onClick={() => checkNow(ap)}>Check</Button>}
                        <Button size="sm" variant="ghost" icon={Eye} onClick={() => setDetailId(ap.id)} aria-label="View details" />
                        {hasRole('admin') && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => { setEditing(ap); setFormOpen(true) }} aria-label="Edit access point" />}
                        {hasRole('admin') && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleting(ap)} className="text-danger" aria-label="Delete access point" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Router}
            title={accessPoints.length ? 'No access points match your filters' : 'No access points registered'}
            description={accessPoints.length ? 'Adjust your search or status filter.' : 'Register an authorized access point to monitor availability, or add a clearly-labelled simulation for a classroom demonstration.'}
            action={hasRole('admin') ? <Button icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>Add access point</Button> : null}
          />
        )}
      </section>

      <AccessPointForm open={formOpen} onClose={() => setFormOpen(false)} accessPoint={editing} onSaved={reload} />
      <AccessPointDetail accessPointId={detailId} onClose={() => setDetailId(null)} />
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteLoading}
        danger
        title="Delete access point?"
        message={deleting ? `“${deleting.name}” and its executed check measurements will be permanently deleted. Configuration history for this record will also be removed.` : ''}
        confirmLabel="Delete access point"
      />
    </div>
  )
}
