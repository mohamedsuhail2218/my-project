import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  ConfirmDialog,
  PageHeader,
  Panel,
  Progress,
  RiskRing,
  StatCard,
} from "../../components/ui";
import {
  applyControl,
  computeRisk,
  controlGaps,
  evaluateScenario,
  recommendationImpact,
  riskLabel,
  uniqueControls,
} from "../../lib/engine";
import { CONTROL_LABELS, SCENARIOS } from "../../data/mock";
import { timeAgo } from "../../lib/format";

const FILTERS = ["all", "proposed", "applied", "dismissed"];

export default function SelfHealing() {
  const { state, dispatch, risk } = useApp();
  const [filter, setFilter] = useState("all");
  const [applyOpen, setApplyOpen] = useState(false);

  const proposed = state.recommendations.filter((rec) => rec.status === "proposed");
  const applied = state.recommendations.filter((rec) => rec.status === "applied");
  const dismissed = state.recommendations.filter((rec) => rec.status === "dismissed");
  const filtered = state.recommendations.filter(
    (rec) => filter === "all" || rec.status === filter
  );

  const projected = useMemo(() => {
    let assets = state.assets;
    proposed.forEach((rec) => {
      assets = applyControl(assets, rec.control, rec.targets);
    });
    const after = computeRisk(assets).score;
    const blockedScenarios = SCENARIOS.filter((scenario) => {
      const before = evaluateScenario(scenario, state.assets);
      const next = evaluateScenario(scenario, assets);
      return before.attackerSuccess && !next.attackerSuccess;
    });
    return {
      assets,
      risk: computeRisk(assets),
      after,
      delta: after - risk.score,
      blockedScenarios,
    };
  }, [state.assets, proposed, risk.score]);

  const quickWins = proposed.filter((rec) => rec.effort === "Low");
  const quickControls = [...new Set(quickWins.map((rec) => rec.control))];
  const presentControls = uniqueControls(state.assets);
  const gaps = controlGaps(state.assets);
  const healingTone = riskLabel(risk.score).tone;

  const healingSteps = [
    { label: "Observe the twin", detail: `${state.assets.length} assets and ${state.edges.length} links in scope.`, state: "done" },
    { label: "Simulate an attack", detail: `${state.runs.length} runs recorded.`, state: state.runs.length ? "done" : "active" },
    { label: "Detect the control gap", detail: `${proposed.length + applied.length} gaps found across the model.`, state: proposed.length + applied.length ? "done" : "active" },
    { label: "Prescribe the fix", detail: applied.length ? `${applied.length} control${applied.length === 1 ? "" : "s"} applied by analysts.` : "Waiting for the first applied control.", state: applied.length ? "done" : "active" },
    { label: "Validate the outcome", detail: applied.length ? "Re-run the blocked path to confirm the fix." : "Apply a fix to unlock validation.", state: applied.length ? "active" : "" },
  ];

  const applyQuickWins = () => {
    if (!quickControls.length) return;
    dispatch({ type: "APPLY_CONTROLS", controls: quickControls });
    setApplyOpen(false);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · Digital twin`}
        title="Let the twin prescribe its own repairs."
        subtitle="Every failed control becomes a concrete recommendation, ranked by the risk it removes. Apply it to the model, re-run the path and prove the repair."
        actions={
          <>
            <Link to="/app/twin/what-if" className="btn outline">
              <Sparkles /> Project in what-if
            </Link>
            <button
              type="button"
              className="btn primary"
              disabled={!quickWins.length}
              onClick={() => setApplyOpen(true)}
            >
              <Zap /> Apply quick wins
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Open recommendations" value={proposed.length} icon={<Wrench />} tone="high" foot={`${proposed.filter((rec) => rec.effort === "Low").length} low effort`} />
        <StatCard label="Applied controls" value={applied.length} icon={<ShieldCheck />} tone="success" foot={`${presentControls.length} control families present`} />
        <StatCard label="Projected risk" value={projected.after} unit="/ 100" icon={<TrendingDown />} tone={projected.after < risk.score ? "success" : "medium"} foot={`${projected.delta} if every open fix is applied`} />
        <StatCard label="Paths recoverable" value={projected.blockedScenarios.length} icon={<RotateCcw />} tone="violet" foot="Scenarios that would stop succeeding" />
      </div>

      <div className="content-grid split-2-1 mt-12">
        <Panel
          title="Recommendation queue"
          icon={<Wrench size={15} />}
          action={<span className="small-meta">{filtered.length} OF {state.recommendations.length}</span>}
          flush
        >
          <div className="filters-bar">
            <div className="chip-row">
              {FILTERS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`chip${filter === item ? " active" : ""}`}
                  onClick={() => setFilter(item)}
                  style={{ textTransform: "capitalize" }}
                >
                  {item}
                  <span className="count">
                    {item === "all"
                      ? state.recommendations.length
                      : state.recommendations.filter((rec) => rec.status === item).length}
                  </span>
                </button>
              ))}
            </div>
            <span className="small-meta" style={{ marginLeft: "auto" }}>
              SORTED BY RISK REMOVED
            </span>
          </div>

          <div className="rec-list">
            {[...filtered]
              .sort((a, b) => b.riskReduction - a.riskReduction)
              .map((rec) => {
                const impact = recommendationImpact(state.assets, rec);
                const targetNames = rec.targets
                  .map((id) => state.assets.find((asset) => asset.id === id)?.name || id)
                  .join(", ");
                return (
                  <div className={`rec-item${rec.status === "applied" ? " applied" : ""}`} key={rec.id}>
                    <span className={`rec-check${rec.status === "applied" ? " applied" : ""}`}>
                      {rec.status === "applied" ? <CheckCircle2 /> : rec.status === "dismissed" ? <XCircle /> : <Circle />}
                    </span>
                    <div className="rec-body">
                      <div className="row wrap between" style={{ gap: 8 }}>
                        <div className="rec-title">{rec.title}</div>
                        <div className="row" style={{ gap: 5 }}>
                          <Badge tone={rec.effort === "Low" ? "success" : rec.effort === "Medium" ? "medium" : "high"}>
                            {rec.effort} effort
                          </Badge>
                          <Badge tone={rec.status === "applied" ? "success" : rec.status === "dismissed" ? "neutral" : "info"}>
                            {rec.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="rec-detail">{rec.detail}</div>
                      <div className="rec-meta">
                        <span className="tag cyan">{rec.category}</span>
                        <span className="tag green">−{Math.abs(impact.delta)} risk</span>
                        <span className="tag violet">{CONTROL_LABELS[rec.control] || rec.control}</span>
                        <span className="tag">{targetNames}</span>
                      </div>
                      <div className="small-meta mt-8" style={{ lineHeight: 1.6 }}>
                        {rec.rationale}
                        {impact.blockedScenarios.length > 0 && (
                          <> · Stops {impact.blockedScenarios.length} open path{impact.blockedScenarios.length === 1 ? "" : "s"}.</>
                        )}
                        {rec.status === "applied" && rec.appliedBy && (
                          <> · Applied by {rec.appliedBy} {rec.appliedAt ? timeAgo(rec.appliedAt) : ""}.</>
                        )}
                      </div>
                      <div className="rec-actions" style={{ flexDirection: "row", justifyContent: "flex-start", alignItems: "center", marginTop: 10 }}>
                        {rec.status === "proposed" && (
                          <>
                            <button
                              type="button"
                              className="btn success sm"
                              onClick={() => dispatch({ type: "APPLY_FIX", id: rec.id })}
                            >
                              <CheckCircle2 /> Apply to twin
                            </button>
                            <button
                              type="button"
                              className="btn ghost sm"
                              onClick={() => dispatch({ type: "DISMISS_FIX", id: rec.id })}
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                        {rec.status === "dismissed" && (
                          <button
                            type="button"
                            className="btn outline sm"
                            onClick={() => dispatch({ type: "RESTORE_FIX", id: rec.id })}
                          >
                            <RotateCcw /> Restore
                          </button>
                        )}
                        {rec.status === "applied" && (
                          <Link to={`/app/twin/what-if?control=${rec.control}`} className="btn ghost sm">
                            Validate with what-if <ArrowRight size={12} />
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="rec-actions">
                      <div style={{ textAlign: "right" }}>
                        <div className="small-meta">RISK DELTA</div>
                        <div className="brief-number" style={{ fontSize: 23, color: impact.delta < 0 ? "var(--green)" : "var(--faint)" }}>
                          {impact.delta > 0 ? "+" : ""}{impact.delta}
                        </div>
                      </div>
                      <span className="small-meta">{impact.before} → {impact.after}</span>
                    </div>
                  </div>
                );
              })}
            {filtered.length === 0 && (
              <div className="empty-state">
                <CheckCircle2 size={26} />
                <div className="strong">No recommendations in this view.</div>
                <div className="small">Try another status or run a new simulation to surface gaps.</div>
              </div>
            )}
          </div>

          <div className="panel-footer">
            <div className="row between">
              <span className="small muted">
                Applying a fix updates the twin immediately. Historical simulation findings are preserved.
              </span>
              <span className="small-meta">{gaps.length} CONTROL FAMILIES MISSING</span>
            </div>
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Self-healing loop" icon={<RotateCcw size={15} />}>
            <div className="healing-loop">
              {healingSteps.map((step, index) => (
                <div className={`healing-step ${step.state}`} key={step.label}>
                  <span className="healing-num">{String(index + 1).padStart(2, "0")}</span>
                  <div className="healing-text">
                    <strong>{step.label}</strong>
                    {step.detail}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Projected posture" icon={<TrendingDown size={15} />}>
            <div className="risk-ring-wrap">
              <RiskRing score={projected.after} size={108} />
              <div className="risk-meta">
                <div className="risk-label" style={{ color: healingTone === "critical" ? "var(--red)" : "var(--green)" }}>
                  <span className="dot" /> {riskLabel(projected.after).label} after fixes
                </div>
                <p>
                  {projected.delta < 0
                    ? `Applying every open recommendation would move risk ${risk.score} → ${projected.after} and interrupt ${projected.blockedScenarios.length} open path${projected.blockedScenarios.length === 1 ? "" : "s"}.`
                    : "No projected movement. Either the open fixes are already reflected or no reachable control gap remains."}
                </p>
              </div>
            </div>
            <div className="factor-list mt-12">
              <div className="factor-row"><span className="k">Current risk</span><Progress value={risk.score} tone="amber" /><span className="v">{risk.score}</span></div>
              <div className="factor-row"><span className="k">Projected risk</span><Progress value={projected.after} tone="green" /><span className="v">{projected.after}</span></div>
              <div className="factor-row"><span className="k">Coverage now</span><Progress value={risk.coverage} tone="violet" /><span className="v">{risk.coverage}%</span></div>
              <div className="factor-row"><span className="k">Coverage projected</span><Progress value={projected.risk.coverage} tone="green" /><span className="v">{projected.risk.coverage}%</span></div>
            </div>
            <Link to="/app/twin/what-if" className="btn outline block mt-12">
              Compare in what-if <ArrowRight />
            </Link>
          </Panel>

          <Panel title="Recently applied" icon={<Clock size={15} />} flush>
            <div className="activity-list">
              {applied.slice(0, 5).map((rec) => (
                <div className="activity-item" key={rec.id}>
                  <span className="activity-icon success"><CheckCircle2 /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="activity-text">{rec.title}</div>
                    <div className="activity-meta">
                      <span>{rec.appliedBy || "Analyst"}</span>
                      <span>·</span>
                      <span>{rec.appliedAt ? timeAgo(rec.appliedAt) : "recently"}</span>
                    </div>
                  </div>
                </div>
              ))}
              {applied.length === 0 && <div className="empty-inline">No controls applied from this queue yet.</div>}
            </div>
          </Panel>

          <Panel title="Missing control families" icon={<ShieldCheck size={15} />}>
            <div className="chip-list">
              {gaps.map((gap) => (
                <span className="tag red" key={gap.control}>{gap.label}</span>
              ))}
              {gaps.length === 0 && <span className="tag green">All key controls are represented</span>}
            </div>
            <div className="small muted mt-12" style={{ lineHeight: 1.55 }}>
              A control family only matters on the asset that participates in a reachable attack path. The recommendation
              queue accounts for that ordering.
            </div>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={applyOpen}
        title="Apply all low-effort fixes?"
        message={`This will apply ${quickWins.length} control${quickWins.length === 1 ? "" : "s"} across ${new Set(quickWins.flatMap((rec) => rec.targets)).size} asset(s) in the twin. Risk is projected to move from ${risk.score} to ${projected.after}. You can still review every change in the what-if comparison.`}
        confirmLabel="Apply quick wins"
        tone="primary"
        onConfirm={applyQuickWins}
        onClose={() => setApplyOpen(false)}
      />
    </div>
  );
}
