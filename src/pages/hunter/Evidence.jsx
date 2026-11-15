import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Copy,
  Database,
  Download,
  FileArchive,
  FileText,
  Filter,
  HardDrive,
  Network,
  ScrollText,
  Search,
  ShieldCheck,
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
  StatCard,
} from "../../components/ui";
import { downloadFile, formatDateTime, timeAgo, toCsv } from "../../lib/format";

const TYPE_ICONS = {
  "Memory capture": HardDrive,
  "Authentication log": ScrollText,
  "Cloud audit trail": Cloud,
  "Firewall sessions": Network,
  "Database log": Database,
  "Disk image": HardDrive,
  "Network capture": Network,
  "Malware sample": FileArchive,
  "Screenshot": FileText,
};

const EVIDENCE_TYPES = [
  "Memory capture",
  "Authentication log",
  "Cloud audit trail",
  "Firewall sessions",
  "Database log",
  "Disk image",
  "Network capture",
  "Malware sample",
  "Screenshot",
  "Other",
];

const emptyForm = () => ({ name: "", type: "Memory capture", size: "", incidentId: "", hash: "" });

const humanSize = (bytes) => {
  if (!bytes) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const parseSizeMb = (value = "") => {
  const number = parseFloat(value);
  if (!Number.isFinite(number)) return 0;
  if (/gb/i.test(value)) return number * 1024;
  if (/kb/i.test(value)) return number / 1024;
  return number;
};

const randomHash = () =>
  `sha256:${Array.from({ length: 24 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}…`;

export default function Evidence() {
  const { state, dispatch } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const focus = searchParams.get("focus");
  const [query, setQuery] = useState("");
  const [incidentId, setIncidentId] = useState("all");
  const [type, setType] = useState("all");
  const [selectedId, setSelectedId] = useState(focus);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState({});

  useEffect(() => {
    if (focus && state.evidence.some((item) => item.id === focus)) setSelectedId(focus);
  }, [focus, state.evidence]);

  const types = useMemo(
    () => ["all", ...[...new Set(state.evidence.map((item) => item.type))].sort()],
    [state.evidence]
  );

  const filtered = useMemo(
    () =>
      [...state.evidence]
        .filter((item) => {
          const term = query.trim().toLowerCase();
          return (
            (!term || `${item.id} ${item.name} ${item.type} ${item.hash} ${item.uploadedBy} ${item.incidentId}`.toLowerCase().includes(term)) &&
            (incidentId === "all" || item.incidentId === incidentId) &&
            (type === "all" || item.type === type)
          );
        })
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()),
    [state.evidence, query, incidentId, type]
  );

  const selected = state.evidence.find((item) => item.id === selectedId) || null;
  const totalMb = state.evidence.reduce((sum, item) => sum + parseSizeMb(item.size), 0);
  const custodyEvents = state.evidence.reduce((sum, item) => sum + (item.chain?.length || 0), 0);
  const linkedCases = new Set(state.evidence.map((item) => item.incidentId).filter(Boolean)).size;

  const openDrawer = (item) => {
    setSelectedId(item.id);
    const next = new URLSearchParams(searchParams);
    next.set("focus", item.id);
    setSearchParams(next, { replace: true });
  };

  const closeDrawer = () => {
    setSelectedId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  };

  const verify = (item) => {
    setVerified((current) => ({ ...current, [item.id]: new Date().toISOString() }));
    dispatch({
      type: "PUSH_TOAST",
      toast: {
        title: "Evidence integrity verified",
        message: `${item.id} · SHA-256 digest matches the sealed record.`,
        tone: "success",
      },
    });
  };

  const copyHash = async (hash) => {
    try {
      await navigator.clipboard.writeText(hash);
      dispatch({ type: "PUSH_TOAST", toast: { title: "Hash copied", message: hash, tone: "success" } });
    } catch {
      dispatch({ type: "PUSH_TOAST", toast: { title: "Clipboard unavailable", message: "Copy the digest manually.", tone: "warning" } });
    }
  };

  const downloadManifest = (item) => {
    const text = [
      `EVIDENCE MANIFEST · ${item.id}`,
      "==============================================",
      `Name:          ${item.name}`,
      `Type:          ${item.type}`,
      `Size:          ${item.size}`,
      `SHA-256:       ${item.hash}`,
      `Uploaded by:   ${item.uploadedBy}`,
      `Uploaded at:   ${formatDateTime(item.uploadedAt)}`,
      `Incident:      ${item.incidentId || "unlinked"}`,
      `Status:        ${item.status}`,
      "",
      "CHAIN OF CUSTODY",
      ...(item.chain || []).map((step) => `- ${formatDateTime(step.time)} · ${step.action} · ${step.actor}`),
      "",
      "Generated by HUNTER AI. Demo workspace, not production evidence.",
    ].join("\n");
    downloadFile(`${item.id}_manifest.txt`, text, "text/plain");
    dispatch({ type: "PUSH_TOAST", toast: { title: "Manifest downloaded", message: `${item.id} chain of custody exported.`, tone: "success" } });
  };

  const exportCsv = () => {
    const csv = toCsv(filtered, [
      { label: "Evidence", value: (item) => item.id },
      { label: "Name", value: (item) => item.name },
      { label: "Type", value: (item) => item.type },
      { label: "Size", value: (item) => item.size },
      { label: "Hash", value: (item) => item.hash },
      { label: "Uploaded by", value: (item) => item.uploadedBy },
      { label: "Uploaded at", value: (item) => item.uploadedAt },
      { label: "Incident", value: (item) => item.incidentId || "" },
      { label: "Status", value: (item) => item.status },
      { label: "Custody events", value: (item) => item.chain?.length || 0 },
    ]);
    downloadFile(`evidence_manifest_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
    dispatch({ type: "PUSH_TOAST", toast: { title: "Manifest exported", message: `${filtered.length} evidence objects written to CSV.`, tone: "success" } });
  };

  const onFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setForm((current) => ({
      ...current,
      name: file.name,
      size: humanSize(file.size),
      hash: randomHash(),
    }));
    setError("");
  };

  const upload = () => {
    if (!form.name.trim()) {
      setError("Provide a name for the evidence object.");
      return;
    }
    dispatch({
      type: "ADD_EVIDENCE",
      evidence: {
        name: form.name.trim(),
        type: form.type,
        size: form.size.trim() || "—",
        hash: form.hash || randomHash(),
        incidentId: form.incidentId || null,
      },
    });
    setModalOpen(false);
    setForm(emptyForm());
    setError("");
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · HUNTER AI`}
        title="Evidence you can defend six months later."
        subtitle="Every object is hashed on arrival, sealed with an append-only chain of custody and linked to the case it supports. Verify integrity before you present it."
        actions={
          <>
            <button type="button" className="btn outline" onClick={exportCsv}>
              <Download /> Export manifest
            </button>
            <button type="button" className="btn violet" onClick={() => { setForm(emptyForm()); setError(""); setModalOpen(true); }}>
              <Upload /> Upload evidence
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Evidence objects" value={state.evidence.length} icon={<Archive />} tone="violet" foot={`${totalMb >= 1024 ? `${(totalMb / 1024).toFixed(1)} GB` : `${totalMb.toFixed(1)} MB`} under management`} />
        <StatCard label="Linked cases" value={linkedCases} icon={<ShieldCheck />} tone="info" foot={`${state.evidence.filter((item) => !item.incidentId).length} objects not yet linked`} />
        <StatCard label="Custody events" value={custodyEvents} icon={<CheckCircle2 />} tone="success" foot="Every transfer and hash recorded" />
        <StatCard label="Sealed" value={state.evidence.filter((item) => item.status === "sealed").length} icon={<Archive />} tone="high" foot={`${state.evidence.filter((item) => item.status !== "sealed").length} awaiting seal`} />
      </div>

      <Panel
        className="mt-12"
        title="Evidence vault"
        icon={<Archive size={15} />}
        action={<span className="small-meta">{filtered.length} OF {state.evidence.length} OBJECTS</span>}
        flush
      >
        <div className="filters-bar">
          <div className="input-icon search" style={{ maxWidth: 280 }}>
            <Search />
            <input
              className="input"
              placeholder="Search names, hashes or case IDs…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select className="select" style={{ width: 165 }} value={incidentId} onChange={(event) => setIncidentId(event.target.value)}>
            <option value="all">All incidents</option>
            {state.incidents.map((incident) => (
              <option key={incident.id} value={incident.id}>{incident.id}</option>
            ))}
          </select>
          <select className="select" style={{ width: 165 }} value={type} onChange={(event) => setType(event.target.value)}>
            {types.map((item) => <option key={item} value={item}>{item === "all" ? "All evidence types" : item}</option>)}
          </select>
        </div>

        <div style={{ padding: 14 }}>
          {filtered.length > 0 ? (
            <div className="grid-3">
              {filtered.map((item) => {
                const Icon = TYPE_ICONS[item.type] || FileText;
                return (
                  <article className="panel evidence-card" key={item.id}>
                    <div className="evidence-head">
                      <span className="evidence-icon"><Icon /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="evidence-name">{item.name}</div>
                        <div className="evidence-meta">{item.id} · {item.type} · {item.size}</div>
                      </div>
                      <Badge tone={verified[item.id] ? "success" : item.status === "sealed" ? "violet" : "high"}>
                        {verified[item.id] ? "verified" : item.status}
                      </Badge>
                    </div>

                    <div className="hash-line" title={item.hash}>{item.hash}</div>

                    <div className="row between mt-10">
                      <span className="small-meta">UPLOADED {timeAgo(item.uploadedAt).toUpperCase()}</span>
                      {item.incidentId ? (
                        <Link to={`/app/hunter/incidents/${item.incidentId}`} className="link small">{item.incidentId}</Link>
                      ) : (
                        <span className="small-meta">UNLINKED</span>
                      )}
                    </div>

                    <div className="chain-list">
                      {(item.chain || []).slice(0, 2).map((step, index) => (
                        <div className="chain-item" key={`${item.id}-${index}`}>
                          <span>{step.action}</span>
                          <span style={{ marginLeft: "auto", color: "var(--faint)" }}>{timeAgo(step.time)}</span>
                        </div>
                      ))}
                      {(item.chain?.length || 0) > 2 && (
                        <div className="small-meta" style={{ paddingLeft: 12, marginTop: 2 }}>
                          +{(item.chain?.length || 0) - 2} more custody event(s)
                        </div>
                      )}
                    </div>

                    <div className="row between mt-12">
                      <button type="button" className="btn ghost sm" onClick={() => verify(item)}>
                        <ShieldCheck /> Verify
                      </button>
                      <button type="button" className="btn outline sm" onClick={() => openDrawer(item)}>
                        Details <ChevronRight size={12} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Filter size={24} />}
              title="No evidence matches these filters."
              detail="Try a different incident, type or search term."
              action={<button type="button" className="btn outline sm" onClick={() => { setQuery(""); setIncidentId("all"); setType("all"); }}>Reset filters</button>}
            />
          )}
        </div>
      </Panel>

      <Drawer
        open={Boolean(selected)}
        title={selected?.name || "Evidence"}
        subtitle={selected ? `${selected.id} · ${selected.type}` : ""}
        onClose={closeDrawer}
        footer={
          selected && (
            <>
              <button type="button" className="btn outline" onClick={() => copyHash(selected.hash)}>
                <Copy /> Copy hash
              </button>
              <button type="button" className="btn outline" onClick={() => downloadManifest(selected)}>
                <Download /> Manifest
              </button>
              {selected.incidentId ? (
                <Link to={`/app/hunter/incidents/${selected.incidentId}`} className="btn violet">
                  <ShieldCheck /> Open {selected.incidentId}
                </Link>
              ) : (
                <Link to="/app/hunter/incidents" className="btn violet">Link to a case</Link>
              )}
            </>
          )
        }
      >
        {selected && (
          <>
            <div className="result-hero">
              <div className="row" style={{ gap: 12, minWidth: 0 }}>
                <span className="evidence-icon" style={{ width: 42, height: 42 }}>
                  {(() => {
                    const Icon = TYPE_ICONS[selected.type] || FileText;
                    return <Icon />;
                  })()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="evidence-name" style={{ fontSize: 13 }}>{selected.name}</div>
                  <div className="small-meta mt-6">{selected.size} · UPLOADED {timeAgo(selected.uploadedAt).toUpperCase()}</div>
                </div>
              </div>
              <Badge tone={verified[selected.id] ? "success" : "violet"}>{verified[selected.id] ? "verified" : selected.status}</Badge>
            </div>

            <MetaGrid
              items={[
                { k: "Evidence ID", v: selected.id },
                { k: "Type", v: selected.type },
                { k: "Size", v: selected.size },
                { k: "Uploaded by", v: selected.uploadedBy },
                { k: "Uploaded at", v: formatDateTime(selected.uploadedAt) },
                { k: "Incident", v: selected.incidentId || "unlinked" },
                { k: "Status", v: selected.status },
                { k: "Custody events", v: selected.chain?.length || 0 },
                { k: "Integrity", v: verified[selected.id] ? "verified" : "not re-checked" },
              ]}
            />

            <div className="drawer-section">
              <div className="label">SHA-256 digest</div>
              <div className="hash-line" style={{ marginTop: 0 }}>{selected.hash}</div>
              <div className="small-meta mt-6">Recompute the digest before presenting this object. Any mismatch breaks the seal.</div>
            </div>

            <div className="drawer-section">
              <div className="label">Chain of custody</div>
              <div className="chain-list" style={{ marginTop: 0 }}>
                {(selected.chain || []).map((step, index) => (
                  <div className="chain-item" key={`${selected.id}-custody-${index}`} style={{ alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div>{step.action}</div>
                      <div className="small-meta mt-6">{formatDateTime(step.time)} · {step.actor}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="row wrap mt-12" style={{ gap: 6 }}>
              <button type="button" className="btn success sm" onClick={() => verify(selected)}>
                <ShieldCheck /> Verify integrity
              </button>
              <button type="button" className="btn outline sm" onClick={() => downloadManifest(selected)}>
                <Download /> Download manifest
              </button>
            </div>

            <div className="notice mt-12">
              <Archive />
              <div>
                Evidence is append-only in this demo. Uploads are simulated and the digest is illustrative; no file leaves your
                browser.
              </div>
            </div>
          </>
        )}
      </Drawer>

      <Modal
        open={modalOpen}
        title="Upload evidence"
        subtitle="Seal a new object into the evidence vault."
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setModalOpen(false)}><X /> Cancel</button>
            <button type="button" className="btn violet" onClick={upload}><ShieldCheck /> Seal evidence</button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="vault-file">Select a file</label>
            <input id="vault-file" className="input" type="file" onChange={onFile} style={{ paddingTop: 7 }} />
            <div className="small-meta">Demo only · the object is recorded and hashed locally.</div>
          </div>
          <div className="field">
            <label htmlFor="vault-name">Name</label>
            <input
              id="vault-name"
              className="input"
              value={form.name}
              onChange={(event) => { setForm({ ...form, name: event.target.value }); setError(""); }}
              placeholder="e.g. db-01_slowquery.log"
            />
          </div>
          <div className="field">
            <label htmlFor="vault-type">Type</label>
            <select id="vault-type" className="select" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {EVIDENCE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="vault-size">Size</label>
            <input
              id="vault-size"
              className="input"
              value={form.size}
              onChange={(event) => setForm({ ...form, size: event.target.value })}
              placeholder="Auto-detected"
            />
          </div>
          <div className="field">
            <label htmlFor="vault-incident">Link to incident</label>
            <select id="vault-incident" className="select" value={form.incidentId} onChange={(event) => setForm({ ...form, incidentId: event.target.value })}>
              <option value="">Unlinked</option>
              {state.incidents.map((incident) => (
                <option key={incident.id} value={incident.id}>{incident.id} · {incident.title}</option>
              ))}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="vault-hash">SHA-256</label>
            <input
              id="vault-hash"
              className="input"
              value={form.hash}
              onChange={(event) => setForm({ ...form, hash: event.target.value })}
              placeholder="Generated on seal if blank"
              style={{ fontFamily: "var(--mono)" }}
            />
          </div>
        </div>
        {error && <div className="form-error mt-12">{error}</div>}
        <div className="notice mt-12">
          <CheckCircle2 />
          <div>HUNTER records the uploader, timestamp and digest in an append-only chain of custody.</div>
        </div>
      </Modal>
    </div>
  );
}
