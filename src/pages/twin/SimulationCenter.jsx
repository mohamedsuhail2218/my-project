import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Crosshair,
  Flame,
  GitBranch,
  Globe,
  KeyRound,
  Layers,
  Pause,
  Play,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  UserRound,
  XCircle,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  PageHeader,
  Panel,
  Progress,
  SeverityBadge,
  StatCard,
} from "../../components/ui";
import {
  evaluateScenario,
  riskLabel,
  scenarioRisk,
  severityRank,
  statusTone,
} from "../../lib/engine";
import { formatDateTime, timeAgo } from "../../lib/format";

const CATEGORY_ICONS = {
  "Initial access": Globe,
  "Credential access": KeyRound,
  Impact: Flame,
  "Lateral movement": GitBranch,
  Cloud: Cloud,
  Insider: UserRound,
  "Supply chain": Layers,
  Availability: Radio,
  Exfiltration: Upload,
};

const MODES = [
  { id: "single", label: "Single run", detail: "One attacker path, fully traced." },
  { id: "red-blue", label: "Red vs blue", detail: "Same path, scored as an exercise." },
];

function TerminalLine({ time, children, tone = "" }) {
  return (
    <div className={`terminal-line ${tone}`}>
      <span className="t">{time}</span>
      <span>{children}</span>
    </div>
  );
}

export default function SimulationCenter() {
  const { state, dispatch, runningRun, risk } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("scenario");
  const scenarioId =
    requested && state.scenarios.some((scenario) => scenario.id === requested)
      ? requested
      : state.scenarios[0]?.id;
  const scenario = state.scenarios.find((item) => item.id === scenarioId) || state.scenarios[0];
  const [mode, setMode] = useState("single");
  const [category, setCategory] = useState("All");
  const [showLatest, setShowLatest] = useState(false);

  const evaluation = useMemo(
    () => evaluateScenario(scenario, state.assets),
    [scenario, state.assets]
  );

  const liveRun = runningRun && runningRun.scenarioId === scenario.id ? runningRun : null;
  const latestRun = useMemo(
    () =>
      state.runs.find(
        (run) => run.scenarioId === scenario.id && run.status === "completed"
      ) || null,
    [state.runs, scenario.id]
  );

  const completedPlan =
    showLatest && latestRun?.plan?.length ? latestRun.plan : null;
  const previewSteps = completedPlan || evaluation.steps;
  const categories = ["All", ...new Set(state.scenarios.map((item) => item.category))];
  const filteredScenarios = state.scenarios.filter(
    (item) => category === "All" || item.category === category
  );

  const openPaths = state.scenarios.filter(
    (item) => evaluateScenario(item, state.assets).attackerSuccess
  ).length;

  const terminalLines = liveRun
    ? [
        {
          time: new Date(liveRun.startedAt).toLocaleTimeString(undefined, { hour12: false }),
          tone: "info",
          text: `authorised twin session · ${liveRun.id} · ${scenario.name}`,
        },
        ...(liveRun.executed || []).map((step) => ({
          time: new Date(step.revealedAt || liveRun.startedAt).toLocaleTimeString(undefined, {
            hour12: false,
          }),
          tone: step.status === "blocked" ? "ok" : step.status === "success" ? "bad" : "warn",
          text: `${String(step.index + 1).padStart(2, "0")} ${step.status.toUpperCase().padEnd(8)} ${
            step.technique
          } · ${step.narrative}`,
        })),
      ]
    : completedPlan
    ? [
        {
          time: new Date(latestRun.startedAt).toLocaleTimeString(undefined, { hour12: false }),
          tone: "info",
          text: `historical replay · ${latestRun.id} · ${scenario.name}`,
        },
        ...completedPlan.map((step) => ({
          time: "—",
          tone: step.status === "blocked" ? "ok" : step.status === "success" ? "bad" : "warn",
          text: `${String(step.index + 1).padStart(2, "0")} ${step.status
            .toUpperCase()
            .padEnd(8)} ${step.technique} · ${
            step.status === "success" ? step.successFactor : step.blockedFactor
          }`,
        })),
      ]
    : [
        {
          time: "—",
          tone: "info",
          text: "twin://sandbox ready · authorization scope: northwind production replica",
        },
        {
          time: "—",
          tone: "",
          text: `${scenario.steps.length} hops modelled · ${evaluation.steps.filter((step) => step.status === "blocked").length} blocked by current controls`,
        },
        {
          time: "—",
          tone: "warn",
          text: "Choose a run mode and authorise the simulation. Nothing is sent to live infrastructure.",
        },
      ];

  const start = () => {
    dispatch({ type: "START_RUN", scenarioId: scenario.id, mode });
    setShowLatest(false);
  };

  const overall = riskLabel(risk.score);

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · Digital twin`}
        title="Rehearse the attack before it happens for real."
        subtitle="Pick a scenario, authorise it against the twin and watch each hop resolve against the controls you have modelled. Nothing here touches live systems."
        actions={
          <>
            <Link to="/app/twin/attack-paths" className="btn outline">
              <GitBranch /> Path explorer
            </Link>
            <Link to="/app/twin/history" className="btn ghost">
              <ChevronRight /> History
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Scenario library" value={state.scenarios.length} icon={<Target />} tone="info" foot="Curated attacker paths" />
        <StatCard label="Open paths" value={openPaths} icon={<AlertTriangle />} tone="critical" foot={`${state.scenarios.length - openPaths} interrupted by controls`} />
        <StatCard label="Overall risk" value={risk.score} unit="/ 100" icon={<ShieldAlert />} tone={overall.tone} foot={overall.label} />
        <StatCard
          label="Live run"
          value={runningRun?.id || "Idle"}
          icon={<Sparkles />}
          tone={runningRun ? "high" : "success"}
          foot={runningRun ? `${runningRun.cursor} / ${runningRun.plan?.length || runningRun.totalSteps} hops executed` : `${state.runs.filter((run) => run.status === "completed").length} completed runs`}
        />
      </div>

      <Panel
        className="mt-12"
        title="Scenario library"
        icon={<Target size={15} />}
        action={<span className="small-meta">{filteredScenarios.length} OF {state.scenarios.length}</span>}
      >
        <div className="scenario-filter-bar">
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              className={`chip${category === item ? " active" : ""}`}
              onClick={() => setCategory(item)}
            >
              {item}
              <span className="count">
                {item === "All"
                  ? state.scenarios.length
                  : state.scenarios.filter((scenarioItem) => scenarioItem.category === item).length}
              </span>
            </button>
          ))}
        </div>
        <div className="scenario-grid mt-12">
          {filteredScenarios.map((item) => {
            const plan = evaluateScenario(item, state.assets);
            const Icon = CATEGORY_ICONS[item.category] || Target;
            return (
              <button
                type="button"
                key={item.id}
                className={`scenario-card${scenario.id === item.id ? " active" : ""}`}
                onClick={() => {
                  setSearchParams({ scenario: item.id }, { replace: true });
                  setShowLatest(false);
                }}
              >
                <div className="scenario-top">
                  <span className="scenario-icon"><Icon /></span>
                  <SeverityBadge severity={item.severity} />
                </div>
                <div className="scenario-name">{item.name}</div>
                <div className="scenario-meta">
                  <span>{item.category}</span>
                  <span>·</span>
                  <span>{plan.totalSteps} hops</span>
                  <span>·</span>
                  <span>{plan.attackerSuccess ? "path open" : `blocked at hop ${plan.blockedAt + 1}`}</span>
                </div>
                <div className="scenario-summary">{item.summary}</div>
                <div className="scenario-steps">
                  {plan.steps.map((step, index) => (
                    <i
                      key={index}
                      className={step.status === "blocked" ? "blocked" : step.status === "success" ? "open" : ""}
                      title={`${step.technique} · ${step.status}`}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="simulation-layout">
        <div className="stack">
          <Panel
            title={liveRun ? `Live simulation · ${liveRun.id}` : showLatest && latestRun ? `Replay · ${latestRun.id}` : "Execution preview"}
            icon={<Play size={15} />}
            action={
              latestRun?.plan?.length ? (
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className={`chip${!showLatest ? " active" : ""}`}
                    onClick={() => setShowLatest(false)}
                  >
                    Current model
                  </button>
                  <button
                    type="button"
                    className={`chip${showLatest ? " active" : ""}`}
                    onClick={() => setShowLatest(true)}
                  >
                    Last run
                  </button>
                </div>
              ) : null
            }
            flush
          >
            <div style={{ padding: 16 }}>
              <div className="runner-header">
                <span className="runner-icon"><Target /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 7 }}>
                    <SeverityBadge severity={scenario.severity} />
                    <Badge tone="neutral">{scenario.category}</Badge>
                    {liveRun ? (
                      <Badge tone="high" dot>Executing</Badge>
                    ) : latestRun ? (
                      <Badge tone={statusTone(latestRun.status)}>{latestRun.status}</Badge>
                    ) : (
                      <Badge tone="info">Preview only</Badge>
                    )}
                  </div>
                  <h2 style={{ fontSize: 18, marginTop: 8 }}>{scenario.name}</h2>
                  <p className="small muted mt-6" style={{ maxWidth: 660, lineHeight: 1.55 }}>
                    {scenario.summary}
                  </p>
                  <div className="row wrap mt-10" style={{ gap: 12 }}>
                    <span className="severity-line">{scenario.entry} → {scenario.target}</span>
                    <span className="small-meta">{evaluation.totalSteps} HOPS</span>
                    <span className="small-meta">
                      {evaluation.attackerSuccess ? "PATH SUCCEEDS" : `${evaluation.completedSteps} HOPS ALLOWED`}
                    </span>
                  </div>
                </div>
              </div>

              {liveRun && (
                <div className="mt-16">
                  <div className="row between mb-8">
                    <span className="small-meta">ATTACK PATH EXECUTION</span>
                    <span className="small-meta">{liveRun.cursor} / {liveRun.plan?.length || liveRun.totalSteps}</span>
                  </div>
                  <Progress value={(liveRun.cursor / Math.max(1, liveRun.plan?.length || 1)) * 100} tone="amber" />
                </div>
              )}

              <div className="runner-steps mt-16">
                {previewSteps.map((step, index) => {
                  const stateClass = liveRun
                    ? index < (liveRun.executed?.length || 0)
                      ? step.status
                      : index === (liveRun.executed?.length || 0)
                      ? "active"
                      : "pending"
                    : step.status === "not-reached"
                    ? "pending"
                    : step.status;
                  const from = state.assets.find((asset) => asset.id === step.from);
                  const to = state.assets.find((asset) => asset.id === step.to);
                  const note =
                    stateClass === "blocked"
                      ? step.blockedFactor
                      : stateClass === "success"
                      ? step.successFactor
                      : step.narrative;
                  return (
                    <div className={`runner-step ${stateClass}`} key={index}>
                      <span className="runner-step-index">
                        {stateClass === "blocked" ? <CheckCircle2 size={11} /> : String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="runner-step-body">
                        <div className="runner-step-title">{step.technique.split("·")[0].trim()}</div>
                        <div className="runner-step-tech">
                          {from?.name || step.from} → {to?.name || step.to} · hop {index + 1}
                          {step.probability != null && ` · ${step.probability}% modelled probability`}
                        </div>
                        <div className="runner-step-note" style={stateClass === "blocked" ? { color: "#6ee7b7" } : undefined}>
                          {note}
                        </div>
                      </div>
                      <Badge tone={stateClass === "blocked" ? "success" : stateClass === "success" ? "critical" : stateClass === "active" ? "high" : "neutral"}>
                        {stateClass === "blocked" ? "blocked" : stateClass === "success" ? "success" : stateClass === "active" ? "running" : "pending"}
                      </Badge>
                    </div>
                  );
                })}
              </div>

              <div className="terminal mt-16">
                <div className="terminal-bar">
                  <span>hunter-twin · execution log</span>
                  <span>{liveRun ? "STREAMING" : completedPlan ? "CAPTURED" : "IDLE"}</span>
                </div>
                <div className="terminal-body">
                  {terminalLines.map((line, index) => (
                    <TerminalLine key={index} time={line.time} tone={line.tone}>
                      {line.text}
                    </TerminalLine>
                  ))}
                  {liveRun && (
                    <div className="terminal-line">
                      <span className="t">&gt;</span>
                      <span className="terminal-cursor" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="panel-footer">
              <div className="row wrap between" style={{ gap: 8 }}>
                <span className="small muted">
                  Executed inside the authorised twin. Results are evidence-backed and reproducible.
                </span>
                <span className="small-meta">
                  {previewSteps.filter((step) => step.status === "blocked").length} BLOCKED ·{" "}
                  {previewSteps.filter((step) => step.status === "success").length} SUCCEEDED
                </span>
              </div>
            </div>
          </Panel>

          {latestRun && (
            <Panel
              title={`Latest result · ${latestRun.id}`}
              icon={latestRun.attackerSuccess ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
              action={
                <Link to={`/app/twin/attack-paths?scenario=${scenario.id}&run=${latestRun.id}`} className="btn ghost sm">
                  Trace <ChevronRight size={12} />
                </Link>
              }
            >
              <div className={`run-result ${latestRun.attackerSuccess ? "failure" : "success"}`}>
                <span className="run-result-icon">
                  {latestRun.attackerSuccess ? <XCircle /> : <ShieldCheck />}
                </span>
                <div>
                  <h3>
                    {latestRun.attackerSuccess
                      ? "The attacker reached the target in this run."
                      : "The attack path was interrupted."}
                  </h3>
                  <p>
                    {latestRun.attackerSuccess
                      ? `Risk remained ${latestRun.riskBefore ?? "—"} → ${latestRun.riskAfter ?? "—"}. Review the findings and apply the proposed controls.`
                      : `The path was blocked after ${latestRun.reachedStep || 0} hop(s). Re-run after changes to confirm the result.`}
                  </p>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right", flexShrink: 0 }}>
                  <div className="small-meta">RISK</div>
                  <div className="brief-number" style={{ fontSize: 24 }}>
                    {latestRun.riskBefore ?? "—"} → {latestRun.riskAfter ?? "—"}
                  </div>
                </div>
              </div>
              <ul className="mt-12" style={{ paddingLeft: 18, color: "var(--muted)", fontSize: 10.5, lineHeight: 1.7 }}>
                {(latestRun.findings || []).map((finding, index) => (
                  <li key={index}>{finding}</li>
                ))}
              </ul>
              <div className="row between mt-16">
                <span className="small-meta">
                  COMPLETED {latestRun.completedAt ? formatDateTime(latestRun.completedAt) : "—"} · {latestRun.initiatedBy || "Analyst"}
                </span>
                <div className="row" style={{ gap: 6 }}>
                  {latestRun.attackerSuccess && ["high", "critical"].includes(scenario.severity) && (
                    <Badge tone="critical">Validation incident opened</Badge>
                  )}
                  <Link to="/app/twin/self-healing" className="btn outline sm">
                    <ShieldCheck /> Review fixes
                  </Link>
                </div>
              </div>
            </Panel>
          )}
        </div>

        <div className="stack">
          <Panel title="Authorise the run" icon={<ShieldCheck size={15} />}>
            <div className="kv-list">
              <div className="kv-row"><span className="k">Scenario</span><span className="v">{scenario.name}</span></div>
              <div className="kv-row"><span className="k">Entry point</span><span className="v mono">{scenario.entry}</span></div>
              <div className="kv-row"><span className="k">Target</span><span className="v mono">{scenario.target}</span></div>
              <div className="kv-row"><span className="k">Current outcome</span><span className="v" style={{ color: evaluation.attackerSuccess ? "var(--red)" : "var(--green)" }}>{evaluation.attackerSuccess ? "Path succeeds" : "Path blocked"}</span></div>
              <div className="kv-row"><span className="k">Scenario risk</span><span className="v">{scenarioRisk(scenario, state.assets)} / 100</span></div>
              <div className="kv-row"><span className="k">Overall twin risk</span><span className="v">{risk.score} / 100</span></div>
            </div>

            <div className="label mt-16">Run mode</div>
            <div className="stack-6 mt-8">
              {MODES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`control-toggle${mode === item.id ? " on" : ""}`}
                  onClick={() => setMode(item.id)}
                  aria-pressed={mode === item.id}
                >
                  <span className="box">{mode === item.id && <CheckCircle2 />}</span>
                  <span className="t">
                    <strong style={{ display: "block", color: "var(--text-soft)", fontWeight: 500 }}>{item.label}</strong>
                    <span style={{ color: "var(--faint)" }}>{item.detail}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-16 stack-6">
              {liveRun ? (
                <button
                  type="button"
                  className="btn danger block"
                  onClick={() => dispatch({ type: "CANCEL_RUN", id: liveRun.id })}
                >
                  <Pause /> Stop simulation
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary block"
                  onClick={start}
                  disabled={Boolean(runningRun)}
                >
                  <Play /> {runningRun ? `${runningRun.id} is already running` : "Authorise simulation"}
                </button>
              )}
              <Link to={`/app/twin/attack-paths?scenario=${scenario.id}`} className="btn outline block">
                <GitBranch /> Inspect before running
              </Link>
            </div>

            <div className="notice warning mt-12">
              <Ban />
              <div>
                This is a safe-by-design simulation. The engine modifies only the twin model and its evidence trail.
              </div>
            </div>
          </Panel>

          <Panel title="Current control gaps" icon={<ShieldAlert size={15} />}>
            <div className="stack-6">
              {evaluation.steps.map((step) => (
                <div className="source-row" key={step.index}>
                  <span className="truncate" title={step.technique}>{step.technique.split("·")[0].trim()}</span>
                  <Progress value={step.probability} tone={step.status === "blocked" ? "green" : "red"} />
                  <span className="v">{step.status === "blocked" ? "BLOCK" : `${step.probability}%`}</span>
                </div>
              ))}
            </div>
            <div className="notice mt-12">
              <ArrowRight />
              <div>
                Apply a control in <Link className="link" to="/app/twin/self-healing">self-healing</Link>, then re-run the
                scenario to prove the path is closed.
              </div>
            </div>
          </Panel>

          <Panel title="Posture snapshot" icon={<ShieldCheck size={15} />}>
            <div className="mini-stat-row">
              <div className="mini-stat"><div className="k">Likelihood</div><div className="v">{risk.likelihood}</div></div>
              <div className="mini-stat"><div className="k">Impact</div><div className="v">{risk.impact}</div></div>
              <div className="mini-stat"><div className="k">Coverage</div><div className="v">{risk.coverage}%</div></div>
              <div className="mini-stat"><div className="k">Severity</div><div className="v" style={{ fontSize: 12, textTransform: "capitalize" }}>{scenario.severity}</div></div>
            </div>
            <div className="small muted mt-12" style={{ lineHeight: 1.55 }}>
              Every run records the risk before and after, the controls it encountered and the evidence it produced.
              Completed high or critical paths open a validation incident in HUNTER AI.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
