import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Filter,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Ticket,
  Timer,
  UserRound,
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
import { formatDateTime, relativeTime, titleCase } from '../lib/utils'
import { api, getErrorMessage } from '../services/api'

const STATUSES = ['Open', 'In Progress', 'Resolved']
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

function StatMini({ label, value, icon: Icon, tone, hint }) {
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-subtle">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', `stat-accent-${tone}`)}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-2 font-display text-[24px] font-bold text-app">{value}</p>
      <p className="mt-1 text-[10px] text-subtle">{hint}</p>
    </div>
  )
}

function TicketModal({ ticket, onClose, onChanged }) {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [status, setStatus] = useState('Open')
  const [priority, setPriority] = useState('Medium')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [commenting, setCommenting] = useState(false)

  useEffect(() => {
    if (ticket) {
      setStatus(ticket.status)
      setPriority(ticket.priority)
      setComment('')
    }
  }, [ticket])

  async function save() {
    setSaving(true)
    try {
      await api.patch(`/tickets/${ticket.id}`, { status, priority })
      toast('Ticket updated', 'success', ticket.ticket_number)
      onChanged()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  async function addComment(event) {
    event.preventDefault()
    if (!comment.trim()) return
    setCommenting(true)
    try {
      await api.post(`/tickets/${ticket.id}/comments`, { comment: comment.trim() })
      setComment('')
      toast('Comment added', 'success')
      onChanged()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Comment failed')
    } finally {
      setCommenting(false)
    }
  }

  return (
    <Modal open={Boolean(ticket)} onClose={onClose} title={ticket?.title || 'Ticket'} subtitle={ticket ? `${ticket.ticket_number} · ${ticket.source} · created ${formatDateTime(ticket.created_at)}` : ''} icon={Ticket} size="lg">
      {ticket && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} />
            <StatusBadge status={ticket.priority} />
            <Badge tone="neutral">{titleCase(ticket.issue_type)}</Badge>
            {ticket.access_point_id && <Badge tone="plum">AP #{ticket.access_point_id}</Badge>}
          </div>

          <div className="rounded-xl border border-app bg-accent/[0.03] p-3.5">
            <p className="eyebrow">Description</p>
            <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">{ticket.description}</p>
            {ticket.resolved_at && <p className="mt-2 text-[9px] text-success">Resolved {formatDateTime(ticket.resolved_at)}</p>}
          </div>

          {hasRole('analyst') ? (
            <div className="grid gap-3 rounded-xl border border-app p-3.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Status">
                <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                  {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
                  {PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                </Select>
              </Field>
              <Button variant="primary" size="sm" loading={saving} onClick={save}>Save</Button>
            </div>
          ) : (
            <InfoNote>Your role has read-only access to ticket status and comments.</InfoNote>
          )}

          <div>
            <SectionHeader icon={MessageSquare} title="Activity & comments" subtitle={`${ticket.comments?.length || 0} recorded entries`} />
            <div className="mt-3 space-y-2.5">
              {(ticket.comments || []).map((entry) => (
                <div key={entry.id} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/[0.04] text-[9px] font-semibold text-muted">
                    {(entry.author_name || 'S').split(' ').map((part) => part[0]).slice(0, 2).join('')}
                  </span>
                  <div className="min-w-0 flex-1 rounded-lg border border-app bg-accent/[0.03] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[9.5px] font-semibold text-app">{entry.author_name || 'System'}</span>
                      <span className="text-[8.5px] text-subtle">{formatDateTime(entry.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-muted">{entry.comment}</p>
                  </div>
                </div>
              ))}
              {!(ticket.comments || []).length && <p className="py-4 text-center text-[10px] text-subtle">No activity recorded yet.</p>}
            </div>
            {hasRole('analyst') && (
              <form onSubmit={addComment} className="mt-3 flex gap-2">
                <input className="input flex-1" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add an administrator comment…" maxLength={3000} aria-label="Add ticket comment" />
                <Button type="submit" variant="primary" icon={Send} loading={commenting} disabled={!comment.trim()}>Add</Button>
              </form>
            )}
          </div>

          <InfoNote>Duplicate prevention links automatic tickets to ongoing incident fingerprints. Resolving a ticket allows a new ticket for the same condition if it recurs.</InfoNote>
        </div>
      )}
    </Modal>
  )
}

function CreateTicketModal({ open, onClose, onCreated }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ title: '', description: '', priority: 'Medium', issue_type: 'manual', access_point_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const accessPoints = useApi('/access-points', { enabled: open })

  useEffect(() => {
    if (open) {
      setForm({ title: '', description: '', priority: 'Medium', issue_type: 'manual', access_point_id: '' })
      setError('')
    }
  }, [open])

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.post('/tickets', { ...form, access_point_id: form.access_point_id ? Number(form.access_point_id) : null })
      toast('Manual issue ticket created', 'success')
      onCreated()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create issue ticket" subtitle="Log an observed issue when no automatic rule fired." icon={Plus} size="md">
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title" required>
          <input className="input" required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Short summary of the issue" />
        </Field>
        <Field label="Description" required>
          <textarea className="input min-h-[100px]" required maxLength={5000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Observed behaviour, users affected, and checks already performed." />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority">
            <Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</Select>
          </Field>
          <Field label="Access point (optional)">
            <Select value={form.access_point_id} onChange={(event) => setForm({ ...form, access_point_id: event.target.value })}>
              <option value="">No specific AP</option>
              {(accessPoints.data || []).filter((ap) => !ap.is_simulated).map((ap) => <option key={ap.id} value={ap.id}>{ap.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-app pt-3">
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>Create ticket</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Issues() {
  const { hasRole } = useAuth()
  const { data, loading, error, reload, lastUpdated } = useApi('/tickets', { pollMs: 25000 })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [selected, setSelected] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)

  const tickets = data?.tickets || []
  const stats = data?.stats || { open: 0, in_progress: 0, resolved: 0, critical: 0, total: 0 }
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (status && ticket.status !== status) return false
      if (priority && ticket.priority !== priority) return false
      if (!term) return true
      return [ticket.ticket_number, ticket.title, ticket.description, ticket.issue_type].some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [priority, search, status, tickets])

  function refreshTicket() {
    reload()
    if (selected) {
      window.setTimeout(() => {
        setSelected((current) => current)
      }, 0)
    }
  }

  const selectedTicket = selected ? tickets.find((ticket) => ticket.id === selected.id) || selected : null

  if (loading && !data) return <PageSkeleton cards={4} />
  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accountable incident response"
        title="Issue management"
        description="Automatic rule-generated tickets, duplicate suppression, priority tracking and a complete administrator comment trail."
        actions={hasRole('analyst') ? <Button variant="primary" size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>New ticket</Button> : null}
      />

      {stats.critical > 0 && (
        <Alert tone="danger" title={`${stats.critical} unresolved critical ticket(s)`}>
          Review critical connectivity or packet-loss incidents and follow Smart Troubleshooting before making any authorized changes.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatMini label="Open" value={stats.open} icon={CircleDot} tone="ochre" hint="Awaiting triage" />
        <StatMini label="In progress" value={stats.in_progress} icon={Timer} tone="wine" hint="Under investigation" />
        <StatMini label="Resolved" value={stats.resolved} icon={CheckCircle2} tone="sage" hint="Closed incidents" />
        <StatMini label="Critical unresolved" value={stats.critical} icon={ShieldAlert} tone="rust" hint="Priority escalation" />
        <StatMini label="Total issues" value={stats.total} icon={Ticket} tone="plum" hint="Automatic + manual" />
      </div>

      <section className="panel overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-app p-4 xl:flex-row xl:items-center">
          <SectionHeader icon={Ticket} title="Ticket register" subtitle={`${filtered.length} ticket(s) shown · updated ${relativeTime(lastUpdated)}`} />
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search ticket number or title…" />
            <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-[130px]">
              <option value="">All statuses</option>{STATUSES.map((value) => <option key={value}>{value}</option>)}
            </Select>
            <Select value={priority} onChange={(event) => setPriority(event.target.value)} className="w-[125px]">
              <option value="">All priorities</option>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}
            </Select>
          </div>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Ticket</th><th>Issue</th><th>Priority</th><th>Status</th><th>Source</th><th>Created</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                {filtered.map((ticket) => (
                  <tr key={ticket.id} className="cursor-pointer" onClick={() => setSelected(ticket)}>
                    <td><span className="font-mono text-[10px] font-semibold text-accent">{ticket.ticket_number}</span></td>
                    <td>
                      <p className="max-w-[300px] truncate text-[11px] font-semibold text-app">{ticket.title}</p>
                      <p className="mt-0.5 text-[9px] text-subtle">{titleCase(ticket.issue_type)}{ticket.access_point_id ? ` · AP #${ticket.access_point_id}` : ''}</p>
                    </td>
                    <td><StatusBadge status={ticket.priority} /></td>
                    <td><StatusBadge status={ticket.status} /></td>
                    <td><Badge tone={ticket.source === 'automatic' ? 'info' : 'neutral'}>{ticket.source}</Badge></td>
                    <td><span className="text-[9.5px]">{relativeTime(ticket.created_at)}</span></td>
                    <td><span className="text-[9.5px]">{relativeTime(ticket.updated_at)}</span></td>
                    <td><div className="flex items-center justify-end text-subtle"><MessageSquare className="mr-1 h-3 w-3" /><span className="mr-2 text-[9px]">{ticket.comments?.length || 0}</span><ChevronRight className="h-3.5 w-3.5" /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={tickets.length ? Search : Ticket}
            title={tickets.length ? 'No tickets match these filters' : 'No issue tickets yet'}
            description={tickets.length ? 'Clear search or adjust status and priority filters.' : 'Automatic monitoring tickets appear when latency, loss, connectivity or AP availability crosses configured thresholds. You can also log a manual incident.'}
            action={hasRole('analyst') && !tickets.length ? <Button icon={Plus} onClick={() => setCreateOpen(true)}>Create manual ticket</Button> : null}
          />
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app pt-3 text-[9px] text-subtle">
        <span className="flex items-center gap-1.5"><Filter className="h-3 w-3" /> {tickets.length} total ticket records</span>
        <span>Auto-ticket duplicates are suppressed while an incident remains Open or In Progress.</span>
      </div>

      <TicketModal ticket={selectedTicket} onClose={() => setSelected(null)} onChanged={refreshTicket} />
      <CreateTicketModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={reload} />
    </div>
  )
}
