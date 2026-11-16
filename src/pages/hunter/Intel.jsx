import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  Copy,
  Download,
  Globe,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Tag,
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
import { downloadFile, formatDateTime, timeAgo, toCsv } from "../../lib/format";
import { api } from "../../lib/api";

const TYPES = ["all", "ip", "domain", "url", "sha256"];
const VERDICTS = ["all", "malicious", "suspicious", "benign"];

const verdictTone = (verdict) =>
  verdict === "malicious"
    ? "critical"
    : verdict === "suspicious"
      ? "high"
      : verdict === "benign"
        ? "success"
        : "neutral";

const emptyForm = () => ({
  type: "ip",
  value: "",
  verdict: "suspicious",
  confidence: 70,
  source: "Analyst submission",
  tags: "",
});

export default function Intel() {
  const { state, dispatch } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [type, setType] = useState("all");
  const [verdict, setVerdict] = useState("all");
  const [selectedId, setSelectedId] = useState(searchParams.get("focus"));
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState([]);
  const [providerError, setProviderError] = useState("");
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupValue, setLookupValue] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lastLookupAt, setLastLookupAt] = useState(null);
  const [proposing, setProposing] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .intelProviders()
      .then((result) => {
        if (active) setProviders(result.providers || []);
      })
      .catch((requestError) => {
        if (active) setProviderError(requestError?.message || "Provider status is unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const param = searchParams.get("q");
    if (param !== null) setQuery(param);
  }, [searchParams]);

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (focus && state.intel.some((ioc) => ioc.id === focus)) setSelectedId(focus);
  }, [searchParams, state.intel]);

  const filtered = useMemo(
    () =>
      state.intel.filter((ioc) => {
        const term = query.trim().toLowerCase();
        return (
          (!term ||
            `${ioc.id} ${ioc.value} ${ioc.type} ${ioc.source} ${(ioc.tags || []).join(" ")} ${ioc.verdict}`
              .toLowerCase()
              .includes(term)) &&
          (type === "all" || ioc.type === type) &&
          (verdict === "all" || ioc.verdict === verdict)
        );
      }),
    [state.intel, query, type, verdict]
  );

  const selected = state.intel.find((ioc) => ioc.id === selectedId) || null;
  const selectedMatches = useMemo(() => {
    if (!selected) return [];
    return state.logs
      .filter((log) => JSON.stringify(log).toLowerCase().includes(selected.value.toLowerCase()))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [selected, state.logs]);

  const malicious = state.intel.filter((ioc) => ioc.verdict === "malicious").length;
  const suspicious = state.intel.filter((ioc) => ioc.verdict === "suspicious").length;
  const sightings = state.intel.reduce((sum, ioc) => sum + ioc.sightings, 0);
  const feeds = useMemo(
    () =>
      [...new Set(state.intel.map((ioc) => ioc.source))]
        .map((source) => ({
          source,
          count: state.intel.filter((ioc) => ioc.source === source).length,
        }))
        .sort((a, b) => b.count - a.count),
    [state.intel]
  );

  const topTags = useMemo(() => {
    const counts = {};
    state.intel.forEach((ioc) => (ioc.tags || []).forEach((tag) => { counts[tag] = (counts[tag] || 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [state.intel]);

  const openDrawer = (ioc) => {
    setSelectedId(ioc.id);
    const next = new URLSearchParams(searchParams);
    next.set("focus", ioc.id);
    setSearchParams(next, { replace: true });
  };

  const closeDrawer = () => {
    setSelectedId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  };

  const copyValue = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      dispatch({ type: "PUSH_TOAST", toast: { title: "Indicator copied", message: value, tone: "success" } });
    } catch {
      dispatch({ type: "PUSH_TOAST", toast: { title: "Clipboard unavailable", message: "Copy the indicator manually.", tone: "warning" } });
    }
  };

  const addIndicator = () => {
    if (!form.value.trim()) {
      setError("Enter an indicator value.");
      return;
    }
    dispatch({
      type: "ADD_IOC",
      ioc: {
        type: form.type,
        value: form.value.trim(),
        verdict: form.verdict,
        confidence: Math.min(100, Math.max(1, Number(form.confidence) || 50)),
        source: form.source.trim() || "Analyst submission",
        tags: form.tags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      },
    });
    setModalOpen(false);
    setForm(emptyForm());
    setError("");
  };

  const runLookup = async (refresh = false) => {
    const indicator = lookupValue.trim();
    if (!indicator) {
      setLookupError("Enter an IPv4/IPv6 address, domain, URL or SHA-256 hash.");
      return;
    }
    setLookingUp(true);
    setLookupError("");
    try {
      const result = await api.intelLookup(indicator, { refresh });
      setLookupResult(result);
      setLastLookupAt(new Date().toISOString());
    } catch (requestError) {
      setLookupResult(null);
      setLookupError(requestError?.message || "The lookup failed.");
    } finally {
      setLookingUp(false);
    }
  };

  const addLiveIndicator = () => {
    if (!lookupResult) return;
    const usable = (lookupResult.providers || []).filter((provider) => provider.ok).map((provider) => provider.label);
    dispatch({
      type: "ADD_IOC",
      ioc: {
        type: lookupResult.type,
        value: lookupResult.indicator,
        verdict: lookupResult.verdict === "unknown" ? "suspicious" : lookupResult.verdict,
        confidence: Math.max(1, lookupResult.confidence || 50),
        source: `Live: ${usable.join(", ") || "RDAP"}`,
        tags: lookupResult.tags || [],
      },
    });
    setLookupOpen(false);
  };

  const proposeBlock = async () => {
    if (!selected) return;
    setProposing(true);
    try {
      const result = await api.proposeResponseAction({
        playbookId: "block-ip",
        target: selected.value,
        rationale: `Analyst proposed a block from indicator ${selected.id} (${selected.verdict}, ${selected.confidence}% confidence, source ${selected.source}).`,
      });
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: result.duplicate ? "Approval already pending" : "Block proposal queued",
          message: result.duplicate
            ? `${selected.value} already has a pending response action.`
            : `${selected.value} requires Super Admin approval before enforcement.`,
          tone: result.duplicate ? "warning" : "success",
        },
      });
    } catch (requestError) {
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Proposal rejected",
          message: requestError?.message || "The response proposal could not be created.",
          tone: "danger",
        },
      });
    } finally {
      setProposing(false);
    }
  };

  const exportCsv = () => {
    const csv = toCsv(filtered, [
      { label: "Indicator", value: (ioc) => ioc.id },
      { label: "Value", value: (ioc) => ioc.value },
      { label: "Type", value: (ioc) => ioc.type },
      { label: "Verdict", value: (ioc) => ioc.verdict },
      { label: "Confidence", value: (ioc) => ioc.confidence },
      { label: "Source", value: (ioc) => ioc.source },
      { label: "Tags", value: (ioc) => (ioc.tags || []).join("; ") },
      { label: "Sightings", value: (ioc) => ioc.sightings },
      { label: "Last seen", value: (ioc) => ioc.lastSeen },
    ]);
    downloadFile(`hunter_intel_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
    dispatch({ type: "PUSH_TOAST", toast: { title: "Indicators exported", message: `${filtered.length} IOC records written to CSV.`, tone: "success" } });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · HUNTER AI`}
        title="Indicators are cheap. Context is what makes them actionable."
        subtitle="Bring external intelligence into the workspace, see where each indicator has appeared in your telemetry and tie it to the case that needs it."
        actions={
          <>
            <button type="button" className="btn outline" onClick={() => { setLookupError(""); setLookupOpen(true); }}>
              <Radio /> Live lookup
            </button>
            <button type="button" className="btn violet" onClick={() => { setForm(emptyForm()); setError(""); setModalOpen(true); }}>
              <Plus /> Add indicator
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Tracked indicators" value={state.intel.length} icon={<Globe />} tone="info" foot={`${feeds.length} intelligence sources contributing`} />
        <StatCard label="Malicious verdicts" value={malicious} icon={<ShieldAlert />} tone="critical" foot={`${suspicious} more marked suspicious`} />
        <StatCard label="Observed sightings" value={sightings} icon={<Siren />} tone="high" foot="Internal matches across all retained telemetry" />
        <StatCard label="Live providers" value={`${providers.filter((provider) => provider.configured).length}/${providers.length || 3}`} icon={<Radio />} tone="violet" foot={providers.length ? providers.map((provider) => provider.configured ? `${provider.label} ready` : `${provider.label} needs a key`).join(" · ") : "RDAP keyless · AbuseIPDB and OTX optional"} />
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Indicator feed"
          icon={<Globe size={15} />}
          action={
            <div className="row" style={{ gap: 6 }}>
              <span className="small-meta">{filtered.length} OF {state.intel.length}</span>
              <button type="button" className="btn ghost sm" onClick={exportCsv}><Download size={12} /> Export</button>
            </div>
          }
          flush
        >
          <div className="filters-bar">
            <div className="input-icon search" style={{ maxWidth: 280 }}>
              <Search />
              <input
                className="input"
                placeholder="Search indicators, tags or sources…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <select className="select" style={{ width: 120 }} value={type} onChange={(event) => setType(event.target.value)}>
              {TYPES.map((item) => <option key={item} value={item}>{item === "all" ? "All types" : item}</option>)}
            </select>
            <div className="chip-row">
              {VERDICTS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`chip${verdict === item ? " active" : ""}`}
                  onClick={() => setVerdict(item)}
                  style={{ textTransform: "capitalize" }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Indicator</th>
                  <th>Type</th>
                  <th>Verdict</th>
                  <th>Confidence</th>
                  <th>Source</th>
                  <th>Sightings</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((ioc) => (
                  <tr key={ioc.id} className="clickable" onClick={() => openDrawer(ioc)}>
                    <td>
                      <div className="mono" style={{ fontSize: 12, color: "#ff9aa8", maxWidth: 270, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ioc.value}>
                        {ioc.value}
                      </div>
                      <div className="small-meta mt-6">{ioc.id}</div>
                    </td>
                    <td><Badge tone="neutral">{ioc.type}</Badge></td>
                    <td><Badge tone={verdictTone(ioc.verdict)}>{ioc.verdict}</Badge></td>
                    <td>
                      <div className="confidence-bar">
                        <Progress value={ioc.confidence} tone={ioc.confidence >= 85 ? "red" : "amber"} />
                        <span>{ioc.confidence}%</span>
                      </div>
                    </td>
                    <td className="small" style={{ maxWidth: 120 }}>{ioc.source}</td>
                    <td className="mono">{ioc.sightings}</td>
                    <td className="small-meta">{timeAgo(ioc.lastSeen)}</td>
                    <td><ChevronRight size={12} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <EmptyState
                icon={<Search size={24} />}
                title="No indicators match these filters."
                detail="Try another verdict or clear the search term."
                action={<button type="button" className="btn outline sm" onClick={() => { setQuery(""); setType("all"); setVerdict("all"); }}>Reset filters</button>}
              />
            )}
          </div>
          <div className="panel-footer">
            <div className="row between">
              <span className="small muted">Indicators are matched against raw events, not only the alert stream.</span>
              <span className="small-meta">WORKSPACE INDICATORS · LIVE LOOKUPS ON DEMAND</span>
            </div>
          </div>
        </Panel>

        <div className="stack">
          <Panel
            title="Live provider status"
            icon={<Radio size={15} />}
            action={<Badge tone={providers.some((provider) => provider.configured && provider.id !== "rdap") ? "success" : "warning"} dot>{providers.some((provider) => provider.configured && provider.id !== "rdap") ? "reputation live" : "RDAP only"}</Badge>}
            flush
          >
            <div style={{ padding: "4px 16px" }}>
              {providerError && (
                <div className="notice warning" style={{ marginTop: 12 }}>
                  <ShieldAlert />
                  <div>{providerError}</div>
                </div>
              )}
              {providers.map((provider) => (
                <div className="server-status" key={provider.id}>
                  <span>{provider.label}</span>
                  <span className="v">
                    {provider.configured ? "CONFIGURED" : "API KEY MISSING"} · {provider.kinds.join(", ")}
                  </span>
                </div>
              ))}
              {!providers.length && !providerError && (
                <div className="empty-inline">Checking provider configuration…</div>
              )}
            </div>
            <div className="panel-footer">
              <span className="small-meta">
                {lastLookupAt ? `LAST LIVE LOOKUP ${timeAgo(lastLookupAt).toUpperCase()} · WORKSPACE CACHE ACTIVE` : "RDAP IS KEYLESS · ABUSEIPDB AND OTX NEED API KEYS"}
              </span>
            </div>
          </Panel>

          <Panel title="Verdict mix" icon={<ShieldCheck size={15} />}>
            <div className="stack-6">
              {VERDICTS.filter((item) => item !== "all").map((item) => {
                const count = state.intel.filter((ioc) => ioc.verdict === item).length;
                return (
                  <div className="source-row" key={item}>
                    <span style={{ textTransform: "capitalize" }}>{item}</span>
                    <Progress
                      value={(count / Math.max(1, state.intel.length)) * 100}
                      tone={item === "malicious" ? "red" : item === "suspicious" ? "amber" : "green"}
                    />
                    <span className="v">{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="mini-stat-row mt-16" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="mini-stat"><div className="k">Avg confidence</div><div className="v">{Math.round(state.intel.reduce((sum, ioc) => sum + ioc.confidence, 0) / Math.max(1, state.intel.length))}%</div></div>
              <div className="mini-stat"><div className="k">Sightings</div><div className="v">{sightings}</div></div>
            </div>
          </Panel>

          <Panel title="Top tags" icon={<Tag size={15} />}>
            <div className="chip-list">
              {topTags.map(([tag, count]) => (
                <button type="button" className="pivot" key={tag} onClick={() => setQuery(tag)}>
                  {tag} <span style={{ opacity: 0.5 }}>{count}</span>
                </button>
              ))}
            </div>
            <div className="notice mt-12">
              <ShieldAlert />
              <div>
                A high-confidence IOC is not a conviction. Confirm internal sightings before blocking a shared or business-critical service.
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Drawer
        open={Boolean(selected)}
        title={selected?.value || "Indicator"}
        subtitle={selected ? `${selected.id} · ${selected.type.toUpperCase()} · ${selected.source}` : ""}
        onClose={closeDrawer}
        footer={
          selected && (
            <>
              <button type="button" className="btn outline" onClick={() => copyValue(selected.value)}>
                <Copy /> Copy value
              </button>
              {selected.type === "ip" && (
                <button
                  type="button"
                  className="btn outline"
                  onClick={proposeBlock}
                  disabled={proposing}
                >
                  <ShieldCheck /> {proposing ? "Proposing…" : "Propose block"}
                </button>
              )}
              <Link to={`/app/hunter/logs?q=${encodeURIComponent(selected.value)}`} className="btn violet">
                <Search /> Hunt in logs
              </Link>
            </>
          )
        }
      >
        {selected && (
          <>
            <div className="result-hero">
              <div style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 6 }}>
                  <Badge tone={verdictTone(selected.verdict)}>{selected.verdict}</Badge>
                  <Badge tone="neutral">{selected.type}</Badge>
                  <Badge tone="info">{selected.confidence}% confidence</Badge>
                </div>
                <div className="result-value mt-10" style={{ fontSize: 13 }}>{selected.value}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div className="brief-number" style={{ fontSize: 26 }}>{selected.sightings}</div>
                <div className="small-meta">INTERNAL SIGHTINGS</div>
              </div>
            </div>

            <MetaGrid
              items={[
                { k: "Indicator", v: selected.id },
                { k: "Type", v: selected.type },
                { k: "Verdict", v: selected.verdict },
                { k: "Confidence", v: `${selected.confidence}%` },
                { k: "Source", v: selected.source },
                { k: "Sightings", v: selected.sightings },
                { k: "First seen", v: formatDateTime(selected.firstSeen) },
                { k: "Last seen", v: formatDateTime(selected.lastSeen) },
                { k: "Internal matches", v: selectedMatches.length },
              ]}
            />

            <div className="drawer-section">
              <div className="label">Tags</div>
              <div className="chip-list">
                {(selected.tags || []).length
                  ? selected.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)
                  : <span className="small dim">No tags applied.</span>}
              </div>
            </div>

            <div className="drawer-section">
              <div className="label">Internal telemetry matches</div>
              {selectedMatches.length > 0 ? (
                <div className="finding-list" style={{ margin: "0 -4px" }}>
                  {selectedMatches.slice(0, 6).map((log) => (
                    <Link to={`/app/hunter/logs?focus=${log.id}`} className="finding-item" key={log.id} style={{ display: "flex", padding: "10px 4px" }}>
                      <span className={`finding-sev-bar ${log.status === "alert" ? "high" : "medium"}`} />
                      <div className="finding-body">
                        <div className="finding-title" style={{ fontSize: 12.5 }}>{log.message}</div>
                        <div className="finding-meta">
                          <span>{formatDateTime(log.timestamp)}</span>
                          <span>·</span>
                          <span>{log.host}</span>
                          <span>·</span>
                          <span>{log.source}</span>
                        </div>
                      </div>
                      <ChevronRight size={12} style={{ marginTop: 8 }} />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="small dim">
                  No retained events contain this indicator. Check the last-seen time before assuming the threat is gone.
                </div>
              )}
              {selectedMatches.length > 6 && (
                <Link to={`/app/hunter/logs?q=${encodeURIComponent(selected.value)}`} className="btn outline sm mt-12">
                  Open all {selectedMatches.length} matches <ArrowRight size={12} />
                </Link>
              )}
            </div>

            <div className="notice mt-12">
              <Radio />
              <div>
                Confidence is the feed's assessment, not HUNTER's. Internal sightings and case context determine whether this
                indicator is relevant to Northwind Systems.
              </div>
            </div>
          </>
        )}
      </Drawer>

      <Modal
        open={lookupOpen}
        title="Live threat intelligence lookup"
        subtitle="Registration data comes from RDAP. Reputation comes from AbuseIPDB and OTX only when their keys are configured."
        onClose={() => setLookupOpen(false)}
        wide
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setLookupOpen(false)}>
              <X /> Close
            </button>
            <button
              type="button"
              className="btn outline"
              onClick={() => runLookup(true)}
              disabled={lookingUp || !lookupValue.trim()}
            >
              <RefreshCw /> {lookingUp ? "Querying…" : "Refresh lookup"}
            </button>
            {lookupResult && (
              <button type="button" className="btn violet" onClick={addLiveIndicator} disabled={!lookupResult.available}>
                <Plus /> Add to workspace intel
              </button>
            )}
          </>
        }
      >
        <form
          className="row"
          style={{ gap: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            runLookup(false);
          }}
        >
          <div className="input-icon" style={{ flex: 1 }}>
            <Search />
            <input
              className="input"
              value={lookupValue}
              onChange={(event) => { setLookupValue(event.target.value); setLookupError(""); }}
              placeholder="8.8.8.8, example.com, https://… or a SHA-256 hash"
              aria-label="Indicator to look up"
              style={{ fontFamily: "var(--mono)" }}
            />
          </div>
          <button type="submit" className="btn violet" disabled={lookingUp || !lookupValue.trim()}>
            <Radio /> {lookingUp ? "Querying…" : "Look up"}
          </button>
        </form>

        {lookupError && <div className="form-error mt-12">{lookupError}</div>}

        {lookupResult && (
          <div className="mt-16">
            <div className="result-hero">
              <div style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 6 }}>
                  <Badge tone={verdictTone(lookupResult.verdict)}>{lookupResult.verdict}</Badge>
                  <Badge tone="neutral">{lookupResult.type}</Badge>
                  <Badge tone="violet">{lookupResult.confidence}% confidence</Badge>
                  {lookupResult.cached && <Badge tone="info">cached</Badge>}
                </div>
                <div className="result-value mt-10" style={{ fontSize: 13 }}>{lookupResult.indicator}</div>
                <div className="small-meta mt-8">CHECKED {formatDateTime(lookupResult.checkedAt).toUpperCase()}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div className="brief-number" style={{ fontSize: 26 }}>{lookupResult.providers.filter((provider) => provider.ok).length}</div>
                <div className="small-meta">PROVIDERS ANSWERED</div>
              </div>
            </div>

            {lookupResult.note && <div className="notice mt-12"><ShieldAlert /><div>{lookupResult.note}</div></div>}

            <div className="stack mt-12">
              {lookupResult.providers.map((provider) => (
                <div className="panel" key={provider.id} style={{ padding: 14 }}>
                  <div className="row between">
                    <div className="row" style={{ gap: 6 }}>
                      <strong style={{ fontSize: 12 }}>{provider.label || provider.id}</strong>
                      {provider.ok ? (
                        <Badge tone={provider.verdict === "malicious" ? "critical" : provider.verdict === "suspicious" ? "high" : "success"}>
                          {provider.verdict}
                        </Badge>
                      ) : (
                        <Badge tone={provider.skipped ? "neutral" : "warning"}>{provider.skipped ? "not configured" : "provider error"}</Badge>
                      )}
                    </div>
                    <span className="small-meta">{provider.ok ? `${provider.confidence || 0}% CONFIDENCE` : "NO DATA"}</span>
                  </div>
                  {provider.ok ? (
                    <>
                      <p className="small muted mt-8" style={{ lineHeight: 1.6 }}>{provider.summary}</p>
                      {provider.tags?.length > 0 && (
                        <div className="chip-list mt-8">
                          {provider.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                        </div>
                      )}
                      {provider.detail && (
                        <div className="kv-list mt-10">
                          {Object.entries(provider.detail)
                            .filter(([, value]) => value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length))
                            .slice(0, 8)
                            .map(([key, value]) => (
                              <div className="kv-row" key={key}>
                                <span className="k">{key.replaceAll(/([A-Z])/g, " $1").toLowerCase()}</span>
                                <span className="v">{Array.isArray(value) ? value.join(", ") : String(value)}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="small muted mt-8">{provider.error}</p>
                  )}
                </div>
              ))}
              {!lookupResult.providers.length && (
                <div className="empty-inline">No provider was enabled for this indicator type.</div>
              )}
            </div>

            <div className="notice mt-12">
              <ShieldCheck />
              <div>
                Provider verdicts are external assessments. Adding an indicator copies the verdict into workspace
                intelligence; blocking always requires a Super Admin approval.
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={modalOpen}
        title="Add an indicator"
        subtitle="Manually submitted indicators are marked for analyst review."
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setModalOpen(false)}><X /> Cancel</button>
            <button type="button" className="btn violet" onClick={addIndicator}><Plus /> Add indicator</button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ioc-type">Type</label>
            <select id="ioc-type" className="select" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {TYPES.filter((item) => item !== "all").map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ioc-verdict">Verdict</label>
            <select id="ioc-verdict" className="select" value={form.verdict} onChange={(event) => setForm({ ...form, verdict: event.target.value })}>
              {VERDICTS.filter((item) => item !== "all").map((item) => <option key={item} value={item} style={{ textTransform: "capitalize" }}>{item}</option>)}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="ioc-value">Indicator value</label>
            <input
              id="ioc-value"
              className="input"
              value={form.value}
              onChange={(event) => { setForm({ ...form, value: event.target.value }); setError(""); }}
              placeholder="IP address, domain, URL or SHA-256"
              style={{ fontFamily: "var(--mono)" }}
            />
          </div>
          <div className="field">
            <label htmlFor="ioc-confidence">Confidence (%)</label>
            <input
              id="ioc-confidence"
              className="input"
              type="number"
              min="1"
              max="100"
              value={form.confidence}
              onChange={(event) => setForm({ ...form, confidence: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="ioc-source">Source</label>
            <input id="ioc-source" className="input" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
          </div>
          <div className="field span-2">
            <label htmlFor="ioc-tags">Tags</label>
            <input id="ioc-tags" className="input" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="credential-access, tor-exit" />
          </div>
        </div>
        {error && <div className="form-error mt-12">{error}</div>}
        <div className="notice mt-12">
          <ShieldAlert />
          <div>New indicators start as analyst submissions and are matched against every retained event immediately.</div>
        </div>
      </Modal>
    </div>
  );
}
