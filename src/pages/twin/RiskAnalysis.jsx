import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Download,
  Gauge,
  Grid3X3,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  Wrench,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  PageHeader,
  Panel,
  Progress,
  RiskRing,
  SeverityBadge,
  Sparkline,
  StatCard,
} from "../../components/ui";
import {
  KEY_CONTROLS,
  computeRisk,
  evaluateScenario,
  riskLabel,
  scenarioRisk,
  severityRank,
} from "../../lib/engine";
import { ASSET_TYPES, CONTROL_LABELS, CRITICALITY, ZONES } from "../../data/mock";
import { downloadFile, toCsv } from "../../lib/format";

const LIKELIHOOD_LABELS = ["Very low", "Low", "Moderate", "High", "Very high"];
const IMPACT_LABELS = ["Very low", "Low", "Moderate", "High", "Critical"];

function riskTone(value) {
  if (value >= 80) return "critical";
  if (value >= 60) return "high";
  if (value >= 40) return "medium";
  if (value >= 20) return "low";
  return "success";
}

function cellKey(impact, likelihood) {
  return `${impact}-${likelihood}`;
}

export default function RiskAnalysis() {
  const { state, risk, dispatch } = useApp();
  const [query, setQuery] = useState("");
  const [criticality, setCriticality] = useState("All");
  const [zone, setZone] = useState("All");
  const [selectedCell, setSelectedCell] = useState("2-3");

  const overall = riskLabel(risk.score);
  const assetRisks = risk.assetRisks;

  const distribution = useMemo(() => {
    const cells = {};
    assetRisks.forEach((asset) => {
      const impact = Math.min(
        4,
        Math.max(0, Math.round((CRITICALITY[asset.criticality]?.impact || 0.5) * 5) - 1)
      );
      const likelihood = Math.min(
        4,
        Math.max(
          0,
          Math.floor(
            Math.min(
              98,
              Math.max(
                5,
                asset.exposure * 100 -
                  asset.controls.length * 6 +
                  (["critical", "high"].includes(asset.criticality) ? 22 : 12)
              )
            ) / 20
          )
        )
      );
      const key = cellKey(impact, likelihood);
      if (!cells[key]) cells[key] = [];
      cells[key].push(asset);
    });
    return cells;
  }, [assetRisks]);

  const selectedAssets = distribution[selectedCell] || [];

  const filteredAssets = useMemo(
    () =>
      [...assetRisks]
        .filter((asset) => {
          const matchesQuery = `${asset.name} ${asset.label} ${asset.ip} ${asset.owner}`
            .toLowerCase()
            .includes(query.toLowerCase());
          const matchesCriticality =
            criticality === "All" || asset.criticality === criticality;
          const matchesZone = zone === "All" || asset.zone === zone;
          return matchesQuery && matchesCriticality && matchesZone;
        })
        .sort((a, b) => b.risk - a.risk),
    [assetRisks, query, criticality, zone]
  );

  const scenarioRows = useMemo(
    () =>
      state.scenarios
        .map((scenario) => ({
          scenario,
          plan: evaluateScenario(scenario, state.assets),
          score: scenarioRisk(scenario, state.assets),
        }))
        .sort((a, b) => b.score - a.score),
    [state.scenarios, state.assets]
  );

  const controlCoverage = useMemo(
    () =>
      KEY_CONTROLS.map((control) => {
        const assets = state.assets.filter((asset) => asset.controls.includes(control));
        return {
          control,
          label: CONTROL_LABELS[control] || control,
          count: assets.length,
          assets,
        };
      }).sort((a, b) => a.count - b.count),
    [state.assets]
  );

  const trend = useMemo(() => {
    const base = risk.score;
    return [base + 11, base + 9, base + 8, base + 6, base + 7, base + 4, base + 5, base + 2, base + 3, base, base - 1, base];
  }, [risk.score]);

  const exportRegister = () => {
    const csv = toCsv(
      [...assetRisks].sort((a, b) => b.risk - a.risk),
      [
        { label: "Asset", value: (asset) => asset.name },
        { label: "Label", value: (asset) => asset.label },
        { label: "Type", value: (asset) => ASSET_TYPES[asset.type]?.label || asset.type },
        { label: "Zone", value: (asset) => ZONES[asset.zone]?.label || asset.zone },
        { label: "Criticality", value: (asset) => asset.criticality },
        { label: "Exposure", value: (asset) => `${Math.round(asset.exposure * 100)}%` },
        { label: "Controls", value: (asset) => asset.controls.length },
        { label: "Risk", value: (asset) => asset.risk },
        { label: "Owner", value: (asset) => asset.owner },
      ]
    );
    downloadFile(`northwind_risk_register_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Risk register exported", message: `${assetRisks.length} assets included in the CSV.`, tone: "success" },
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · Digital twin`}
        title="Risk is a distribution, not a number."
        subtitle="See where likelihood and impact collide, which assets carry the weighted risk and which controls actually reduce it across the modelled attack paths."
        actions={
          <>
            <button
              type="button"
              className="btn outline"
              onClick={() => dispatch({ type: "SYNC_TWIN" })}
            >
              <SlidersHorizontal /> Recalculate
            </button>
            <button type="button" className="btn primary" onClick={exportRegister}>
              <Download /> Export register
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Overall risk" value={risk.score} unit="/ 100" icon={<Gauge />} tone={overall.tone} foot={`${overall.label} · weighted posture`} />
        <StatCard label="Likelihood" value={risk.likelihood} unit="/ 100" icon={<TrendingDown />} tone={riskTone(risk.likelihood)} foot="Control-adjusted attack likelihood" />
        <StatCard label="Business impact" value={risk.impact} unit="/ 100" icon={<AlertTriangle />} tone={riskTone(risk.impact)} foot="Criticality-weighted impact" />
        <StatCard label="Control coverage" value={risk.coverage} unit="%" icon={<ShieldCheck />} tone={risk.coverage >= 70 ? "success" : "high"} foot={`${controlCoverage.filter((item) => item.count > 0).length} of ${KEY_CONTROLS.length} key controls present`} />
      </div>

      <div className="content-grid split-1-2 mt-12">
        <Panel title="Posture breakdown" icon={<Gauge size={15} />}>
          <div className="risk-ring-wrap">
            <RiskRing score={risk.score} size={134} />
            <div className="risk-meta">
              <div className="risk-label" style={{ color: overall.tone === "critical" ? "var(--red)" : overall.tone === "high" ? "var(--orange)" : "var(--amber)" }}>
                <span className={`dot ${overall.tone === "critical" ? "pulse" : ""}`} />
                {overall.label} exposure
              </div>
              <p>
                {risk.score >= 70
                  ? "At least one end-to-end path remains open. Prioritise the lowest-effort control that breaks the most paths."
                  : "Existing controls interrupt several chains, but weighted asset risk still dominates the score."}
              </p>
            </div>
          </div>
          <div className="factor-list mt-12">
            <div className="factor-row"><span className="k">Weighted asset risk</span><Progress value={risk.assetRisk} tone="amber" /><span className="v">{risk.assetRisk}</span></div>
            <div className="factor-row"><span className="k">Scenario risk</span><Progress value={risk.scenarioRisk} tone="red" /><span className="v">{risk.scenarioRisk}</span></div>
            <div className="factor-row"><span className="k">Exposure</span><Progress value={risk.exposure} tone="violet" /><span className="v">{risk.exposure}</span></div>
            <div className="factor-row"><span className="k">Coverage</span><Progress value={risk.coverage} tone="green" /><span className="v">{risk.coverage}%</span></div>
          </div>
          <div className="mt-16">
            <div className="row between mb-8">
              <span className="small-meta">RISK TREND · 12 WEEKS</span>
              <Badge tone="success">Improving</Badge>
            </div>
            <Sparkline values={trend} color="#fbbf24" height={54} />
          </div>
          <div className="mini-stat-row mt-12">
            <div className="mini-stat"><div className="k">Assets</div><div className="v">{state.assets.length}</div></div>
            <div className="mini-stat"><div className="k">Critical</div><div className="v">{assetRisks.filter((asset) => asset.criticality === "critical").length}</div></div>
            <div className="mini-stat"><div className="k">Open paths</div><div className="v red">{scenarioRows.filter((row) => row.plan.attackerSuccess).length}</div></div>
            <div className="mini-stat"><div className="k">Applied fixes</div><div className="v green">{state.recommendations.filter((rec) => rec.status === "applied").length}</div></div>
          </div>
        </Panel>

        <Panel
          title="Likelihood × impact matrix"
          icon={<Grid3X3 size={15} />}
          action={
            <Link to="/app/twin/builder" className="btn ghost sm">
              Edit model <ChevronRight size={12} />
            </Link>
          }
        >
          <div className="matrix-wrap">
            <div className="matrix-y-label">Impact →</div>
            <div>
              <div className="matrix">
                {[4, 3, 2, 1, 0].map((impact) =>
                  [0, 1, 2, 3, 4].map((likelihood) => {
                    const key = cellKey(impact, likelihood);
                    const assets = distribution[key] || [];
                    const level = Math.max(impact + 1, likelihood + 1);
                    const active = selectedCell === key;
                    return (
                      <button
                        type="button"
                        key={key}
                        className={`matrix-cell${level > 1 ? ` l${level}` : ""}`}
                        onClick={() => setSelectedCell(key)}
                        style={{
                          border: active ? "1px solid rgba(34,211,238,.55)" : "1px solid transparent",
                          cursor: "pointer",
                          background: active ? "rgba(6,182,212,.18)" : undefined,
                        }}
                        title={`${IMPACT_LABELS[impact]} impact × ${LIKELIHOOD_LABELS[likelihood]} likelihood · ${assets.length} asset(s)`}
                      >
                        {assets.length > 0 && (
                          <span className="matrix-dot" style={{ left: "50%", top: "50%" }}>
                            {assets.length}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="matrix-x-labels">
                {LIKELIHOOD_LABELS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="matrix-legend">
                <span>LIKELIHOOD →</span>
                <span className="matrix-gradient" />
                <span>IMPACT →</span>
              </div>
            </div>
          </div>

          <div className="drawer-section" style={{ borderTop: "1px solid var(--border-soft)", marginTop: 14, paddingTop: 12 }}>
            <div className="row between mb-8">
              <span className="small-meta">
                SELECTED CELL · {IMPACT_LABELS[Number(selectedCell.split("-")[0])]} IMPACT ×{" "}
                {LIKELIHOOD_LABELS[Number(selectedCell.split("-")[1])]} LIKELIHOOD
              </span>
              <span className="small-meta">{selectedAssets.length} ASSET(S)</span>
            </div>
            {selectedAssets.length ? (
              <div className="chip-list">
                {selectedAssets.map((asset) => (
                  <Link
                    key={asset.id}
                    to={`/app/twin/builder?asset=${asset.id}`}
                    className="tag cyan"
                    style={{ textDecoration: "none" }}
                  >
                    {asset.name} · {asset.risk}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="small dim">No assets occupy this cell. Choose another square.</div>
            )}
          </div>

          <div className="notice mt-12">
            <AlertTriangle />
            <div>The matrix is a structured estimate from exposure, criticality and modelled controls. It is not a prediction of a live compromise.</div>
          </div>
        </Panel>
      </div>

      <Panel
        className="mt-12"
        title="Asset risk register"
        icon={<BarChart3 size={15} />}
        action={<span className="small-meta">{filteredAssets.length} OF {assetRisks.length}</span>}
        flush
      >
        <div className="filters-bar">
          <div className="input-icon search" style={{ maxWidth: 280 }}>
            <Search />
            <input
              className="input"
              placeholder="Search assets, owners, addresses…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="chip-row">
            {["All", "critical", "high", "medium", "low"].map((level) => (
              <button
                type="button"
                key={level}
                className={`chip${criticality === level ? " active" : ""}`}
                onClick={() => setCriticality(level)}
              >
                {level === "All" ? "All criticality" : CRITICALITY[level].label}
              </button>
            ))}
          </div>
          <select className="select" value={zone} onChange={(event) => setZone(event.target.value)} style={{ width: 150 }}>
            <option value="All">All zones</option>
            {Object.entries(ZONES).map(([id, meta]) => (
              <option key={id} value={id}>{meta.label}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Zone</th>
                <th>Criticality</th>
                <th>Exposure</th>
                <th>Controls</th>
                <th>Risk</th>
                <th>Owner</th>
                <th style={{ width: 58 }} />
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    <div className="strong" style={{ fontSize: 13 }}>{asset.name}</div>
                    <div className="small-meta mt-6">{ASSET_TYPES[asset.type]?.label} · {asset.ip}</div>
                  </td>
                  <td className="small">{ZONES[asset.zone]?.label || asset.zone}</td>
                  <td><Badge tone={asset.criticality}>{CRITICALITY[asset.criticality]?.label}</Badge></td>
                  <td className="mono">{Math.round(asset.exposure * 100)}%</td>
                  <td className="mono">{asset.controls.length}</td>
                  <td>
                    <div className="confidence-bar">
                      <Progress value={asset.risk} tone={asset.risk >= 70 ? "red" : asset.risk >= 50 ? "amber" : "green"} />
                      <span>{asset.risk}</span>
                    </div>
                  </td>
                  <td className="small">{asset.owner}</td>
                  <td>
                    <Link to={`/app/twin/builder?asset=${asset.id}`} className="btn ghost sm">
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="content-grid cols-2">
        <Panel title="Scenario risk" icon={<AlertTriangle size={15} />} action={<Link to="/app/twin/attack-paths" className="btn ghost sm">Paths <ChevronRight size={12} /></Link>} flush>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Severity</th>
                  <th>Risk</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {scenarioRows.map(({ scenario, plan, score }) => (
                  <tr key={scenario.id}>
                    <td>
                      <Link to={`/app/twin/attack-paths?scenario=${scenario.id}`} className="strong" style={{ fontSize: 12.5, color: "var(--text-soft)" }}>
                        {scenario.name}
                      </Link>
                      <div className="small-meta mt-6">{scenario.category}</div>
                    </td>
                    <td><SeverityBadge severity={scenario.severity} /></td>
                    <td>
                      <div className="confidence-bar">
                        <Progress value={score} tone={score >= 70 ? "red" : score >= 45 ? "amber" : "green"} />
                        <span>{score}</span>
                      </div>
                    </td>
                    <td><Badge tone={plan.attackerSuccess ? "critical" : "success"}>{plan.attackerSuccess ? "open" : "blocked"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Control coverage" icon={<ShieldCheck size={15} />} action={<Link to="/app/twin/self-healing" className="btn success sm"><Wrench /> Fix gaps</Link>} flush>
          <div style={{ padding: 16 }}>
            <div className="stack-6">
              {controlCoverage.map((item) => (
                <div className="source-row" key={item.control}>
                  <span className="truncate" title={item.label}>{item.label}</span>
                  <Progress value={Math.min(100, item.count * 28)} tone={item.count ? "green" : "red"} />
                  <span className="v">{item.count ? `${item.count} asset${item.count === 1 ? "" : "s"}` : "GAP"}</span>
                </div>
              ))}
            </div>
            <div className="notice mt-12">
              <ShieldCheck />
              <div>
                Coverage counts control assignments across assets. A control on the wrong asset may not interrupt a path.
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="notice mt-12">
        <BarChart3 />
        <div>
          Scores are recomputed from the current twin state using the weighted asset model and the scenario library. Apply a
          fix in <Link className="link" to="/app/twin/self-healing">self-healing</Link> or project it in{" "}
          <Link className="link" to="/app/twin/what-if">what-if</Link> to see the distribution move.
        </div>
      </div>
    </div>
  );
}
