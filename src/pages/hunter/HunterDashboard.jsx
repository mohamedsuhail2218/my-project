import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Archive,
  Brain,
  ChevronRight,
  Clock,
  Fingerprint,
  Globe,
  Radio,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Zap,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  PageHeader,
  Panel,
  Progress,
  ScoreRing,
  SeverityBadge,
  Sparkline,
  StatCard,
  StatusBadge,
} from "../../components/ui";
import { severityRank } from "../../lib/engine";
import { timeAgo } from "../../lib/format";

const SEVERITIES = ["critical", "high", "medium", "low"];

export default function HunterDashboard() {
  const { state, dispatch } = useApp();

  const openDetections = useMemo(
    () =>
      [...state.detections]
        .filter((detection) => detection.status === "open")
        .sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    [state.detections]
  );
  const activeIncidents = state.incidents.filter((incident) => incident.status !== "closed");
  const unassigned = state.detections.filter(
    (detection) => detection.assignee === "Unassigned" && detection.status !== "closed"
  );
  const anomalousLogs = state.logs.filter((log) => log.status !== "allow");

  const severityCounts = useMemo(
    () =>
      SEVERITIES.map((severity) => ({
        severity,
        total: state.detections.filter((detection) => detection.severity === severity).length,
        open: state.detections.filter(
          (detection) => detection.severity === severity && detection.status !== "closed"
        ).length,
      })),
    [state.detections]
  );

  const sourceCounts = useMemo(() => {
    const counts = {};
    state.logs.forEach((log) => {
      counts[log.source] = (counts[log.source] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([source, count]) => ({
        source,
        count,
        alerts: state.logs.filter((log) => log.source === source && log.status !== "allow").length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [state.logs]);

  const detectionTrend = useMemo(() => {
    const base = Math.max(1, openDetections.length + 2);
    return [base + 4, base + 2, base + 3, base + 1, base + 5, base + 2, base + 4, base + 3, base + 1, base + 2, base + 3, base];
  }, [openDetections.length]);

  const topDetection = openDetections[0] || null;
  const topIncident = [...activeIncidents].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity)
  )[0] || null;

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · HUNTER AI`}
        title="HUNTER has read the evidence. Here is what matters."
        subtitle="Detections, behavioural matches, threat intelligence and incident context — correlated into a single investigation surface."
        actions={
          <>
            <Link to="/app/hunter/intel" className="btn outline">
              <Radio /> Live intel lookup
            </Link>
            <Link to="/app/hunter/detections" className="btn violet">
              <ShieldAlert /> Open detection queue
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Open detections" value={openDetections.length} icon={<ShieldAlert />} tone="high" foot={`${unassigned.length} unassigned · ${state.detections.length} total this week`} />
        <StatCard label="Active incidents" value={activeIncidents.length} icon={<Siren />} tone="critical" foot={`${state.incidents.filter((incident) => incident.status === "open").length} awaiting first response`} />
        <StatCard label="Signals ingested" value={state.logs.length} icon={<ScrollText />} tone="info" foot={`${anomalousLogs.length} alert/deny events in view`} />
        <StatCard label="Evidence sealed" value={state.evidence.length} icon={<Archive />} tone="violet" foot="SHA-256 verified chain of custody" />
      </div>

      <div className="brief-hero violet mt-12">
        <div className="row" style={{ alignItems: "flex-start", gap: 15 }}>
          <span className="feature-icon" style={{ width: 38, height: 38, flexShrink: 0 }}>
            <Brain />
          </span>
          <div>
            <div className="eyebrow violet" style={{ marginBottom: 4 }}>HUNTER AI · Daily brief</div>
            <h2>
              {topDetection
                ? `${topDetection.title} on ${topDetection.assetId}.`
                : "No open detections. The model is quiet."}
            </h2>
            <p>
              {topDetection
                ? `${topDetection.description} ${
                    topIncident
                      ? `${topIncident.id} is ${topIncident.status} with ${topIncident.detectionIds.length} linked detection(s).`
                      : "No incident is linked yet."
                  } HUNTER assigned ${Math.round(topDetection.confidence * 100)}% confidence to this pattern.`
                : "HUNTER is listening. Ingest a log sample or run a simulation to exercise the detection pipeline."}
            </p>
            <div className="chip-row mt-12">
              <Link to={topDetection ? `/app/hunter/detections?focus=${topDetection.id}` : "/app/hunter/detections"} className="btn violet sm">
                Review detection <ArrowRight />
              </Link>
              <Link to="/app/hunter/investigation" className="btn outline sm">
                <Search size={14} /> Investigate a source
              </Link>
              {topIncident && (
                <Link to={`/app/hunter/incidents/${topIncident.id}`} className="btn ghost sm">
                  Open {topIncident.id}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="brief-number" style={{ color: "var(--violet)" }}>
            {Math.round((openDetections.filter((detection) => detection.severity === "critical").length / Math.max(1, openDetections.length)) * 100)}%
          </div>
          <div className="small-meta">CRITICAL SHARE</div>
          <div className="small-meta mt-8">HUNTER-CORE v4.1</div>
        </div>
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Priority queue"
          icon={<ShieldAlert size={15} />}
          action={<Link to="/app/hunter/detections" className="btn ghost sm">All detections <ChevronRight size={12} /></Link>}
          flush
        >
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Detection</th>
                  <th>Severity</th>
                  <th>Confidence</th>
                  <th>Asset</th>
                  <th>Assignee</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {openDetections.slice(0, 6).map((detection) => (
                  <tr key={detection.id}>
                    <td>
                      <div className="strong" style={{ fontSize: 13 }}>{detection.title}</div>
                      <div className="small-meta mt-6">{detection.id} · {detection.technique} · {detection.source}</div>
                    </td>
                    <td><SeverityBadge severity={detection.severity} /></td>
                    <td>
                      <div className="confidence-bar">
                        <Progress value={detection.confidence * 100} tone={detection.confidence > 0.9 ? "red" : "amber"} />
                        <span>{Math.round(detection.confidence * 100)}%</span>
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{detection.assetId}</td>
                    <td className="small">{detection.assignee}</td>
                    <td>
                      <Link to={`/app/hunter/detections?focus=${detection.id}`} className="btn ghost sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
                {openDetections.length === 0 && (
                  <tr><td colSpan={6}><div className="empty-inline">No open detections. HUNTER is listening.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="panel-footer">
            <div className="row between">
              <span className="small muted">{state.fingerprints.length} actor fingerprints · {state.intel.length} tracked indicators</span>
              <Link to="/app/hunter/fingerprints" className="link small icon-inline"><Fingerprint size={12} /> Compare actors</Link>
            </div>
          </div>
        </Panel>

        <Panel title="Detection volume" icon={<Activity size={15} />}>
          <div className="row between mb-8">
            <span className="small-meta">ROLLING 12 HOURS</span>
            <Badge tone="high">Elevated</Badge>
          </div>
          <Sparkline values={detectionTrend} color="#fb7185" height={72} />
          <div className="mt-16">
            <div className="stack-6">
              {severityCounts.map((item) => (
                <div className="source-row" key={item.severity}>
                  <span style={{ textTransform: "capitalize" }}>{item.severity}</span>
                  <Progress
                    value={(item.open / Math.max(1, state.detections.length)) * 100}
                    tone={item.severity === "critical" ? "red" : item.severity === "high" ? "amber" : item.severity === "medium" ? "cyan" : "green"}
                  />
                  <span className="v">{item.open} open</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mini-stat-row mt-16">
            <div className="mini-stat"><div className="k">MTTD</div><div className="v">42s</div></div>
            <div className="mini-stat"><div className="k">MTTA</div><div className="v">18m</div></div>
            <div className="mini-stat"><div className="k">Auto-triaged</div><div className="v">{state.detections.filter((detection) => detection.status === "triaged").length}</div></div>
            <div className="mini-stat"><div className="k">Coverage</div><div className="v">{Math.round((state.detections.length / Math.max(1, state.logs.length)) * 100)}%</div></div>
          </div>
        </Panel>
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Actor fingerprints"
          icon={<Fingerprint size={15} />}
          action={<Link to="/app/hunter/fingerprints" className="btn ghost sm">All actors <ChevronRight size={12} /></Link>}
          flush
        >
          <div style={{ padding: 14 }}>
            <div className="grid-2">
              {state.fingerprints.slice(0, 4).map((fingerprint) => (
                <div className="panel" style={{ padding: 14, boxShadow: "none" }} key={fingerprint.id}>
                  <div className="row between" style={{ alignItems: "flex-start" }}>
                    <div className="row" style={{ gap: 9 }}>
                      <span className="fp-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                        {fingerprint.actor.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div className="strong" style={{ fontSize: 12 }}>{fingerprint.actor}</div>
                        <div className="small-meta mt-6">{fingerprint.classification}</div>
                      </div>
                    </div>
                    <ScoreRing value={fingerprint.score} size={44} tone="violet" />
                  </div>
                  <div className="chip-list mt-10">
                    {fingerprint.tactics.slice(0, 2).map((tactic) => (
                      <span className="tag violet" key={tactic}>{tactic}</span>
                    ))}
                  </div>
                  <div className="row between mt-10">
                    <span className="small-meta">{fingerprint.detections} DETECTIONS · {fingerprint.incidents} INCIDENT(S)</span>
                    <Link to="/app/hunter/fingerprints" className="link small">Profile</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          title="Incident load"
          icon={<Siren size={15} />}
          action={<Link to="/app/hunter/incidents" className="btn ghost sm">Cases <ChevronRight size={12} /></Link>}
          flush
        >
          <div className="finding-list">
            {activeIncidents.slice(0, 5).map((incident) => (
              <Link to={`/app/hunter/incidents/${incident.id}`} className="finding-item" key={incident.id} style={{ display: "flex" }}>
                <span className={`finding-sev-bar ${incident.severity}`} />
                <div className="finding-body">
                  <div className="finding-title">{incident.title}</div>
                  <div className="finding-meta">
                    <span>{incident.id}</span>
                    <span>·</span>
                    <span>{incident.assignee}</span>
                    <span>·</span>
                    <span>{timeAgo(incident.updatedAt)}</span>
                  </div>
                </div>
                <StatusBadge status={incident.status} />
              </Link>
            ))}
            {activeIncidents.length === 0 && <div className="empty-inline">No active incidents.</div>}
          </div>
        </Panel>
      </div>

      <div className="content-grid split-2-1">
        <Panel title="Live threat intelligence" icon={<Globe size={15} />} action={<Link to="/app/hunter/intel" className="btn ghost sm">Intel feed <ChevronRight size={12} /></Link>} flush>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Indicator</th>
                  <th>Type</th>
                  <th>Verdict</th>
                  <th>Confidence</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {state.intel.slice(0, 5).map((ioc) => (
                  <tr key={ioc.id}>
                    <td className="mono" style={{ fontSize: 12, color: "#ff9aa8", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{ioc.value}</td>
                    <td><Badge tone="neutral">{ioc.type}</Badge></td>
                    <td>
                      <Badge tone={ioc.verdict === "malicious" ? "critical" : ioc.verdict === "suspicious" ? "high" : "success"}>
                        {ioc.verdict}
                      </Badge>
                    </td>
                    <td>{ioc.confidence}%</td>
                    <td className="small-meta">{timeAgo(ioc.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-footer">
            <span className="small muted">Live provider lookups run on demand · RDAP keyless · AbuseIPDB and OTX when configured</span>
          </div>
        </Panel>

        <Panel title="Signal sources" icon={<Radio size={15} />}>
          <div className="stack-6">
            {sourceCounts.map((source) => (
              <div className="source-row" key={source.source}>
                <span className="mono">{source.source}</span>
                <Progress value={(source.count / Math.max(1, state.logs.length)) * 100} tone={source.alerts ? "amber" : "cyan"} />
                <span className="v">{source.count}</span>
              </div>
            ))}
          </div>
          <div className="notice mt-12">
            <Zap />
            <div>HUNTER normalises every source before detection. Alerts are correlated across identity, endpoint, network and cloud.</div>
          </div>
          <Link to="/app/hunter/logs" className="btn outline block mt-12">
            <ScrollText /> Open log explorer
          </Link>
        </Panel>
      </div>

      <div className="content-grid split-2-1">
        <Panel title="Recent evidence" icon={<Archive size={15} />} action={<Link to="/app/hunter/evidence" className="btn ghost sm">Vault <ChevronRight size={12} /></Link>} flush>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Object</th>
                  <th>Type</th>
                  <th>Incident</th>
                  <th>Sealed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {state.evidence.slice(0, 4).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="mono" style={{ fontSize: 12, color: "var(--text-soft)" }}>{item.name}</div>
                      <div className="small-meta mt-6">{item.id} · {item.size}</div>
                    </td>
                    <td className="small">{item.type}</td>
                    <td>
                      {item.incidentId ? (
                        <Link to={`/app/hunter/incidents/${item.incidentId}`} className="link small">{item.incidentId}</Link>
                      ) : "—"}
                    </td>
                    <td className="small-meta">{timeAgo(item.uploadedAt)}</td>
                    <td><Badge tone={item.status === "sealed" ? "success" : "high"}>{item.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Workspace activity" icon={<Clock size={15} />} flush>
          <div className="activity-list">
            {state.activity.slice(0, 6).map((item) => (
              <div className="activity-item" key={item.id}>
                <span className={`activity-icon ${item.tone || ""}`}><Sparkles /></span>
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
          </div>
        </Panel>
      </div>

      <div className="notice mt-12">
        <ShieldCheck />
        <div>
          HUNTER AI explains its reasoning: every detection links back to raw events, the actor fingerprint and the evidence
          object that supports it. No black-box verdicts.
        </div>
      </div>
    </div>
  );
}
