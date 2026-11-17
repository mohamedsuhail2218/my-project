import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Clock,
  Copy,
  Download,
  FileUp,
  Filter,
  Pause,
  Radio,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  Drawer,
  EmptyState,
  MetaGrid,
  Modal,
  PageHeader,
  Panel,
  Progress,
  StatCard,
} from "../../components/ui";
import { SAMPLE_LOG_TEXT } from "../../data/mock";
import { downloadFile, formatDateTime, timeAgo, toCsv } from "../../lib/format";
import { parseLogText, recordMatches } from "../../lib/hunter";
import { api } from "../../lib/api";
import { useEventStream } from "../../lib/useEventStream";

const STATUSES = ["all", "alert", "deny", "allow"];

const statusTone = (status) =>
  status === "alert" ? "high" : status === "deny" ? "medium" : "success";

const anomalyTone = (severity) =>
  severity === "critical" ? "critical" : severity === "high" ? "high" : severity === "medium" ? "medium" : "success";

function toLogShape(event) {
  return {
    id: `LIVE-${event.id}`,
    serverId: event.id,
    timestamp: event.timestamp,
    source: event.source || "push",
    host: event.host || "unknown-host",
    event: event.event || "custom_event",
    action: event.action || "",
    status: event.status || "allow",
    ip: event.ip || "-",
    user: event.user || "-",
    message: event.message || "",
    raw: event.raw || JSON.stringify(event, null, 2),
    anomalyScore: event.anomalyScore,
    anomalySeverity: event.anomalySeverity,
    anomalyExplanation: event.anomalyExplanation,
    blocked: event.blocked,
    receivedAt: event.receivedAt,
    ingestedBy: event.ingestedBy,
    live: true,
  };
}

function mergeServerEvents(current, incoming) {
  const seen = new Set(current.map((event) => event.id));
  return [...incoming.filter((event) => !seen.has(event.id)), ...current].slice(0, 600);
}

export default function LogAnalysis() {
  const { state, dispatch } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const focus = searchParams.get("focus");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [host, setHost] = useState("all");
  const [visibleCount, setVisibleCount] = useState(40);
  const [selectedId, setSelectedId] = useState(focus);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestText, setIngestText] = useState(SAMPLE_LOG_TEXT);
  const [fallbackSource, setFallbackSource] = useState("vpn");
  const [liveTail, setLiveTail] = useState(searchParams.get("live") === "1");
  const [serverEvents, setServerEvents] = useState([]);
  const [serverMeta, setServerMeta] = useState({
    loaded: false,
    error: "",
    stats: null,
    model: null,
  });
  const [topAnomalies, setTopAnomalies] = useState([]);
  const [streamState, setStreamState] = useState("idle");
  const [ingesting, setIngesting] = useState(false);
  const [training, setTraining] = useState(false);

  const loadServer = useCallback(async () => {
    const failures = [];
    let telemetry = null;
    let stats = null;
    let anomalies = null;

    // Sequential reads avoid cold-starting several Vercel instances, each with
    // its own ephemeral SQLite database and session table.
    try {
      telemetry = await api.telemetry({ limit: 300 });
    } catch (error) {
      failures.push(error);
    }
    try {
      stats = await api.telemetryStats();
    } catch (error) {
      failures.push(error);
    }
    try {
      anomalies = await api.anomalies({ limit: 8 });
    } catch (error) {
      failures.push(error);
    }

    if (telemetry) setServerEvents(telemetry.events.map(toLogShape));
    if (telemetry || stats) {
      setServerMeta({
        loaded: true,
        error: "",
        stats: stats || telemetry?.stats || null,
        model: telemetry?.model || stats?.model || null,
      });
    } else if (failures.length) {
      const fatal = failures.find((error) => error?.status !== 401) || failures[0];
      setServerMeta((current) => ({
        ...current,
        loaded: true,
        error: fatal?.message || "Server telemetry could not be loaded.",
      }));
    }
    if (anomalies) setTopAnomalies(anomalies.events || []);
  }, []);

  useEffect(() => {
    loadServer();
  }, [loadServer]);

  const liveTailEnabled = liveTail && serverMeta.loaded;
  useEventStream({
    path: liveTailEnabled ? "/telemetry/stream" : "",
    enabled: liveTailEnabled,
    onStateChange: setStreamState,
    onEvent: (message) => {
      if (message.event === "ready") {
        setStreamState("open");
        return;
      }
      if (message.event !== "telemetry") return;
      try {
        const payload = JSON.parse(message.data);
        const incoming = (payload.events || []).map(toLogShape);
        if (incoming.length) {
          setServerEvents((current) => mergeServerEvents(current, incoming));
        }
        setStreamState("open");
      } catch {
        // Ignore a malformed frame; the stream stays open.
      }
    },
  });

  useEffect(() => {
    if (focus && (serverEvents.some((log) => log.id === focus) || state.logs.some((log) => log.id === focus))) {
      setSelectedId(focus);
    }
  }, [focus, serverEvents, state.logs]);

  useEffect(() => {
    const param = searchParams.get("q");
    if (param !== null) setQuery(param);
  }, [searchParams]);

  useEffect(() => {
    setVisibleCount(40);
  }, [query, source, status, host]);

  const usingServer = serverEvents.length > 0;
  const activeLogs = usingServer ? serverEvents : state.logs;
  const model = serverMeta.model;
  const modelTrained = model?.status === "trained";

  const sources = useMemo(
    () => ["all", ...[...new Set(activeLogs.map((log) => log.source))].sort()],
    [activeLogs]
  );
  const hosts = useMemo(
    () => ["all", ...[...new Set(activeLogs.map((log) => log.host))].sort()],
    [activeLogs]
  );

  const filtered = useMemo(
    () =>
      [...activeLogs]
        .filter(
          (log) =>
            (source === "all" || log.source === source) &&
            (status === "all" || log.status === status) &&
            (host === "all" || log.host === host) &&
            recordMatches(log, query, [log.raw, log.id])
        )
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [activeLogs, source, status, host, query]
  );
  const visible = filtered.slice(0, visibleCount);
  const selected = activeLogs.find((log) => log.id === selectedId) || null;

  const sourceCounts = useMemo(
    () =>
      sources
        .filter((item) => item !== "all")
        .map((item) => ({
          source: item,
          count: activeLogs.filter((log) => log.source === item).length,
          alerts: activeLogs.filter((log) => log.source === item && log.status !== "allow").length,
        }))
        .sort((a, b) => b.count - a.count),
    [sources, activeLogs]
  );

  const alerts = filtered.filter((log) => log.status === "alert").length;
  const denied = filtered.filter((log) => log.status === "deny").length;
  const scored = activeLogs.filter((log) => typeof log.anomalyScore === "number").length;

  const openLog = (log) => {
    setSelectedId(log.id);
    const next = new URLSearchParams(searchParams);
    next.set("focus", log.id);
    setSearchParams(next, { replace: true });
  };

  const closeDrawer = () => {
    setSelectedId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  };

  const pushToast = (toast) => dispatch({ type: "PUSH_TOAST", toast });

  const copyRaw = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast({ title: "Copied to clipboard", message: "Raw event preserved exactly as ingested.", tone: "success" });
    } catch {
      pushToast({ title: "Clipboard unavailable", message: "Select the raw event text and copy it manually.", tone: "warning" });
    }
  };

  const exportCsv = () => {
    const csv = toCsv(filtered, [
      { label: "Event", value: (log) => log.id },
      { label: "Timestamp", value: (log) => log.timestamp },
      { label: "Source", value: (log) => log.source },
      { label: "Host", value: (log) => log.host },
      { label: "Event type", value: (log) => log.event },
      { label: "Action", value: (log) => log.action },
      { label: "User", value: (log) => log.user },
      { label: "Source IP", value: (log) => log.ip },
      { label: "Status", value: (log) => log.status },
      { label: "Anomaly score", value: (log) => log.anomalyScore ?? "" },
      { label: "Anomaly severity", value: (log) => log.anomalySeverity ?? "" },
      { label: "Message", value: (log) => log.message },
    ]);
    downloadFile(`hunter_logs_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
    pushToast({ title: "Log view exported", message: `${filtered.length} normalised events written to CSV.`, tone: "success" });
  };

  const ingest = async () => {
    const parsedLogs = parseLogText(ingestText, fallbackSource);
    if (!parsedLogs.length) {
      pushToast({ title: "Nothing to ingest", message: "Paste at least one event or load the sample.", tone: "warning" });
      return;
    }

    const events = parsedLogs.map((log) => ({
      timestamp: log.timestamp,
      source: log.source,
      host: log.host,
      event: log.event,
      action: log.action,
      status: ["allow", "deny", "alert"].includes(log.status) ? log.status : "allow",
      ip: log.ip === "-" ? "" : log.ip,
      user: log.user === "-" ? "" : log.user,
      message: log.message,
      raw: log.raw,
    }));

    setIngesting(true);
    try {
      const result = await api.ingestTelemetry({ source: fallbackSource, events });
      const incoming = result.events.map(toLogShape);
      setServerEvents((current) => mergeServerEvents(current, incoming));
      setServerMeta((current) => ({ ...current, model: result.model || current.model }));
      setIngestOpen(false);
      pushToast({
        title: `${result.accepted} event${result.accepted === 1 ? "" : "s"} ingested server-side`,
        message: result.blocked
          ? `${result.blocked} event(s) matched an active response block.`
          : result.model?.status === "trained"
            ? `Scored by the isolation forest (${result.model.samples} training events).`
            : `Stored in SQLite. The model trains once ${result.model?.minSamples || 12} events are available.`,
        tone: result.blocked ? "warning" : "success",
      });
      loadServer();
    } catch (error) {
      pushToast({
        title: "Ingestion rejected",
        message:
          error?.status === 403
            ? "Your role cannot write telemetry. Ask a Super Admin for an ingestion token or analyst access."
            : error?.message || "The API did not accept this batch.",
        tone: "danger",
      });
    } finally {
      setIngesting(false);
    }
  };

  const trainModel = async () => {
    setTraining(true);
    try {
      const result = await api.trainModel();
      setServerMeta((current) => ({ ...current, model: result.model }));
      setTopAnomalies([]);
      pushToast({
        title: "Anomaly model trained",
        message: `${result.model.samples} events · ${result.model.trees} trees · threshold ${result.model.threshold}.`,
        tone: "success",
      });
      loadServer();
    } catch (error) {
      pushToast({
        title: "Training needs more data",
        message: error?.message || "The model could not be trained.",
        tone: "warning",
      });
    } finally {
      setTraining(false);
    }
  };

  const createDetection = (log) => {
    if (!log?.anomalyScore) return;
    dispatch({
      type: "ADD_DETECTION",
      detection: {
        title: `${log.event} on ${log.host}`,
        severity: log.anomalySeverity || "medium",
        confidence: Math.min(1, Number(log.anomalyScore) || 0.5),
        source: "ml",
        technique: "ML-ANOMALY",
        techniqueName: "Isolation forest outlier",
        assetId: log.host,
        firstSeen: log.timestamp,
        lastSeen: log.timestamp,
        events: 1,
        description: `Server-side isolation forest scored this event ${Number(log.anomalyScore).toFixed(
          3
        )} (${log.anomalySeverity}). ${log.anomalyExplanation?.summary || "The combined feature shape deviated from the learned baseline."}`,
        evidenceIds: [],
        incidentId: null,
      },
    });
  };

  const streamBadge = (() => {
    if (!liveTail) return null;
    if (streamState === "open") return <Badge tone="success" dot>live</Badge>;
    if (streamState === "error") return <Badge tone="critical">reconnecting</Badge>;
    return <Badge tone="warning" dot>connecting</Badge>;
  })();

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · HUNTER AI`}
        title="Read the raw events before you trust the verdict."
        subtitle="Search server-side telemetry, stream new events over Server-Sent Events and inspect the isolation-forest score attached to every arrival. Demo workspace events remain available when the live store is empty."
        actions={
          <>
            <button
              type="button"
              className={`btn ${liveTail ? "primary" : "outline"}`}
              onClick={() => setLiveTail((value) => !value)}
              aria-pressed={liveTail}
            >
              {liveTail ? <Pause /> : <Radio />} {liveTail ? "Pause live tail" : "Live tail"}
            </button>
            <button type="button" className="btn outline" onClick={exportCsv}>
              <Download /> Export view
            </button>
            <button type="button" className="btn violet" onClick={() => setIngestOpen(true)}>
              <Upload /> Ingest logs
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard
          label="Events retained"
          value={activeLogs.length}
          icon={<ScrollText />}
          tone="info"
          foot={
            usingServer
              ? `${serverMeta.stats?.total ?? activeLogs.length} in SQLite · ${serverMeta.stats?.last24h ?? 0} last 24h`
              : `${sources.length - 1} demo source${sources.length === 2 ? "" : "s"} · server store empty`
          }
        />
        <StatCard
          label="Alerts in view"
          value={alerts}
          icon={<AlertTriangle />}
          tone="high"
          foot={`${denied} denied events · ${filtered.length} events match the current query`}
        />
        <StatCard
          label="Anomaly model"
          value={modelTrained ? model.samples : 0}
          icon={<Brain />}
          tone="violet"
          foot={
            modelTrained
              ? `${model.algorithm} · ${model.trees} trees · ${scored} scored`
              : `Needs ${model?.minSamples || 12} events · ${model?.samples || 0} stored`
          }
        />
        <StatCard
          label="Query matches"
          value={filtered.length}
          icon={<Search />}
          tone="success"
          foot={query ? `Query: ${query}` : "No free-text filter applied"}
        />
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Log explorer"
          icon={<ScrollText size={15} />}
          action={
            <div className="row" style={{ gap: 8 }}>
              {streamBadge}
              {usingServer ? <Badge tone="info">server</Badge> : <Badge tone="neutral">demo corpus</Badge>}
              <span className="small-meta">{visible.length} OF {filtered.length} EVENTS</span>
            </div>
          }
          flush
        >
          <div className="filters-bar">
            <div className="input-icon search" style={{ maxWidth: 320 }}>
              <Search />
              <input
                className="input"
                placeholder="Search logs or use source:vpn status:deny"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search logs"
              />
            </div>
            <select className="select" style={{ width: 125 }} value={source} onChange={(event) => setSource(event.target.value)} aria-label="Filter by source">
              {sources.map((item) => (
                <option key={item} value={item}>{item === "all" ? "All sources" : item}</option>
              ))}
            </select>
            <select className="select" style={{ width: 118 }} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
              {STATUSES.map((item) => (
                <option key={item} value={item}>{item === "all" ? "All status" : item}</option>
              ))}
            </select>
            <select className="select" style={{ width: 132 }} value={host} onChange={(event) => setHost(event.target.value)} aria-label="Filter by host">
              {hosts.map((item) => (
                <option key={item} value={item}>{item === "all" ? "All hosts" : item}</option>
              ))}
            </select>
          </div>

          {serverMeta.error && (
            <div className="notice warning" style={{ margin: "12px 16px 0" }}>
              <AlertTriangle />
              <span>
                <strong>Server telemetry unavailable.</strong> {serverMeta.error} The demo workspace corpus is shown
                instead; nothing below is presented as live.
              </span>
            </div>
          )}

          {!serverMeta.error && usingServer && (
            <div className={`notice ${liveTail ? "success" : "info"}`} style={{ margin: "12px 16px 0" }}>
              <Radio />
              <span>
                <strong>{liveTail ? "Live server stream." : "Server-side telemetry."}</strong>{" "}
                {liveTail
                  ? `Events are delivered over SSE${streamState === "open" ? "" : ` (${streamState})`}. Each arrival is stored in SQLite and scored by the workspace model.`
                  : "Events were loaded from the API. Enable live tail to stream new arrivals over SSE."}
              </span>
            </div>
          )}

          {!serverMeta.error && serverMeta.loaded && !usingServer && (
            <div className="notice" style={{ margin: "12px 16px 0" }}>
              <Server />
              <span>
                <strong>The server telemetry store is empty.</strong> The seeded demo corpus is shown below. Ingest a
                batch or point a log shipper at <span className="mono">/api/telemetry/ingest</span> to replace it with
                real server-side events.
              </span>
            </div>
          )}

          <div className="table-wrap">
            <table className="table compact log-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Host</th>
                  <th>Event</th>
                  <th>User</th>
                  <th>Status</th>
                  {usingServer && <th>Anomaly</th>}
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((log) => (
                  <tr key={log.id} className="clickable" onClick={() => openLog(log)}>
                    <td className="small-meta" title={timeAgo(log.timestamp)} style={{ whiteSpace: "nowrap" }}>
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td><Badge tone="neutral">{log.source}</Badge></td>
                    <td style={{ color: "var(--text-soft)" }}>{log.host}</td>
                    <td style={{ color: "var(--muted)" }}>{log.event}</td>
                    <td className="small-meta">{log.user}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <Badge tone={statusTone(log.status)}>{log.status}</Badge>
                        {Array.isArray(log.blocked) && log.blocked.length > 0 && <Badge tone="critical">blocked</Badge>}
                      </div>
                    </td>
                    {usingServer && (
                      <td>
                        {typeof log.anomalyScore === "number" ? (
                          <Badge tone={anomalyTone(log.anomalySeverity)}>{log.anomalyScore.toFixed(2)}</Badge>
                        ) : (
                          <span className="small-meta">unscored</span>
                        )}
                      </td>
                    )}
                    <td className="msg" title={log.message}>{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <EmptyState
                icon={<Filter size={24} />}
                title="No events match this query."
                detail="Try a broader term or clear the source and status filters."
                action={
                  <button
                    type="button"
                    className="btn outline sm"
                    onClick={() => { setSource("all"); setStatus("all"); setHost("all"); setQuery(""); }}
                  >
                    Reset filters
                  </button>
                }
              />
            )}
          </div>

          <div className="panel-footer">
            <div className="row between">
              <span className="small muted">
                {query ? `Showing events matching “${query}”.` : "Click any event to inspect its raw fields, anomaly score and pivot."}
              </span>
              {filtered.length > visible.length ? (
                <button type="button" className="btn ghost sm" onClick={() => setVisibleCount((count) => count + 40)}>
                  Load more <ArrowRight size={12} />
                </button>
              ) : (
                <span className="small-meta">END OF RESULTS</span>
              )}
            </div>
          </div>
        </Panel>

        <div className="stack">
          <Panel
            title="Anomaly model"
            icon={<Brain size={15} />}
            action={
              <button
                type="button"
                className="btn ghost sm"
                onClick={trainModel}
                disabled={training || state.user?.roleKey === "read_only"}
                title={state.user?.roleKey === "read_only" ? "Read-only users cannot train the model." : "Train on stored telemetry"}
              >
                <RefreshCw /> {training ? "Training…" : "Train"}
              </button>
            }
          >
            <div className="kv-list">
              <div className="kv-row"><span className="k">Algorithm</span><span className="v">{model?.algorithm || "isolation-forest"}</span></div>
              <div className="kv-row"><span className="k">Status</span><span className="v">{modelTrained ? "trained" : model?.status || "untrained"}</span></div>
              <div className="kv-row"><span className="k">Training events</span><span className="v">{model?.samples ?? 0}</span></div>
              <div className="kv-row"><span className="k">Trees</span><span className="v">{model?.trees ?? 0}</span></div>
              <div className="kv-row"><span className="k">Threshold</span><span className="v">{model?.threshold ?? "—"}</span></div>
              <div className="kv-row"><span className="k">Scored events</span><span className="v">{serverMeta.stats?.scored ?? scored}</span></div>
            </div>
            {topAnomalies.length > 0 ? (
              <div className="finding-list mt-12" style={{ margin: "12px -16px 0" }}>
                {topAnomalies.slice(0, 5).map((event) => (
                  <button
                    type="button"
                    className="finding-item"
                    key={event.id}
                    onClick={() => setQuery(event.host)}
                    style={{ display: "flex", width: "100%", textAlign: "left" }}
                  >
                    <span className={`finding-sev-bar ${event.anomalySeverity || "medium"}`} />
                    <div className="finding-body">
                      <div className="finding-title" style={{ fontSize: 12.5 }}>
                        {event.event} on {event.host}
                      </div>
                      <div className="finding-meta">
                        <span>{Number(event.anomalyScore).toFixed(3)}</span>
                        <span>·</span>
                        <span>{event.anomalySeverity}</span>
                        <span>·</span>
                        <span>{timeAgo(event.timestamp)}</span>
                      </div>
                    </div>
                    <ArrowRight size={12} style={{ marginTop: 10 }} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="notice mt-12">
                <Brain />
                <div>
                  {modelTrained
                    ? "No scored events are stored yet. New arrivals are scored before they are returned."
                    : `The model trains lazily after ${model?.minSamples || 12} events. Training writes scores back to every stored event.`}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Ingest a source" icon={<FileUp size={15} />}>
            <button type="button" className="log-upload" onClick={() => setIngestOpen(true)} style={{ width: "100%" }}>
              <Upload />
              <strong>Paste events or drop a log sample</strong>
              <span>POST /api/telemetry/ingest · scores on arrival</span>
            </button>
            <div className="log-summary mt-12">
              <div className="log-stat"><div className="k">Server events</div><div className="v" style={{ fontSize: 13 }}>{serverMeta.stats?.total ?? 0}</div></div>
              <div className="log-stat"><div className="k">Blocked</div><div className="v" style={{ fontSize: 13 }}>{serverMeta.stats?.activeBlocks ?? 0}</div></div>
              <div className="log-stat"><div className="k">Sources</div><div className="v" style={{ fontSize: 13 }}>{serverMeta.stats?.sources?.length ?? 0}</div></div>
              <div className="log-stat"><div className="k">Retention</div><div className="v" style={{ fontSize: 13 }}>{serverMeta.stats?.retentionDays ?? 90}d</div></div>
            </div>
            <div className="notice mt-12">
              <ShieldAlert />
              <div>
                Ingestion requires <span className="mono">hunter:write</span> or a workspace-scoped bearer token.
                Events are stored in SQLite, scored by the isolation forest and matched against active blocks.
              </div>
            </div>
          </Panel>

          <Panel
            title="Source mix"
            icon={<Server size={15} />}
            action={<Badge tone={usingServer ? "info" : "neutral"}>{usingServer ? "server" : "demo"}</Badge>}
            flush
          >
            <div style={{ padding: 16 }} className="stack-6">
              {sourceCounts.map((item) => (
                <div className="source-row" key={item.source}>
                  <span className="mono">{item.source}</span>
                  <Progress
                    value={(item.count / Math.max(1, activeLogs.length)) * 100}
                    tone={item.alerts ? "amber" : "cyan"}
                  />
                  <span className="v">{item.count}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Query recipes" icon={<Search size={15} />}>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              Combine free text with <span className="mono">field:value</span> terms. HUNTER searches every normalised field,
              including the original raw line.
            </p>
            <div className="pivot-list mt-12">
              {[
                "source:vpn status:deny",
                "status:alert",
                "host:ws-042",
                "user:svc_app",
                "185.220.101.42",
                "event:process_create",
              ].map((recipe) => (
                <button type="button" className="pivot" key={recipe} onClick={() => setQuery(recipe)}>
                  {recipe}
                </button>
              ))}
            </div>
            <Link to={`/app/hunter/investigation${query ? `?q=${encodeURIComponent(query)}` : ""}`} className="btn outline block mt-12">
              <Search size={14} /> Pivot into investigation
            </Link>
          </Panel>
        </div>
      </div>

      <Drawer
        open={Boolean(selected)}
        title={selected?.event || "Log event"}
        subtitle={selected ? `${selected.id} · ${selected.host} · ${formatDateTime(selected.timestamp)}` : ""}
        onClose={closeDrawer}
        footer={
          selected && (
            <>
              <button type="button" className="btn outline" onClick={() => copyRaw(selected.raw || JSON.stringify(selected, null, 2))}>
                <Copy /> Copy raw
              </button>
              <button type="button" className="btn outline" onClick={() => setQuery(selected.host)}>
                <Filter /> Filter host
              </button>
              <Link
                to={`/app/hunter/investigation?q=${encodeURIComponent(selected.ip && selected.ip !== "-" ? selected.ip : selected.host)}`}
                className="btn violet"
              >
                <Search /> Investigate source
              </Link>
            </>
          )
        }
      >
        {selected && (
          <>
            <div className="row wrap mb-12" style={{ gap: 6 }}>
              <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
              <Badge tone="neutral">{selected.source}</Badge>
              <Badge tone="info">{selected.host}</Badge>
              {selected.live && <Badge tone="violet">server event</Badge>}
              <span className="small-meta">{timeAgo(selected.timestamp)}</span>
            </div>
            <p className="small soft" style={{ lineHeight: 1.65 }}>{selected.message}</p>

            <MetaGrid
              items={[
                { k: "Event", v: selected.id },
                { k: "Timestamp", v: formatDateTime(selected.timestamp) },
                { k: "Source", v: selected.source },
                { k: "Host", v: selected.host },
                { k: "User", v: selected.user },
                { k: "Source IP", v: selected.ip },
                { k: "Event type", v: selected.event },
                { k: "Action", v: selected.action },
                { k: "Verdict", v: selected.status },
              ]}
            />

            {selected.live && (
              <div className="drawer-section">
                <div className="label">Isolation-forest score</div>
                {typeof selected.anomalyScore === "number" ? (
                  <>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <Badge tone={anomalyTone(selected.anomalySeverity)}>{selected.anomalySeverity}</Badge>
                      <Badge tone="violet">score {selected.anomalyScore.toFixed(4)}</Badge>
                      {typeof model?.threshold === "number" && (
                        <span className="small-meta">THRESHOLD {model.threshold}</span>
                      )}
                    </div>
                    <p className="small soft mt-8" style={{ lineHeight: 1.6 }}>
                      {selected.anomalyExplanation?.summary ||
                        "The combined feature shape deviated from the learned baseline."}
                    </p>
                    {selected.anomalyExplanation?.top?.length > 0 && (
                      <div className="chip-list mt-10">
                        {selected.anomalyExplanation.top.map((item) => (
                          <span className="tag violet" key={`${item.feature}-${item.reason}`}>{item.reason}</span>
                        ))}
                      </div>
                    )}
                    {["high", "critical"].includes(selected.anomalySeverity) && (
                      <button type="button" className="btn outline sm mt-12" onClick={() => createDetection(selected)}>
                        <ShieldAlert /> Create detection from score
                      </button>
                    )}
                  </>
                ) : (
                  <div className="small dim">
                    This event has no model score. The workspace needs at least {model?.minSamples || 12} stored events
                    before the isolation forest trains its first baseline.
                  </div>
                )}
              </div>
            )}

            {Array.isArray(selected.blocked) && selected.blocked.length > 0 && (
              <div className="drawer-section">
                <div className="label">Response block match</div>
                <div className="chip-list">
                  {selected.blocked.map((block) => (
                    <span className="tag" key={`${block.kind}-${block.value}`}>
                      {block.kind} · {block.value}
                    </span>
                  ))}
                </div>
                <div className="small dim mt-8">
                  An approved response playbook is enforcing this block. The event was raised to alert before storage.
                </div>
              </div>
            )}

            <div className="drawer-section">
              <div className="label">Raw event</div>
              <pre className="log-raw">{selected.raw || JSON.stringify(selected, null, 2)}</pre>
            </div>

            <div className="drawer-section">
              <div className="label">How HUNTER parsed it</div>
              <div className="kv-list">
                <div className="kv-row"><span className="k">Normaliser</span><span className="v">hunter-normaliser-v3</span></div>
                <div className="kv-row"><span className="k">Source family</span><span className="v" style={{ textTransform: "capitalize" }}>{selected.source}</span></div>
                <div className="kv-row"><span className="k">Correlated host</span><span className="v">{selected.host}</span></div>
                <div className="kv-row"><span className="k">Received</span><span className="v">{selected.receivedAt ? formatDateTime(selected.receivedAt) : "demo corpus"}</span></div>
                <div className="kv-row"><span className="k">Ingested by</span><span className="v">{selected.ingestedBy || "demo workspace"}</span></div>
              </div>
            </div>

            <div className="notice mt-12">
              <Clock />
              <div>Raw events are immutable once ingested. Pivoting opens a new investigation context without altering the record.</div>
            </div>
          </>
        )}
      </Drawer>

      <Modal
        open={ingestOpen}
        title="Ingest telemetry"
        subtitle="Paste newline-delimited events. The API validates, stores and scores the batch."
        onClose={() => setIngestOpen(false)}
        wide
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setIngestOpen(false)}>
              <X /> Cancel
            </button>
            <button type="button" className="btn outline" onClick={() => setIngestText(SAMPLE_LOG_TEXT)}>
              Load sample
            </button>
            <button type="button" className="btn violet" onClick={ingest} disabled={ingesting}>
              <Upload /> {ingesting ? "Sending…" : "Parse & ingest"}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ingest-source">Default source</label>
            <select
              id="ingest-source"
              className="select"
              value={fallbackSource}
              onChange={(event) => setFallbackSource(event.target.value)}
            >
              {sources.filter((item) => item !== "all").map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
              {!["vpn", "firewall", "edr", "identity", "dns", "app"].includes(fallbackSource) && (
                <option value={fallbackSource}>{fallbackSource}</option>
              )}
            </select>
          </div>
          <div className="field">
            <label>Destination</label>
            <div className="input" style={{ display: "flex", alignItems: "center", color: "var(--muted)", fontSize: 13 }}>
              POST /api/telemetry/ingest · role-gated
            </div>
          </div>
          <div className="field span-2">
            <label htmlFor="ingest-text">Events</label>
            <textarea
              id="ingest-text"
              className="textarea"
              rows={12}
              value={ingestText}
              onChange={(event) => setIngestText(event.target.value)}
              spellCheck={false}
              style={{ fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.6 }}
            />
          </div>
        </div>
        <div className="notice mt-12">
          <ShieldAlert />
          <div>
            Events are written to the server-side SQLite store, scored by the isolation forest and matched against
            approved response blocks. Nothing is simulated or added to the browser-only demo corpus.
          </div>
        </div>
      </Modal>
    </div>
  );
}
