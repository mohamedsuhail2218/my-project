import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Filter,
  Plus,
  Search,
  ShieldAlert,
  Siren,
  User,
  X,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  Drawer,
  MetaGrid,
  PageHeader,
  Panel,
  Progress,
  SeverityBadge,
  StatCard,
  StatusBadge,
} from "../../components/ui";
import { severityRank } from "../../lib/engine";
import { downloadFile, formatDateTime, timeAgo, toCsv } from "../../lib/format";

const SEVERITIES = ["all", "critical", "high", "medium", "low"];
const STATUSES = ["all", "open", "triaged", "closed"];
const SOURCES = ["all", "rule", "behavioural", "statistical", "ml"];

export default function Detections() {
  const { state, dispatch } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const focus = searchParams.get("focus");
  const [selectedId, setSelectedId] = useState(focus);
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (focus && state.detections.some((detection) => detection.id === focus)) {
      setSelectedId(focus);
    }
  }, [focus, state.detections]);

  const selected = state.detections.find((detection) => detection.id === selectedId) || null;

  const filtered = useMemo(
    () =>
      [...state.detections]
        .filter((detection) => {
          const matchesQuery = `${detection.id} ${detection.title} ${detection.technique} ${detection.techniqueName} ${detection.assetId} ${detection.assignee}`
            .toLowerCase()
            .includes(query.toLowerCase());
          return (
            matchesQuery &&
            (severity === "all" || detection.severity === severity) &&
            (status === "all" || detection.status === status) &&
            (source === "all" || detection.source === source)
          );
        })
        .sort((a, b) => {
          if (a.status === "closed" && b.status !== "closed") return 1;
          if (b.status === "closed" && a.status !== "closed") return -1;
          return severityRank(a.severity) - severityRank(b.severity);
        }),
    [state.detections, query, severity, status, source]
  );

  const open = state.detections.filter((detection) => detection.status === "open");
  const critical = state.detections.filter(
    (detection) => detection.severity === "critical" && detection.status !== "closed"
  );
  const meanConfidence = Math.round(
    (state.detections.reduce((sum, detection) => sum + detection.confidence, 0) /
      Math.max(1, state.detections.length)) *
      100
  );
  const linked = state.detections.filter((detection) => detection.incidentId).length;
  const sourceCounts = ["rule", "behavioural", "statistical", "ml"].map((item) => ({
    source: item,
    count: state.detections.filter((detection) => detection.source === item).length,
  }));

  const openDetection = (detection) => {
    setSelectedId(detection.id);
    setSearchParams({ focus: detection.id }, { replace: true });
  };

  const closeDrawer = () => {
    setSelectedId(null);
    if (focus) setSearchParams({}, { replace: true });
  };

  const exportCsv = () => {
    const csv = toCsv(state.detections, [
      { label: "Detection", value: (detection) => detection.id },
      { label: "Title", value: (detection) => detection.title },
      { label: "Severity", value: (detection) => detection.severity },
      { label: "Status", value: (detection) => detection.status },
      { label: "Source", value: (detection) => detection.source },
      { label: "Technique", value: (detection) => detection.technique },
      { label: "Asset", value: (detection) => detection.assetId },
      { label: "Confidence", value: (detection) => Math.round(detection.confidence * 100) },
      { label: "Assignee", value: (detection) => detection.assignee },
      { label: "Incident", value: (detection) => detection.incidentId || "" },
    ]);
    downloadFile(`hunter_detections_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Detections exported", message: `${state.detections.length} records written to CSV.`, tone: "success" },
    });
  };

  const triage = (detection) =>
    dispatch({ type: "UPDATE_DETECTION", id: detection.id, patch: { status: "triaged" } });
  const close = (detection) =>
    dispatch({ type: "UPDATE_DETECTION", id: detection.id, patch: { status: "closed" } });
  const reopen = (detection) =>
    dispatch({ type: "UPDATE_DETECTION", id: detection.id, patch: { status: "open" } });
  const assignMe = (detection) =>
    dispatch({
      type: "UPDATE_DETECTION",
      id: detection.id,
      patch: { assignee: state.user?.name || "Analyst" },
    });
  const createIncident = (detection) =>
    dispatch({ type: "ADD_INCIDENT_FROM_DETECTION", detectionId: detection.id });

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · HUNTER AI`}
        title="The queue, ranked by what could hurt you."
        subtitle="HUNTER correlates rules, behavioural models and statistical baselines. Open a detection to see the raw evidence, the actor context and the path to an incident."
        actions={
          <>
            <button type="button" className="btn outline" onClick={exportCsv}>
              <Download /> Export CSV
            </button>
            <Link to="/app/hunter/logs" className="btn ghost">
              <Search /> Search raw logs
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Open detections" value={open.length} icon={<ShieldAlert />} tone="high" foot={`${state.detections.filter((detection) => detection.status === "triaged").length} being triaged`} />
        <StatCard label="Critical / high" value={critical.length + state.detections.filter((detection) => detection.severity === "high" && detection.status !== "closed").length} icon={<Siren />} tone="critical" foot={`${critical.length} critical in the open queue`} />
        <StatCard label="Mean confidence" value={meanConfidence} unit="%" icon={<CheckCircle2 />} tone="violet" foot="Across all recorded detections" />
        <StatCard label="Linked to incidents" value={linked} icon={<ExternalLink />} tone="info" foot={`${state.incidents.filter((incident) => incident.status !== "closed").length} active incidents`} />
      </div>

      <div className="content-grid split-2-1 mt-12">
        <Panel
          title="Detection queue"
          icon={<ShieldAlert size={15} />}
          action={<span className="small-meta">{filtered.length} OF {state.detections.length}</span>}
          flush
        >
          <div className="filters-bar">
            <div className="input-icon search" style={{ maxWidth: 250 }}>
              <Search />
              <input
                className="input"
                placeholder="Search detections, techniques, assets…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="chip-row">
              {SEVERITIES.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`chip${severity === item ? " active" : ""}`}
                  onClick={() => setSeverity(item)}
                  style={{ textTransform: "capitalize" }}
                >
                  {item === "all" ? "All severity" : item}
                </button>
              ))}
            </div>
            <div className="chip-row">
              {STATUSES.map((item) => (
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
            <select className="select" value={source} onChange={(event) => setSource(event.target.value)} style={{ width: 135 }}>
              {SOURCES.map((item) => (
                <option value={item} key={item}>{item === "all" ? "All sources" : item}</option>
              ))}
            </select>
          </div>

          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Detection</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Asset</th>
                  <th>Assignee</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((detection) => (
                  <tr key={detection.id} className="clickable" onClick={() => openDetection(detection)}>
                    <td>
                      <div className="detection-title-cell">
                        <span className={`sev-marker ${detection.severity}`} />
                        <div>
                          <div className="strong" style={{ fontSize: 11 }}>{detection.title}</div>
                          <div className="small-meta mt-6">
                            {detection.id} · {detection.technique} · {detection.techniqueName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><SeverityBadge severity={detection.severity} /></td>
                    <td><StatusBadge status={detection.status} /></td>
                    <td>
                      <div className="confidence-bar">
                        <Progress value={detection.confidence * 100} tone={detection.confidence >= 0.9 ? "red" : "amber"} />
                        <span>{Math.round(detection.confidence * 100)}%</span>
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 9 }}>{detection.assetId}</td>
                    <td className="small">{detection.assignee}</td>
                    <td className="small-meta">{timeAgo(detection.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty-state">
                <Filter size={24} />
                <div className="strong">No detections match these filters.</div>
                <div className="small">Try another severity or clear the search.</div>
                <button type="button" className="btn outline sm" onClick={() => { setSeverity("all"); setStatus("all"); setSource("all"); setQuery(""); }}>
                  Reset filters
                </button>
              </div>
            )}
          </div>
          <div className="panel-footer">
            <div className="row between">
              <span className="small muted">Click a row to open the evidence-backed detection drawer.</span>
              <span className="small-meta">{state.detections.filter((detection) => detection.status === "closed").length} CLOSED · {linked} WITH INCIDENT</span>
            </div>
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Source mix" icon={<ShieldAlert size={15} />}>
            <div className="stack-6">
              {sourceCounts.map((item) => (
                <div className="source-row" key={item.source}>
                  <span style={{ textTransform: "capitalize" }}>{item.source}</span>
                  <Progress value={(item.count / Math.max(1, state.detections.length)) * 100} tone={item.source === "rule" ? "cyan" : item.source === "behavioural" ? "violet" : item.source === "ml" ? "red" : "amber"} />
                  <span className="v">{item.count}</span>
                </div>
              ))}
            </div>
            <div className="mini-stat-row mt-12" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="mini-stat"><div className="k">Triage now</div><div className="v">{open.length}</div></div>
              <div className="mini-stat"><div className="k">SLA target</div><div className="v" style={{ fontSize: 12 }}>15 min</div></div>
            </div>
            <div className="notice mt-12">
              <Clock />
              <div>Untriaged critical detections escalate automatically after 15 minutes in the production workflow.</div>
            </div>
          </Panel>

          <Panel title="Open incidents" icon={<Siren size={15} />} flush>
            <div className="finding-list">
              {state.incidents.filter((incident) => incident.status !== "closed").slice(0, 5).map((incident) => (
                <Link to={`/app/hunter/incidents/${incident.id}`} key={incident.id} className="finding-item" style={{ display: "flex" }}>
                  <span className={`finding-sev-bar ${incident.severity}`} />
                  <div className="finding-body">
                    <div className="finding-title">{incident.title}</div>
                    <div className="finding-meta">
                      <span>{incident.id}</span>
                      <span>·</span>
                      <span>{incident.detectionIds.length} detection(s)</span>
                    </div>
                  </div>
                  <ChevronRight size={12} style={{ marginTop: 12 }} />
                </Link>
              ))}
              {state.incidents.filter((incident) => incident.status !== "closed").length === 0 && (
                <div className="empty-inline">No open incidents.</div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <Drawer
        open={Boolean(selected)}
        title={selected?.title || "Detection"}
        subtitle={selected ? `${selected.id} · ${selected.technique} · ${selected.techniqueName}` : ""}
        onClose={closeDrawer}
        footer={
          selected && (
            <>
              {selected.status !== "closed" ? (
                <>
                  <button type="button" className="btn outline" onClick={() => triage(selected)}>
                    <CheckCircle2 /> Triage
                  </button>
                  <button type="button" className="btn outline" onClick={() => close(selected)}>
                    Close detection
                  </button>
                </>
              ) : (
                <button type="button" className="btn outline" onClick={() => reopen(selected)}>
                  Reopen
                </button>
              )}
              {!selected.incidentId ? (
                <button type="button" className="btn danger" onClick={() => createIncident(selected)}>
                  <Siren /> Open incident
                </button>
              ) : (
                <Link to={`/app/hunter/incidents/${selected.incidentId}`} className="btn primary">
                  <ExternalLink /> Open {selected.incidentId}
                </Link>
              )}
            </>
          )
        }
      >
        {selected && (
          <>
            <div className="row wrap mb-12" style={{ gap: 6 }}>
              <SeverityBadge severity={selected.severity} />
              <StatusBadge status={selected.status} />
              <Badge tone="neutral">{selected.source}</Badge>
              {selected.simulationId && <Badge tone="violet">simulation</Badge>}
            </div>
            <p className="small soft" style={{ lineHeight: 1.65 }}>{selected.description}</p>

            <MetaGrid
              items={[
                { k: "Asset", v: selected.assetId },
                { k: "Technique", v: selected.technique },
                { k: "Confidence", v: `${Math.round(selected.confidence * 100)}%` },
                { k: "Events", v: selected.events },
                { k: "First seen", v: formatDateTime(selected.firstSeen) },
                { k: "Last seen", v: formatDateTime(selected.lastSeen) },
              ]}
            />

            <div className="drawer-section">
              <div className="label">Assignee</div>
              <div className="row" style={{ gap: 7 }}>
                <select
                  className="select"
                  value={selected.assignee}
                  onChange={(event) =>
                    dispatch({
                      type: "UPDATE_DETECTION",
                      id: selected.id,
                      patch: { assignee: event.target.value },
                    })
                  }
                >
                  <option value="Unassigned">Unassigned</option>
                  {state.team.map((member) => (
                    <option value={member.name} key={member.id}>{member.name}</option>
                  ))}
                </select>
                <button type="button" className="btn outline sm" onClick={() => assignMe(selected)}>
                  <User /> Assign to me
                </button>
              </div>
            </div>

            <div className="drawer-section">
              <div className="label">Linked evidence</div>
              {selected.evidenceIds.length ? (
                <div className="stack-6">
                  {selected.evidenceIds.map((id) => {
                    const item = state.evidence.find((evidence) => evidence.id === id);
                    return (
                      <Link to="/app/hunter/evidence" className="link-row" key={id} style={{ textDecoration: "none" }}>
                        <span className="mono">{item?.name || id}</span>
                        <span className="v">{item?.size || "not in vault"} <ArrowRight size={10} /></span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="small dim">No evidence objects linked. The simulation or log source may still be available.</div>
              )}
            </div>

            <div className="drawer-section">
              <div className="label">Linked incident</div>
              {selected.incidentId ? (
                <Link to={`/app/hunter/incidents/${selected.incidentId}`} className="link-row" style={{ textDecoration: "none" }}>
                  <span>{selected.incidentId}</span>
                  <span className="v">Open case <ArrowRight size={10} /></span>
                </Link>
              ) : (
                <div className="small dim">No incident has been opened yet. Use “Open incident” to preserve the detection and start a case.</div>
              )}
            </div>

            <div className="drawer-section">
              <div className="label">Detection context</div>
              <div className="kv-list">
                <div className="kv-row"><span className="k">Source</span><span className="v" style={{ textTransform: "capitalize" }}>{selected.source}</span></div>
                <div className="kv-row"><span className="k">Simulation</span><span className="v">{selected.simulationId || "—"}</span></div>
                <div className="kv-row"><span className="k">Events observed</span><span className="v">{selected.events}</span></div>
                <div className="kv-row"><span className="k">Incident</span><span className="v">{selected.incidentId || "not opened"}</span></div>
              </div>
            </div>

            <div className="notice mt-12">
              <ShieldAlert />
              <div>
                HUNTER’s confidence reflects signal quality and corroboration. Review the source evidence before closing or
                escalating.
              </div>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
