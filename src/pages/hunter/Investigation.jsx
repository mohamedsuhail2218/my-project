import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Archive,
  ChevronRight,
  Clock,
  Database,
  FileSearch,
  Fingerprint,
  Globe,
  History,
  Network,
  Search,
  Server,
  ShieldAlert,
  Siren,
  Sparkles,
  Target,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  Progress,
  SeverityBadge,
  StatCard,
  StatusBadge,
} from "../../components/ui";
import { assetRisk, severityRank } from "../../lib/engine";
import { formatDateTime, timeAgo } from "../../lib/format";
import { extractPivots, recordMatches } from "../../lib/hunter";
import { api } from "../../lib/api";
import { ZONES } from "../../data/mock";

const includes = (record, term) =>
  Object.values(record)
    .map((value) => (Array.isArray(value) ? value.join(" ") : String(value ?? "")))
    .join(" ")
    .toLowerCase()
    .includes(term);

export default function Investigation() {
  const { state } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [input, setInput] = useState(query);
  const [history, setHistory] = useState(() => (query ? [query] : []));
  const [assistant, setAssistant] = useState(null);
  const [assistantError, setAssistantError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .assistantStatus()
      .then((result) => {
        if (active) setAssistant(result.assistant);
      })
      .catch((error) => {
        if (active) setAssistantError(error?.message || "Assistant status is unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setInput(query);
  }, [query]);

  const askAssistant = async (event) => {
    event.preventDefault();
    const text = question.trim();
    if (text.length < 3) {
      setAssistantError("Ask a question with at least three characters.");
      return;
    }
    setAsking(true);
    setAssistantError("");
    try {
      const result = await api.askHunter({
        question: text,
        incidentId: /^INC-\d+$/i.test(text) ? text.toUpperCase() : undefined,
      });
      setAnswer(result);
    } catch (error) {
      setAnswer(null);
      setAssistantError(error?.message || "The assistant could not answer this question.");
    } finally {
      setAsking(false);
    }
  };

  const canAsk = state.user?.roleKey !== "read_only";

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return { logs: [], detections: [], incidents: [], intel: [], evidence: [], assets: [] };
    }
    return {
      logs: state.logs
        .filter((log) => recordMatches(log, term, [log.raw, log.id]))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      detections: state.detections.filter((detection) =>
        includes(
          {
            id: detection.id,
            title: detection.title,
            technique: detection.technique,
            techniqueName: detection.techniqueName,
            assetId: detection.assetId,
            description: detection.description,
            assignee: detection.assignee,
            incidentId: detection.incidentId,
          },
          term
        )
      ),
      incidents: state.incidents.filter((incident) =>
        includes(
          {
            id: incident.id,
            title: incident.title,
            summary: incident.summary,
            tags: incident.tags,
            assignee: incident.assignee,
            status: incident.status,
            containment: incident.containment,
          },
          term
        )
      ),
      intel: state.intel.filter((ioc) =>
        includes(
          { id: ioc.id, type: ioc.type, value: ioc.value, source: ioc.source, tags: ioc.tags, verdict: ioc.verdict },
          term
        )
      ),
      evidence: state.evidence.filter((item) =>
        includes(
          {
            id: item.id,
            name: item.name,
            type: item.type,
            hash: item.hash,
            uploadedBy: item.uploadedBy,
            incidentId: item.incidentId,
          },
          term
        )
      ),
      assets: state.assets.filter((asset) =>
        includes(
          {
            id: asset.id,
            name: asset.name,
            label: asset.label,
            ip: asset.ip,
            owner: asset.owner,
            zone: asset.zone,
            services: asset.services,
            seeds: asset.seeds,
          },
          term
        )
      ),
    };
  }, [state, query]);

  const totals = {
    logs: results.logs.length,
    detections: results.detections.length,
    incidents: results.incidents.length,
    intel: results.intel.length,
    evidence: results.evidence.length,
    assets: results.assets.length,
  };
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const pivots = useMemo(
    () =>
      extractPivots(results.logs, 12).filter(
        (pivot) => pivot.toLowerCase() !== query.trim().toLowerCase()
      ),
    [results.logs, query]
  );

  const submitted = query.trim().length > 0;
  const hottestAsset = useMemo(
    () => [...state.assets].sort((a, b) => assetRisk(b) - assetRisk(a))[0],
    [state.assets]
  );
  const recentIncident = useMemo(
    () =>
      [...state.incidents].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0],
    [state.incidents]
  );
  const topIntel = state.intel.find((ioc) => ioc.verdict === "malicious") || state.intel[0];
  const recentDetection = useMemo(
    () =>
      [...state.detections].sort(
        (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
      )[0],
    [state.detections]
  );

  const runSearch = (value = input) => {
    const trimmed = String(value).trim();
    setInput(trimmed);
    if (!trimmed) {
      setSearchParams({});
      return;
    }
    setSearchParams({ q: trimmed });
    setHistory((prev) => [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 6));
  };

  const suggestions = [
    {
      icon: <ShieldAlert />,
      label: "Latest detection",
      value: recentDetection?.assetId || "",
      detail: recentDetection ? `${recentDetection.id} · ${recentDetection.title}` : "No detections",
      link: recentDetection ? `/app/hunter/detections?focus=${recentDetection.id}` : null,
    },
    {
      icon: <Globe />,
      label: "Malicious indicator",
      value: topIntel?.value || "",
      detail: topIntel ? `${topIntel.source} · ${topIntel.verdict}` : "No indicators",
      link: "/app/hunter/intel",
    },
    {
      icon: <Server />,
      label: "Most exposed asset",
      value: hottestAsset?.id || "",
      detail: hottestAsset ? `${hottestAsset.name} · risk ${assetRisk(hottestAsset)}` : "No assets",
      link: hottestAsset ? `/app/twin/builder?asset=${hottestAsset.id}` : null,
    },
    {
      icon: <Siren />,
      label: "Most recent case",
      value: recentIncident?.id || "",
      detail: recentIncident ? `${recentIncident.title} · ${recentIncident.status}` : "No incidents",
      link: recentIncident ? `/app/hunter/incidents/${recentIncident.id}` : null,
    },
  ].filter((item) => item.value);

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · HUNTER AI`}
        title="Start with one signal. End with the whole story."
        subtitle="Pivot across logs, detections, incidents, indicators, evidence and the twin from a single query. HUNTER keeps the entity links intact as you move."
        actions={
          <>
            <Link to="/app/hunter/logs" className="btn outline">
              <FileSearch /> Log explorer
            </Link>
            <Link to="/app/hunter/incidents" className="btn violet">
              <Siren /> Cases
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard
          label="Unified index"
          value={state.logs.length + state.detections.length + state.incidents.length + state.intel.length + state.evidence.length + state.assets.length}
          icon={<Database />}
          tone="info"
          foot={`${state.logs.length} events · ${state.detections.length} detections · ${state.evidence.length} evidence objects`}
        />
        <StatCard
          label="Active cases"
          value={state.incidents.filter((incident) => incident.status !== "closed").length}
          icon={<Siren />}
          tone="critical"
          foot={`${state.incidents.filter((incident) => incident.status === "open").length} awaiting first response`}
        />
        <StatCard
          label="Tracked indicators"
          value={state.intel.length}
          icon={<Globe />}
          tone="violet"
          foot={`${state.intel.filter((ioc) => ioc.verdict === "malicious").length} malicious · ${state.intel.filter((ioc) => ioc.verdict === "suspicious").length} suspicious`}
        />
        <StatCard
          label="Telemetry sources"
          value={new Set(state.logs.map((log) => log.source)).size}
          icon={<Network />}
          tone="success"
          foot={`${state.logs.filter((log) => log.status !== "allow").length} events need attention`}
        />
      </div>

      <Panel
        className="mt-12"
        title="Pivot search"
        icon={<Search size={15} />}
        action={<span className="small-meta">CASE-INSENSITIVE · ALL ENTITIES</span>}
      >
        <form
          className="investigate-search"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch();
          }}
        >
          <div className="input-icon">
            <Search />
            <input
              className="input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Try 185.220.101.42, INC-2040, ws-042, T1110 or a SHA-256 hash…"
              aria-label="Investigation query"
              autoFocus
            />
          </div>
          <button type="submit" className="btn violet">
            <Target /> Investigate
          </button>
        </form>
        <div className="pivot-list mt-12">
          {[
            "185.220.101.42",
            "INC-2040",
            "ws-042",
            "T1110",
            "cdn-sync-update.com",
            "svc_app",
          ].map((suggestion) => (
            <button type="button" className="pivot" key={suggestion} onClick={() => runSearch(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        className="mt-12"
        title="Ask HUNTER"
        icon={<Sparkles size={15} />}
        action={
          assistant?.configured ? (
            <Badge tone="success" dot>{assistant.model}</Badge>
          ) : assistant ? (
            <Badge tone="warning">not configured</Badge>
          ) : (
            <span className="small-meta">CHECKING STATUS</span>
          )
        }
      >
        {assistant?.configured ? (
          <form onSubmit={askAssistant}>
            <div className="row" style={{ gap: 8 }}>
              <div className="input-icon" style={{ flex: 1 }}>
                <Sparkles />
                <input
                  className="input"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask about an incident, host, indicator or anomaly score…"
                  aria-label="Ask HUNTER a question"
                  disabled={!canAsk || asking}
                />
              </div>
              <button type="submit" className="btn violet" disabled={!canAsk || asking || !question.trim()}>
                <ArrowRight /> {asking ? "Thinking…" : "Ask"}
              </button>
            </div>
            {!canAsk && (
              <div className="notice mt-12">
                <ShieldAlert />
                <div>The assistant requires the <span className="mono">hunter:write</span> permission. Read-only reviewers can inspect retrieved sources but cannot submit questions.</div>
              </div>
            )}
            <div className="small-meta mt-10">
              Answers come from the configured OpenAI-compatible endpoint ({assistant.endpointHost}). Retrieval is
              deterministic: only workspace incidents, detections, telemetry, intel and asset context are sent.
            </div>
          </form>
        ) : (
          <div className="notice">
            <Sparkles />
            <div>
              <strong>The natural-language assistant is not configured.</strong>{" "}
              {assistant?.note ||
                "Set HUNTER_LLM_BASE_URL and HUNTER_LLM_MODEL on the API server. No canned answers are returned when the endpoint is absent."}
            </div>
          </div>
        )}

        {assistantError && <div className="form-error mt-12">{assistantError}</div>}

        {answer && (
          <div className="mt-16">
            <div className="result-hero">
              <div style={{ minWidth: 0 }}>
                <div className="eyebrow violet">HUNTER assessment</div>
                <div className="small-meta mt-8">
                  {answer.model} · {answer.counts?.incidents || 0} incidents · {answer.counts?.telemetry || 0} telemetry
                  events retrieved
                </div>
              </div>
              <Badge tone="violet">{answer.sources?.length || 0} sources</Badge>
            </div>
            <p className="small soft mt-12" style={{ whiteSpace: "pre-wrap", lineHeight: 1.75 }}>
              {answer.answer}
            </p>
            {answer.sources?.length > 0 && (
              <div className="drawer-section">
                <div className="label">Cited evidence</div>
                <div className="finding-list" style={{ margin: "0 -4px" }}>
                  {answer.sources.map((source) => (
                    <Link
                      to={source.to || "/app/hunter/investigation"}
                      className="finding-item"
                      key={source.ref}
                      style={{ display: "flex", padding: "10px 4px" }}
                    >
                      <span className="tag violet" style={{ flexShrink: 0 }}>{source.ref}</span>
                      <div className="finding-body">
                        <div className="finding-title" style={{ fontSize: 12.5 }}>{source.title}</div>
                        <div className="finding-meta">
                          <span>{source.kind}</span>
                          <span>·</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 520 }}>
                            {source.detail}
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={12} style={{ marginTop: 8 }} />
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="small-meta mt-10">
              Generated {formatDateTime(answer.generatedAt)} · Review the cited sources before acting. The model cannot
              execute response playbooks.
            </div>
          </div>
        )}
      </Panel>

      {!submitted && (
        <div className="content-grid split-2-1">
          <Panel title="Start from a signal" icon={<Sparkles size={15} />} flush>
            <div className="finding-list">
              {suggestions.map((item) => (
                <button
                  type="button"
                  className="finding-item"
                  key={item.label}
                  onClick={() => runSearch(item.value)}
                  style={{ display: "flex", width: "100%", textAlign: "left" }}
                >
                  <span className="feature-icon" style={{ width: 32, height: 32, flexShrink: 0 }}>{item.icon}</span>
                  <div className="finding-body">
                    <div className="finding-title">{item.value}</div>
                    <div className="finding-meta">
                      <span>{item.label}</span>
                      <span>·</span>
                      <span>{item.detail}</span>
                    </div>
                  </div>
                  {item.link && <ChevronRight size={13} style={{ marginTop: 9 }} />}
                </button>
              ))}
            </div>
            <div className="panel-footer">
              <span className="small muted">Pick a starting entity or type your own query. Every result stays linked to its source.</span>
            </div>
          </Panel>

          <div className="stack">
            <Panel title="Search coverage" icon={<Database size={15} />}>
              <div className="stack-6">
                {[
                  ["Log events", state.logs.length, "cyan"],
                  ["Detections", state.detections.length, "violet"],
                  ["Incidents", state.incidents.length, "amber"],
                  ["Indicators", state.intel.length, "red"],
                  ["Evidence", state.evidence.length, "green"],
                  ["Twin assets", state.assets.length, "cyan"],
                ].map(([label, count, tone]) => (
                  <div className="source-row" key={label}>
                    <span>{label}</span>
                    <Progress
                      value={(count / Math.max(1, state.logs.length + state.detections.length)) * 100}
                      tone={tone}
                    />
                    <span className="v">{count}</span>
                  </div>
                ))}
              </div>
              <div className="notice mt-12">
                <FileSearch />
                <div>Queries run locally against the workspace index. Raw evidence is never modified.</div>
              </div>
            </Panel>

            <Panel title="Recent searches" icon={<History size={15} />} flush>
              {history.length ? (
                <div className="finding-list">
                  {history.map((item) => (
                    <button
                      type="button"
                      className="finding-item"
                      key={item}
                      onClick={() => runSearch(item)}
                      style={{ display: "flex", width: "100%", textAlign: "left" }}
                    >
                      <span className="activity-icon"><Clock /></span>
                      <div className="finding-body">
                        <div className="finding-title">{item}</div>
                        <div className="finding-meta"><span>Saved in this session</span></div>
                      </div>
                      <ArrowRight size={12} style={{ marginTop: 10 }} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-inline">Your last six queries appear here.</div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {submitted && (
        <>
          <div className="result-hero mt-12">
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow violet">Investigation context</div>
              <div className="result-value mt-8">{query}</div>
              <div className="small-meta mt-8">
                {total} matching entities · searched {new Date().toLocaleTimeString()}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div className="brief-number" style={{ color: total ? "var(--violet)" : "var(--faint)", fontSize: 30 }}>{total}</div>
              <div className="small-meta">MATCHING ENTITIES</div>
            </div>
          </div>

          <div className="result-meta-grid">
            {[
              ["Log events", totals.logs],
              ["Detections", totals.detections],
              ["Incidents", totals.incidents],
              ["Indicators", totals.intel],
              ["Evidence", totals.evidence],
              ["Twin assets", totals.assets],
            ].map(([label, count]) => (
              <div className="result-meta" key={label}>
                <div className="k">{label}</div>
                <div className="v">{count}</div>
              </div>
            ))}
          </div>

          {total === 0 && (
            <Panel className="mt-12">
              <EmptyState
                icon={<Search size={26} />}
                title={`No workspace entity matches “${query}”.`}
                detail="Check the spelling, try an indicator value, or search a hostname such as ws-042."
                action={
                  <div className="chip-row">
                    <button type="button" className="btn outline sm" onClick={() => runSearch("ws-042")}>Search ws-042</button>
                    <button type="button" className="btn outline sm" onClick={() => runSearch("185.220.101.42")}>Search top IOC</button>
                  </div>
                }
              />
            </Panel>
          )}

          {pivots.length > 0 && (
            <Panel
              className="mt-12"
              title="Pivot candidates"
              icon={<Fingerprint size={15} />}
              action={<span className="small-meta">EXTRACTED FROM MATCHING EVENTS</span>}
            >
              <div className="pivot-list">
                {pivots.map((pivot) => (
                  <button type="button" className="pivot" key={pivot} onClick={() => runSearch(pivot)}>
                    {pivot}
                  </button>
                ))}
              </div>
              <div className="small muted mt-12">
                Hosts, users, addresses and domains observed alongside the original match. Click one to continue the hunt.
              </div>
            </Panel>
          )}

          {totals.logs > 0 && (
            <Panel
              className="mt-12"
              title="Log events"
              icon={<FileSearch size={15} />}
              action={<Link to={`/app/hunter/logs?q=${encodeURIComponent(query)}`} className="btn ghost sm">Open in explorer <ChevronRight size={12} /></Link>}
              flush
            >
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Source</th>
                      <th>Host</th>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.logs.slice(0, 8).map((log) => (
                      <tr key={log.id}>
                        <td className="small-meta" style={{ whiteSpace: "nowrap" }}>{formatDateTime(log.timestamp)}</td>
                        <td><Badge tone="neutral">{log.source}</Badge></td>
                        <td className="mono" style={{ fontSize: 12 }}>{log.host}</td>
                        <td className="small">{log.event}</td>
                        <td><Badge tone={log.status === "alert" ? "high" : log.status === "deny" ? "medium" : "success"}>{log.status}</Badge></td>
                        <td className="small muted" style={{ maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.message}>{log.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel-footer">
                <div className="row between">
                  <span className="small muted">{totals.logs} matching event(s) · showing first 8</span>
                  <Link to={`/app/hunter/logs?q=${encodeURIComponent(query)}`} className="link small">See all events <ArrowRight size={12} /></Link>
                </div>
              </div>
            </Panel>
          )}

          <div className="content-grid cols-2">
            {totals.detections > 0 && (
              <Panel title="Detections" icon={<ShieldAlert size={15} />} flush>
                <div className="table-wrap">
                  <table className="table compact">
                    <thead><tr><th>Detection</th><th>Severity</th><th>Asset</th><th /></tr></thead>
                    <tbody>
                      {results.detections.slice(0, 5).map((detection) => (
                        <tr key={detection.id}>
                          <td>
                            <div className="strong" style={{ fontSize: 12.5 }}>{detection.title}</div>
                            <div className="small-meta mt-6">{detection.id} · {detection.technique}</div>
                          </td>
                          <td><SeverityBadge severity={detection.severity} /></td>
                          <td className="mono" style={{ fontSize: 12 }}>{detection.assetId}</td>
                          <td><Link to={`/app/hunter/detections?focus=${detection.id}`} className="btn ghost sm">Open</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel-footer"><span className="small-meta">{totals.detections} MATCHING DETECTIONS</span></div>
              </Panel>
            )}

            {totals.incidents > 0 && (
              <Panel title="Incidents" icon={<Siren size={15} />} flush>
                <div className="finding-list">
                  {results.incidents.slice(0, 5).map((incident) => (
                    <Link to={`/app/hunter/incidents/${incident.id}`} className="finding-item" key={incident.id} style={{ display: "flex" }}>
                      <span className={`finding-sev-bar ${incident.severity}`} />
                      <div className="finding-body">
                        <div className="finding-title">{incident.title}</div>
                        <div className="finding-meta">
                          <span>{incident.id}</span>
                          <span>·</span>
                          <span>{incident.status}</span>
                          <span>·</span>
                          <span>{timeAgo(incident.updatedAt)}</span>
                        </div>
                      </div>
                      <ChevronRight size={13} style={{ marginTop: 10 }} />
                    </Link>
                  ))}
                </div>
                <div className="panel-footer"><span className="small-meta">{totals.incidents} MATCHING CASES</span></div>
              </Panel>
            )}

            {totals.intel > 0 && (
              <Panel title="Indicators" icon={<Globe size={15} />} flush>
                <div className="table-wrap">
                  <table className="table compact">
                    <thead><tr><th>Indicator</th><th>Verdict</th><th>Confidence</th></tr></thead>
                    <tbody>
                      {results.intel.slice(0, 5).map((ioc) => (
                        <tr key={ioc.id}>
                          <td className="mono" style={{ fontSize: 12, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ioc.value}</td>
                          <td><Badge tone={ioc.verdict === "malicious" ? "critical" : ioc.verdict === "suspicious" ? "high" : "success"}>{ioc.verdict}</Badge></td>
                          <td className="mono">{ioc.confidence}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel-footer">
                  <Link to={`/app/hunter/intel?q=${encodeURIComponent(query)}`} className="link small">Open intelligence feed <ArrowRight size={12} /></Link>
                </div>
              </Panel>
            )}

            {totals.evidence > 0 && (
              <Panel title="Evidence" icon={<Archive size={15} />} flush>
                <div className="finding-list">
                  {results.evidence.slice(0, 5).map((item) => (
                    <Link to={`/app/hunter/evidence?focus=${item.id}`} className="finding-item" key={item.id} style={{ display: "flex" }}>
                      <span className="feature-icon" style={{ width: 30, height: 30, flexShrink: 0 }}><Archive /></span>
                      <div className="finding-body">
                        <div className="finding-title" style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>{item.name}</div>
                        <div className="finding-meta">
                          <span>{item.id}</span>
                          <span>·</span>
                          <span>{item.type}</span>
                          <span>·</span>
                          <span>{item.size}</span>
                        </div>
                      </div>
                      <ChevronRight size={13} style={{ marginTop: 10 }} />
                    </Link>
                  ))}
                </div>
                <div className="panel-footer"><span className="small-meta">{totals.evidence} MATCHING OBJECTS</span></div>
              </Panel>
            )}
          </div>

          {totals.assets > 0 && (
            <Panel className="mt-12" title="Twin assets" icon={<Server size={15} />} flush>
              <div className="table-wrap">
                <table className="table compact">
                  <thead><tr><th>Asset</th><th>Zone</th><th>Address</th><th>Owner</th><th>Risk</th><th /></tr></thead>
                  <tbody>
                    {results.assets.map((asset) => (
                      <tr key={asset.id}>
                        <td>
                          <div className="strong" style={{ fontSize: 13 }}>{asset.name}</div>
                          <div className="small-meta mt-6">{asset.id} · {asset.label}</div>
                        </td>
                        <td className="small">{ZONES[asset.zone]?.label || asset.zone}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{asset.ip}</td>
                        <td className="small">{asset.owner}</td>
                        <td><Badge tone={assetRisk(asset) >= 70 ? "critical" : assetRisk(asset) >= 50 ? "high" : "success"}>{assetRisk(asset)}</Badge></td>
                        <td><Link to={`/app/twin/builder?asset=${asset.id}`} className="btn ghost sm">Inspect</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
