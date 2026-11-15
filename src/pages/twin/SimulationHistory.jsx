import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  GitBranch,
  History,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  PageHeader,
  Panel,
  Progress,
  StatCard,
} from "../../components/ui";
import { statusTone } from "../../lib/engine";
import { downloadFile, formatDateTime, formatDuration, timeAgo, toCsv } from "../../lib/format";

export default function SimulationHistory() {
  const { state, dispatch, runningRun } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");
  const [mode, setMode] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(
    () =>
      state.runs.filter((run) => {
        const scenarioName =
          state.scenarios.find((scenario) => scenario.id === run.scenarioId)?.name || "";
        return (
          (status === "all" || run.status === status) &&
          (mode === "all" || run.mode === mode) &&
          `${run.id} ${run.scenarioId} ${scenarioName} ${run.initiatedBy}`
            .toLowerCase()
            .includes(query.toLowerCase())
        );
      }),
    [state.runs, state.scenarios, status, mode, query]
  );

  const completed = state.runs.filter((run) => run.status === "completed");
  const blockedRuns = completed.filter((run) => !run.attackerSuccess);
  const averageDuration = completed.length
    ? Math.round(
        completed.reduce((sum, run) => sum + (run.durationMs || 0), 0) / completed.length
      )
    : 0;
  const successRate = completed.length
    ? Math.round((completed.filter((run) => run.attackerSuccess).length / completed.length) * 100)
    : 0;

  const scenarioSummary = useMemo(() => {
    const map = new Map();
    state.runs.forEach((run) => {
      const item = map.get(run.scenarioId) || { runs: 0, success: 0 };
      item.runs += 1;
      if (run.attackerSuccess) item.success += 1;
      map.set(run.scenarioId, item);
    });
    return [...map.entries()]
      .map(([scenarioId, value]) => ({
        scenario: state.scenarios.find((scenario) => scenario.id === scenarioId),
        ...value,
      }))
      .filter((item) => item.scenario)
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 5);
  }, [state.runs, state.scenarios]);

  const exportCsv = () => {
    const csv = toCsv(state.runs, [
      { label: "Run", value: (run) => run.id },
      { label: "Scenario", value: (run) => state.scenarios.find((scenario) => scenario.id === run.scenarioId)?.name || run.scenarioId },
      { label: "Mode", value: (run) => run.mode },
      { label: "Status", value: (run) => run.status },
      { label: "Attacker success", value: (run) => (run.attackerSuccess == null ? "" : run.attackerSuccess ? "yes" : "no") },
      { label: "Reached step", value: (run) => run.reachedStep ?? "" },
      { label: "Total steps", value: (run) => run.totalSteps ?? "" },
      { label: "Risk before", value: (run) => run.riskBefore ?? "" },
      { label: "Risk after", value: (run) => run.riskAfter ?? "" },
      { label: "Started", value: (run) => run.startedAt },
      { label: "Completed", value: (run) => run.completedAt || "" },
      { label: "Initiated by", value: (run) => run.initiatedBy || "" },
    ]);
    downloadFile(`northwind_simulation_history_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "History exported", message: `${state.runs.length} simulation records written to CSV.`, tone: "success" },
    });
  };

  const rerun = (run) => {
    dispatch({ type: "START_RUN", scenarioId: run.scenarioId, mode: run.mode || "single" });
    navigate("/app/twin/simulations");
  };

  const createReport = (run) => {
    const scenario = state.scenarios.find((item) => item.id === run.scenarioId);
    dispatch({
      type: "ADD_REPORT",
      report: {
        title: `${scenario?.name || run.scenarioId} — ${run.id}`,
        type: "Simulation",
        scope: run.id,
        summary: `Attack-path reconstruction for ${run.id}. Attacker ${run.attackerSuccess ? "reached the target" : "was blocked"} after ${run.reachedStep ?? 0} of ${run.totalSteps ?? 0} hops. Risk ${run.riskBefore ?? "—"} → ${run.riskAfter ?? "—"}.`,
        size: "860 KB",
      },
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · Digital twin`}
        title="Every rehearsal leaves a receipt."
        subtitle="Full run history, outcome evidence, risk movement and the people who authorised each simulation. Replay, export or re-run any path."
        actions={
          <>
            <button type="button" className="btn outline" onClick={exportCsv}>
              <Download /> Export CSV
            </button>
            <Link to="/app/twin/simulations" className="btn primary">
              <Play /> New simulation
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Total runs" value={state.runs.length} icon={<History />} tone="info" foot={`${completed.length} completed · ${state.runs.filter((run) => run.status === "running").length} running`} />
        <StatCard label="Attack containment" value={100 - successRate} unit="%" icon={<ShieldCheck />} tone={successRate <= 50 ? "success" : "high"} foot={`${blockedRuns.length} of ${completed.length} paths blocked`} />
        <StatCard label="Average duration" value={formatDuration(averageDuration)} icon={<Clock />} tone="violet" foot="Deterministic one-second cadence per hop" />
        <StatCard label="Last activity" value={state.runs[0]?.id || "—"} icon={<RefreshCw />} tone="medium" foot={state.runs[0] ? timeAgo(state.runs[0].completedAt || state.runs[0].startedAt) : "No runs yet"} />
      </div>

      <div className="content-grid split-2-1 mt-12">
        <Panel
          title="Run history"
          icon={<History size={15} />}
          action={<span className="small-meta">{filtered.length} OF {state.runs.length}</span>}
          flush
        >
          <div className="filters-bar">
            <div className="input-icon search" style={{ maxWidth: 260 }}>
              <Search />
              <input
                className="input"
                placeholder="Search runs, scenarios, analysts…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="chip-row">
              {["all", "completed", "running", "cancelled"].map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`chip${status === item ? " active" : ""}`}
                  onClick={() => setStatus(item)}
                  style={{ textTransform: "capitalize" }}
                >
                  {item}
                </button>
              ))}
            </div>
            <select className="select" value={mode} onChange={(event) => setMode(event.target.value)} style={{ width: 140 }}>
              <option value="all">All modes</option>
              <option value="single">Single run</option>
              <option value="red-blue">Red vs blue</option>
            </select>
          </div>

          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th style={{ width: 26 }} />
                  <th>Run</th>
                  <th>Scenario</th>
                  <th>Mode</th>
                  <th>Outcome</th>
                  <th>Risk</th>
                  <th>Authorised by</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((run) => {
                  const scenario = state.scenarios.find((item) => item.id === run.scenarioId);
                  const expanded = expandedId === run.id;
                  return (
                    <React.Fragment key={run.id}>
                      <tr
                        className="clickable"
                        onClick={() => setExpandedId(expanded ? null : run.id)}
                      >
                        <td>
                          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>{run.id}</td>
                        <td>
                          <div className="strong" style={{ fontSize: 12.5 }}>{scenario?.name || run.scenarioId}</div>
                          <div className="small-meta mt-6">{scenario?.category || "—"}</div>
                        </td>
                        <td>
                          <Badge tone={run.mode === "red-blue" ? "violet" : "neutral"}>
                            {run.mode === "red-blue" ? "red / blue" : "single"}
                          </Badge>
                        </td>
                        <td>
                          {run.status === "running" ? (
                            <Badge tone="high" dot>running</Badge>
                          ) : run.status === "cancelled" ? (
                            <Badge tone="neutral">cancelled</Badge>
                          ) : run.attackerSuccess ? (
                            <Badge tone="critical">reached target</Badge>
                          ) : (
                            <Badge tone="success">blocked</Badge>
                          )}
                        </td>
                        <td>
                          <span className="mono" style={{ fontSize: 12 }}>
                            {run.riskBefore ?? "—"} → {run.riskAfter ?? "—"}
                          </span>
                        </td>
                        <td className="small">{run.initiatedBy}</td>
                        <td className="small-meta">{timeAgo(run.completedAt || run.startedAt)}</td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0, background: "transparent" }}>
                            <div className="history-row-detail">
                              <div className="content-grid split-2-1" style={{ marginTop: 0 }}>
                                <div>
                                  <div className="row wrap" style={{ gap: 8 }}>
                                    <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                                    <Badge tone={run.attackerSuccess ? "critical" : "success"}>
                                      {run.attackerSuccess ? "attacker success" : "attack contained"}
                                    </Badge>
                                    {runningRun?.id === run.id && <Badge tone="high" dot>live</Badge>}
                                    <span className="small-meta">
                                      {formatDateTime(run.completedAt || run.startedAt)}
                                    </span>
                                  </div>
                                  {run.status === "running" ? (
                                    <div className="mt-12">
                                      <div className="row between mb-8">
                                        <span className="small muted">Executing hop {run.cursor} of {run.plan?.length || run.totalSteps}</span>
                                        <span className="small-meta">{Math.round((run.cursor / Math.max(1, run.plan?.length || 1)) * 100)}%</span>
                                      </div>
                                      <Progress value={(run.cursor / Math.max(1, run.plan?.length || 1)) * 100} tone="amber" />
                                    </div>
                                  ) : (
                                    <ul className="mt-12" style={{ paddingLeft: 18, color: "var(--muted)", fontSize: 12.5, lineHeight: 1.7 }}>
                                      {(run.findings || []).length ? run.findings.map((finding, index) => (
                                        <li key={index}>{finding}</li>
                                      )) : <li>No findings were recorded for this run.</li>}
                                    </ul>
                                  )}
                                  <div className="row wrap mt-12" style={{ gap: 6 }}>
                                    <Link to={`/app/twin/attack-paths?scenario=${run.scenarioId}${run.id ? `&run=${run.id}` : ""}`} className="btn outline sm">
                                      <GitBranch size={12} /> Trace path
                                    </Link>
                                    <button type="button" className="btn ghost sm" onClick={() => rerun(run)} disabled={Boolean(runningRun)}>
                                      <RefreshCw /> Re-run
                                    </button>
                                    <button type="button" className="btn ghost sm" onClick={() => createReport(run)}>
                                      <FileText /> Generate report
                                    </button>
                                  </div>
                                </div>
                                <div className="mini-stat-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
                                  <div className="mini-stat"><div className="k">Hops reached</div><div className="v">{run.reachedStep ?? "—"} / {run.totalSteps ?? "—"}</div></div>
                                  <div className="mini-stat"><div className="k">Duration</div><div className="v" style={{ fontSize: 12 }}>{formatDuration(run.durationMs)}</div></div>
                                  <div className="mini-stat"><div className="k">Risk before</div><div className="v" style={{ color: "var(--amber)" }}>{run.riskBefore ?? "—"}</div></div>
                                  <div className="mini-stat"><div className="k">Risk after</div><div className="v" style={{ color: "var(--green)" }}>{run.riskAfter ?? "—"}</div></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty-state">
                <History size={26} />
                <div className="strong">No runs match these filters.</div>
                <div className="small">Clear the search or choose another status.</div>
                <button type="button" className="btn outline sm" onClick={() => { setQuery(""); setStatus("all"); setMode("all"); }}>
                  Reset filters
                </button>
              </div>
            )}
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Outcome distribution" icon={<BarChart3 size={15} />}>
            <div className="stack-6">
              <div className="source-row">
                <span>Reached target</span>
                <Progress value={completed.length ? (completed.filter((run) => run.attackerSuccess).length / completed.length) * 100 : 0} tone="red" />
                <span className="v">{completed.filter((run) => run.attackerSuccess).length}</span>
              </div>
              <div className="source-row">
                <span>Contained</span>
                <Progress value={completed.length ? (blockedRuns.length / completed.length) * 100 : 0} tone="green" />
                <span className="v">{blockedRuns.length}</span>
              </div>
              <div className="source-row">
                <span>Running</span>
                <Progress value={state.runs.filter((run) => run.status === "running").length * 20} tone="amber" />
                <span className="v">{state.runs.filter((run) => run.status === "running").length}</span>
              </div>
              <div className="source-row">
                <span>Cancelled</span>
                <Progress value={state.runs.filter((run) => run.status === "cancelled").length * 20} tone="violet" />
                <span className="v">{state.runs.filter((run) => run.status === "cancelled").length}</span>
              </div>
            </div>
            <div className="notice mt-12">
              <AlertTriangle />
              <div>
                A run is evidence, not a scoreboard. Re-run the same path after a fix and compare the recorded risk movement.
              </div>
            </div>
          </Panel>

          <Panel title="Most exercised scenarios" icon={<Play size={15} />} flush>
            <div className="finding-list">
              {scenarioSummary.map((item) => (
                <Link to={`/app/twin/attack-paths?scenario=${item.scenario.id}`} className="finding-item" key={item.scenario.id} style={{ display: "flex" }}>
                  <span className={`finding-sev-bar ${item.scenario.severity}`} />
                  <div className="finding-body">
                    <div className="finding-title">{item.scenario.name}</div>
                    <div className="finding-meta">
                      <span>{item.runs} run{item.runs === 1 ? "" : "s"}</span>
                      <span>·</span>
                      <span>{item.success} success</span>
                    </div>
                  </div>
                  <ChevronRight size={12} style={{ marginTop: 12 }} />
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="History retention" icon={<Clock size={15} />}>
            <div className="kv-list">
              <div className="kv-row"><span className="k">Retention window</span><span className="v">{state.settings.retentionDays} days</span></div>
              <div className="kv-row"><span className="k">Evidence integrity</span><span className="v green">100%</span></div>
              <div className="kv-row"><span className="k">Report linkage</span><span className="v">{state.reports.filter((report) => report.type === "Simulation").length} packs</span></div>
              <div className="kv-row"><span className="k">Workspace</span><span className="v">{state.org.name}</span></div>
            </div>
            <Link to="/app/reports" className="btn outline block mt-12">
              <FileText /> Open report library
            </Link>
          </Panel>
        </div>
      </div>

      <div className="notice mt-12">
        <CheckCircle2 />
        <div>
          All runs are deterministic and reproducible against the same twin snapshot. The record includes the controls
          encountered, the findings and the resulting risk movement.
        </div>
      </div>
    </div>
  );
}
