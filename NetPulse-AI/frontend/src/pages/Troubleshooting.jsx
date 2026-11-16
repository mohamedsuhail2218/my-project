import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  History,
  Info,
  ListChecks,
  LockKeyhole,
  Radar,
  Search,
  ShieldCheck,
  Stethoscope,
  Ticket,
  Wrench,
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
  StatusBadge,
  cn,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import { formatDateTime, relativeTime, titleCase } from '../lib/utils'
import { api, getErrorMessage } from '../services/api'

const ISSUE_LABELS = {
  connectivity_down: 'Connectivity failure',
  high_latency: 'High latency',
  packet_loss: 'Packet loss',
  ap_unavailable: 'Access point unavailable',
  ai_anomaly: 'AI network anomaly',
  no_issue_detected: 'No issue detected',
  insufficient_data: 'Insufficient data',
  simulated_access_point: 'Simulated access point',
}

export default function Troubleshooting() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [accessPointId, setAccessPointId] = useState('')
  const [running, setRunning] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const { data, loading, error, reload } = useApi('/troubleshooting', { params: { limit: 40 }, enabled: true })
  const accessPoints = useApi('/access-points', { pollMs: 60000 })

  const recommendations = data || []
  const selected = useMemo(
    () => recommendations.find((item) => item.id === selectedId) || recommendations[0],
    [recommendations, selectedId],
  )

  useEffect(() => {
    if (!selectedId && recommendations[0]) setSelectedId(recommendations[0].id)
  }, [recommendations, selectedId])

  async function runDiagnosis() {
    setRunning(true)
    try {
      const response = await api.post('/troubleshooting/run', { access_point_id: accessPointId ? Number(accessPointId) : null })
      toast('Rule-based diagnosis completed', 'success', response.data.issue_type === 'no_issue_detected' ? 'No issue detected' : ISSUE_LABELS[response.data.issue_type] || 'Diagnosis ready')
      setSelectedId(response.data.id)
      reload()
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Diagnosis failed')
    } finally {
      setRunning(false)
    }
  }

  if (loading && !data) return <PageSkeleton cards={3} />
  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Safe guided remediation"
        title="Smart troubleshooting"
        description="Turn live measurements into explainable possible causes and authorized diagnostic steps. The engine is rule-based first; no router or AP configuration is ever changed."
        actions={
          hasRole('analyst') ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={accessPointId} onChange={(event) => setAccessPointId(event.target.value)} className="w-[220px]">
                <option value="">Whole-network probe</option>
                {(accessPoints.data || []).map((ap) => <option key={ap.id} value={ap.id}>{ap.is_simulated ? '[SIMULATED] ' : ''}{ap.name}</option>)}
              </Select>
              <Button variant="primary" size="sm" icon={Stethoscope} loading={running} onClick={runDiagnosis}>Run diagnosis</Button>
            </div>
          ) : null
        }
      />

      <Alert tone="info" title="No automated changes — by design">
        NetPulse AI only recommends human diagnostic steps. It does not log in to, restart, reconfigure or reboot routers and access points, and it never changes firewall or Wi-Fi settings.
      </Alert>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <section className="panel overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-app p-4 sm:flex-row sm:items-center">
            <SectionHeader icon={Wrench} title={selected ? ISSUE_LABELS[selected.issue_type] || titleCase(selected.issue_type) : 'Diagnosis workspace'} subtitle={selected ? `Generated ${formatDateTime(selected.generated_at)}` : 'Run a diagnosis to generate guidance'} />
            {selected && <StatusBadge status={selected.severity} />}
          </div>

          {selected ? (
            <div className="space-y-5 p-5">
              <div className="relative overflow-hidden rounded-xl border border-app bg-gradient-to-br from-accent/[0.06] to-transparent p-4">
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                    selected.severity === 'Critical' ? 'border-danger/20 bg-danger/10 text-danger' : selected.severity === 'High' ? 'border-warning/20 bg-warning/10 text-warning' : 'border-success/20 bg-success/10 text-success',
                  )}>
                    {selected.issue_type === 'no_issue_detected' ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="eyebrow">Detected issue</p>
                    <p className="mt-1 text-[12px] font-medium leading-relaxed text-app">{selected.detected_issue}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={selected.severity === 'Critical' ? 'danger' : selected.severity === 'High' ? 'warning' : selected.severity === 'Medium' ? 'info' : 'success'}>{selected.severity} severity</Badge>
                      <Badge tone="neutral">{ISSUE_LABELS[selected.issue_type] || selected.issue_type}</Badge>
                      {selected.access_point_id && <Badge tone="plum">AP #{selected.access_point_id}</Badge>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <SectionHeader icon={Search} title="Possible causes" subtitle="Investigate these hypotheses — do not assume one is true" />
                  <ul className="mt-3 space-y-2">
                    {selected.possible_causes.map((cause, index) => (
                      <li key={index} className="flex items-start gap-2.5 rounded-lg border border-app bg-accent/[0.03] p-2.5 text-[10px] leading-relaxed text-muted">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warning/10 font-mono text-[8px] text-warning">{index + 1}</span>
                        {cause}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <SectionHeader icon={ListChecks} title="Recommended diagnostic steps" subtitle="Perform only within your authorization" />
                  <ol className="mt-3 space-y-2">
                    {selected.recommended_steps.map((step, index) => (
                      <li key={index} className="flex items-start gap-2.5 text-[10px] leading-relaxed text-muted">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-accent/20 bg-accent/10 font-mono text-[8px] text-accent">{String(index + 1).padStart(2, '0')}</span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-accent/[0.03] px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-subtle">
                  <Ticket className="h-3.5 w-3.5" />
                  <span>Previous related incidents:</span>
                  {selected.related_incident_ids?.length
                    ? selected.related_incident_ids.map((id) => <Link key={id} to="/issues" className="rounded border border-app px-1.5 py-0.5 font-mono text-[9px] text-accent hover:border-accent/30">#{id}</Link>)
                    : <span>None in the last 30 days</span>}
                </div>
                <span className="flex items-center gap-1.5 text-[9px] text-subtle"><LockKeyhole className="h-3 w-3" /> Read-only diagnosis</span>
              </div>

              <InfoNote>{selected.safety_note}</InfoNote>
            </div>
          ) : (
            <EmptyState
              icon={Stethoscope}
              title="No diagnosis generated yet"
              description="Run the rule engine to translate the latest live measurement into safe, prioritized troubleshooting steps."
              action={hasRole('analyst') ? <Button variant="primary" icon={Stethoscope} loading={running} onClick={runDiagnosis}>Run diagnosis</Button> : null}
            />
          )}
        </section>

        <div className="space-y-4">
          <section className="panel">
            <div className="border-b border-app p-4">
              <SectionHeader icon={History} title="Diagnosis history" subtitle="Recent recommendations" />
            </div>
            <div className="max-h-[480px] divide-y divide-[var(--border)] overflow-y-auto">
              {recommendations.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-accent/[0.025]', selected?.id === item.id && 'bg-accent/[0.04]')}
                >
                  <span className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', item.severity === 'Critical' ? 'bg-danger' : item.severity === 'High' ? 'bg-warning' : item.severity === 'Medium' ? 'bg-accent' : 'bg-success')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10.5px] font-medium text-app">{ISSUE_LABELS[item.issue_type] || titleCase(item.issue_type)}</span>
                    <span className="mt-0.5 block line-clamp-1 text-[9px] text-subtle">{item.detected_issue}</span>
                    <span className="mt-1 block text-[8.5px] text-subtle">{relativeTime(item.generated_at)} · {item.severity}</span>
                  </span>
                  {selected?.id === item.id && <ChevronRight className="mt-1 h-3.5 w-3.5 text-accent" />}
                </button>
              ))}
              {!recommendations.length && <div className="px-4 py-8 text-center text-[10px] text-subtle">No diagnoses recorded yet.</div>}
            </div>
          </section>

          <section className="panel p-4">
            <SectionHeader icon={ShieldCheck} title="Safety guardrails" />
            <ul className="mt-3 space-y-2.5">
              {[
                'No automatic router or AP changes',
                'ICMP and read-only ARP observations only',
                'Admin authorization required for device scope',
                'Human verification before any remediation',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[10px] leading-relaxed text-muted"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />{item}</li>
              ))}
            </ul>
          </section>

          <div className="rounded-xl border border-app bg-accent/[0.03] p-3.5">
            <p className="flex items-center gap-2 text-[10px] font-semibold text-app"><Bot className="h-3.5 w-3.5 text-plum" /> AI enhancement</p>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-subtle">Optional AI-generated explanations can supplement the reliable rule engine, but never replace deterministic diagnostic steps or authorization checks.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
