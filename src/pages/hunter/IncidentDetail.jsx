import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Upload,
  User,
  X,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  MetaGrid,
  Modal,
  PageHeader,
  Panel,
  SeverityBadge,
  StatCard,
  StatusBadge,
  UserAvatar,
} from "../../components/ui";
import { assetRisk } from "../../lib/engine";
import { downloadFile, formatDateTime, timeAgo } from "../../lib/format";
import { api } from "../../lib/api";

const WORKFLOW = ["open", "investigating", "contained", "closed"];
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

const humanSize = (bytes) => {
  if (!bytes) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const randomHash = () =>
  `sha256:${Array.from({ length: 24 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}…`;

const emptyEvidence = () => ({ name: "", type: "Memory capture", size: "", hash: "" });

export default function IncidentDetail() {
  const { state, dispatch } = useApp();
  const { incidentId } = useParams();
  const incident = state.incidents.find((item) => item.id === incidentId) || null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ summary: "", containment: "", nextAction: "" });
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceForm, setEvidenceForm] = useState(emptyEvidence);
  const [evidenceError, setEvidenceError] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [playbooks, setPlaybooks] = useState([]);
  const [responseActions, setResponseActions] = useState([]);
  const [responseError, setResponseError] = useState("");
  const [proposal, setProposal] = useState({ playbookId: "block-ip", target: "", rationale: "" });
  const [proposing, setProposing] = useState(false);
  const [decidingId, setDecidingId] = useState("");
  const [responseTick, setResponseTick] = useState(0);
  const isSuperAdmin = state.user?.roleKey === "super_admin";
  const canPropose = state.user?.roleKey !== "read_only";

  useEffect(() => {
    let active = true;
    Promise.all([
      api.responsePlaybooks(),
      api.responseActions({ incidentId, limit: 25 }),
    ])
      .then(([catalog, actions]) => {
        if (!active) return;
        setPlaybooks(catalog.playbooks || []);
        setResponseActions(actions.actions || []);
        setResponseError("");
      })
      .catch((requestError) => {
        if (active) setResponseError(requestError?.message || "Response playbooks are unavailable.");
      });
    return () => {
      active = false;
    };
  }, [incidentId, responseTick]);

  const selectedPlaybook = playbooks.find((playbook) => playbook.id === proposal.playbookId) || null;

  const proposeContainment = async (event) => {
    event.preventDefault();
    if (!incident) return;
    if (!proposal.target.trim()) {
      dispatch({
        type: "PUSH_TOAST",
        toast: { title: "Target required", message: "Enter the IP, host or identity to act on.", tone: "warning" },
      });
      return;
    }
    setProposing(true);
    try {
      const result = await api.proposeResponseAction({
        playbookId: proposal.playbookId,
        target: proposal.target.trim(),
        rationale:
          proposal.rationale.trim() ||
          `Containment proposed from case ${incident.id} by ${state.user?.name || "an analyst"}.`,
        incidentId: incident.id,
      });
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: result.duplicate ? "Approval already pending" : "Containment proposal queued",
          message: result.duplicate
            ? "An identical request is already waiting for a Super Admin."
            : `${result.action.playbook?.label || result.action.playbookId} needs Super Admin approval before it runs.`,
          tone: result.duplicate ? "warning" : "success",
        },
      });
      setProposal((current) => ({ ...current, target: "", rationale: "" }));
      setResponseTick((tick) => tick + 1);
    } catch (requestError) {
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Proposal rejected",
          message: requestError?.message || "The response action could not be created.",
          tone: "danger",
        },
      });
    } finally {
      setProposing(false);
    }
  };

  const decideAction = async (action, decision) => {
    setDecidingId(action.id);
    try {
      await api.decideResponseAction(
        action.id,
        decision,
        decision === "approve" ? `Approved from ${incident?.id || "case detail"}.` : `Rejected from ${incident?.id || "case detail"}.`
      );
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: decision === "approve" ? "Playbook executed" : "Proposal rejected",
          message:
            decision === "approve"
              ? `${action.playbook?.label || action.playbookId} applied to ${action.target}.`
              : `${action.playbook?.label || action.playbookId} was not executed.`,
          tone: decision === "approve" ? "success" : "warning",
        },
      });
      setResponseTick((tick) => tick + 1);
    } catch (requestError) {
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Decision failed",
          message: requestError?.message || "The approval could not be recorded.",
          tone: "danger",
        },
      });
    } finally {
      setDecidingId("");
    }
  };

  useEffect(() => {
    if (!incident) return;
    setDraft({
      summary: incident.summary || "",
      containment: incident.containment || "",
      nextAction: incident.nextAction || "",
    });
    setEditing(false);
    setEvidenceOpen(false);
    setCloseOpen(false);
  }, [incidentId]);

  const linkedDetections = useMemo(() => {
    if (!incident) return [];
    const ids = new Set(incident.detectionIds || []);
    return state.detections.filter(
      (detection) => ids.has(detection.id) || detection.incidentId === incident.id
    );
  }, [state.detections, incident]);

  const evidence = useMemo(
    () => (incident ? state.evidence.filter((item) => item.incidentId === incident.id) : []),
    [state.evidence, incident]
  );

  const affectedAssets = useMemo(() => {
    const ids = new Set(linkedDetections.map((detection) => detection.assetId));
    return state.assets.filter((asset) => ids.has(asset.id));
  }, [state.assets, linkedDetections]);

  const relatedLogs = useMemo(() => {
    const hosts = new Set(affectedAssets.map((asset) => asset.id));
    return state.logs
      .filter((log) => hosts.has(log.host) && log.status !== "allow")
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
  }, [state.logs, affectedAssets]);

  const timelineEvents = useMemo(() => {
    if (!incident) return [];
    const events = [];
    events.push({
      key: `${incident.id}-opened`,
      at: incident.createdAt,
      title: `Case ${incident.id} opened`,
      meta: [`HUNTER AI`, incident.status, incident.assignee],
      tone: "critical",
    });
    linkedDetections.forEach((detection) => {
      events.push({
        key: `${detection.id}-seen`,
        at: detection.firstSeen,
        title: `Detection: ${detection.title}`,
        meta: [detection.id, detection.technique, detection.assetId],
        tone: detection.severity,
        to: `/app/hunter/detections?focus=${detection.id}`,
      });
    });
    evidence.forEach((item) => {
      (item.chain || []).forEach((step, index) => {
        events.push({
          key: `${item.id}-${index}`,
          at: step.time,
          title: `${step.action} · ${item.name}`,
          meta: [item.id, step.actor, item.status],
          tone: "info",
          to: `/app/hunter/evidence?focus=${item.id}`,
        });
      });
    });
    relatedLogs.slice(0, 6).forEach((log) => {
      events.push({
        key: `log-${log.id}`,
        at: log.timestamp,
        title: log.message,
        meta: [log.source, log.host, log.event],
        tone: log.status === "alert" ? "high" : "medium",
        to: `/app/hunter/logs?focus=${log.id}`,
      });
    });
    state.activity
      .filter(
        (item) =>
          item.text.includes(incident.id) ||
          linkedDetections.some((detection) => item.text.includes(detection.id))
      )
      .forEach((item) => {
        events.push({
          key: `activity-${item.id}`,
          at: item.at,
          title: item.text,
          meta: [item.actor, "workspace"],
          tone: item.tone || "info",
        });
      });
    events.push({
      key: `${incident.id}-updated`,
      at: incident.updatedAt,
      title: `Case updated · ${incident.status}`,
      meta: ["Last recorded change", incident.assignee],
      tone: "success",
    });

    return events
      .filter((event, index, all) => all.findIndex((item) => item.key === event.key) === index)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [incident, linkedDetections, evidence, relatedLogs, state.activity]);

  if (!incident) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={`${state.org.name} · HUNTER AI`}
          title="This case is not in the workspace."
          subtitle="The incident may have been removed or the link may be stale."
          actions={<Link to="/app/hunter/incidents" className="btn outline"><ArrowLeft /> All cases</Link>}
        />
        <Panel className="mt-12">
          <EmptyState
            icon={<Siren size={26} />}
            title={`No incident matches ${incidentId}.`}
            detail="Open the case queue to find an active investigation."
            action={<Link to="/app/hunter/incidents" className="btn primary"><Siren /> Open case queue</Link>}
          />
        </Panel>
      </div>
    );
  }

  const createdHours = Math.max(0, (Date.now() - new Date(incident.createdAt).getTime()) / 3600000);
  const ageValue = createdHours < 24 ? Math.max(1, Math.round(createdHours)) : Math.round(createdHours / 24);
  const ageUnit = createdHours < 24 ? "hours" : "days";
  const openDetections = linkedDetections.filter((detection) => detection.status !== "closed").length;

  const setStatus = (status) => {
    if (status === incident.status) return;
    dispatch({ type: "UPDATE_INCIDENT", id: incident.id, patch: { status } });
  };

  const saveNarrative = () => {
    dispatch({
      type: "UPDATE_INCIDENT",
      id: incident.id,
      patch: {
        summary: draft.summary,
        containment: draft.containment,
        nextAction: draft.nextAction,
      },
    });
    setEditing(false);
  };

  const addEvidence = () => {
    if (!evidenceForm.name.trim()) {
      setEvidenceError("Name the evidence object before sealing it.");
      return;
    }
    dispatch({
      type: "ADD_EVIDENCE",
      evidence: {
        name: evidenceForm.name.trim(),
        type: evidenceForm.type,
        size: evidenceForm.size.trim() || "—",
        hash: evidenceForm.hash || randomHash(),
        incidentId: incident.id,
      },
    });
    setEvidenceOpen(false);
    setEvidenceForm(emptyEvidence());
  };

  const onEvidenceFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setEvidenceForm((current) => ({
      ...current,
      name: file.name,
      size: humanSize(file.size),
      hash: randomHash(),
    }));
    setEvidenceError("");
  };

  const generateReport = () => {
    dispatch({
      type: "ADD_REPORT",
      report: {
        title: `${incident.id} · ${incident.title}`,
        type: "Incident",
        summary: incident.summary,
        scope: incident.id,
        size: "1.1 MB",
      },
    });
  };

  const downloadBrief = () => {
    const lines = [
      `# ${incident.id} — ${incident.title}`,
      "",
      `- Severity: ${incident.severity}`,
      `- Status: ${incident.status}`,
      `- Owner: ${incident.assignee}`,
      `- Opened: ${formatDateTime(incident.createdAt)}`,
      `- Last updated: ${formatDateTime(incident.updatedAt)}`,
      `- Tags: ${(incident.tags || []).join(", ") || "none"}`,
      "",
      "## Summary",
      incident.summary,
      "",
      "## Containment",
      incident.containment,
      "",
      "## Next action",
      incident.nextAction,
      "",
      "## Linked detections",
      ...(linkedDetections.length
        ? linkedDetections.map(
            (detection) =>
              `- ${detection.id} · ${detection.severity.toUpperCase()} · ${detection.title} (${detection.assetId})`
          )
        : ["- None linked"]),
      "",
      "## Evidence",
      ...(evidence.length
        ? evidence.map((item) => `- ${item.id} · ${item.name} · ${item.size} · ${item.hash}`)
        : ["- None sealed"]),
      "",
      "## Chronology",
      ...timelineEvents.map(
        (event) => `- ${formatDateTime(event.at)} — ${event.title} (${event.meta.join(" · ")})`
      ),
      "",
      "Generated by HUNTER AI. Demo workspace, not production evidence.",
    ];
    downloadFile(`${incident.id}_case_brief.md`, lines.join("\n"), "text/markdown");
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Case brief downloaded", message: `${incident.id} chronology and evidence inventory exported.`, tone: "success" },
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`HUNTER AI · Case ${incident.id}`}
        title={incident.title}
        subtitle={incident.summary}
        actions={
          <>
            <Link to="/app/hunter/incidents" className="btn ghost">
              <ArrowLeft /> All cases
            </Link>
            <button type="button" className="btn outline" onClick={downloadBrief}>
              <Download /> Download brief
            </button>
            <button type="button" className="btn violet" onClick={() => setEvidenceOpen(true)}>
              <Upload /> Add evidence
            </button>
          </>
        }
      />

      <div className="result-hero mt-12">
        <div style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            {incident.simulationId && <Badge tone="violet">simulation-derived</Badge>}
            {(incident.tags || []).slice(0, 3).map((tag) => (
              <span className="tag" key={tag}>{tag}</span>
            ))}
          </div>
          <div className="result-value mt-10" style={{ fontSize: 13 }}>{incident.id}</div>
          <div className="small-meta mt-8">
            OPENED {formatDateTime(incident.createdAt).toUpperCase()} · UPDATED {timeAgo(incident.updatedAt).toUpperCase()} · OWNER {(incident.assignee || "UNASSIGNED").toUpperCase()}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="user-inline"><UserAvatar name={incident.assignee} size="sm" /> {incident.assignee}</span>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Linked detections" value={linkedDetections.length} icon={<Siren />} tone="high" foot={`${openDetections} still open`} />
        <StatCard label="Evidence sealed" value={evidence.length} icon={<Archive />} tone="violet" foot="SHA-256 chain of custody" />
        <StatCard label="Affected assets" value={affectedAssets.length} icon={<ShieldCheck />} tone="info" foot={affectedAssets.map((asset) => asset.name).join(", ") || "No asset linked"} />
        <StatCard label="Case age" value={ageValue} unit={ageUnit} icon={<Clock />} tone={incident.status === "closed" ? "success" : "critical"} foot={`Opened ${timeAgo(incident.createdAt)}`} />
      </div>

      <div className="content-grid split-2-1">
        <div className="stack">
          <Panel
            title="Case narrative"
            icon={<FileText size={15} />}
            action={
              editing ? (
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn ghost sm" onClick={() => { setEditing(false); setDraft({ summary: incident.summary, containment: incident.containment, nextAction: incident.nextAction }); }}>
                    Cancel
                  </button>
                  <button type="button" className="btn success sm" onClick={saveNarrative}>
                    <CheckCircle2 /> Save changes
                  </button>
                </div>
              ) : (
                <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>
                  Edit narrative
                </button>
              )
            }
          >
            {editing ? (
              <div className="form-grid">
                <div className="field span-2">
                  <label htmlFor="case-summary">Summary</label>
                  <textarea
                    id="case-summary"
                    className="textarea"
                    rows={4}
                    value={draft.summary}
                    onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                  />
                </div>
                <div className="field span-2">
                  <label htmlFor="case-containment">Containment</label>
                  <textarea
                    id="case-containment"
                    className="textarea"
                    rows={3}
                    value={draft.containment}
                    onChange={(event) => setDraft({ ...draft, containment: event.target.value })}
                  />
                </div>
                <div className="field span-2">
                  <label htmlFor="case-next">Next action</label>
                  <textarea
                    id="case-next"
                    className="textarea"
                    rows={3}
                    value={draft.nextAction}
                    onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })}
                  />
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="label">Summary</div>
                  <p className="small soft mt-6" style={{ lineHeight: 1.7 }}>{incident.summary}</p>
                </div>
                <div className="mt-16">
                  <div className="label">Containment</div>
                  <p className="small muted mt-6" style={{ lineHeight: 1.7 }}>{incident.containment || "No containment action recorded."}</p>
                </div>
                <div className="notice mt-16">
                  <CheckCircle2 />
                  <div><strong className="soft">Next action:</strong> {incident.nextAction}</div>
                </div>
              </>
            )}
          </Panel>

          <Panel
            title="Linked detections"
            icon={<Siren size={15} />}
            action={<span className="small-meta">{linkedDetections.length} LINKED</span>}
            flush
          >
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Detection</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Asset</th>
                    <th>Last seen</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {linkedDetections.map((detection) => (
                    <tr key={detection.id}>
                      <td>
                        <div className="strong" style={{ fontSize: 11 }}>{detection.title}</div>
                        <div className="small-meta mt-6">{detection.id} · {detection.technique}</div>
                      </td>
                      <td><SeverityBadge severity={detection.severity} /></td>
                      <td><StatusBadge status={detection.status} /></td>
                      <td className="mono" style={{ fontSize: 9 }}>{detection.assetId}</td>
                      <td className="small-meta">{timeAgo(detection.lastSeen)}</td>
                      <td>
                        <Link to={`/app/hunter/detections?focus=${detection.id}`} className="btn ghost sm">
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {linkedDetections.length === 0 && (
                    <tr><td colSpan={6}><div className="empty-inline">No detections are linked to this case yet.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title="Evidence"
            icon={<Archive size={15} />}
            action={
              <button type="button" className="btn ghost sm" onClick={() => setEvidenceOpen(true)}>
                <Plus /> Add object
              </button>
            }
            flush
          >
            {evidence.length ? (
              <div className="finding-list">
                {evidence.map((item) => (
                  <div className="finding-item" key={item.id} style={{ alignItems: "flex-start" }}>
                    <span className="feature-icon" style={{ width: 32, height: 32, flexShrink: 0 }}><Archive /></span>
                    <div className="finding-body">
                      <div className="finding-title" style={{ fontFamily: "var(--mono)", fontSize: 10.5 }}>{item.name}</div>
                      <div className="finding-meta">
                        <span>{item.id}</span>
                        <span>·</span>
                        <span>{item.type}</span>
                        <span>·</span>
                        <span>{item.size}</span>
                        <span>·</span>
                        <span>{timeAgo(item.uploadedAt)}</span>
                      </div>
                      <div className="hash-line" style={{ marginTop: 7 }}>{item.hash}</div>
                    </div>
                    <Link to={`/app/hunter/evidence?focus=${item.id}`} className="btn ghost sm">Open</Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-inline">No evidence sealed for this case. Add a memory capture, log export or disk image.</div>
            )}
          </Panel>

          <Panel title="Related telemetry" icon={<Clock size={15} />} action={<span className="small-meta">ALERT + DENY ONLY</span>} flush>
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Time</th><th>Host</th><th>Event</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {relatedLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="small-meta" style={{ whiteSpace: "nowrap" }}>{formatDateTime(log.timestamp)}</td>
                      <td className="mono" style={{ fontSize: 9 }}>{log.host}</td>
                      <td className="small">{log.event}</td>
                      <td><Badge tone={log.status === "alert" ? "high" : "medium"}>{log.status}</Badge></td>
                      <td><Link to={`/app/hunter/logs?focus=${log.id}`} className="btn ghost sm">Inspect</Link></td>
                    </tr>
                  ))}
                  {relatedLogs.length === 0 && (
                    <tr><td colSpan={5}><div className="empty-inline">No alerting telemetry on the affected assets.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Response status" icon={<ShieldCheck size={15} />}>
            <div className="incident-status-flow">
              {WORKFLOW.map((step) => (
                <button
                  type="button"
                  className={`status-step${incident.status === step ? " active" : ""}`}
                  key={step}
                  onClick={() => setStatus(step)}
                >
                  {step}
                </button>
              ))}
            </div>
            <div className="drawer-section">
              <div className="label">Case owner</div>
              <select
                className="select"
                value={incident.assignee}
                onChange={(event) =>
                  dispatch({ type: "UPDATE_INCIDENT", id: incident.id, patch: { assignee: event.target.value } })
                }
              >
                <option value="Unassigned">Unassigned</option>
                {state.team.map((member) => (
                  <option key={member.id} value={member.name}>{member.name}</option>
                ))}
              </select>
            </div>
            <div className="drawer-section">
              <div className="label">Next action</div>
              <p className="small soft" style={{ lineHeight: 1.6 }}>{incident.nextAction}</p>
              {incident.status !== "contained" && incident.status !== "closed" && (
                <button type="button" className="btn success sm mt-10" onClick={() => setStatus("contained")}>
                  <CheckCircle2 /> Mark contained
                </button>
              )}
            </div>
            <div className="row wrap mt-12" style={{ gap: 6 }}>
              <button type="button" className="btn outline sm" onClick={generateReport}>
                <FileText /> Generate report
              </button>
              <Link to={`/app/hunter/timeline?q=${incident.id}`} className="btn ghost sm">
                <Clock /> Full timeline
              </Link>
            </div>
            {incident.status !== "closed" ? (
              <button type="button" className="btn danger block mt-12" onClick={() => setCloseOpen(true)}>
                <X /> Close case
              </button>
            ) : (
              <button type="button" className="btn outline block mt-12" onClick={() => setStatus("investigating")}>
                Reopen case
              </button>
            )}
          </Panel>

          <Panel
            title="Response playbooks"
            icon={<ShieldCheck size={15} />}
            action={<Badge tone={responseActions.some((action) => action.status === "pending") ? "high" : "neutral"}>{responseActions.filter((action) => action.status === "pending").length} pending</Badge>}
          >
            {responseError && (
              <div className="notice warning">
                <ShieldAlert />
                <div>{responseError}</div>
              </div>
            )}
            <form onSubmit={proposeContainment}>
              <div className="field">
                <label htmlFor="response-playbook">Playbook</label>
                <select
                  id="response-playbook"
                  className="select"
                  value={proposal.playbookId}
                  onChange={(event) => setProposal({ ...proposal, playbookId: event.target.value })}
                  disabled={!canPropose}
                >
                  {playbooks.map((playbook) => (
                    <option key={playbook.id} value={playbook.id}>{playbook.label}</option>
                  ))}
                </select>
              </div>
              <div className="field mt-10">
                <label htmlFor="response-target">Target</label>
                <input
                  id="response-target"
                  className="input"
                  value={proposal.target}
                  onChange={(event) => setProposal({ ...proposal, target: event.target.value })}
                  placeholder={
                    selectedPlaybook?.targetKind === "ip"
                      ? "203.0.113.10"
                      : selectedPlaybook?.targetKind === "host"
                        ? "ws-042"
                        : "user@northwind.io"
                  }
                  disabled={!canPropose}
                  style={{ fontFamily: "var(--mono)" }}
                />
              </div>
              <div className="field mt-10">
                <label htmlFor="response-rationale">Rationale</label>
                <textarea
                  id="response-rationale"
                  className="textarea"
                  rows={2}
                  value={proposal.rationale}
                  onChange={(event) => setProposal({ ...proposal, rationale: event.target.value })}
                  placeholder="What evidence supports this containment?"
                  disabled={!canPropose}
                />
              </div>
              <button type="submit" className="btn outline block mt-12" disabled={!canPropose || proposing || !playbooks.length}>
                <ShieldCheck /> {proposing ? "Queuing…" : "Propose containment"}
              </button>
            </form>

            {selectedPlaybook && (
              <p className="small muted mt-10" style={{ lineHeight: 1.55 }}>
                {selectedPlaybook.description} Impact: {selectedPlaybook.impact}.{" "}
                {selectedPlaybook.reversible ? "Reversible after execution." : "Irreversible once executed."}
              </p>
            )}

            <div className="drawer-section">
              <div className="label">Case response actions</div>
              {responseActions.length ? (
                <div className="stack-6">
                  {responseActions.slice(0, 6).map((action) => (
                    <div className="kv-row" key={action.id} style={{ alignItems: "flex-start" }}>
                      <span>
                        <span className="strong" style={{ fontSize: 10.5, display: "block" }}>{action.playbook?.label || action.playbookId}</span>
                        <span className="small-meta">{action.target} · {timeAgo(action.requestedAt)}</span>
                      </span>
                      <span className="row" style={{ gap: 5 }}>
                        <Badge tone={action.status === "executed" ? "success" : action.status === "pending" ? "high" : action.status === "rejected" ? "neutral" : "info"}>
                          {action.status}
                        </Badge>
                        {action.status === "pending" && isSuperAdmin && (
                          <>
                            <button
                              type="button"
                              className="btn success sm"
                              disabled={decidingId === action.id}
                              onClick={() => decideAction(action, "approve")}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn ghost sm"
                              disabled={decidingId === action.id}
                              onClick={() => decideAction(action, "reject")}
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="small dim">No response playbook has been proposed for this case.</div>
              )}
            </div>

            <div className="notice mt-12">
              <ShieldAlert />
              <div>
                Proposals never execute automatically. Only a Super Admin decision changes enforcement state, and every
                decision is written to the hash-chained audit log.
              </div>
            </div>
          </Panel>

          <Panel title="Case chronology" icon={<Clock size={15} />} action={<span className="small-meta">{timelineEvents.length} EVENTS</span>}>
            {timelineEvents.length ? (
              <div className="timeline">
                {timelineEvents.slice(-14).map((event) => (
                  <div className="timeline-event" key={event.key}>
                    <span className={`timeline-dot ${event.tone}`} />
                    <div className="timeline-event-body">
                      <div className="timeline-event-title">
                        {event.to ? <Link to={event.to} style={{ color: "inherit" }}>{event.title}</Link> : event.title}
                      </div>
                      <div className="timeline-event-meta">
                        {event.meta.filter(Boolean).map((item, index) => (
                          <React.Fragment key={`${event.key}-${index}`}>
                            {index > 0 && <span>·</span>}
                            <span>{item}</span>
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="small-meta mt-6">{formatDateTime(event.at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-inline">No chronology recorded.</div>
            )}
            {timelineEvents.length > 14 && (
              <div className="panel-footer" style={{ margin: "12px -16px -16px", padding: "10px 16px" }}>
                <Link to={`/app/hunter/timeline?q=${incident.id}`} className="link small">See the full event stream <ArrowRight size={12} /></Link>
              </div>
            )}
          </Panel>

          <Panel title="Affected assets" icon={<ShieldCheck size={15} />} flush>
            {affectedAssets.length ? (
              <div style={{ padding: "4px 16px" }}>
                {affectedAssets.map((asset) => (
                  <Link to={`/app/twin/builder?asset=${asset.id}`} className="link-row" key={asset.id} style={{ textDecoration: "none" }}>
                    <span>
                      <span className="mono" style={{ fontSize: 9, color: "var(--text-soft)" }}>{asset.name}</span>
                      <span className="small-meta" style={{ display: "block", marginTop: 3 }}>{asset.label} · {asset.ip}</span>
                    </span>
                    <span className="v">risk {assetRisk(asset)} <ChevronRight size={10} /></span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty-inline">No twin assets linked to this case.</div>
            )}
          </Panel>

          <Panel title="Case tags" icon={<User size={15} />}>
            <div className="chip-list">
              {(incident.tags || []).length ? (
                incident.tags.map((tag) => <span className="tag violet" key={tag}>{tag}</span>)
              ) : (
                <span className="small dim">No tags recorded.</span>
              )}
            </div>
            <div className="notice mt-12">
              <ShieldCheck />
              <div>Case metadata is retained with the evidence chain. Closing a case does not delete its records.</div>
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={evidenceOpen}
        title="Add evidence to this case"
        subtitle={`${incident.id} · ${incident.title}`}
        onClose={() => setEvidenceOpen(false)}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setEvidenceOpen(false)}>
              <X /> Cancel
            </button>
            <button type="button" className="btn violet" onClick={addEvidence}>
              <ShieldCheck /> Seal evidence
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="evidence-file">Select a file</label>
            <input id="evidence-file" className="input" type="file" onChange={onEvidenceFile} style={{ paddingTop: 7 }} />
            <div className="small-meta">Demo only · the file is hashed and recorded, not uploaded.</div>
          </div>
          <div className="field">
            <label htmlFor="evidence-name">Evidence name</label>
            <input
              id="evidence-name"
              className="input"
              value={evidenceForm.name}
              onChange={(event) => { setEvidenceForm({ ...evidenceForm, name: event.target.value }); setEvidenceError(""); }}
              placeholder="e.g. ws-042_memory.raw.gz"
            />
          </div>
          <div className="field">
            <label htmlFor="evidence-type">Type</label>
            <select
              id="evidence-type"
              className="select"
              value={evidenceForm.type}
              onChange={(event) => setEvidenceForm({ ...evidenceForm, type: event.target.value })}
            >
              {EVIDENCE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="evidence-size">Size</label>
            <input
              id="evidence-size"
              className="input"
              value={evidenceForm.size}
              onChange={(event) => setEvidenceForm({ ...evidenceForm, size: event.target.value })}
              placeholder="18.2 MB"
            />
          </div>
          <div className="field">
            <label htmlFor="evidence-hash">SHA-256</label>
            <input
              id="evidence-hash"
              className="input"
              value={evidenceForm.hash}
              onChange={(event) => setEvidenceForm({ ...evidenceForm, hash: event.target.value })}
              placeholder="Generated on seal if blank"
            />
          </div>
        </div>
        {evidenceError && <div className="form-error mt-12">{evidenceError}</div>}
        <div className="notice mt-12">
          <Archive />
          <div>HUNTER records the uploader, timestamp and digest in an append-only chain of custody.</div>
        </div>
      </Modal>

      <ConfirmDialog
        open={closeOpen}
        title={`Close ${incident.id}?`}
        message="Closing preserves the case, detections and evidence. You can reopen it if new telemetry arrives."
        confirmLabel="Close case"
        tone="danger"
        onConfirm={() => setStatus("closed")}
        onClose={() => setCloseOpen(false)}
      />
    </div>
  );
}
