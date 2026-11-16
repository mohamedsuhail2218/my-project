import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  KeyRound,
  LockKeyhole,
  Mail,
  Moon,
  Plus,
  Radar,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  Sun,
  Ticket,
  UserPlus,
  UserRound,
  Users,
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
  SectionHeader,
  Select,
  Toggle,
  cn,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import { formatDateTime, relativeTime } from '../lib/utils'
import { api, getErrorMessage } from '../services/api'

function CreateUserModal({ open, onClose, onCreated }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'viewer' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm({ full_name: '', email: '', password: '', role: 'viewer' })
      setError('')
    }
  }, [open])

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.post('/auth/users', form)
      toast('User account created', 'success', form.email)
      onCreated()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create user account" subtitle="Assign the minimum role required for the person's job." icon={UserPlus} size="md">
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" required>
          <input className="input" required minLength={2} maxLength={120} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} placeholder="Network administrator" />
        </Field>
        <Field label="Email address" required>
          <input type="email" className="input" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@college.edu" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Temporary password" required hint="Minimum 10 characters. Share through a secure channel.">
            <input type="password" className="input" required minLength={10} maxLength={256} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 10 characters" autoComplete="new-password" />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="viewer">Viewer — read only</option>
              <option value="analyst">Analyst — run checks & manage issues</option>
              <option value="admin">Admin — full configuration</option>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-app pt-3">
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>Create user</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Settings() {
  const { user, hasRole } = useAuth()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const settings = useApi('/settings')
  const system = useApi('/settings/system', { pollMs: 60000 })
  const users = useApi('/auth/users', { enabled: hasRole('admin') })
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [createUserOpen, setCreateUserOpen] = useState(false)

  useEffect(() => {
    if (settings.data && !form) {
      setForm({
        latency_threshold_ms: settings.data.latency_threshold_ms,
        packet_loss_threshold_pct: settings.data.packet_loss_threshold_pct,
        auto_tickets_enabled: settings.data.auto_tickets_enabled,
        auto_anomaly_detection: settings.data.auto_anomaly_detection,
        theme_default: settings.data.theme_default,
        organization_name: settings.data.organization_name,
      })
    }
  }, [settings.data, form])

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      const response = await api.patch('/settings', form)
      setForm((current) => ({
        ...current,
        latency_threshold_ms: response.data.latency_threshold_ms,
        packet_loss_threshold_pct: response.data.packet_loss_threshold_pct,
        auto_tickets_enabled: response.data.auto_tickets_enabled,
        auto_anomaly_detection: response.data.auto_anomaly_detection,
        theme_default: response.data.theme_default,
        organization_name: response.data.organization_name,
      }))
      setTheme(form.theme_default)
      toast('Workspace settings saved', 'success')
      system.reload()
    } catch (err) {
      setSaveError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (settings.loading && !settings.data) return <PageSkeleton cards={3} />
  if (settings.error && !settings.data) return <ErrorPanel message={settings.error} onRetry={settings.reload} />
  if (!form) return null

  const admin = hasRole('admin')
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace administration"
        title="Settings"
        description="Configure operational thresholds, automation guardrails, team access and workspace appearance."
        actions={<Button variant="primary" size="sm" icon={Save} onClick={save} loading={saving} disabled={!admin}>Save settings</Button>}
      />

      {saveError && <Alert tone="danger" title="Could not save settings">{saveError}</Alert>}
      {!admin && <Alert tone="info" title="Read-only configuration view">Only administrators can change workspace settings. Your role can still use monitoring and issue workflows where permitted.</Alert>}

      <div className="grid gap-4 xl:grid-cols-[1fr_350px]">
        <form onSubmit={save} className="space-y-4">
          <section className="panel p-4 sm:p-5">
            <SectionHeader icon={Gauge} title="Monitoring thresholds" subtitle="Used by live checks and automatic ticket creation" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="High latency threshold (ms)" hint="Live measurements at or above this value can open a ticket.">
                <input type="number" min="1" max="5000" step="1" className="input" disabled={!admin} value={form.latency_threshold_ms} onChange={(event) => update('latency_threshold_ms', Number(event.target.value))} />
              </Field>
              <Field label="Packet-loss threshold (%)" hint="Sustained loss at or above this value triggers escalation.">
                <input type="number" min="0" max="100" step="0.1" className="input" disabled={!admin} value={form.packet_loss_threshold_pct} onChange={(event) => update('packet_loss_threshold_pct', Number(event.target.value))} />
              </Field>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ['Probe target', settings.data.monitor_target],
                ['Interval', `${settings.data.monitoring_interval_seconds}s`],
                ['Discovery', settings.data.device_discovery_enabled ? 'ARP read-only' : 'Disabled'],
              ].map(([label, value]) => (
                <div key={label} className="panel-raised p-2.5">
                  <p className="text-[9px] uppercase tracking-wider text-subtle">{label}</p>
                  <p className="mt-1 truncate font-mono text-[10px] text-app">{value}</p>
                </div>
              ))}
            </div>
            <InfoNote className="mt-3">Probe target, interval and discovery are environment-managed in <span className="code-chip">backend/.env</span> so an API request cannot redirect monitoring at an unauthorized host.</InfoNote>
          </section>

          <section className="panel p-4 sm:p-5">
            <SectionHeader icon={Ticket} title="Automation & safety" subtitle="Guardrails for AI and ticket automation" />
            <div className="mt-2 divide-y divide-[var(--border)]">
              <Toggle label="Automatic issue tickets" description="Create one ticket per ongoing threshold incident. Duplicate fingerprints are suppressed." checked={form.auto_tickets_enabled} onChange={(value) => update('auto_tickets_enabled', value)} disabled={!admin} />
              <Toggle label="Automatic AI anomaly detection" description="Run Isolation Forest after scheduled and manual live probes. High/Critical events can escalate." checked={form.auto_anomaly_detection} onChange={(value) => update('auto_anomaly_detection', value)} disabled={!admin} />
              <Toggle label="Automatic configuration changes" description="Permanently disabled by design. No router, AP, firewall or Wi-Fi configuration is modified." checked={false} onChange={() => {}} disabled />
            </div>
          </section>

          <section className="panel p-4 sm:p-5">
            <SectionHeader icon={Settings2} title="Workspace identity" subtitle="Display details used across the application" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Organization name">
                <input className="input" disabled={!admin} value={form.organization_name} onChange={(event) => update('organization_name', event.target.value)} maxLength={120} />
              </Field>
              <Field label="Default theme">
                <Select value={form.theme_default} onChange={(event) => update('theme_default', event.target.value)} disabled={!admin}>
                  <option value="dark">Dark operations theme</option>
                  <option value="light">Light operations theme</option>
                </Select>
              </Field>
            </div>
          </section>

          {admin && <div className="flex justify-end"><Button type="submit" variant="primary" icon={Save} loading={saving}>Save workspace settings</Button></div>}
        </form>

        <div className="space-y-4">
          <section className="panel p-4">
            <SectionHeader icon={UserRound} title="Your account" subtitle="Signed-in session" />
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-sm font-bold text-accent">
                {(user?.full_name || 'NP').split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-app">{user?.full_name}</p>
                <p className="truncate text-[9.5px] text-subtle">{user?.email}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-[10px]">
              <div className="flex justify-between gap-2"><span className="text-subtle">Role</span><Badge tone={user?.role === 'admin' ? 'info' : 'neutral'} className="capitalize">{user?.role}</Badge></div>
              <div className="flex justify-between gap-2"><span className="text-subtle">Last sign-in</span><span className="text-app">{user?.last_login_at ? relativeTime(user.last_login_at) : 'Current session'}</span></div>
              <div className="flex justify-between gap-2"><span className="text-subtle">Auth method</span><span className="text-app">JWT access token</span></div>
              <div className="flex justify-between gap-2"><span className="text-subtle">Password</span><span className="flex items-center gap-1 text-success"><LockKeyhole className="h-3 w-3" /> Argon2 hashed</span></div>
            </div>
          </section>

          <section className="panel p-4">
            <SectionHeader icon={Sun} title="Appearance" subtitle="Applies immediately on this browser" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setTheme('dark'); update('theme_default', 'dark') }} className={cn('rounded-lg border p-3 text-left transition', theme === 'dark' ? 'border-accent/35 bg-accent/[0.06]' : 'border-app')}>
                <Moon className="h-4 w-4 text-accent" /><p className="mt-2 text-[10px] font-semibold text-app">Dark operations</p><p className="mt-0.5 text-[8.5px] text-subtle">Default · low-light NOC</p>
              </button>
              <button type="button" onClick={() => { setTheme('light'); update('theme_default', 'light') }} className={cn('rounded-lg border p-3 text-left transition', theme === 'light' ? 'border-accent/35 bg-accent/[0.06]' : 'border-app')}>
                <Sun className="h-4 w-4 text-warning" /><p className="mt-2 text-[10px] font-semibold text-app">Light workspace</p><p className="mt-0.5 text-[8.5px] text-subtle">Bright room presentation</p>
              </button>
            </div>
          </section>

          <section className="panel p-4">
            <SectionHeader icon={Server} title="System status" subtitle="Runtime capabilities" />
            <div className="mt-3 space-y-2 text-[10px]">
              {[
                ['API', system.data?.status || '—'],
                ['Database', system.data?.database || '—'],
                ['Environment', system.data?.environment || '—'],
                ['Monitoring', system.data?.monitoring_enabled ? 'Enabled' : 'Disabled'],
                ['Test runner', system.data?.test_runner_enabled ? 'Enabled' : 'Disabled'],
                ['Server time', system.data?.time_utc ? formatDateTime(system.data.time_utc) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-app pb-2 last:border-0 last:pb-0">
                  <span className="text-subtle">{label}</span>
                  <span className={cn('text-right font-medium', label === 'API' || label === 'Database' ? 'text-success' : 'text-app')}>{value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {admin && (
        <section className="panel overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-app p-4 sm:flex-row sm:items-center">
            <SectionHeader icon={Users} title="Team access" subtitle="Role-based access control for this workspace" />
            <Button size="sm" icon={Plus} onClick={() => setCreateUserOpen(true)}>Add user</Button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Created</th></tr></thead>
              <tbody>
                {(users.data || []).map((account) => (
                  <tr key={account.id}>
                    <td><span className="font-medium text-app">{account.full_name}</span>{account.id === user?.id && <span className="ml-2 text-[8px] text-accent">YOU</span>}</td>
                    <td className="font-mono text-[10px]">{account.email}</td>
                    <td><Badge tone={account.role === 'admin' ? 'info' : account.role === 'analyst' ? 'plum' : 'neutral'} className="capitalize">{account.role}</Badge></td>
                    <td><Badge tone={account.is_active ? 'success' : 'danger'} dot>{account.is_active ? 'Active' : 'Disabled'}</Badge></td>
                    <td>{account.last_login_at ? relativeTime(account.last_login_at) : 'Never'}</td>
                    <td>{formatDateTime(account.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-app px-4 py-2.5"><InfoNote>Roles: Viewer can read; Analyst can run diagnostics and manage issues; Admin can change configuration, devices, reports and tests.</InfoNote></div>
        </section>
      )}

      <CreateUserModal open={createUserOpen} onClose={() => setCreateUserOpen(false)} onCreated={users.reload} />
    </div>
  )
}
