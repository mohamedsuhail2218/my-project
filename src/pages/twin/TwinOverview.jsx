import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  ChevronRight,
  CircleDot,
  GitBranch,
  Globe,
  Layers,
  Lock,
  Network,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import TopologyGraph, { TopologyLegend } from "../../components/TopologyGraph";
import AssetIcon from "../../components/AssetIcon";
import {
  Badge,
  PageHeader,
  Panel,
  Progress,
  RiskRing,
  SeverityBadge,
  StatCard,
} from "../../components/ui";
import { ASSET_TYPES, CONTROL_LABELS, CRITICALITY, ZONES } from "../../data/mock";
import { assetRisk, evaluateScenario, riskLabel, severityRank } from "../../lib/engine";
import { timeAgo } from "../../lib/format";

export default function TwinOverview() {
  const { state, dispatch, risk } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get("asset");
  const [selectedId, setSelectedId] = useState(
    initialId && state.assets.some((asset) => asset.id === initialId)
      ? initialId
      : state.assets[0]?.id || null
  );

  const selectedAsset = state.assets.find((asset) => asset.id === selectedId) || null;
  const overall = riskLabel(risk.score);
  const selectedRisk = selectedAsset ? assetRisk(selectedAsset) : 0;

  const zoneRows = useMemo(
    () =>
      Object.entries(ZONES).map(([zoneId, zone]) => {
        const assets = state.assets.filter((asset) => asset.zone === zoneId);
        const avg = assets.length
          ? Math.round(assets.reduce((sum, asset) => sum + assetRisk(asset), 0) / assets.length)
          : 0;
        return {
          id: zoneId,
          label: zone.label,
          assets,
          avg,
          critical: assets.filter((asset) => ["critical", "high"].includes(asset.criticality)).length,
          coverage: assets.length
            ? Math.round((assets.filter((asset) => asset.controls.length > 0).length / assets.length) * 100)
            : 0,
        };
      }),
    [state.assets]
  );

  const exposure = useMemo(
    () =>
      state.scenarios
        .map((scenario) => ({ scenario, plan: evaluateScenario(scenario, state.assets) }))
        .sort((a, b) => {
          if (a.plan.attackerSuccess !== b.plan.attackerSuccess) return a.plan.attackerSuccess ? -1 : 1;
          return severityRank(a.scenario.severity) - severityRank(b.scenario.severity);
        })
        .slice(0, 5),
    [state.scenarios, state.assets]
  );

  const selectAsset = (asset) => {
    setSelectedId(asset.id);
    setSearchParams({ asset: asset.id }, { replace: true });
  };

  const recentRuns = state.runs.slice(0, 4);
  const targetScenario = selectedAsset
    ? state.scenarios.find((scenario) => scenario.target === selectedAsset.id) || null
    : null;
  const requiredControls = selectedAsset
    ? [...new Set(
        state.scenarios
          .flatMap((scenario) =>
            scenario.steps
              .filter((step) => step.to === selectedAsset.id)
              .map((step) => step.control)
          )
      )]
    : [];
  const missingControls = requiredControls.filter(
    (control) => !selectedAsset?.controls.includes(control)
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · Digital twin`}
        title="A faithful copy of the network, safe to break."
        subtitle="Every asset, link, service and control is modelled. Select a node to inspect its exposure, then rehearse an attack path against the copy — never production."
        actions={
          <>
            <button
              type="button"
              className="btn outline"
              onClick={() => dispatch({ type: "SYNC_TWIN" })}
            >
              <RefreshCw /> Validate model
            </button>
            <Link to="/app/twin/builder" className="btn primary">
              <GitBranch /> Edit twin
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard
          label="Modelled assets"
          value={state.assets.length}
          icon={<Server />}
          tone="info"
          foot={`${Object.keys(
            state.assets.reduce((acc, asset) => ({ ...acc, [asset.type]: true }), {})
          ).length} asset types in 5 zones`}
        />
        <StatCard
          label="Approved links"
          value={state.edges.length}
          icon={<Network />}
          tone="violet"
          foot="Firewall-aware east-west paths"
        />
        <StatCard
          label="Overall risk"
          value={risk.score}
          unit="/ 100"
          icon={<Activity />}
          tone={overall.tone}
          foot={`${overall.label} · weighted posture`}
        />
        <StatCard
          label="Control coverage"
          value={risk.coverage}
          unit="%"
          icon={<ShieldCheck />}
          tone="success"
          foot={`${state.assets.flatMap((asset) => asset.controls).length} control assignments`}
        />
      </div>

      <div className="content-grid split-2-1 mt-12">
        <Panel
          className="topology-panel"
          title="Authorised topology"
          icon={<GitBranch size={15} />}
          action={
            <div className="row" style={{ gap: 6 }}>
              <span className="badge success"><span className="dot" /> APPROVED</span>
              <span className="small-meta">{timeAgo(state.lastSyncedAt)}</span>
            </div>
          }
          flush
        >
          <TopologyGraph
            assets={state.assets}
            edges={state.edges}
            selectedId={selectedId}
            onSelect={selectAsset}
          />
          <TopologyLegend>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 8.5 }}>
              {state.assets.length} nodes · {state.edges.length} links · SVG model
            </span>
          </TopologyLegend>
        </Panel>

        <div className="stack">
          <Panel
            title={selectedAsset ? "Asset inspector" : "Select a node"}
            icon={<Server size={15} />}
            action={
              selectedAsset && (
                <Link to={`/app/twin/builder?asset=${selectedAsset.id}`} className="btn ghost sm">
                  Open <ChevronRight size={12} />
                </Link>
              )
            }
          >
            {selectedAsset ? (
              <>
                <div className="inspector-hero">
                  <span className={`asset-icon ${selectedAsset.zone === "data" ? "violet" : ""}`}>
                    <AssetIcon type={selectedAsset.type} size={18} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="inspector-name">{selectedAsset.name}</div>
                    <div className="inspector-sub">
                      {selectedAsset.label} · {selectedAsset.ip || "no address"}
                    </div>
                  </div>
                  <RiskRing score={selectedRisk} size={54} label="RISK" />
                </div>

                <div className="mini-stat-row mt-12">
                  <div className="mini-stat">
                    <div className="k">Zone</div>
                    <div className="v" style={{ fontSize: 12 }}>{ZONES[selectedAsset.zone]?.label || selectedAsset.zone}</div>
                  </div>
                  <div className="mini-stat">
                    <div className="k">Criticality</div>
                    <div className="v" style={{ fontSize: 12 }}>{CRITICALITY[selectedAsset.criticality]?.label}</div>
                  </div>
                  <div className="mini-stat">
                    <div className="k">Exposure</div>
                    <div className="v" style={{ fontSize: 12 }}>{Math.round(selectedAsset.exposure * 100)}%</div>
                  </div>
                  <div className="mini-stat">
                    <div className="k">Controls</div>
                    <div className="v" style={{ fontSize: 12 }}>{selectedAsset.controls.length}</div>
                  </div>
                </div>

                <div className="inspector-section mt-16">
                  <div className="label">Services</div>
                  <div className="chip-list">
                    {(selectedAsset.services || []).map((service) => (
                      <span className="tag cyan" key={service}>{service}</span>
                    ))}
                    {!selectedAsset.services?.length && <span className="small dim">No services recorded.</span>}
                  </div>
                </div>

                <div className="inspector-section">
                  <div className="label">Applied controls</div>
                  <div className="chip-list">
                    {selectedAsset.controls.map((control) => (
                      <span className="tag green" key={control}>
                        {CONTROL_LABELS[control] || control}
                      </span>
                    ))}
                    {!selectedAsset.controls.length && <span className="small dim">No controls modelled on this asset.</span>}
                  </div>
                </div>

                <div className="inspector-section">
                  <div className="label">Owner</div>
                  <div className="small soft">{selectedAsset.owner || "Unassigned"}</div>
                </div>

                {missingControls.length > 0 && (
                  <div className="notice warning mt-12">
                    <Lock />
                    <div>
                      This asset belongs to a scenario target with {missingControls.length} unmodelled control
                      families. Review the path in <Link className="link" to={`/app/twin/attack-paths?scenario=${targetScenario?.id || ""}`}>attack paths</Link>.
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="inspector-empty">
                <Network size={24} />
                <div className="strong">Select a node on the topology.</div>
                <div className="small">The inspector shows services, controls and exposure.</div>
              </div>
            )}
          </Panel>

          <Panel title="Model health" icon={<Layers size={15} />}>
            <div className="factor-list">
              <div className="factor-row">
                <span className="k">Known assets</span>
                <Progress value={100} tone="green" />
                <span className="v">{state.assets.length}</span>
              </div>
              <div className="factor-row">
                <span className="k">Links mapped</span>
                <Progress value={Math.min(100, state.edges.length * 5)} tone="cyan" />
                <span className="v">{state.edges.length}</span>
              </div>
              <div className="factor-row">
                <span className="k">Control coverage</span>
                <Progress value={risk.coverage} tone="violet" />
                <span className="v">{risk.coverage}%</span>
              </div>
              <div className="factor-row">
                <span className="k">Scenario coverage</span>
                <Progress value={Math.min(100, state.scenarios.length * 10)} tone="amber" />
                <span className="v">{state.scenarios.length}</span>
              </div>
            </div>
            <div className="notice mt-12">
              <ShieldCheck />
              <div>The twin is deterministic and approval-gated. Nothing here touches live infrastructure.</div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Zones and exposure"
          icon={<Globe size={15} />}
          action={<Link to="/app/twin/risk" className="btn ghost sm">Risk analysis <ChevronRight size={12} /></Link>}
          flush
        >
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Assets</th>
                  <th>High / critical</th>
                  <th>Avg. asset risk</th>
                  <th>Coverage</th>
                  <th>Posture</th>
                </tr>
              </thead>
              <tbody>
                {zoneRows.map((zone) => (
                  <tr key={zone.id}>
                    <td>
                      <div className="strong" style={{ fontSize: 11.5 }}>{zone.label}</div>
                      <div className="small-meta mt-6">{zone.id.toUpperCase()}</div>
                    </td>
                    <td className="mono">{zone.assets.length}</td>
                    <td className="mono">{zone.critical}</td>
                    <td>
                      <div className="confidence-bar">
                        <Progress value={zone.avg} tone={zone.avg >= 70 ? "red" : zone.avg >= 50 ? "amber" : "green"} />
                        <span>{zone.avg}</span>
                      </div>
                    </td>
                    <td className="mono">{zone.coverage}%</td>
                    <td>
                      <Badge tone={zone.avg >= 70 ? "critical" : zone.avg >= 50 ? "high" : "success"}>
                        {zone.avg >= 70 ? "Exposed" : zone.avg >= 50 ? "Elevated" : "Guarded"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Most exposed paths"
          icon={<Play size={15} />}
          action={<Link to="/app/twin/simulations" className="btn ghost sm">Simulate <ChevronRight size={12} /></Link>}
          flush
        >
          <div className="finding-list">
            {exposure.map(({ scenario, plan }) => (
              <Link
                to={`/app/twin/attack-paths?scenario=${scenario.id}`}
                className="finding-item"
                key={scenario.id}
                style={{ display: "flex" }}
              >
                <span className={`finding-sev-bar ${scenario.severity}`} />
                <div className="finding-body">
                  <div className="finding-title">{scenario.name}</div>
                  <div className="finding-meta">
                    <span>{scenario.entry} → {scenario.target}</span>
                    <span>·</span>
                    <span>{plan.totalSteps} hops</span>
                  </div>
                </div>
                <Badge tone={plan.attackerSuccess ? "critical" : "success"}>
                  {plan.attackerSuccess ? "Open" : "Blocked"}
                </Badge>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="content-grid split-1-2">
        <Panel
          title="Recent simulations"
          icon={<Activity size={15} />}
          action={<Link to="/app/twin/history" className="btn ghost sm">History <ChevronRight size={12} /></Link>}
          flush
        >
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Scenario</th>
                  <th>Outcome</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="mono" style={{ fontSize: 9 }}>{run.id}</td>
                    <td>
                      <div className="strong" style={{ fontSize: 10.5 }}>
                        {state.scenarios.find((scenario) => scenario.id === run.scenarioId)?.name || run.scenarioId}
                      </div>
                      <div className="small-meta mt-6">{run.mode === "red-blue" ? "RED VS BLUE" : "SINGLE RUN"}</div>
                    </td>
                    <td>
                      {run.status === "running" ? (
                        <Badge tone="high" dot>Running</Badge>
                      ) : run.attackerSuccess ? (
                        <Badge tone="critical">Reached target</Badge>
                      ) : run.status === "cancelled" ? (
                        <Badge tone="neutral">Cancelled</Badge>
                      ) : (
                        <Badge tone="success">Blocked</Badge>
                      )}
                    </td>
                    <td className="small-meta">{timeAgo(run.completedAt || run.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Twin change log" icon={<CircleDot size={15} />} flush>
          <div className="activity-list">
            {state.activity.filter((item) => ["twin", "fix", "simulation"].includes(item.type)).slice(0, 7).map((item) => (
              <div className="activity-item" key={item.id}>
                <span className={`activity-icon ${item.tone || ""}`}><Wrench /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="activity-text">{item.text}</div>
                  <div className="activity-meta">
                    <span>{item.actor}</span>
                    <span>·</span>
                    <span>{timeAgo(item.at)}</span>
                  </div>
                </div>
              </div>
            ))}
            {state.activity.filter((item) => ["twin", "fix", "simulation"].includes(item.type)).length === 0 && (
              <div className="empty-inline">No model changes recorded yet.</div>
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title="How this model is used"
        icon={<Layers size={15} />}
        className="mt-12"
      >
        <div className="grid-3">
          {[
            {
              icon: <GitBranch />,
              title: "Faithful structure",
              text: "Assets, addresses, services, trust relationships and controls mirror the approved architecture snapshot.",
            },
            {
              icon: <Play />,
              title: "Safe execution",
              text: "Every attack path runs inside the model. Nothing is sent to production, and every step is explainable.",
            },
            {
              icon: <ShieldCheck />,
              title: "Evidence-backed fixes",
              text: "Apply a control, re-run the path and compare risk before and after. Fixes are validated, not assumed.",
            },
          ].map((item) => (
            <div className="row" style={{ alignItems: "flex-start", gap: 12 }} key={item.title}>
              <span className="feature-icon" style={{ width: 34, height: 34, flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div className="strong">{item.title}</div>
                <p className="small muted mt-6" style={{ lineHeight: 1.55 }}>{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
