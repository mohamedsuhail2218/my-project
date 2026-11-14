import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Download,
  Fingerprint as FingerprintIcon,
  GitCompare,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  Drawer,
  EmptyState,
  PageHeader,
  Panel,
  Progress,
  ScoreRing,
  StatCard,
} from "../../components/ui";
import { downloadFile, formatDate, timeAgo, toCsv } from "../../lib/format";

const scoreTone = (score) => (score >= 80 ? "red" : score >= 65 ? "amber" : "violet");
const signalTone = (value) => (value >= 75 ? "red" : value >= 60 ? "amber" : "cyan");

export default function Fingerprints() {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("score");
  const [compare, setCompare] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...state.fingerprints]
      .filter((fingerprint) =>
        `${fingerprint.actor} ${fingerprint.classification} ${fingerprint.tactics.join(" ")} ${fingerprint.summary}`
          .toLowerCase()
          .includes(term)
      )
      .sort((a, b) => {
        if (sort === "recent") return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
        if (sort === "activity") return b.detections - a.detections;
        return b.score - a.score;
      });
  }, [state.fingerprints, query, sort]);

  const selected = state.fingerprints.find((fingerprint) => fingerprint.id === selectedId) || null;
  const compared = state.fingerprints.filter((fingerprint) => compare.includes(fingerprint.id));

  const highConfidence = state.fingerprints.filter((fingerprint) => fingerprint.score >= 75).length;
  const activeToday = state.fingerprints.filter(
    (fingerprint) => Date.now() - new Date(fingerprint.lastSeen).getTime() <= 24 * 3600 * 1000
  ).length;
  const linkedIncidents = state.fingerprints.reduce((sum, fingerprint) => sum + fingerprint.incidents, 0);

  const sharedTactics = useMemo(() => {
    if (compared.length < 2) return [];
    return compared[0].tactics.filter((tactic) =>
      compared.slice(1).every((fingerprint) => fingerprint.tactics.includes(tactic))
    );
  }, [compared]);

  const toggleCompare = (fingerprint) => {
    if (compare.includes(fingerprint.id)) {
      setCompare(compare.filter((id) => id !== fingerprint.id));
      return;
    }
    if (compare.length >= 3) {
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Comparison limit reached",
          message: "Select up to three actor profiles at a time.",
          tone: "warning",
        },
      });
      return;
    }
    setCompare([...compare, fingerprint.id]);
  };

  const exportCsv = () => {
    const csv = toCsv(filtered, [
      { label: "Profile", value: (item) => item.id },
      { label: "Actor", value: (item) => item.actor },
      { label: "Classification", value: (item) => item.classification },
      { label: "Score", value: (item) => item.score },
      { label: "Confidence", value: (item) => Math.round(item.confidence * 100) },
      { label: "Detections", value: (item) => item.detections },
      { label: "Incidents", value: (item) => item.incidents },
      { label: "Tactics", value: (item) => item.tactics.join("; ") },
      { label: "Last seen", value: (item) => item.lastSeen },
    ]);
    downloadFile(`hunter_actor_fingerprints_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Fingerprints exported", message: `${filtered.length} actor profiles written to CSV.`, tone: "success" },
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · HUNTER AI`}
        title="Adversaries leave a shape, not just a signature."
        subtitle="HUNTER clusters auth rhythm, user-agent entropy, tooling overlap and infrastructure reuse into a behavioural fingerprint. Compare actors to see where their tradecraft converges."
        actions={
          <>
            <button type="button" className="btn outline" onClick={exportCsv}>
              <Download /> Export profiles
            </button>
            <Link to="/app/hunter/investigation" className="btn violet">
              <Search /> Hunt an actor
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Tracked actors" value={state.fingerprints.length} icon={<FingerprintIcon />} tone="violet" foot={`${state.fingerprints.filter((item) => item.classification.includes("Insider")).length} internal profile(s) in scope`} />
        <StatCard label="High similarity" value={highConfidence} icon={<Target />} tone="critical" foot="Score 75 or above · attribution confidence checked" />
        <StatCard label="Active last 24h" value={activeToday} icon={<Sparkles />} tone="high" foot="Actor behaviour observed in current telemetry" />
        <StatCard label="Linked incidents" value={linkedIncidents} icon={<ShieldCheck />} tone="info" foot={`${state.fingerprints.filter((item) => item.incidents > 0).length} profiles with case history`} />
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Actor profiles"
          icon={<FingerprintIcon size={15} />}
          action={<span className="small-meta">{filtered.length} OF {state.fingerprints.length} PROFILES</span>}
          flush
        >
          <div className="filters-bar">
            <div className="input-icon search" style={{ maxWidth: 280 }}>
              <Search />
              <input
                className="input"
                placeholder="Search actors, tradecraft or tactics…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <select className="select" style={{ width: 150 }} value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="score">Highest similarity</option>
              <option value="recent">Most recently seen</option>
              <option value="activity">Most detections</option>
            </select>
            {compare.length > 0 && (
              <button type="button" className="btn ghost sm" onClick={() => setCompare([])}>
                <X size={12} /> Clear compare ({compare.length})
              </button>
            )}
          </div>

          <div style={{ padding: 14 }}>
            <div className="fp-grid">
              {filtered.map((fingerprint) => (
                <article className="panel fp-card" key={fingerprint.id}>
                  <div className="fp-head">
                    <div className="row" style={{ alignItems: "flex-start", gap: 10, minWidth: 0 }}>
                      <span className="fp-avatar">{fingerprint.actor.slice(0, 2).toUpperCase()}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="strong" style={{ fontSize: 13 }}>{fingerprint.actor}</div>
                        <div className="small-meta mt-6">{fingerprint.id} · LAST SEEN {timeAgo(fingerprint.lastSeen).toUpperCase()}</div>
                      </div>
                    </div>
                    <ScoreRing value={fingerprint.score} size={48} tone={scoreTone(fingerprint.score)} />
                  </div>

                  <div className="fp-class">{fingerprint.classification}</div>
                  <p className="fp-summary">{fingerprint.summary}</p>

                  <div className="fp-signals">
                    {fingerprint.signals.map((signal) => (
                      <div className="fp-signal" key={signal.label}>
                        <span>{signal.label}</span>
                        <Progress value={signal.value} tone={signalTone(signal.value)} />
                        <span className="v">{signal.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="chip-list mt-12">
                    {fingerprint.tactics.map((tactic) => (
                      <span className="tag violet" key={tactic}>{tactic}</span>
                    ))}
                  </div>

                  <div className="incident-foot">
                    <span>{fingerprint.detections} detection(s) · {fingerprint.incidents} incident(s)</span>
                    <span>Confidence {Math.round(fingerprint.confidence * 100)}%</span>
                  </div>

                  <div className="row mt-10" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className={`btn sm ${compare.includes(fingerprint.id) ? "success" : "outline"}`}
                      onClick={() => toggleCompare(fingerprint)}
                    >
                      <GitCompare /> {compare.includes(fingerprint.id) ? "Selected" : "Compare"}
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setSelectedId(fingerprint.id)} style={{ marginLeft: "auto" }}>
                      Profile <ArrowRight size={12} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {filtered.length === 0 && (
              <EmptyState
                icon={<Search size={24} />}
                title="No actor profiles match this search."
                detail="Try a tactic such as “Credential Access”, or clear the query."
                action={<button type="button" className="btn outline sm" onClick={() => setQuery("")}>Clear search</button>}
              />
            )}
          </div>
        </Panel>

        <div className="stack">
          {compared.length > 0 ? (
            <Panel
              title="Actor comparison"
              icon={<GitCompare size={15} />}
              action={<span className="small-meta">{compared.length} SELECTED</span>}
              flush
            >
              {compared.length < 2 ? (
                <div className="empty-inline">
                  Select one more profile to compare tradecraft, confidence and shared tactics.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table compact">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        {compared.map((fingerprint) => (
                          <th key={fingerprint.id}>{fingerprint.actor}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="small muted">Similarity</td>
                        {compared.map((fingerprint) => (
                          <td key={fingerprint.id}><Badge tone={scoreTone(fingerprint.score)}>{fingerprint.score}</Badge></td>
                        ))}
                      </tr>
                      <tr>
                        <td className="small muted">Confidence</td>
                        {compared.map((fingerprint) => (
                          <td key={fingerprint.id} className="mono">{Math.round(fingerprint.confidence * 100)}%</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="small muted">Detections</td>
                        {compared.map((fingerprint) => (
                          <td key={fingerprint.id} className="mono">{fingerprint.detections}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="small muted">Incidents</td>
                        {compared.map((fingerprint) => (
                          <td key={fingerprint.id} className="mono">{fingerprint.incidents}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="small muted">Last seen</td>
                        {compared.map((fingerprint) => (
                          <td key={fingerprint.id} className="small">{timeAgo(fingerprint.lastSeen)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="small muted">First seen</td>
                        {compared.map((fingerprint) => (
                          <td key={fingerprint.id} className="small">{formatDate(fingerprint.firstSeen)}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                  <div className="panel-footer">
                    <div className="small muted">
                      {sharedTactics.length
                        ? `Shared tactics: ${sharedTactics.join(", ")}.`
                        : "No shared tactic family across the selected profiles."}
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          ) : (
            <Panel title="How matching works" icon={<Sparkles size={15} />}>
              <p className="small muted" style={{ lineHeight: 1.65 }}>
                HUNTER does not rely on a single indicator. A fingerprint is a weighted cluster of behaviours that survives
                infrastructure changes.
              </p>
              <div className="stack-6 mt-12">
                {[
                  ["Auth timing rhythm", "Interval regularity across failed and successful sessions."],
                  ["User-agent entropy", "Spoofed or rotating client fingerprints."],
                  ["Tooling overlap", "Shared command shapes and process ancestry."],
                  ["Infrastructure reuse", "Address, domain and certificate overlap."],
                ].map(([title, detail]) => (
                  <div className="link-row" key={title} style={{ alignItems: "flex-start" }}>
                    <div>
                      <div className="strong" style={{ fontSize: 10.5 }}>{title}</div>
                      <div className="small-meta mt-6" style={{ lineHeight: 1.5 }}>{detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="notice mt-12">
                <Users />
                <div>Use compare to check whether two alerts belong to the same actor before merging cases.</div>
              </div>
            </Panel>
          )}

          <Panel title="Attribution posture" icon={<Target size={15} />} flush>
            <div className="finding-list">
              {[...state.fingerprints]
                .sort((a, b) => b.score - a.score)
                .slice(0, 4)
                .map((fingerprint) => (
                  <button
                    type="button"
                    className="finding-item"
                    key={fingerprint.id}
                    onClick={() => setSelectedId(fingerprint.id)}
                    style={{ display: "flex", width: "100%", textAlign: "left" }}
                  >
                    <span className={`finding-sev-bar ${fingerprint.score >= 80 ? "critical" : fingerprint.score >= 65 ? "high" : "medium"}`} />
                    <div className="finding-body">
                      <div className="finding-title">{fingerprint.actor}</div>
                      <div className="finding-meta">
                        <span>{fingerprint.classification}</span>
                      </div>
                    </div>
                    <span className="finding-time">{fingerprint.score}</span>
                  </button>
                ))}
            </div>
          </Panel>
        </div>
      </div>

      <Drawer
        open={Boolean(selected)}
        title={selected?.actor || "Actor profile"}
        subtitle={selected ? `${selected.id} · ${selected.classification}` : ""}
        onClose={() => setSelectedId(null)}
        footer={
          selected && (
            <>
              <button type="button" className={`btn ${compare.includes(selected.id) ? "success" : "outline"}`} onClick={() => toggleCompare(selected)}>
                <GitCompare /> {compare.includes(selected.id) ? "Remove from compare" : "Add to compare"}
              </button>
              <Link to={`/app/hunter/investigation?q=${encodeURIComponent(selected.actor)}`} className="btn violet">
                <Search /> Hunt this actor
              </Link>
            </>
          )
        }
      >
        {selected && (
          <>
            <div className="result-hero">
              <div className="row" style={{ gap: 12 }}>
                <span className="fp-avatar" style={{ width: 42, height: 42, fontSize: 14 }}>
                  {selected.actor.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <div className="strong" style={{ fontSize: 15 }}>{selected.actor}</div>
                  <div className="small-meta mt-6">FIRST SEEN {formatDate(selected.firstSeen).toUpperCase()}</div>
                </div>
              </div>
              <ScoreRing value={selected.score} size={58} tone={scoreTone(selected.score)} />
            </div>

            <p className="small soft mt-16" style={{ lineHeight: 1.7 }}>{selected.summary}</p>

            <div className="drawer-section">
              <div className="label">Behavioural signals</div>
              <div className="fp-signals" style={{ marginTop: 0 }}>
                {selected.signals.map((signal) => (
                  <div className="fp-signal" key={signal.label}>
                    <span>{signal.label}</span>
                    <Progress value={signal.value} tone={signalTone(signal.value)} />
                    <span className="v">{signal.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="drawer-section">
              <div className="label">Observed tactics</div>
              <div className="chip-list">
                {selected.tactics.map((tactic) => (
                  <span className="tag violet" key={tactic}>{tactic}</span>
                ))}
              </div>
            </div>

            <div className="drawer-section">
              <div className="label">Attribution</div>
              <div className="kv-list">
                <div className="kv-row"><span className="k">Similarity score</span><span className="v">{selected.score} / 100</span></div>
                <div className="kv-row"><span className="k">Confidence</span><span className="v">{Math.round(selected.confidence * 100)}%</span></div>
                <div className="kv-row"><span className="k">Detections</span><span className="v">{selected.detections}</span></div>
                <div className="kv-row"><span className="k">Incidents</span><span className="v">{selected.incidents}</span></div>
                <div className="kv-row"><span className="k">Last observed</span><span className="v">{timeAgo(selected.lastSeen)}</span></div>
              </div>
            </div>

            <div className="notice mt-12">
              <ShieldCheck />
              <div>
                {selected.score >= 80
                  ? "Treat this profile as an active adversary. Preserve evidence and compare future alerts before closing cases."
                  : "Attribution is probabilistic. Corroborate with infrastructure and tooling before merging cases."}
              </div>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
