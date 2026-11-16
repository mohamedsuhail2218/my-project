import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  Play,
  RefreshCw,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  InfoNote,
  Modal,
  PageHeader,
  PageSkeleton,
  SectionHeader,
  StatusBadge,
  cn,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import { formatDateTime, relativeTime, titleCase } from '../lib/utils'
import { api, getErrorMessage } from '../services/api'

function Duration({ ms }) {
  if (ms == null) return '—'
  if (ms < 1000) return `${Number(ms).toFixed(0)} ms`
  return `${(Number(ms) / 1000).toFixed(2)} s`
}

export default function AutomationTesting() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [runId, setRunId] = useState(null)
  const [starting, setStarting] = useState(false)
  const [selectedTest, setSelectedTest] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const { data, loading, error, reload } = useApi('/tests', { params: runId ? { run_id: runId } : {}, pollMs: 5000 })

  const results = data?.results || []
  const runs = data?.runs || []
  const current = data?.current_run
  const filtered = useMemo(() => (statusFilter ? results.filter((result) => result.status === statusFilter) : results), [results, statusFilter])
  const grouped = useMemo(() => {
    return filtered.reduce((groups, result) => {
      groups[result.suite] = groups[result.suite] || []
      groups[result.suite].push(result)
      return groups
    }, {})
  }, [filtered])

  useEffect(() => {
    if (!data?.current_run && starting) setStarting(false)
  }, [data?.current_run, starting])

  async function startRun() {
    setStarting(true)
    try {
      const response = await api.post('/tests/run')
      setRunId(null)
      toast(response.data.message, 'info', 'Test runner started')
      window.setTimeout(reload, 800)
    } catch (err) {
      toast(getErrorMessage(err), 'error', 'Could not start tests')
      setStarting(false)
    }
  }

  if (loading && !data) return <PageSkeleton cards={4} />
  if (error && !data) return <ErrorPanel message={error} onRetry={reload} />

  const latestRun = runs.find((run) => run.run_id === data?.latest_run_id) || runs[0]
  const isRunning = current?.status === 'running' || starting

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quality engineering"
        title="Automation testing"
        description="Execute the repository's fixed pytest suite, inspect persisted results, and review the Playwright browser automation setup."
        actions={
          hasRole('admin') ? (
            <Button variant="primary" size="sm" icon={isRunning ? RefreshCw : Play} loading={isRunning} onClick={startRun} disabled={isRunning}>
              {isRunning ? 'Tests running…' : 'Run backend tests'}
            </Button>
          ) : <Badge tone="neutral">Admin-only test control</Badge>
        }
      />

      <Alert tone="info" title="Allow-listed testing only">
        The test runner executes one fixed command against this repository's pytest suite. It never accepts arbitrary commands, and it runs in a separate test database context.
      </Alert>

      {isRunning && (
        <div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/[0.05] px-4 py-3.5">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" />
          <div>
            <p className="text-[11px] font-semibold text-accent">Automated test run in progress</p>
            <p className="mt-0.5 text-[10px] text-subtle">Running authentication, monitoring, ML, ticket, device, report and API tests in an isolated subprocess. Results will appear automatically.</p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Latest status', value: latestRun?.status ? titleCase(latestRun.status) : 'No runs', icon: latestRun?.failed ? XCircle : CheckCircle2, accent: latestRun?.status === 'passed' ? 'sage' : latestRun?.status === 'failed' ? 'rust' : 'wine', hint: latestRun ? relativeTime(latestRun.executed_at) : 'Run the suite to begin' },
          { label: 'Tests passed', value: data?.passed ?? 0, icon: CheckCircle2, accent: 'sage', hint: 'In the selected run' },
          { label: 'Tests failed', value: data?.failed ?? 0, icon: AlertTriangle, accent: 'rust', hint: data?.failed ? 'Review failure details' : 'No failed tests' },
          { label: 'Skipped', value: data?.skipped ?? 0, icon: CircleDot, accent: 'ochre', hint: 'Environment-dependent tests' },
        ].map((card) => (
          <div key={card.label} className="panel p-4">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-subtle">{card.label}</p>
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', `stat-accent-${card.accent}`)}><card.icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-2 font-display text-[23px] font-bold text-app">{card.value}</p>
            <p className="mt-1 text-[10px] text-subtle">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_325px]">
        <section className="panel overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-app p-4 sm:flex-row sm:items-center">
            <SectionHeader icon={FileCheck2} title="Test results" subtitle={data?.latest_run_id ? `Run ${data.latest_run_id} · ${results.length} test(s)` : 'No test results yet'} />
            <div className="flex items-center gap-2">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input w-[130px] py-1.5 text-[10px]">
                <option value="">All statuses</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>
          </div>
          {filtered.length ? (
            <div className="space-y-4 p-4">
              {Object.entries(grouped).map(([suite, suiteResults]) => (
                <div key={suite}>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{suite}</p>
                    <span className="text-[9px] text-subtle">{suiteResults.length} test(s)</span>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-app">
                    {suiteResults.map((test, index) => (
                      <button
                        key={test.id}
                        onClick={() => setSelectedTest(test)}
                        className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-accent/[0.03]', index !== 0 && 'border-t border-app')}
                      >
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', test.status === 'passed' ? 'bg-success/10 text-success' : test.status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning')}>
                          {test.status === 'passed' ? <CheckCircle2 className="h-3 w-3" /> : test.status === 'failed' ? <XCircle className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[9.5px] text-app">{test.test_name}</span>
                          <span className="mt-0.5 block text-[8.5px] text-subtle">{formatDateTime(test.executed_at)}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[9px] text-subtle">{Duration(test.duration_ms)}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FlaskConical}
              title={data?.latest_run_id ? 'No tests match this filter' : 'No automated test results recorded'}
              description={data?.latest_run_id ? 'Choose another status filter.' : 'Run the backend pytest suite from this page. Browser tests are executed separately with Playwright from the frontend workspace.'}
              action={hasRole('admin') && !data?.latest_run_id ? <Button variant="primary" icon={Play} onClick={startRun}>Run backend tests</Button> : null}
            />
          )}
        </section>

        <div className="space-y-4">
          <section className="panel p-4">
            <SectionHeader icon={Clock3} title="Run history" subtitle="Persisted JUnit results" />
            <div className="mt-3 space-y-1.5">
              {runs.map((run) => (
                <button
                  key={run.run_id}
                  onClick={() => setRunId(run.run_id)}
                  className={cn('w-full rounded-lg border px-3 py-2.5 text-left transition', run.active ? 'border-accent/30 bg-accent/5' : 'border-app bg-accent/[0.03] hover:border-accent/20')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[9px] text-app">{run.run_id}</span>
                    <StatusBadge status={run.status === 'running' ? 'In Progress' : run.status === 'passed' ? 'passed' : 'failed'}>{run.status}</StatusBadge>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[8.5px] text-subtle">
                    <span>{run.executed_at ? formatDateTime(run.executed_at) : run.started_at ? relativeTime(run.started_at) : '—'}</span>
                    <span>{run.passed ?? 0} passed · {run.failed ?? 0} failed</span>
                  </div>
                </button>
              ))}
              {!runs.length && <p className="py-5 text-center text-[10px] text-subtle">No runs recorded. Start the first suite.</p>}
            </div>
            {data?.latest_run_id && <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => { setRunId(null); reload() }}>View latest run <RefreshCw className="h-3 w-3" /></Button>}
          </section>

          <section className="panel p-4">
            <SectionHeader icon={Terminal} title="Browser automation" subtitle="Playwright end-to-end suite" />
            <div className="mt-3 space-y-2">
              <p className="text-[10px] leading-relaxed text-muted">Playwright verifies sign-in, protected navigation, responsive layout and core dashboard interactions against the running application.</p>
              <div className="rounded-lg border border-app bg-ink-950/60 p-2.5 font-mono text-[9px] leading-relaxed text-sand-300">
                cd frontend<br />npm run test:e2e
              </div>
              <p className="text-[9px] leading-relaxed text-subtle">Reports are written to <span className="code-chip">reports/playwright-report</span>. Browser tests are intentionally not launchable from the API runner.</p>
            </div>
          </section>

          <section className="rounded-xl border border-app bg-accent/[0.03] p-3.5">
            <p className="flex items-center gap-2 text-[10px] font-semibold text-app"><Code2 className="h-3.5 w-3.5 text-plum" /> Test coverage</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Auth', 'API', 'Monitoring', 'ML', 'Tickets', 'Devices', 'Reports', 'Browser'].map((item) => <span key={item} className="code-chip">{item}</span>)}
            </div>
            <InfoNote className="mt-2.5">{data?.note}</InfoNote>
          </section>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-app pt-3 text-[9px] text-subtle">
        <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" /> Fixed test command · isolated subprocess · result persistence</span>
        <span>{data?.latest_run_id ? `Selected run ${data.latest_run_id}` : 'Awaiting first run'}</span>
      </div>

      <Modal open={Boolean(selectedTest)} onClose={() => setSelectedTest(null)} title={selectedTest?.test_name || 'Test result'} subtitle={selectedTest ? `${selectedTest.suite} · ${formatDateTime(selectedTest.executed_at)}` : ''} icon={FlaskConical} size="md">
        {selectedTest && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedTest.status} />
              <span className="text-[10px] text-subtle">Duration {Duration(selectedTest.duration_ms)}</span>
            </div>
            <div className="rounded-lg border border-app bg-ink-950/60 p-3">
              <p className="eyebrow mb-1.5">Details</p>
              <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-muted">{selectedTest.details || 'No failure details were recorded for this test.'}</pre>
            </div>
            <InfoNote>Results are parsed from JUnit XML and retained in the automated_test_results table. The PDF testing report includes the latest recorded run.</InfoNote>
          </div>
        )}
      </Modal>
    </div>
  )
}
