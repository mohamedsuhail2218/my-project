import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Clock3,
  Eye,
  Fingerprint,
  Info,
  Laptop,
  LockKeyhole,
  Pencil,
  Radar,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserCheck,
  Wifi,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
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
import { formatDateTime, relativeTime } from '../lib/utils'
import { api, getErrorMessage } from '../services/api'

function DeviceDetail({ deviceId, onClose, onChanged }) {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const { data, loading, error, reload } = useApi(`/devices/${deviceId}/activity`, { enabled: Boolean(deviceId), pollMs: 30000 })
  const [notes, setNotes] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const device = data?.device

  useEffect(() => {
    if (device) {
      setNotes(device.notes || '')
      setDisplayName(device.display_name || '')
    }
  }, [device])

  if (!deviceId) return null

  async function save() {
    setSaving(true)
    try {
      await api.patch(`/devices/${device.id}`, { notes: notes || null, display_name: displayName || null })
      toast('Device record updated', 'success')
      reload()
      onChanged()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Could not update device')
    } finally {
      setSaving(false)
    }
  }

  async function approve() {
    setSaving(true)
    try {
      await api.post(`/devices/${device.id}/approve`)
      toast('Device approved as recognized', 'success')
      reload()
      onChanged()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Approval failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={Boolean(deviceId)} onClose={onClose} title={device?.display_name || 'Device details'} subtitle={device ? `${device.ip_address} · ${device.mac_masked || 'masked MAC unavailable'}` : 'Loading device activity'} icon={Smartphone} size="lg">
      {loading && !device ? (
        <div className="flex h-48 items-center justify-center"><Radar className="h-5 w-5 animate-spin text-accent" /></div>
      ) : error ? (
        <Alert tone="danger">{error}</Alert>
      ) : !device ? (
        <Alert tone="warning">Device details are not available.</Alert>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={device.is_approved ? 'success' : 'warning'} dot>{device.is_approved ? 'Approved' : 'Unrecognized'}</Badge>
            <span className="text-[10px] text-subtle">First seen {formatDateTime(device.first_seen_at)}</span>
          </div>
          <div className="grid gap-2 text-[10.5px] sm:grid-cols-2">
            {[
              ['IP address', device.ip_address],
              ['Masked MAC', device.mac_masked || 'Not available'],
              ['First observed', formatDateTime(device.first_seen_at)],
              ['Last observed', formatDateTime(device.last_seen_at)],
              ['Approval', device.is_approved ? 'Administrator approved' : 'Awaiting administrator'],
              ['Hostname', device.hostname || 'Not resolved (privacy-preserving)'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-app bg-accent/[0.03] p-2.5">
                <p className="text-[9px] uppercase tracking-wider text-subtle">{label}</p>
                <p className="mt-1 break-all font-mono text-[10px] text-app">{value}</p>
              </div>
            ))}
          </div>

          {hasRole('admin') && (
            <div className="space-y-3 rounded-xl border border-app p-3.5">
              <SectionHeader icon={Pencil} title="Administrator metadata" subtitle="Approve the device and assign a recognizable name. MAC identity remains hashed." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Display name">
                  <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Lab printer" maxLength={120} />
                </Field>
                <Field label="Notes">
                  <input className="input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Owner / purpose" maxLength={2000} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={save} loading={saving}>Save metadata</Button>
                {!device.is_approved && <Button size="sm" variant="primary" icon={UserCheck} onClick={approve} loading={saving}>Approve device</Button>}
              </div>
            </div>
          )}

          <div>
            <SectionHeader icon={Clock3} title="Observation history" subtitle="Read-only ARP cache sightings on authorized local subnets" />
            <div className="mt-3 max-h-52 space-y-1.5 overflow-y-auto">
              {(data?.activities || []).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between gap-3 rounded-lg border border-app bg-accent/[0.03] px-3 py-2 text-[10px]">
                  <span className="flex items-center gap-2 text-muted"><Wifi className="h-3 w-3 text-accent" /> {activity.ip_address}</span>
                  <span className="text-subtle">{formatDateTime(activity.seen_at)}</span>
                </div>
              ))}
              {!(data?.activities || []).length && <p className="py-4 text-center text-[10px] text-subtle">No recorded sightings.</p>}
            </div>
          </div>

          <InfoNote>
            NetPulse stores a SHA-256 identity hash and a masked MAC only. It does not capture traffic, DNS history or sensitive device data.
          </InfoNote>
        </div>
      )}
    </Modal>
  )
}

export default function Devices() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const { data, loading, error, reload, lastUpdated } = useApi('/devices', { pollMs: 30000 })
  const [search, setSearch] = useState('')
  const [approval, setApproval] = useState('all')
  const [discovering, setDiscovering] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [approvingId, setApprovingId] = useState(null)

  const devices = data?.devices || []
  const summary = data?.summary || { total: 0, approved: 0, unrecognized: 0 }
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return devices.filter((device) => {
      if (approval === 'approved' && !device.is_approved) return false
      if (approval === 'unrecognized' && device.is_approved) return false
      if (!term) return true
      return [device.display_name, device.hostname, device.ip_address, device.mac_masked].some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [approval, devices, search])

  async function discover() {
    setDiscovering(true)
    try {
      const response = await api.post('/devices/discover')
      toast(response.data.message, response.data.new_devices ? 'warning' : 'success', 'Local ARP observation')
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Discovery failed')
    } finally {
      setDiscovering(false)
    }
  }

  async function approve(device) {
    setApprovingId(device.id)
    try {
      await api.post(`/devices/${device.id}/approve`)
      toast(`${device.display_name || device.ip_address} approved`, 'success')
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Approval failed')
    } finally {
      setApprovingId(null)
    }
  }

  if (loading && !data) return <PageSkeleton cards={3} />
  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Authorized local visibility"
        title="Connected devices"
        description="Observe devices already visible in the operating system ARP cache on local subnets. Approve known devices and flag unrecognized ones — without scanning."
        actions={hasRole('analyst') ? <Button variant="primary" size="sm" icon={Radar} loading={discovering} onClick={discover}>Discover local devices</Button> : null}
      />

      <Alert tone="warning" title="Privacy-preserving by design">
        No active Nmap-style scans, packet capture, or external subnet discovery. The application hashes device identifiers, masks MAC addresses, and stores only local sightings.
      </Alert>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Observed devices', value: summary.total, hint: 'Across approved and unknown records', icon: Smartphone, accent: 'wine' },
          { label: 'Approved devices', value: summary.approved, hint: 'Administrator recognized', icon: ShieldCheck, accent: 'sage' },
          { label: 'Unrecognized', value: summary.unrecognized, hint: 'Requires administrator review', icon: ShieldAlert, accent: 'ochre' },
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

      {summary.unrecognized > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/[0.05] px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="text-[11px] font-semibold text-warning">{summary.unrecognized} unrecognized device(s) observed</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-subtle">Review the masked identity and network activity. Approve only devices you can verify as authorized.</p>
          </div>
        </div>
      )}

      <section className="panel overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-app p-4 md:flex-row md:items-center">
          <SectionHeader icon={Laptop} title="Device registry" subtitle={`${filtered.length} device(s) shown`} />
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search IP, name or masked MAC…" />
            <Select value={approval} onChange={(event) => setApproval(event.target.value)} className="w-[150px]">
              <option value="all">All devices</option>
              <option value="approved">Approved</option>
              <option value="unrecognized">Unrecognized</option>
            </Select>
            <span className="text-[9px] text-subtle">Updated {relativeTime(lastUpdated)}</span>
          </div>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Device</th><th>Network identity</th><th>Status</th><th>First seen</th><th>Last seen</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {filtered.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <button className="flex items-center gap-2.5 text-left" onClick={() => setSelectedId(device.id)}>
                        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', device.is_approved ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                          <Laptop className="h-3.5 w-3.5" />
                        </span>
                        <span>
                          <span className="block text-[11px] font-semibold text-app hover:text-accent">{device.display_name || device.hostname || 'Unnamed local device'}</span>
                          <span className="block font-mono text-[9px] text-subtle">{device.mac_masked || 'Masked MAC unavailable'}</span>
                        </span>
                      </button>
                    </td>
                    <td><span className="code-chip">{device.ip_address}</span></td>
                    <td><Badge tone={device.is_approved ? 'success' : 'warning'} dot>{device.is_approved ? 'Approved' : 'Unrecognized'}</Badge></td>
                    <td><span className="text-[10px]">{relativeTime(device.first_seen_at)}</span></td>
                    <td><span className="text-[10px]">{relativeTime(device.last_seen_at)}</span></td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={Eye} onClick={() => setSelectedId(device.id)}>Details</Button>
                        {hasRole('admin') && !device.is_approved && (
                          <Button size="sm" icon={CheckCircle2} loading={approvingId === device.id} onClick={() => approve(device)}>Approve</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title={devices.length ? 'No devices match your filters' : 'No local devices observed yet'}
            description={devices.length ? 'Try a different search or approval filter.' : 'Run Discover Local Devices. The application reads the OS ARP cache only after an administrator triggers discovery.'}
            action={hasRole('analyst') ? <Button icon={Radar} loading={discovering} onClick={discover}>Observe local ARP cache</Button> : null}
          />
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: LockKeyhole, title: 'Hashed identity', text: 'Raw MAC addresses are not stored as identity keys.' },
          { icon: Fingerprint, title: 'Masked display', text: 'Only the final portions of a MAC may be shown for operational context.' },
          { icon: Activity, title: 'Sighting history', text: 'Each discovery records the local IP and timestamp for audit.' },
        ].map((item) => (
          <div key={item.title} className="panel flex items-start gap-3 p-3.5">
            <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div><p className="text-[10.5px] font-semibold text-app">{item.title}</p><p className="mt-1 text-[9.5px] leading-relaxed text-subtle">{item.text}</p></div>
          </div>
        ))}
      </div>

      <DeviceDetail deviceId={selectedId} onClose={() => setSelectedId(null)} onChanged={reload} />
    </div>
  )
}
