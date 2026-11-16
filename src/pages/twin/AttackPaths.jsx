import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  ChevronRight,
  CircleDot,
  Download,
  GitBranch,
  History,
  MinusCircle,
  Play,
  ShieldCheck,
  Target,
  Wrench,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import TopologyGraph, { TopologyLegend } from "../../components/TopologyGraph";
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
import { CONTROL_LABELS } from "../../data/mock";
import { downloadFile, formatDateTime, timeAgo } from "../../lib/format";

export default function AttackPaths() {
  const { state, risk } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedRun = searchParams.get("run");
  const initialRun = state.runs.find((run) => run.id === requestedRun) || null;
  const requestedScenario = searchParams.get("scenario");
  const scenarioId =
    requestedScenario && state.scenarios.some((scenario) => scenario.id === requestedScenario)
      ? requestedScenario
      : initialRun?.scenarioId || state.scenarios[0]?.id;
  const scenario = state.scenarios.find((item) => item.id === scenarioId) || state.scenarios[0];
  const evaluation = useMemo(
    () => evaluateScenario(scenario, state.assets),
    [scenario, state.assets]
  );
  const latestRun = useMemo(
    () =>
      state.runs.find(
        (run) => run.scenarioId === scenario.id && run.status === "completed" && run.plan?.length
      ) || null,
    [state.runs, scenario.id]
  );
  const [useLastRun, setUseLastRun] = useState(Boolean(initialRun?.plan?.length));
  const selectedRun = useLastRun
    ? (initialRun?.scenarioId === scenario.id ? initialRun : null) || latestRun
    : null;
  const steps = selectedRun?.plan || evaluation.steps;
  const blockedAt = steps.findIndex((step) => step.status === "blocked");
  const succeeded = steps.filter((step) => step.status === "success").length;
  const pathSucceeds = steps.length > 0 && steps.every((step) => step.status === "success");

  const scenarioRows = useMemo(
    () =>
      state.scenarios
        .map((item) => ({
          scenario: item,
          plan: evaluateScenario(item, state.assets),
        }))
        .sort((a, b) => {
          if (a.plan.attackerSuccess !== b.plan.attackerSuccess) return a.plan.attackerSuccess ? -1 : 1;
          return severityRank(a.scenario.severity) - severityRank(b.scenario.severity);
        }),
    [state.scenarios, state.assets]
  );

  const controls = useMemo(() => {
    const seen = new Set();
    return steps
      .filter((step) => {
        if (seen.has(step.control)) return false;
        seen.add(step.control);
        return true;
      })
      .map((step) => ({
        control: step.control,
        label: CONTROL_LABELS[step.control] || step.control,
        step,
      }));
  }, [steps]);

  const selectScenario = (id) => {
    setSearchParams({ scenario: id }, { replace: true });
    setUseLastRun(false);
  };

  const downloadPath = () => {
    downloadFile(
      `${scenario.id}_${selectedRun?.id || "current"}_path.json`,
      JSON.stringify(
        {
          scenario: {
            id: scenario.id,
            name: scenario.name,
            entry: scenario.entry,
            target: scenario.target,
            severity: scenario.severity,
          },
          source: selectedRun ? { kind: "run", id: selectedRun.id, completedAt: selectedRun.completedAt } : { kind: "current-model" },
          posture: { risk: risk.score, scenarioRisk: scenarioRisk(scenario, state.assets) },
          steps,
        },
        null,
        2
      ),
      "application/json"
    );
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · Digital twin`}
        title="Follow every hop. Understand every stop."
        subtitle="Each attack path is a chain of evidence-backed hops. Inspect the route, the control that should stop it and the conditions that let it through."
        actions={
          <>
            <button type="button" className="btn outline" onClick={downloadPath}>
              <Download /> Export path
            </button>
            <Link to={`/app/twin/simulations?scenario=${scenario.id}`} className="btn primary">
              <Play /> Run this scenario
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Scenarios" value={state.scenarios.length} icon={<Target />} tone="info" foot="Across nine attack categories" />
        <StatCard label="Hops in view" value={steps.length} icon={<GitBranch />} tone="violet" foot={`${succeeded} succeeded · ${steps.filter((step) => step.status === "blocked").length} blocked`} />
        <StatCard label="Scenario risk" value={scenarioRisk(scenario, state.assets)} unit="/ 100" icon={<AlertTriangle />} tone={pathSucceeds ? "critical" : "success"} foot={pathSucceeds ? "Path succeeds in current model" : "Path interrupted"} />
        <StatCard label="Overall risk" value={risk.score} unit="/ 100" icon={<ShieldCheck />} tone={riskLabel(risk.score).tone} foot={`${risk.coverage}% control coverage`} />
      </div>

      <div className="content-grid split-1-2 mt-12">
        <Panel
          title="Scenario paths"
          icon={<Target size={15} />}
          action={<span className="small-meta">{scenarioRows.filter((row) => row.plan.attackerSuccess).length} OPEN</span>}
          flush
        >
          <div className="finding-list">
            {scenarioRows.map(({ scenario: item, plan }) => (
              <button
                type="button"
                key={item.id}
                className="finding-item"
                onClick={() => selectScenario(item.id)}
                style={{
                  display: "flex",
                  width: "100%",
                  textAlign: "left",
                  background: scenario.id === item.id ? "rgba(225, 29, 51, .045)" : undefined,
                }}
              >
                <span className={`finding-sev-bar ${item.severity}`} />
                <div className="finding-body">
                  <div className="finding-title">{item.name}</div>
                  <div className="finding-meta">
                    <span>{item.entry} → {item.target}</span>
                    <span>·</span>
                    <span>{plan.totalSteps} hops</span>
                  </div>
                </div>
                <Badge tone={plan.attackerSuccess ? "critical" : "success"}>
                  {plan.attackerSuccess ? "open" : "blocked"}
                </Badge>
              </button>
            ))}
          </div>
        </Panel>

        <div className="stack">
          <Panel
            className="topology-panel"
            title={selectedRun ? `Replay · ${selectedRun.id}` : "Current model"}
            icon={<GitBranch size={15} />}
            action={
              latestRun ? (
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className={`chip${!useLastRun ? " active" : ""}`}
                    onClick={() => {
                      setUseLastRun(false);
                      setSearchParams({ scenario: scenario.id }, { replace: true });
                    }}
                  >
                    Current model
                  </button>
                  <button
                    type="button"
                    className={`chip${useLastRun ? " active" : ""}`}
                    onClick={() => {
                      setUseLastRun(true);
                      setSearchParams({ scenario: scenario.id, run: latestRun.id }, { replace: true });
                    }}
                  >
                    Last run
                  </button>
                </div>
              ) : null
            }
            flush
          >
            <div className="row wrap between" style={{ padding: "16px 18px 10px", gap: 10 }}>
              <div>
                <div className="row wrap" style={{ gap: 7 }}>
                  <SeverityBadge severity={scenario.severity} />
                  <Badge tone="neutral">{scenario.category}</Badge>
                  {selectedRun ? (
                    <Badge tone={statusTone(selectedRun.status)}>{selectedRun.status}</Badge>
                  ) : (
                    <Badge tone="info">live model</Badge>
                  )}
                </div>
                <h2 style={{ fontSize: 18, marginTop: 8 }}>{scenario.name}</h2>
                <p className="small muted mt-6" style={{ maxWidth: 640, lineHeight: 1.55 }}>{scenario.summary}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="small-meta">PATH OUTCOME</div>
                <div className="brief-number" style={{ fontSize: 21, color: pathSucceeds ? "var(--red)" : "var(--green)" }}>
                  {pathSucceeds ? "COMPROMISE" : "BLOCKED"}
                </div>
                <div className="small-meta mt-6">
                  {blockedAt >= 0 ? `AT HOP ${blockedAt + 1}` : `${succeeded} HOPS ALLOWED`}
                </div>
              </div>
            </div>
            <TopologyGraph assets={state.assets} edges={state.edges} steps={steps} />
            <TopologyLegend>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 11.5 }}>
                {selectedRun ? `CAPTURED ${formatDateTime(selectedRun.completedAt)}` : "MODEL EVALUATION · LIVE"}
              </span>
            </TopologyLegend>
          </Panel>

          <Panel title="Attack path" icon={<CircleDot size={15} />} flush>
            <div style={{ padding: 18 }}>
              <div className="path-layout">
                {steps.map((step, index) => {
                  const from = state.assets.find((asset) => asset.id === step.from);
                  const to = state.assets.find((asset) => asset.id === step.to);
                  const blocked = step.status === "blocked";
                  const pending = step.status === "not-reached";
                  return (
                    <div className="path-step" key={index}>
                      <div className="path-step-rail">
                        <span className={`path-step-node${blocked ? " blocked" : pending ? " pending" : ""}`}>
                          {blocked ? <ShieldCheck size={12} /> : pending ? <MinusCircle size={12} /> : String(index + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <div className={`path-step-card${blocked ? " blocked" : ""}`}>
                        <div className="path-step-head">
                          <div>
                            <div className="path-step-title">{step.technique.split("·")[0].trim()}</div>
                            <div className="path-step-route">
                              {step.technique.split("·")[1]?.trim() || "Technique"} · {from?.name || step.from} → {to?.name || step.to}
                            </div>
                          </div>
                          <div className="row" style={{ gap: 5 }}>
                            {step.probability != null && (
                              <Badge tone={blocked ? "success" : pending ? "neutral" : "critical"}>
                                {blocked ? "blocked" : pending ? "not reached" : `${step.probability}%`}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="path-step-desc">{step.narrative}</div>
                        {blocked ? (
                          <div className="path-factor blocked">
                            <ShieldCheck />
                            <span>{step.blockedFactor}</span>
                          </div>
                        ) : pending ? (
                          <div className="path-factor blocked" style={{ color: "var(--faint)" }}>
                            <Ban />
                            <span>The chain was interrupted before this hop could execute.</span>
                          </div>
                        ) : (
                          <div className="path-factor">
                            <AlertTriangle />
                            <span>{step.successFactor}</span>
                          </div>
                        )}
                        <div className="row wrap mt-10" style={{ gap: 6 }}>
                          <MicroTag label="Control" value={CONTROL_LABELS[step.control] || step.control} />
                          <MicroTag
                            label="Present"
                            value={step.controlPresent ? "yes" : "no"}
                            tone={step.controlPresent ? "green" : "red"}
                          />
                          {selectedRun?.executed?.find((item) => item.index === step.index)?.revealedAt && (
                            <MicroTag
                              label="Seen"
                              value={timeAgo(selectedRun.executed.find((item) => item.index === step.index).revealedAt)}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="content-grid split-2-1">
        <Panel title="Control encounters" icon={<ShieldCheck size={15} />} flush>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Hop</th>
                  <th>Segment</th>
                  <th>Control</th>
                  <th>Modelled</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((step) => (
                  <tr key={step.index}>
                    <td className="mono">{String(step.index + 1).padStart(2, "0")}</td>
                    <td>
                      <div className="strong" style={{ fontSize: 12.5 }}>
                        {state.assets.find((asset) => asset.id === step.from)?.name || step.from} →{" "}
                        {state.assets.find((asset) => asset.id === step.to)?.name || step.to}
                      </div>
                      <div className="small-meta mt-6">{step.technique.split("·")[0].trim()}</div>
                    </td>
                    <td className="small">{CONTROL_LABELS[step.control] || step.control}</td>
                    <td>
                      <Badge tone={step.controlPresent ? "success" : "critical"}>
                        {step.controlPresent ? "present" : "missing"}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={step.status === "blocked" ? "success" : step.status === "success" ? "critical" : "neutral"}>
                        {step.status.replace("-", " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-footer">
            <div className="row between">
              <span className="small muted">
                {blockedAt >= 0 ? `The path is stopped at hop ${blockedAt + 1}.` : "Every hop succeeded in this model."}
              </span>
              <Link to="/app/twin/self-healing" className="btn success sm">
                <Wrench /> Close the gaps
              </Link>
            </div>
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Path details" icon={<History size={15} />}>
            <div className="kv-list">
              <div className="kv-row"><span className="k">Entry</span><span className="v mono">{scenario.entry}</span></div>
              <div className="kv-row"><span className="k">Target</span><span className="v mono">{scenario.target}</span></div>
              <div className="kv-row"><span className="k">Hops</span><span className="v">{steps.length}</span></div>
              <div className="kv-row"><span className="k">Hops allowed</span><span className="v">{succeeded}</span></div>
              <div className="kv-row"><span className="k">First block</span><span className="v">{blockedAt >= 0 ? `Hop ${blockedAt + 1}` : "None"}</span></div>
              <div className="kv-row"><span className="k">Source</span><span className="v">{selectedRun ? selectedRun.id : "Current model"}</span></div>
              <div className="kv-row"><span className="k">Evaluated</span><span className="v">{selectedRun?.completedAt ? timeAgo(selectedRun.completedAt) : "Now"}</span></div>
            </div>
            {selectedRun && (
              <Link to={`/app/twin/history`} className="btn ghost sm block mt-12">
                <History /> Open in history <ChevronRight size={12} />
              </Link>
            )}
          </Panel>

          <Panel title="Priority controls" icon={<Wrench size={15} />}>
            <div className="stack-6">
              {controls.map(({ control, label, step }) => (
                <div className="source-row" key={control}>
                  <span className="truncate" title={label}>{label}</span>
                  <Progress
                    value={step.controlPresent ? 90 : 26}
                    tone={step.controlPresent ? "green" : "red"}
                  />
                  <span className="v">{step.controlPresent ? "ON" : "GAP"}</span>
                </div>
              ))}
              {controls.length === 0 && <div className="empty-inline">No control metadata in this view.</div>}
            </div>
            <div className="notice mt-12">
              <AlertTriangle />
              <div>
                A missing control is only a gap when an attacker can reach its hop. The path ordering matters.
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function MicroTag({ label, value, tone }) {
  return (
    <span className={`tag ${tone || ""}`} style={{ fontSize: 11.5 }}>
      {label}: {value}
    </span>
  );
}
