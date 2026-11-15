import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Crosshair,
  Flame,
  Play,
  ShieldCheck,
  Swords,
  Target,
  Trophy,
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
import { evaluateScenario, severityRank, statusTone } from "../../lib/engine";
import { CONTROL_LABELS } from "../../data/mock";
import { formatDateTime, timeAgo } from "../../lib/format";

export default function RedVsBlue() {
  const { state, dispatch, runningRun } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("scenario");
  const scenarioId =
    requested && state.scenarios.some((scenario) => scenario.id === requested)
      ? requested
      : state.scenarios[0]?.id;
  const scenario = state.scenarios.find((item) => item.id === scenarioId) || state.scenarios[0];

  const redBlueRuns = useMemo(
    () => state.runs.filter((run) => run.mode === "red-blue"),
    [state.runs]
  );
  const [selectedRunId, setSelectedRunId] = useState(redBlueRuns[0]?.id || null);
  const runningBlue = runningRun?.mode === "red-blue" ? runningRun : null;
  const activeRun =
    runningBlue ||
    state.runs.find((run) => run.id === selectedRunId && run.mode === "red-blue") ||
    redBlueRuns[0] ||
    null;
  const activeScenario = activeRun
    ? state.scenarios.find((item) => item.id === activeRun.scenarioId) || scenario
    : scenario;

  const livePlan = activeRun?.plan?.length ? activeRun.plan : null;
  const fallbackEvaluation = useMemo(
    () => evaluateScenario(activeScenario, state.assets),
    [activeScenario, state.assets]
  );
  const allSteps = livePlan || fallbackEvaluation.steps;
  const resolvedCount = activeRun?.status === "running"
    ? activeRun.executed?.length || 0
    : livePlan
    ? allSteps.length
    : 0;
  const resolvedSteps = livePlan ? allSteps.slice(0, resolvedCount) : [];
  const redScore = resolvedSteps.filter((step) => step.status === "success").length;
  const blueScore = resolvedSteps.filter((step) => step.status === "blocked").length;
  const pendingCount = Math.max(0, allSteps.length - resolvedCount);
  const activeOutcome =
    activeRun?.status === "completed"
      ? activeRun.attackerSuccess
        ? "red"
        : "blue"
      : null;

  const completedExercises = redBlueRuns.filter((run) => run.status === "completed");
  const blueWins = completedExercises.filter((run) => !run.attackerSuccess).length;
  const winRate = completedExercises.length
    ? Math.round((blueWins / completedExercises.length) * 100)
    : 0;
  const blockedHops = completedExercises.reduce(
    (sum, run) => sum + Math.max(0, (run.totalSteps || 0) - (run.reachedStep || 0)),
    0
  );

  const loadRun = (run) => {
    setSelectedRunId(run.id);
    setSearchParams({ scenario: run.scenarioId });
  };

  const startExercise = () => {
    dispatch({ type: "START_RUN", scenarioId: scenario.id, mode: "red-blue" });
    setSearchParams({ scenario: scenario.id });
  };

  const rounds = livePlan
    ? livePlan.slice(0, activeRun?.status === "running" ? resolvedCount + 1 : livePlan.length)
    : fallbackEvaluation.steps;

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · Digital twin`}
        title="Two teams. One model. No production blast radius."
        subtitle="Red executes the attack path. Blue responds with the controls you have modelled. The scoreboard is the evidence."
        actions={
          <>
            <div className="select-wrap">
              <select
                className="select"
                value={scenario.id}
                onChange={(event) => {
                  setSearchParams({ scenario: event.target.value });
                  setSelectedRunId(null);
                }}
                style={{ minWidth: 230 }}
              >
                {state.scenarios.map((item) => (
                  <option value={item.id} key={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            {runningBlue ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => dispatch({ type: "CANCEL_RUN", id: runningBlue.id })}
              >
                <XCircle /> Stop exercise
              </button>
            ) : (
              <button
                type="button"
                className="btn primary"
                onClick={startExercise}
                disabled={Boolean(runningRun)}
              >
                <Swords /> Start exercise
              </button>
            )}
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Scored exercises" value={completedExercises.length} icon={<Swords />} tone="violet" foot={`${state.runs.length} total simulations`} />
        <StatCard label="Blue win rate" value={winRate} unit="%" icon={<ShieldCheck />} tone={winRate >= 50 ? "success" : "high"} foot={`${blueWins} of ${completedExercises.length} exercises held`} />
        <StatCard label="Hops denied" value={blockedHops} icon={<Target />} tone="success" foot="Across completed red/blue rounds" />
        <StatCard label="Live state" value={runningBlue ? "Running" : activeOutcome === "blue" ? "Blue wins" : activeOutcome === "red" ? "Red wins" : "Ready"} icon={<Flame />} tone={runningBlue ? "high" : activeOutcome === "blue" ? "success" : "critical"} foot={runningBlue ? `${runningBlue.cursor} of ${runningBlue.plan?.length || 0} rounds` : activeRun?.id || "No exercise loaded"} />
      </div>

      <div className="content-grid split-2-1 mt-12">
        <div className="stack">
          <Panel
            title={`${activeScenario.name}`}
            icon={<Crosshair size={15} />}
            action={
              <div className="row wrap" style={{ gap: 6 }}>
                <SeverityBadge severity={activeScenario.severity} />
                {activeRun && <Badge tone={statusTone(activeRun.status)}>{activeRun.status}</Badge>}
              </div>
            }
          >
            <div className="vs-scoreboard">
              <div className="vs-team red">
                <div className="vs-team-label"><Flame size={12} /> Red team</div>
                <div className="vs-score">{String(redScore).padStart(2, "0")}</div>
                <div className="vs-team-sub">{resolvedCount ? `${redScore} successful hop${redScore === 1 ? "" : "s"}` : "Awaiting first round"}</div>
              </div>
              <span className="vs-badge">VS</span>
              <div className="vs-team blue">
                <div className="vs-team-label"><ShieldCheck size={12} /> Blue team</div>
                <div className="vs-score">{String(blueScore).padStart(2, "0")}</div>
                <div className="vs-team-sub">{resolvedCount ? `${blueScore} blocked hop${blueScore === 1 ? "" : "s"}` : "Controls on standby"}</div>
              </div>
            </div>

            <div className="row between mt-16">
              <span className="small-meta">
                ROUND {resolvedCount} / {allSteps.length} · {pendingCount} PENDING
              </span>
              <span className="small-meta">
                {activeOutcome === "blue" ? "BLUE HOLDS THE PATH" : activeOutcome === "red" ? "RED REACHES THE TARGET" : "EXERCISE IN PROGRESS"}
              </span>
            </div>
            <Progress
              value={(resolvedCount / Math.max(1, allSteps.length)) * 100}
              tone={activeOutcome === "red" ? "red" : "green"}
            />

            {activeRun && (
              <div className="battle-log mt-16">
                {rounds.map((step, index) => {
                  const resolved = index < resolvedCount || (!livePlan && activeRun);
                  const blocked = step.status === "blocked";
                  const notReached = step.status === "not-reached";
                  return (
                    <div className="battle-round" key={index}>
                      <div className="round-num">R{String(index + 1).padStart(2, "0")}</div>
                      <div className="battle-side red">
                        <div className="side-label">Red · executes</div>
                        <div className="side-text">{step.narrative || step.technique}</div>
                      </div>
                      <div className="battle-side blue">
                        <div className="side-label">Blue · responds</div>
                        <div className="side-text">
                          {blocked
                            ? step.blockedFactor
                            : notReached
                            ? "Chain already interrupted."
                            : CONTROL_LABELS[step.control] || step.control}
                        </div>
                      </div>
                      <span
                        className={`battle-outcome${resolved && !blocked && !notReached ? " red" : ""}`}
                        style={!resolved ? { borderColor: "var(--border)", color: "var(--faint)" } : notReached ? { borderColor: "var(--border)", color: "var(--faint)" } : undefined}
                      >
                        {!resolved ? "pending" : blocked ? "blue" : notReached ? "halted" : "red"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {!activeRun && (
              <div className="battle-log mt-16">
                {fallbackEvaluation.steps.map((step, index) => (
                  <div className="battle-round" key={index}>
                    <div className="round-num">R{String(index + 1).padStart(2, "0")}</div>
                    <div className="battle-side red">
                      <div className="side-label">Red · projected</div>
                      <div className="side-text">{step.narrative}</div>
                    </div>
                    <div className="battle-side blue">
                      <div className="side-label">Blue · projected</div>
                      <div className="side-text">
                        {step.status === "blocked" ? step.blockedFactor : CONTROL_LABELS[step.control] || step.control}
                      </div>
                    </div>
                    <span className={`battle-outcome${step.status === "success" ? " red" : ""}`}>
                      {step.status === "success" ? "red" : step.status === "blocked" ? "blue" : "halted"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!activeRun && (
              <div className="notice mt-16">
                <Swords />
                <div>These rounds are a projection from the current model. Start an exercise to score them against the twin.</div>
              </div>
            )}

            {activeOutcome && (
              <div className={`run-result mt-16 ${activeOutcome === "blue" ? "success" : "failure"}`}>
                <span className="run-result-icon">
                  {activeOutcome === "blue" ? <Trophy /> : <XCircle />}
                </span>
                <div>
                  <h3>{activeOutcome === "blue" ? "Blue team holds the path." : "Red team reaches the target."}</h3>
                  <p>
                    {activeOutcome === "blue"
                      ? "The first blocking control stopped the chain. Review whether the same control protects the production path."
                      : "The path completed every hop. The simulation opened a validation incident with the evidence attached."}
                  </p>
                </div>
                <Link to={`/app/twin/attack-paths?scenario=${activeScenario.id}&run=${activeRun.id}`} className="btn outline sm" style={{ marginLeft: "auto" }}>
                  Trace <ArrowRight />
                </Link>
              </div>
            )}
          </Panel>

          <Panel title="Exercise history" icon={<Swords size={15} />} flush>
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Scenario</th>
                    <th>Winner</th>
                    <th>Hops</th>
                    <th>When</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {redBlueRuns.map((run) => (
                    <tr key={run.id}>
                      <td className="mono" style={{ fontSize: 12 }}>{run.id}</td>
                      <td>
                        <div className="strong" style={{ fontSize: 12.5 }}>
                          {state.scenarios.find((item) => item.id === run.scenarioId)?.name || run.scenarioId}
                        </div>
                        <div className="small-meta mt-6">{run.mode === "red-blue" ? "RED / BLUE" : run.mode.toUpperCase()}</div>
                      </td>
                      <td>
                        {run.status === "running" ? (
                          <Badge tone="high" dot>running</Badge>
                        ) : run.attackerSuccess ? (
                          <Badge tone="critical">red</Badge>
                        ) : (
                          <Badge tone="success">blue</Badge>
                        )}
                      </td>
                      <td className="mono">{run.reachedStep ?? "—"} / {run.totalSteps ?? "—"}</td>
                      <td className="small-meta">{timeAgo(run.completedAt || run.startedAt)}</td>
                      <td>
                        <button type="button" className="btn ghost sm" onClick={() => loadRun(run)}>
                          Load
                        </button>
                      </td>
                    </tr>
                  ))}
                  {redBlueRuns.length === 0 && (
                    <tr>
                      <td colSpan={6}><div className="empty-inline">No red/blue exercises have been run yet.</div></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Exercise controls" icon={<Target size={15} />}>
            <div className="kv-list">
              <div className="kv-row"><span className="k">Scenario</span><span className="v">{activeScenario.name}</span></div>
              <div className="kv-row"><span className="k">Entry → target</span><span className="v mono">{activeScenario.entry} → {activeScenario.target}</span></div>
              <div className="kv-row"><span className="k">Rounds modelled</span><span className="v">{fallbackEvaluation.totalSteps}</span></div>
              <div className="kv-row"><span className="k">Current model</span><span className="v" style={{ color: fallbackEvaluation.attackerSuccess ? "var(--red)" : "var(--green)" }}>{fallbackEvaluation.attackerSuccess ? "Red path open" : "Blue blocks path"}</span></div>
              <div className="kv-row"><span className="k">Active run</span><span className="v">{activeRun?.id || "None"}</span></div>
            </div>
            <div className="stack-6 mt-16">
              {runningBlue ? (
                <button type="button" className="btn danger block" onClick={() => dispatch({ type: "CANCEL_RUN", id: runningBlue.id })}>
                  <XCircle /> Stop exercise
                </button>
              ) : (
                <button type="button" className="btn primary block" onClick={startExercise} disabled={Boolean(runningRun)}>
                  <Play /> Start red/blue exercise
                </button>
              )}
              <Link to={`/app/twin/attack-paths?scenario=${scenario.id}`} className="btn outline block">
                Inspect the path
              </Link>
            </div>
            <div className="notice warning mt-12">
              <Flame />
              <div>
                Red and blue share the same deterministic engine. Scores reflect modelled controls, not live production
                behaviour.
              </div>
            </div>
          </Panel>

          <Panel title="Blue team strengths" icon={<ShieldCheck size={15} />}>
            <div className="stack-6">
              {fallbackEvaluation.steps.map((step) => (
                <div className="source-row" key={step.index}>
                  <span className="truncate" title={CONTROL_LABELS[step.control]}>{CONTROL_LABELS[step.control] || step.control}</span>
                  <Progress value={step.status === "blocked" ? 92 : 28} tone={step.status === "blocked" ? "green" : "red"} />
                  <span className="v">{step.status === "blocked" ? "HELD" : "OPEN"}</span>
                </div>
              ))}
            </div>
            <div className="small muted mt-12" style={{ lineHeight: 1.55 }}>
              {blueWins
                ? `Blue has held ${blueWins} completed exercise${blueWins === 1 ? "" : "s"} by interrupting the first reachable hop.`
                : "Blue has not yet scored a completed exercise. Apply a control or re-run after the next fix."}
            </div>
          </Panel>

          <Panel title="Last scored exercise" icon={<Trophy size={15} />}>
            {completedExercises[0] ? (
              <>
                <div className="row between">
                  <div>
                    <div className="strong">{completedExercises[0].id}</div>
                    <div className="small-meta mt-6">
                      {state.scenarios.find((item) => item.id === completedExercises[0].scenarioId)?.name}
                    </div>
                  </div>
                  <Badge tone={completedExercises[0].attackerSuccess ? "critical" : "success"}>
                    {completedExercises[0].attackerSuccess ? "Red" : "Blue"}
                  </Badge>
                </div>
                <div className="kv-list mt-12">
                  <div className="kv-row"><span className="k">Risk before</span><span className="v">{completedExercises[0].riskBefore ?? "—"}</span></div>
                  <div className="kv-row"><span className="k">Risk after</span><span className="v">{completedExercises[0].riskAfter ?? "—"}</span></div>
                  <div className="kv-row"><span className="k">Duration</span><span className="v">{completedExercises[0].durationMs ? `${Math.round(completedExercises[0].durationMs / 1000)}s` : "—"}</span></div>
                  <div className="kv-row"><span className="k">Completed</span><span className="v">{completedExercises[0].completedAt ? formatDateTime(completedExercises[0].completedAt) : "—"}</span></div>
                </div>
                <div className="chip-row mt-12">
                  <CheckCircle2 size={13} style={{ color: "var(--green)" }} />
                  <span className="small muted">Chain-of-custody preserved for all rounds.</span>
                </div>
              </>
            ) : (
              <div className="empty-inline">No completed red/blue exercise yet.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
