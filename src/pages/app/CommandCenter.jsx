import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Fingerprint,
  Gauge,
  GitBranch,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Target,
  TrendingDown,
  Wrench,
  Zap,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import TopologyGraph, { TopologyLegend } from "../../components/TopologyGraph";
import AssetIcon from "../../components/AssetIcon";
import {
  Badge,
  Progress,
  RiskRing,
  SeverityBadge,
  Sparkline,
  StatCard,
  StatusBadge,
  PageHeader,
  Panel,
} from "../../components/ui";
import {
  assetRisk,
  computeRisk,
  evaluateScenario,
  recommendationImpact,
  riskLabel,
  severityRank,
} from "../../lib/engine";
import { timeAgo } from "../../lib/format";
import { ASSET_TYPES } from "../../data/mock";

const ACTIVITY_ICONS = {
  detection: ShieldAlert,
  simulation: Play,
  evidence: FileText,
  fix: Wrench,
  incident: Siren,
  twin: GitBranch,
  report: FileText,
  workspace: Fingerprint,
};

function FactorRow({ label, value, tone }) {
  return (
    <div className="factor-row">
      <span className="k">{label}</span>
      <Progress value={value} tone={tone} />
      <span className="v">{value}</span>
    </div>
  );
}

export default function CommandCenter() {
  const { state, dispatch, runningRun, risk } = useApp();
  const [selectedId, setSelectedId] = useState("app-01");
  const selectedAsset = state.assets.find((asset) => asset.id === selectedId) || null;
  const overall = riskLabel(risk.score);

  const openDetections = useMemo(
    () => state.detections.filter((detection) => detection.status === "open"),
    [state.detections]
  );
  const activeIncidents = useMemo(
    () => state.incidents.filter((incident) => incident.status !== "closed"),
    [state.incidents]
  );
  const topDetections = useMemo(
    () =>
      [...openDetections]
        .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
        .slice(0, 4),
    [openDetections]
  );
  const topRecommendations = useMemo(
    () =>
      [...state.recommendations]
        .filter((rec) => rec.status === "proposed")
        .sort((a, b) => b.riskReduction - a.riskReduction)
        .slice(0, 3),
    [state.recommendations]
  );
  const exposure = useMemo(
    () =>
      state.scenarios
        .map((scenario) => ({ scenario, plan: evaluateScenario(scenario, state.assets) }))
        .sort((a, b) => {
          if (a.plan.attackerSuccess !== b.plan.attackerSuccess) return a.plan.attackerSuccess ? -1 : 1;
          return b.plan.completedSteps - a.plan.completedSteps;
        })
        .slice(0, 4),
    [state.scenarios, state.assets]
  );

  const successRate = useMemo(() => {
    const completed = state.runs.filter((run) => run.status === "completed");
    if (!completed.length) return 0;
    return Math.round((completed.filter((run) => !run.attackerSuccess).length / completed.length) * 100);
  }, [state.runs]);

  const trend = useMemo(() => {
    const base = risk.score;
    return [base + 9, base + 7, base + 6, base + 5, base + 3, base + 4, base, base - 1, base + 1, base - 2, base - 1, base];
  }, [risk.score]);

  const selectedRisk = selectedAsset ? assetRisk(selectedAsset) : null;
  const topFixImpact = topRecommendations[0]
    ? recommendationImpact(state.assets, topRecommendations[0])
    : null;

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · Command Center`}
        title="Your twin is ready. What are we testing today?"
        subtitle="Rehearse the attack against a faithful copy of the environment, investigate the evidence with HUNTER AI, then prove the fix."
        actions={
          <>
            <Link to="/app/twin/self-healing" className="btn outline">
              <Wrench /> Review fixes
            </Link>
            <Link to="/app/twin/simulations" className="btn primary">
              <Play /> Run a simulation
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard
          label="Overall risk"
          value={risk.score}
          unit="/ 100"
          icon={<Gauge />}
          tone={overall.tone}
          delta={<><TrendingDown size={11} /> -6.2%</>}
          foot={`${overall.label} · weighted 0.62 / 0.38`}
        />
        <StatCard
          label="Open detections"
          value={openDetections.length}
          icon={<ShieldAlert />}
          tone="high"
          foot={`${state.detections.filter((item) => item.status === "triaged").length} already triaged`}
        />
        <StatCard
          label="Active incidents"
          value={activeIncidents.length}
          icon={<Siren />}
          tone="critical"
          foot={`${state.incidents.filter((item) => item.status === "open").length} awaiting first response`}
        />
        <StatCard
          label="Control coverage"
          value={risk.coverage}
          unit="%"
          icon={<ShieldCheck />}
          tone="success"
          foot={`${state.assets.flatMap((asset) => asset.controls).length} applied across ${state.assets.length} assets`}
        />
      </div>

      <div className="brief-hero violet mt-12">
        <div className="row" style={{ alignItems: "flex-start", gap: 15 }}>
          <span className="feature-icon" style={{ width: 38, height: 38, flexShrink: 0 }}>
            <Brain />
          </span>
          <div>
            <div className="eyebrow violet" style={{ marginBottom: 4 }}>HUNTER AI · Daily brief</div>
            <h2>
              {topDetections[0]
                ? `${topDetections[0].title} is still open on ${topDetections[0].assetId}.`
                : "No open detections. The twin is quiet."}
            </h2>
            <p>
              {topDetections[0]
                ? `${topDetections[0].description} The linked incident ${topDetections[0].incidentId || "has not been created yet"}. ${
                    activeIncidents.length
                  } active case${activeIncidents.length === 1 ? "" : "s"} need a disposition.`
                : "Run a simulation or ingest a log sample to exercise the detection pipeline."}
            </p>
            <div className="chip-row mt-12">
              <Link to="/app/hunter/detections" className="btn violet sm">
                Open HUNTER queue <ArrowRight />
              </Link>
              <Link to="/app/hunter/incidents" className="btn outline sm">
                Review incidents
              </Link>
              {topDetections[0]?.incidentId && (
                <Link to={`/app/hunter/incidents/${topDetections[0].incidentId}`} className="btn ghost sm">
                  Go to {topDetections[0].incidentId}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="brief-number" style={{ color: "var(--violet)" }}>{state.logs.length}</div>
          <div className="small-meta">NORMALISED EVENTS</div>
          <div className="small-meta mt-8">HUNTER-CORE v4.1</div>
        </div>
      </div>

      <div className="content-grid split-2-1">
        <Panel
          className="topology-panel"
          title="Authorised digital twin"
          icon={<GitBranch size={15} />}
          action={
            <div className="row" style={{ gap: 6 }}>
              <span className="badge success"><span className="dot" /> SYNCED</span>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => dispatch({ type: "SYNC_TWIN" })}
              >
                <RefreshCw size={12} /> Validate
              </button>
            </div>
          }
          flush
        >
          <TopologyGraph
            assets={state.assets}
            edges={state.edges}
            selectedId={selectedId}
            onSelect={(asset) => setSelectedId(asset.id)}
          />
          <TopologyLegend>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 11.5 }}>
              {state.assets.length} assets · {state.edges.length} approved links
            </span>
          </TopologyLegend>
          {selectedAsset ? (
            <div className="asset-peek">
              <span className="peek-name">
                <AssetIcon type={selectedAsset.type} size={14} />
                {selectedAsset.name}
              </span>
              <span className="peek-meta">
                {ASSET_TYPES[selectedAsset.type]?.label} · {selectedAsset.ip} · risk{" "}
                <span style={{ color: selectedRisk >= 70 ? "var(--red)" : "var(--amber)" }}>{selectedRisk}</span>
              </span>
              <span className="peek-meta">{selectedAsset.controls.length} controls</span>
              <Link className="peek-link link icon-inline" to={`/app/twin/builder?asset=${selectedAsset.id}`}>
                Inspect in builder <ChevronRight size={12} />
              </Link>
            </div>
          ) : (
            <div className="asset-peek">
              <span className="peek-meta">Select a node to inspect its risk and controls.</span>
            </div>
          )}
        </Panel>

        <Panel
          title="Risk posture"
          icon={<Gauge size={15} />}
          action={<Link to="/app/twin/risk" className="btn ghost sm">Analyse <ChevronRight size={12} /></Link>}
        >
          <div className="risk-ring-wrap">
            <RiskRing score={risk.score} size={128} />
            <div className="risk-meta">
              <div className="risk-label" style={{ color: overall.tone === "critical" ? "var(--red)" : "var(--amber)" }}>
                <span className={`dot ${overall.tone === "critical" ? "pulse" : ""}`} />
                {overall.label} exposure
              </div>
              <p>
                {risk.score >= 70
                  ? "A successful end-to-end path remains. The data tier is reachable from the app tier and egress is uninspected."
                  : "Controls are interrupting attack chains. Re-run the most exposed paths to confirm the change."}
              </p>
            </div>
          </div>
          <div className="factor-list">
            <FactorRow label="Likelihood" value={risk.likelihood} tone="amber" />
            <FactorRow label="Impact" value={risk.impact} tone="red" />
            <FactorRow label="Exposure" value={risk.exposure} tone="violet" />
            <FactorRow label="Coverage" value={risk.coverage} tone="green" />
          </div>
          <div className="mini-stat-row mt-16">
            <div className="mini-stat"><div className="k">Asset risk</div><div className="v">{risk.assetRisk}</div></div>
            <div className="mini-stat"><div className="k">Scenario risk</div><div className="v">{risk.scenarioRisk}</div></div>
            <div className="mini-stat"><div className="k">Fix success</div><div className="v green">{successRate}%</div></div>
            <div className="mini-stat"><div className="k">Latest run</div><div className="v" style={{ fontSize: 12.5 }}>{state.runs[0]?.id || "—"}</div></div>
          </div>
          <div className="mt-16">
            <div className="row between mb-8">
              <span className="small-meta">RISK TREND · 12 WEEKS</span>
              <Badge tone="success">Improving</Badge>
            </div>
            <Sparkline values={trend} color="#fbbf24" height={52} />
          </div>
        </Panel>
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Priority actions"
          icon={<Zap size={15} />}
          action={<Link to="/app/twin/self-healing" className="btn ghost sm">All recommendations <ChevronRight size={12} /></Link>}
          flush
        >
          <div className="action-list">
            {topRecommendations.length === 0 && (
              <div className="empty-inline">No outstanding recommendations. Apply a simulation to surface the next gap.</div>
            )}
            {topRecommendations.map((rec, index) => {
              const impact = recommendationImpact(state.assets, rec);
              return (
                <div className="action-item" key={rec.id}>
                  <span className="action-rank">0{index + 1}</span>
                  <div className="action-body">
                    <div className="action-title">{rec.title}</div>
                    <div className="action-meta">
                      <span>{rec.category}</span>
                      <span>·</span>
                      <span>{rec.effort} effort</span>
                      <span>·</span>
                      <span className="green">{impact.delta} projected risk</span>
                    </div>
                    <div className="action-buttons">
                      <button
                        type="button"
                        className="btn success sm"
                        onClick={() => dispatch({ type: "APPLY_FIX", id: rec.id })}
                      >
                        <CheckCircle2 /> Apply to twin
                      </button>
                      <Link to="/app/twin/what-if" className="btn ghost sm">Project in what-if</Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {topFixImpact && (
            <div className="panel-footer">
              <span className="small muted">
                Applying <strong className="soft">{topRecommendations[0].title}</strong> would move risk{" "}
                {topFixImpact.before} → {topFixImpact.after} and stop {topFixImpact.blockedScenarios.length} simulated path(s).
              </span>
            </div>
          )}
        </Panel>

        <Panel
          title="HUNTER queue"
          icon={<ShieldAlert size={15} />}
          action={<Link to="/app/hunter/detections" className="btn ghost sm">View all <ChevronRight size={12} /></Link>}
          flush
        >
          <div className="finding-list">
            {topDetections.length === 0 && <div className="empty-inline">No open detections. HUNTER is listening.</div>}
            {topDetections.map((detection) => (
              <Link
                to={`/app/hunter/detections?focus=${detection.id}`}
                className="finding-item"
                key={detection.id}
                style={{ display: "flex" }}
              >
                <span className={`finding-sev-bar ${detection.severity}`} />
                <div className="finding-body">
                  <div className="finding-title">{detection.title}</div>
                  <div className="finding-meta">
                    <span>{detection.id}</span>
                    <span>·</span>
                    <span>{detection.technique}</span>
                    <span>·</span>
                    <span>{detection.assetId}</span>
                    <span>·</span>
                    <span>{Math.round(detection.confidence * 100)}% confidence</span>
                  </div>
                </div>
                <span className="finding-time">{timeAgo(detection.firstSeen)}</span>
              </Link>
            ))}
          </div>
          <div className="panel-footer">
            <div className="row between">
              <span className="small muted">{state.detections.length} detections this week · {state.fingerprints.length} actor fingerprints</span>
              <Link to="/app/hunter/fingerprints" className="link small icon-inline"><Fingerprint size={12} /> Compare</Link>
            </div>
          </div>
        </Panel>
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Attack paths needing attention"
          icon={<Target size={15} />}
          action={<Link to="/app/twin/attack-paths" className="btn ghost sm">Open path explorer <ChevronRight size={12} /></Link>}
          flush
        >
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Entry → target</th>
                  <th scope="col">Outcome</th>
                  <th scope="col" style={{ width: 70 }}>Trace</th>
                </tr>
              </thead>
              <tbody>
                {exposure.map(({ scenario, plan }) => (
                  <tr key={scenario.id}>
                    <td>
                      <div className="strong" style={{ fontSize: 13 }}>{scenario.name}</div>
                      <div className="small-meta mt-6">{scenario.category} · {plan.totalSteps} hops</div>
                    </td>
                    <td><SeverityBadge severity={scenario.severity} /></td>
                    <td className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                      {scenario.entry} → {scenario.target}
                    </td>
                    <td>
                      {plan.attackerSuccess ? (
                        <Badge tone="critical">Path succeeds</Badge>
                      ) : (
                        <Badge tone="success">{plan.completedSteps} hop{plan.completedSteps === 1 ? "" : "s"} allowed</Badge>
                      )}
                    </td>
                    <td>
                      <Link to={`/app/twin/attack-paths?scenario=${scenario.id}`} className="btn ghost sm">
                        Trace <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Recent activity"
          icon={<Activity size={15} />}
          action={<Clock size={14} className="dim" />}
          flush
        >
          <div className="activity-list">
            {state.activity.slice(0, 6).map((item) => {
              const Icon = ACTIVITY_ICONS[item.type] || Activity;
              return (
                <div className="activity-item" key={item.id}>
                  <span className={`activity-icon ${item.tone || ""}`}><Icon /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="activity-text">{item.text}</div>
                    <div className="activity-meta">
                      <span>{item.actor}</span>
                      <span>·</span>
                      <span>{timeAgo(item.at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel
        className="mt-12"
        title={runningRun ? `Live simulation · ${runningRun.id}` : "Simulation readiness"}
        icon={<Play size={15} />}
        action={
          runningRun ? (
            <Link to="/app/twin/simulations" className="btn outline sm"><Sparkles /> Watch live</Link>
          ) : (
            <Link to="/app/twin/history" className="btn ghost sm">View history <ChevronRight size={12} /></Link>
          )
        }
      >
        {runningRun ? (
          <div className="row wrap" style={{ gap: 22 }}>
            <div>
              <div className="small-meta">SCENARIO</div>
              <div className="strong" style={{ marginTop: 3 }}>{state.scenarios.find((scenario) => scenario.id === runningRun.scenarioId)?.name}</div>
            </div>
            <div>
              <div className="small-meta">PROGRESS</div>
              <div className="strong" style={{ marginTop: 3 }}>{runningRun.cursor} / {runningRun.plan?.length || runningRun.totalSteps} hops</div>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div className="row between mb-8">
                <span className="small muted">Attack path execution</span>
                <span className="small-meta">{runningRun.executed?.length || 0} events revealed</span>
              </div>
              <Progress value={((runningRun.cursor || 0) / Math.max(1, runningRun.plan?.length || 1)) * 100} />
            </div>
            <Link to="/app/twin/simulations" className="btn primary sm"><ArrowRight /> Open runner</Link>
          </div>
        ) : (
          <div className="row wrap between" style={{ gap: 16 }}>
            <div className="row" style={{ gap: 12 }}>
              <span className="feature-icon" style={{ width: 34, height: 34 }}><ShieldCheck /></span>
              <div>
                <div className="strong">The model is deterministic and ready.</div>
                <div className="small muted mt-6">{state.assets.length} assets · {state.edges.length} links · {state.scenarios.length} scenarios · {state.recommendations.filter((rec) => rec.status === "proposed").length} fixes proposed</div>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link to="/app/twin/builder" className="btn outline sm"><GitBranch /> Update the twin</Link>
              <Link to="/app/twin/simulations" className="btn primary sm"><Play /> Choose a scenario</Link>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
