import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  Archive,
  ArrowRight,
  ChevronRight,
  Clock,
  Filter,
  Fingerprint,
  Play,
  Radio,
  ScrollText,
  Search,
  ShieldAlert,
  Siren,
  Sparkles,
  X,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  Drawer,
  EmptyState,
  MetaGrid,
  PageHeader,
  Panel,
  Progress,
  StatCard,
} from "../../components/ui";
import { severityRank } from "../../lib/engine";
import { formatDateTime, timeAgo, truncate } from "../../lib/format";
import { dayKey, dayLabel, withinHours } from "../../lib/hunter";

const TYPE_META = {
  detection: { label: "Detection", short: "DET", icon: ShieldAlert, tone: "high" },
  incident: { label: "Incident", short: "CASE", icon: Siren, tone: "critical" },
  evidence: { label: "Evidence", short: "EV", icon: Archive, tone: "violet" },
  simulation: { label: "Simulation", short: "SIM", icon: Play, tone: "success" },
  telemetry: { label: "Telemetry", short: "LOG", icon: ScrollText, tone: "info" },
  workspace: { label: "Workspace", short: "ACT", icon: Sparkles, tone: "neutral" },
};

const TYPES = ["all", "detection", "incident", "evidence", "simulation", "telemetry", "workspace"];
const SEVERITIES = ["all", "critical", "high", "medium", "low", "info"];
const RANGES = [
  { value: "24", label: "24h" },
  { value: "168", label: "7d" },
  { value: "720", label: "30d" },
  { value: "0", label: "All" },
];

const toneForSeverity = (severity) =>
  severity === "critical" ? "critical" : severity === "high" ? "high" : severity === "medium" ? "medium" : "info";

export default function EventTimeline() {
  const { state } = useApp();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [type, setType] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [range, setRange] = useState("168");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const param = searchParams.get("q");
    if (param !== null) setQuery(param);
  }, [searchParams]);

  const events = useMemo(() => {
    const list = [];

    state.detections.forEach((detection) => {
      list.push({
        id: `det-${detection.id}`,
        kind: "detection",
        at: detection.firstSeen,
        title: `Detection · ${detection.title}`,
        detail: detection.description,
        tone: detection.severity,
        severity: detection.severity,
        source: detection.source,
        meta: [detection.id, detection.technique, detection.assetId],
        link: `/app/hunter/detections?focus=${detection.id}`,
      });
    });

    state.incidents.forEach((incident) => {
      list.push({
        id: `inc-${incident.id}`,
        kind: "incident",
        at: incident.createdAt,
        title: `${incident.id} opened · ${incident.title}`,
        detail: incident.summary,
        tone: incident.severity,
        severity: incident.severity,
        source: "case management",
        meta: [incident.assignee, incident.status, `${incident.detectionIds.length} detection(s)`],
        link: `/app/hunter/incidents/${incident.id}`,
      });
    });

    state.evidence.forEach((item) => {
      list.push({
        id: `ev-${item.id}`,
        kind: "evidence",
        at: item.uploadedAt,
        title: `Evidence sealed · ${item.name}`,
        detail: `${item.type} · ${item.size} · ${item.hash}`,
        tone: "violet",
        severity: "info",
        source: "evidence vault",
        meta: [item.id, item.uploadedBy, item.incidentId || "unlinked"],
        link: `/app/hunter/evidence?focus=${item.id}`,
      });
    });

    state.runs.forEach((run) => {
      const scenario = state.scenarios.find((item) => item.id === run.scenarioId);
      const tone =
        run.status === "running"
          ? "info"
          : run.status === "cancelled"
          ? "medium"
          : run.attackerSuccess
          ? "critical"
          : "success";
      list.push({
        id: `run-${run.id}`,
        kind: "simulation",
        at: run.completedAt || run.startedAt,
        title: `${run.id} ${run.status === "completed" ? (run.attackerSuccess ? "reached target" : "was blocked") : run.status} · ${scenario?.name || run.scenarioId}`,
        detail: (run.findings || []).slice(0, 2).join(" "),
        tone,
        severity: tone === "critical" ? "critical" : tone === "success" ? "low" : "info",
        source: "digital twin",
        meta: [run.mode === "red-blue" ? "red vs blue" : "single run", run.initiatedBy, run.id],
        link: `/app/twin/attack-paths?scenario=${run.scenarioId}&run=${run.id}`,
      });
    });

    state.logs.forEach((log) => {
      list.push({
        id: `log-${log.id}`,
        kind: "telemetry",
        at: log.timestamp,
        title: `${log.event} · ${log.host}`,
        detail: log.message,
        tone: log.status === "alert" ? "high" : log.status === "deny" ? "medium" : "info",
        severity: log.status === "alert" ? "high" : log.status === "deny" ? "medium" : "info",
        source: log.source,
        meta: [log.source, log.user, log.ip],
        link: `/app/hunter/logs?focus=${log.id}`,
        raw: log.raw,
      });
    });

    state.activity.forEach((item) => {
      list.push({
        id: `act-${item.id}`,
        kind: "workspace",
        at: item.at,
        title: item.text,
        detail: `${item.actor} · ${item.type}`,
        tone: item.tone || "info",
        severity: "info",
        source: "workspace",
        meta: [item.type, item.actor],
        link: null,
      });
    });

    return list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [state]);

  const scoped = useMemo(() => {
    const term = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesQuery = !term || `${event.title} ${event.detail || ""} ${event.meta.join(" ")}`.toLowerCase().includes(term);
      return (
        matchesQuery &&
        (severity === "all" || event.severity === severity) &&
        withinHours(event.at, Number(range) || 0)
      );
    });
  }, [events, query, severity, range]);

  const filtered = useMemo(
    () => scoped.filter((event) => type === "all" || event.kind === type),
    [scoped, type]
  );

  const grouped = useMemo(() => {
    const groups = new Map();
    filtered.forEach((event) => {
      const key = dayKey(event.at);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(event);
    });
    return [...groups.entries()].map(([key, items]) => ({
      key,
      label: dayLabel(items[0].at),
      items,
    }));
  }, [filtered]);

  const selected = events.find((event) => event.id === selectedId) || null;
  const typeCounts = useMemo(
    () =>
      TYPES.filter((item) => item !== "all").reduce((counts, item) => {
        counts[item] = scoped.filter((event) => event.kind === item).length;
        return counts;
      }, {}),
    [scoped]
  );
  const highSignal = filtered.filter((event) => ["critical", "high"].includes(event.severity)).length;
  const caseEvents = filtered.filter((event) => ["detection", "incident"].includes(event.kind)).length;
  const sourceCount = new Set(filtered.map((event) => event.source)).size;
  const keyMoments = [...scoped]
    .filter((event) => ["critical", "high"].includes(event.severity))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5);

  const severityCounts = SEVERITIES.filter((item) => item !== "all").map((item) => ({
    severity: item,
    count: scoped.filter((event) => event.severity === item).length,
  }));

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · HUNTER AI`}
        title="One chronology for everything that happened."
        subtitle="Detections, cases, evidence, simulations, telemetry and human actions merged into a single command timeline. Filter it, read the chain and jump straight to the source."
        actions={
          <>
            <Link to="/app/hunter/incidents" className="btn outline">
              <Siren /> Cases
            </Link>
            <Link to="/app/twin/history" className="btn ghost">
              <Play /> Simulation history
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Events in view" value={filtered.length} icon={<Activity />} tone="info" foot={`${events.length} total across all sources`} />
        <StatCard label="High signal" value={highSignal} icon={<ShieldAlert />} tone="critical" foot="Critical and high severity events in the current window" />
        <StatCard label="Case activity" value={caseEvents} icon={<Siren />} tone="high" foot={`${state.incidents.filter((incident) => incident.status !== "closed").length} active cases contributing`} />
        <StatCard label="Distinct sources" value={sourceCount} icon={<Radio />} tone="violet" foot={`Range · ${RANGES.find((item) => item.value === range)?.label || "custom"}`} />
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Unified event stream"
          icon={<Clock size={15} />}
          action={<span className="small-meta">{filtered.length} EVENTS · NEWEST FIRST</span>}
          flush
        >
          <div className="filters-bar">
            <div className="input-icon search" style={{ maxWidth: 250 }}>
              <Search />
              <input
                className="input"
                placeholder="Search the chronology…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <select className="select" style={{ width: 135 }} value={type} onChange={(event) => setType(event.target.value)}>
              {TYPES.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "All event types" : TYPE_META[item].label}
                </option>
              ))}
            </select>
            <select className="select" style={{ width: 120 }} value={severity} onChange={(event) => setSeverity(event.target.value)}>
              {SEVERITIES.map((item) => (
                <option key={item} value={item}>{item === "all" ? "All severity" : item}</option>
              ))}
            </select>
            <div className="chip-row">
              {RANGES.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={`chip${range === item.value ? " active" : ""}`}
                  onClick={() => setRange(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: "14px 18px 18px" }}>
            {grouped.length ? (
              grouped.map((group) => (
                <div key={group.key}>
                  <div className="timeline-day">{group.label}</div>
                  <div className="timeline">
                    {group.items.map((event) => {
                      const meta = TYPE_META[event.kind];
                      return (
                        <button
                          type="button"
                          className="timeline-event"
                          key={event.id}
                          onClick={() => setSelectedId(event.id)}
                        >
                          <span className={`timeline-dot ${event.tone}`} />
                          <div className="timeline-event-body">
                            <div className="timeline-event-title">{event.title}</div>
                            <div className="timeline-event-meta">
                              {event.meta.filter(Boolean).map((item, index) => (
                                <React.Fragment key={`${event.id}-meta-${index}`}>
                                  {index > 0 && <span>·</span>}
                                  <span>{item}</span>
                                </React.Fragment>
                              ))}
                              <span>·</span>
                              <span>{timeAgo(event.at)}</span>
                            </div>
                            {event.detail && (
                              <div className="timeline-event-detail">{truncate(event.detail, 190)}</div>
                            )}
                          </div>
                          <Badge tone={meta.tone}>{meta.short}</Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                icon={<Filter size={24} />}
                title="No events in this window."
                detail="Widen the time range or clear the type and severity filters."
                action={
                  <button
                    type="button"
                    className="btn outline sm"
                    onClick={() => { setType("all"); setSeverity("all"); setRange("720"); setQuery(""); }}
                  >
                    Reset timeline
                  </button>
                }
              />
            )}
          </div>
          <div className="panel-footer">
            <div className="row between">
              <span className="small muted">Every event links back to its evidence object or source record.</span>
              <span className="small-meta">HUNTER-CORE v4.1</span>
            </div>
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Signal mix" icon={<Fingerprint size={15} />}>
            <div className="stack-6">
              {TYPES.filter((item) => item !== "all").map((item) => (
                <div className="source-row" key={item}>
                  <span>{TYPE_META[item].label}</span>
                  <Progress
                    value={(typeCounts[item] / Math.max(1, scoped.length)) * 100}
                    tone={
                      item === "incident" ? "red" : item === "detection" ? "amber" : item === "evidence" ? "violet" : "cyan"
                    }
                  />
                  <span className="v">{typeCounts[item]}</span>
                </div>
              ))}
            </div>
            <div className="mini-stat-row mt-16" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="mini-stat"><div className="k">Window</div><div className="v" style={{ fontSize: 12 }}>{RANGES.find((item) => item.value === range)?.label}</div></div>
              <div className="mini-stat"><div className="k">In view</div><div className="v">{filtered.length}</div></div>
            </div>
          </Panel>

          <Panel title="Severity mix" icon={<Activity size={15} />}>
            <div className="stack-6">
              {severityCounts.map((item) => (
                <div className="source-row" key={item.severity}>
                  <span style={{ textTransform: "capitalize" }}>{item.severity}</span>
                  <Progress
                    value={(item.count / Math.max(1, scoped.length)) * 100}
                    tone={item.severity === "critical" ? "red" : item.severity === "high" ? "amber" : item.severity === "medium" ? "cyan" : "green"}
                  />
                  <span className="v">{item.count}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Key moments"
            icon={<ShieldAlert size={15} />}
            flush
            action={<span className="small-meta">CRITICAL + HIGH</span>}
          >
            <div className="finding-list">
              {keyMoments.map((event) => (
                <button
                  type="button"
                  className="finding-item"
                  key={event.id}
                  onClick={() => setSelectedId(event.id)}
                  style={{ display: "flex", width: "100%", textAlign: "left" }}
                >
                  <span className={`finding-sev-bar ${event.severity}`} />
                  <div className="finding-body">
                    <div className="finding-title">{truncate(event.title, 72)}</div>
                    <div className="finding-meta">
                      <span>{TYPE_META[event.kind].label}</span>
                      <span>·</span>
                      <span>{timeAgo(event.at)}</span>
                    </div>
                  </div>
                  <ChevronRight size={12} style={{ marginTop: 10 }} />
                </button>
              ))}
              {keyMoments.length === 0 && <div className="empty-inline">No high-signal events in this window.</div>}
            </div>
          </Panel>

          <Panel title="How this view is built" icon={<Sparkles size={15} />}>
            <p className="small muted" style={{ lineHeight: 1.65 }}>
              HUNTER merges immutable source records, not copies. Opening an event takes you to the original log, detection,
              case or evidence object.
            </p>
            <div className="notice mt-12">
              <Clock />
              <div>Times are shown in your local timezone. All source clocks were normalised at ingest.</div>
            </div>
          </Panel>
        </div>
      </div>

      <Drawer
        open={Boolean(selected)}
        title={selected ? TYPE_META[selected.kind].label : "Event"}
        subtitle={selected ? `${formatDateTime(selected.at)} · ${timeAgo(selected.at)}` : ""}
        onClose={() => setSelectedId(null)}
        footer={
          selected && (
            <>
              <button type="button" className="btn outline" onClick={() => setSelectedId(null)}>
                <X /> Close
              </button>
              {selected.link && (
                <Link to={selected.link} className="btn violet">
                  Open source record <ArrowRight />
                </Link>
              )}
            </>
          )
        }
      >
        {selected && (
          <>
            <div className="row wrap mb-12" style={{ gap: 6 }}>
              <Badge tone={TYPE_META[selected.kind].tone}>{TYPE_META[selected.kind].label}</Badge>
              <Badge tone={toneForSeverity(selected.severity)}>{selected.severity}</Badge>
              <span className="small-meta">{formatDateTime(selected.at)}</span>
            </div>
            <h3 style={{ fontSize: 16, lineHeight: 1.4 }}>{selected.title}</h3>
            {selected.detail && (
              <p className="small soft mt-12" style={{ lineHeight: 1.7 }}>{selected.detail}</p>
            )}

            <MetaGrid
              items={[
                { k: "Event source", v: selected.source },
                { k: "Event type", v: TYPE_META[selected.kind].label },
                { k: "Severity", v: selected.severity },
                { k: "Observed at", v: formatDateTime(selected.at) },
                { k: "Relative", v: timeAgo(selected.at) },
                { k: "Linked record", v: selected.link ? "available" : "workspace action" },
              ]}
            />

            <div className="drawer-section">
              <div className="label">Event context</div>
              <div className="kv-list">
                {selected.meta.filter(Boolean).map((item, index) => (
                  <div className="kv-row" key={`${selected.id}-ctx-${index}`}>
                    <span className="k">Field {index + 1}</span>
                    <span className="v">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {selected.raw && (
              <div className="drawer-section">
                <div className="label">Raw event</div>
                <pre className="log-raw">{selected.raw}</pre>
              </div>
            )}

            <div className="notice mt-12">
              <Fingerprint />
              <div>
                This event is part of the immutable audit chain. Filtering or opening it never changes the source record.
              </div>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
