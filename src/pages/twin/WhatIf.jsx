import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Lock,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  Wrench,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  ConfirmDialog,
  PageHeader,
  Panel,
  Progress,
  RiskRing,
  SeverityBadge,
  StatCard,
} from "../../components/ui";
import {
  applyControlByRecommendation,
  computeRisk,
  evaluateScenario,
  riskLabel,
  severityRank,
} from "../../lib/engine";
import { CONTROL_LABELS, SCENARIOS } from "../../data/mock";

const PRESETS = [
  {
    id: "quick",
    label: "Quick wins",
    detail: "Low-effort recommendations only",
  },
  {
    id: "identity",
    label: "Identity first",
    detail: "MFA and least-privilege access",
  },
  {
    id: "data",
    label: "Protect the data",
    detail: "DLP, egress control and backups",
  },
  {
    id: "all",
    label: "Everything",
    detail: "Every proposed control family",
  },
];

function DualBar({ before, after, tone = "cyan" }) {
  return (
    <div className="dual-bar">
      <span className="bar-a" style={{ width: `${Math.min(100, before)}%` }} />
      <span className="bar-b" style={{ width: `${Math.min(100, after)}%`, background: tone }} />
    </div>
  );
}

export default function WhatIf() {
  const { state, dispatch, risk } = useApp();
  const [searchParams] = useSearchParams();
  const initialControl = searchParams.get("control");
  const [selectedControls, setSelectedControls] = useState(
    initialControl && state.recommendations.some((rec) => rec.control === initialControl)
      ? [initialControl]
      : []
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [appliedControls, setAppliedControls] = useState([]);

  const controlOptions = useMemo(() => {
    const map = new Map();
    state.recommendations.forEach((rec) => {
      if (!map.has(rec.control)) {
        map.set(rec.control, {
          control: rec.control,
          label: CONTROL_LABELS[rec.control] || rec.control,
          targets: new Set(),
          efforts: new Set(),
          reductions: [],
          categories: new Set(),
        });
      }
      const item = map.get(rec.control);
      rec.targets.forEach((target) => item.targets.add(target));
      item.efforts.add(rec.effort);
      item.reductions.push(rec.riskReduction || 0);
      item.categories.add(rec.category);
    });
    return [...map.values()]
      .map((item) => ({
        ...item,
        targets: [...item.targets],
        efforts: [...item.efforts],
        categories: [...item.categories],
        reduction: item.reductions.reduce((sum, value) => sum + value, 0),
      }))
      .sort((a, b) => b.reduction - a.reduction);
  }, [state.recommendations]);

  const projectedAssets = useMemo(
    () =>
      selectedControls.reduce(
        (assets, control) =>
          applyControlByRecommendation(assets, control, state.recommendations),
        state.assets
      ),
    [selectedControls, state.assets, state.recommendations]
  );

  const projectedRisk = useMemo(() => computeRisk(projectedAssets), [projectedAssets]);
  const overall = riskLabel(risk.score);
  const projectedOverall = riskLabel(projectedRisk.score);
  const delta = projectedRisk.score - risk.score;

  const scenarioImpact = useMemo(
    () =>
      SCENARIOS.map((scenario) => {
        const before = evaluateScenario(scenario, state.assets);
        const after = evaluateScenario(scenario, projectedAssets);
        return {
          scenario,
          before,
          after,
          newlyBlocked: before.attackerSuccess && !after.attackerSuccess,
          reopened: !before.attackerSuccess && after.attackerSuccess,
        };
      }).sort((a, b) => {
        if (a.newlyBlocked !== b.newlyBlocked) return a.newlyBlocked ? -1 : 1;
        return severityRank(a.scenario.severity) - severityRank(b.scenario.severity);
      }),
    [state.assets, projectedAssets]
  );

  const blockedCount = scenarioImpact.filter((item) => item.newlyBlocked).length;
  const changedAssets = projectedAssets.filter((asset) => {
    const original = state.assets.find((item) => item.id === asset.id);
    return (
      original &&
      (asset.controls.length !== original.controls.length ||
        asset.controls.some((control) => !original.controls.includes(control)))
    );
  });

  const toggleControl = (control) => {
    setSelectedControls((current) =>
      current.includes(control)
        ? current.filter((item) => item !== control)
        : [...current, control]
    );
    setAppliedControls([]);
  };

  const applyPreset = (preset) => {
    let controls = [];
    if (preset === "quick") {
      controls = [
        ...new Set(
          state.recommendations
            .filter((rec) => rec.effort === "Low" && rec.status === "proposed")
            .map((rec) => rec.control)
        ),
      ];
    } else if (preset === "identity") {
      controls = ["mfa", "iam"].filter((control) => controlOptions.some((item) => item.control === control));
    } else if (preset === "data") {
      controls = ["dlp", "egress-filter", "backup", "encryption"].filter((control) =>
        controlOptions.some((item) => item.control === control)
      );
    } else {
      controls = controlOptions.map((item) => item.control);
    }
    setSelectedControls(controls);
    setAppliedControls([]);
  };

  const applyProjection = () => {
    if (!selectedControls.length) return;
    dispatch({ type: "APPLY_CONTROLS", controls: selectedControls });
    setAppliedControls(selectedControls);
    setSelectedControls([]);
    setConfirmOpen(false);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · Digital twin`}
        title="Project the fix before you commit it."
        subtitle="Compose a set of controls, compare the projected twin against today and see which attack paths close. Nothing changes until you apply the projection."
        actions={
          <>
            <button
              type="button"
              className="btn outline"
              onClick={() => {
                setSelectedControls([]);
                setAppliedControls([]);
              }}
            >
              <RotateCcw /> Reset projection
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!selectedControls.length}
              onClick={() => setConfirmOpen(true)}
            >
              <ShieldCheck /> Apply projection
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Risk today" value={risk.score} unit="/ 100" icon={<SlidersHorizontal />} tone={overall.tone} foot={`${overall.label} exposure`} />
        <StatCard label="Projected risk" value={projectedRisk.score} unit="/ 100" icon={<TrendingDown />} tone={projectedOverall.tone} foot={selectedControls.length ? `${delta > 0 ? "+" : ""}${delta} from current` : "Select a control to project"} />
        <StatCard label="Paths closed" value={blockedCount} icon={<GitBranch />} tone="success" foot={`${scenarioImpact.filter((item) => item.before.attackerSuccess).length} paths open today`} />
        <StatCard label="Assets touched" value={changedAssets.length} icon={<Wrench />} tone="violet" foot={`${selectedControls.length} control famil${selectedControls.length === 1 ? "y" : "ies"} selected`} />
      </div>

      <div className="content-grid split-2-1 mt-12">
        <div className="stack">
          <Panel
            title="Compose the projection"
            icon={<SlidersHorizontal size={15} />}
            action={<span className="small-meta">{selectedControls.length} SELECTED</span>}
          >
            <div className="chip-row mb-12">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className="chip"
                  onClick={() => applyPreset(preset.id)}
                  title={preset.detail}
                >
                  <Sparkles size={10} /> {preset.label}
                </button>
              ))}
            </div>
            <div className="control-toggle-grid">
              {controlOptions.map((option) => {
                const on = selectedControls.includes(option.control);
                return (
                  <button
                    type="button"
                    key={option.control}
                    className={`control-toggle${on ? " on" : ""}`}
                    onClick={() => toggleControl(option.control)}
                    aria-pressed={on}
                  >
                    <span className="box">{on && <CheckCircle2 />}</span>
                    <span className="t" style={{ flex: 1 }}>
                      <span style={{ display: "block" }}>{option.label}</span>
                      <span className="small-meta" style={{ display: "block", marginTop: 2 }}>
                        {option.targets.length} asset{option.targets.length === 1 ? "" : "s"} · {option.efforts.join(" / ")} effort
                      </span>
                    </span>
                    <Badge tone={on ? "success" : "neutral"}>−{option.reduction}</Badge>
                  </button>
                );
              })}
            </div>
            <div className="notice mt-12">
              <Lock />
              <div>
                Projections use the recommendation targets and the same deterministic engine as simulations. A control can
                still fail to block a path if its target does not sit on the reachable route.
              </div>
            </div>
          </Panel>

          <Panel title="Before vs projected" icon={<TrendingDown size={15} />}>
            <div className="compare-bars">
              <div className="compare-row">
                <span className="k">Overall risk</span>
                <DualBar before={risk.score} after={projectedRisk.score} tone={projectedRisk.score < risk.score ? "#34d399" : "#f87171"} />
                <span className="v">{risk.score} → {projectedRisk.score}</span>
              </div>
              <div className="compare-row">
                <span className="k">Likelihood</span>
                <DualBar before={risk.likelihood} after={projectedRisk.likelihood} tone="#22d3ee" />
                <span className="v">{risk.likelihood} → {projectedRisk.likelihood}</span>
              </div>
              <div className="compare-row">
                <span className="k">Impact</span>
                <DualBar before={risk.impact} after={projectedRisk.impact} tone="#a78bfa" />
                <span className="v">{risk.impact} → {projectedRisk.impact}</span>
              </div>
              <div className="compare-row">
                <span className="k">Exposure</span>
                <DualBar before={risk.exposure} after={projectedRisk.exposure} tone="#fbbf24" />
                <span className="v">{risk.exposure} → {projectedRisk.exposure}</span>
              </div>
              <div className="compare-row">
                <span className="k">Coverage</span>
                <DualBar before={risk.coverage} after={projectedRisk.coverage} tone="#34d399" />
                <span className="v">{risk.coverage}% → {projectedRisk.coverage}%</span>
              </div>
            </div>
            <div className="compare-legend mt-16">
              <span><i style={{ background: "#3f5876" }} /> Today</span>
              <span><i style={{ background: "#22d3ee" }} /> Projected twin</span>
              <span style={{ marginLeft: "auto" }} className="small-meta">
                THE PROJECTION DOES NOT COMMIT UNTIL APPLIED
              </span>
            </div>
          </Panel>

          <Panel
            title="Scenario impact"
            icon={<GitBranch size={15} />}
            action={<Link to="/app/twin/attack-paths" className="btn ghost sm">Open paths <ChevronRight size={12} /></Link>}
            flush
          >
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Severity</th>
                    <th>Today</th>
                    <th>Projected</th>
                    <th>Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioImpact.map(({ scenario, before, after, newlyBlocked, reopened }) => (
                    <tr key={scenario.id}>
                      <td>
                        <Link to={`/app/twin/attack-paths?scenario=${scenario.id}`} style={{ color: "var(--text-soft)" }}>
                          <span className="strong" style={{ fontSize: 12.5 }}>{scenario.name}</span>
                        </Link>
                        <div className="small-meta mt-6">{scenario.entry} → {scenario.target}</div>
                      </td>
                      <td><SeverityBadge severity={scenario.severity} /></td>
                      <td><Badge tone={before.attackerSuccess ? "critical" : "success"}>{before.attackerSuccess ? "open" : "blocked"}</Badge></td>
                      <td><Badge tone={after.attackerSuccess ? "critical" : "success"}>{after.attackerSuccess ? "open" : "blocked"}</Badge></td>
                      <td>
                        {newlyBlocked ? (
                          <span className="small green">Path closed</span>
                        ) : reopened ? (
                          <span className="small red">Path reopened</span>
                        ) : before.attackerSuccess === after.attackerSuccess ? (
                          <span className="small dim">No change</span>
                        ) : (
                          <span className="small muted">Changed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Projection summary" icon={<ShieldCheck size={15} />}>
            <div className="risk-ring-wrap">
              <RiskRing score={projectedRisk.score} size={112} />
              <div className="risk-meta">
                <div className="risk-label" style={{ color: projectedOverall.tone === "critical" ? "var(--red)" : "var(--green)" }}>
                  <span className="dot" /> {projectedOverall.label}
                </div>
                <p>
                  {selectedControls.length
                    ? `Projected risk ${risk.score} → ${projectedRisk.score}. ${blockedCount} path${blockedCount === 1 ? "" : "s"} would stop succeeding.`
                    : "No controls selected. Choose controls to build a projection."}
                </p>
              </div>
            </div>
            <div className="factor-list mt-12">
              <div className="factor-row"><span className="k">Risk delta</span><Progress value={Math.abs(delta)} tone={delta <= 0 ? "green" : "red"} /><span className="v">{delta > 0 ? "+" : ""}{delta}</span></div>
              <div className="factor-row"><span className="k">Coverage gain</span><Progress value={Math.max(0, projectedRisk.coverage - risk.coverage)} tone="green" /><span className="v">+{Math.max(0, projectedRisk.coverage - risk.coverage)}%</span></div>
              <div className="factor-row"><span className="k">Paths closed</span><Progress value={blockedCount * 20} tone="cyan" /><span className="v">{blockedCount}</span></div>
            </div>
            <button
              type="button"
              className="btn primary block mt-12"
              disabled={!selectedControls.length}
              onClick={() => setConfirmOpen(true)}
            >
              <ShieldCheck /> Apply to twin
            </button>
            <div className="small muted mt-8" style={{ lineHeight: 1.55 }}>
              Applying updates the digital twin and marks the matching recommendations as applied.
            </div>
          </Panel>

          <Panel title="Paths closed by this projection" icon={<GitBranch size={15} />} flush>
            <div className="finding-list">
              {scenarioImpact.filter((item) => item.newlyBlocked).map(({ scenario }) => (
                <Link to={`/app/twin/attack-paths?scenario=${scenario.id}`} className="finding-item" key={scenario.id} style={{ display: "flex" }}>
                  <span className={`finding-sev-bar ${scenario.severity}`} />
                  <div className="finding-body">
                    <div className="finding-title">{scenario.name}</div>
                    <div className="finding-meta">
                      <span>{scenario.entry} → {scenario.target}</span>
                    </div>
                  </div>
                  <CheckCircle2 size={13} style={{ color: "var(--green)", marginTop: 12 }} />
                </Link>
              ))}
              {blockedCount === 0 && (
                <div className="empty-inline">
                  No paths close with this selection. Try a control that sits earlier in a reachable chain.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Assets in scope" icon={<Wrench size={15} />} flush>
            <div style={{ padding: 14 }}>
              <div className="chip-list">
                {changedAssets.map((asset) => (
                  <Link key={asset.id} to={`/app/twin/builder?asset=${asset.id}`} className="tag cyan" style={{ textDecoration: "none" }}>
                    {asset.name}
                  </Link>
                ))}
                {changedAssets.length === 0 && <span className="small dim">Selection does not change any asset yet.</span>}
              </div>
              {selectedControls.length > 0 && (
                <div className="notice mt-12">
                  <ArrowRight />
                  <div>
                    {selectedControls.length} control famil{selectedControls.length === 1 ? "y" : "ies"} project onto{" "}
                    {new Set(controlOptions.filter((item) => selectedControls.includes(item.control)).flatMap((item) => item.targets)).size} asset targets.
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div className="notice mt-12">
        <Sparkles />
        <div>
          Applied {appliedControls.length ? `${appliedControls.length} control famil${appliedControls.length === 1 ? "y" : "ies"}` : "projections"} become part of the twin.
          Use <Link className="link" to="/app/twin/simulations">Simulation Center</Link> to prove the closure on the exact attack path.
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Apply this projection to the twin?"
        message={`This commits ${selectedControls.length} control famil${selectedControls.length === 1 ? "y" : "ies"} across ${changedAssets.length} asset(s). Risk is projected to move ${risk.score} → ${projectedRisk.score}, and ${blockedCount} path(s) should close. Historical runs and evidence are preserved.`}
        confirmLabel="Apply projection"
        tone="primary"
        onConfirm={applyProjection}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
