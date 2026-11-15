import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  User,
  X,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  EmptyState,
  Modal,
  PageHeader,
  Panel,
  SeverityBadge,
  StatCard,
  StatusBadge,
  UserAvatar,
} from "../../components/ui";
import { severityRank } from "../../lib/engine";
import { downloadFile, timeAgo, toCsv } from "../../lib/format";
import { api } from "../../lib/api";

const STATUS_FILTERS = ["all", "open", "investigating", "contained", "closed"];
const SEVERITIES = ["critical", "high", "medium", "low"];
const WORKFLOW = [
  { status: "open", label: "Open", detail: "Triage the linked detections and assign an owner." },
  { status: "investigating", label: "Investigating", detail: "Preserve evidence and reconstruct the event chain." },
  { status: "contained", label: "Contained", detail: "Stop the spread, revoke access and verify the fix." },
  { status: "closed", label: "Closed", detail: "Record the disposition and tune the detection." },
];

const emptyForm = () => ({
  title: "",
  severity: "high",
  assignee: "",
  summary: "",
  tags: "",
});

export default function Incidents() {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [responseActions, setResponseActions] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [responseError, setResponseError] = useState("");
  const [decidingId, setDecidingId] = useState("");
  const isSuperAdmin = state.user?.roleKey === "super_admin";

  const loadResponse = useCallback(async () => {
    try {
      const result = await api.responseActions({ limit: 50 });
      setResponseActions(result.actions || []);
      setBlocks(result.blocks || []);
      setResponseError("");
    } catch (requestError) {
      setResponseError(requestError?.message || "Response actions are unavailable.");
    }
  }, []);

  useEffect(() => {
    loadResponse();
  }, [loadResponse]);

  const decide = async (action, decision) => {
    setDecidingId(action.id);
    try {
      const result = await api.decideResponseAction(
        action.id,
        decision,
        decision === "approve" ? "Approved from the incident queue." : "Rejected from the incident queue."
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
      if (decision === "approve" && result.action?.status === "executed" && result.action?.playbookId === "block-ip") {
        setBlocks((current) =>
          current.some((block) => block.value === result.action.target)
            ? current
            : [
                { id: result.action.id, kind: "ip", value: result.action.target, createdAt: new Date().toISOString() },
                ...current,
              ]
        );
      }
      loadResponse();
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

  const pendingActions = responseActions.filter((action) => action.status === "pending");

  const filtered = useMemo(
    () =>
      [...state.incidents]
        .filter((incident) => {
          const matchesQuery = `${incident.id} ${incident.title} ${incident.summary} ${incident.assignee} ${(incident.tags || []).join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase());
          return (
            matchesQuery &&
            (status === "all" || incident.status === status) &&
            (severity === "all" || incident.severity === severity)
          );
        })
        .sort((a, b) => {
          if (a.status === "closed" && b.status !== "closed") return 1;
          if (b.status === "closed" && a.status !== "closed") return -1;
          if (a.status === "open" && b.status !== "open") return -1;
          if (b.status === "open" && a.status !== "open") return 1;
          const bySeverity = severityRank(a.severity) - severityRank(b.severity);
          if (bySeverity !== 0) return bySeverity;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }),
    [state.incidents, query, status, severity]
  );

  const active = state.incidents.filter((incident) => incident.status !== "closed");
  const criticalOpen = active.filter((incident) => incident.severity === "critical").length;
  const waiting = active.filter((incident) => incident.status === "open").length;
  const contained = state.incidents.filter((incident) => incident.status === "contained").length;

  const openNew = () => {
    setForm({ ...emptyForm(), assignee: state.user?.name || "Unassigned" });
    setError("");
    setModalOpen(true);
  };

  const submit = () => {
    if (!form.title.trim()) {
      setError("Give the incident a short, specific title.");
      return;
    }
    dispatch({
      type: "ADD_INCIDENT",
      incident: {
        title: form.title.trim(),
        severity: form.severity,
        assignee: form.assignee || "Unassigned",
        summary:
          form.summary.trim() ||
          "Manually opened from the incident queue. Triage the source telemetry and link supporting evidence.",
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim().toLowerCase().replaceAll(" ", "-"))
          .filter(Boolean),
      },
    });
    setModalOpen(false);
    setForm(emptyForm());
  };

  const exportCsv = () => {
    const csv = toCsv(filtered, [
      { label: "Incident", value: (incident) => incident.id },
      { label: "Title", value: (incident) => incident.title },
      { label: "Severity", value: (incident) => incident.severity },
      { label: "Status", value: (incident) => incident.status },
      { label: "Assignee", value: (incident) => incident.assignee },
      { label: "Detections", value: (incident) => incident.detectionIds.length },
      { label: "Updated", value: (incident) => incident.updatedAt },
    ]);
    downloadFile(`hunter_incidents_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Cases exported", message: `${filtered.length} incident records written to CSV.`, tone: "success" },
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · HUNTER AI`}
        title="Every case has an owner, a clock and a next action."
        subtitle="Incidents are where detections become decisions. Move a case through response, preserve the evidence and leave a defensible record of what happened."
        actions={
          <>
            <button type="button" className="btn outline" onClick={exportCsv}>
              <Download /> Export cases
            </button>
            <button type="button" className="btn danger" onClick={openNew}>
              <Plus /> New incident
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Active cases" value={active.length} icon={<Siren />} tone="critical" foot={`${waiting} awaiting first response`} />
        <StatCard label="Critical open" value={criticalOpen} icon={<ShieldAlert />} tone="high" foot="Highest severity still in flight" />
        <StatCard label="Contained" value={contained} icon={<CheckCircle2 />} tone="success" foot="Threat stopped · verification outstanding" />
        <StatCard label="Closed lifetime" value={state.incidents.filter((incident) => incident.status === "closed").length} icon={<Archive />} tone="info" foot="Disposition recorded with evidence" />
      </div>

      <Panel
        className="mt-12"
        title="Pending response approvals"
        icon={<ShieldCheck size={15} />}
        action={
          <div className="row" style={{ gap: 6 }}>
            <Badge tone={pendingActions.length ? "high" : "success"}>{pendingActions.length} pending</Badge>
            <button type="button" className="btn ghost sm" onClick={loadResponse}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        }
        flush
      >
        {responseError && (
          <div className="notice warning" style={{ margin: 16 }}>
            <ShieldAlert />
            <div>{responseError}</div>
          </div>
        )}
        {pendingActions.length > 0 ? (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Playbook</th>
                  <th>Target</th>
                  <th>Requested by</th>
                  <th>Rationale</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pendingActions.map((action) => (
                  <tr key={action.id}>
                    <td>
                      <div className="strong" style={{ fontSize: 13 }}>{action.playbook?.label || action.playbookId}</div>
                      <div className="small-meta mt-6">{action.id} · {action.playbook?.impact || "impact unknown"}</div>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{action.target}</td>
                    <td className="small">
                      {action.requestedBy}
                      <div className="small-meta mt-6">{timeAgo(action.requestedAt)}</div>
                    </td>
                    <td className="small muted" style={{ maxWidth: 330 }}>{action.rationale}</td>
                    <td>
                      <Badge tone={action.automated ? "violet" : "neutral"}>{action.automated ? "automation" : "analyst"}</Badge>
                    </td>
                    <td>
                      {isSuperAdmin ? (
                        <div className="row" style={{ gap: 5 }}>
                          <button
                            type="button"
                            className="btn success sm"
                            disabled={decidingId === action.id}
                            onClick={() => decide(action, "approve")}
                          >
                            <CheckCircle2 size={12} /> Approve
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={decidingId === action.id}
                            onClick={() => decide(action, "reject")}
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="small-meta">SUPER ADMIN APPROVAL REQUIRED</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-inline">
            No response action is waiting for approval. Analysts can propose containment from a case; automation only
            queues proposals and never executes a playbook.
          </div>
        )}
        {blocks.length > 0 && (
          <div className="panel-footer">
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="small-meta">ACTIVE BLOCKS</span>
              {blocks.slice(0, 8).map((block) => (
                <span className="tag" key={`${block.kind}-${block.value}`}>{block.kind} · {block.value}</span>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel
        className="mt-12"
        title="Case queue"
        icon={<Siren size={15} />}
        action={<span className="small-meta">{filtered.length} OF {state.incidents.length} CASES</span>}
        flush
      >
        <div className="filters-bar">
          <div className="input-icon search" style={{ maxWidth: 300 }}>
            <Search />
            <input
              className="input"
              placeholder="Search cases, IDs, tags or owners…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="chip-row">
            {STATUS_FILTERS.map((item) => (
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
          <select className="select" style={{ width: 150 }} value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="all">All severity</option>
            {SEVERITIES.map((item) => (
              <option key={item} value={item} style={{ textTransform: "capitalize" }}>{item}</option>
            ))}
          </select>
        </div>

        <div style={{ padding: 14 }}>
          {filtered.length > 0 ? (
            <div className="incident-grid">
              {filtered.map((incident) => {
                const evidence = state.evidence.filter((item) => item.incidentId === incident.id);
                return (
                  <article className="panel incident-card" key={incident.id}>
                    <div className="incident-top">
                      <div className="row wrap" style={{ gap: 6 }}>
                        <SeverityBadge severity={incident.severity} />
                        <Badge tone="neutral">{incident.detectionIds.length} detection{incident.detectionIds.length === 1 ? "" : "s"}</Badge>
                      </div>
                      <StatusBadge status={incident.status} />
                    </div>

                    <div className="incident-id mt-8">
                      {incident.id} · UPDATED {timeAgo(incident.updatedAt).toUpperCase()}
                    </div>
                    <div className="incident-title">
                      <Link to={`/app/hunter/incidents/${incident.id}`} style={{ color: "inherit" }}>{incident.title}</Link>
                    </div>
                    <p className="incident-summary">{incident.summary}</p>

                    {incident.tags?.length > 0 && (
                      <div className="chip-list mt-10">
                        {incident.tags.map((tag) => (
                          <span className="tag" key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}

                    <div className="incident-foot">
                      <span className="user-inline">
                        <UserAvatar name={incident.assignee} size="sm" />
                        {incident.assignee}
                      </span>
                      <span>{evidence.length} evidence · {incident.detectionIds.length} detections</span>
                    </div>

                    <div className="row between mt-10" style={{ gap: 8 }}>
                      <span className="small-meta" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={incident.nextAction}>
                        NEXT · {incident.nextAction}
                      </span>
                      <div className="row" style={{ gap: 5 }}>
                        {["open", "investigating"].includes(incident.status) && (
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => dispatch({ type: "UPDATE_INCIDENT", id: incident.id, patch: { status: "contained" } })}
                          >
                            Contain
                          </button>
                        )}
                        <Link to={`/app/hunter/incidents/${incident.id}`} className="btn outline sm">
                          Open case <ArrowRight size={12} />
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Filter size={24} />}
              title="No cases match these filters."
              detail="Try a different status, severity or search term."
              action={
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={() => { setStatus("all"); setSeverity("all"); setQuery(""); }}
                >
                  Reset filters
                </button>
              }
            />
          )}
        </div>
      </Panel>

      <Panel
        className="mt-12"
        title="Response workflow"
        icon={<Clock size={15} />}
        action={<Link to="/app/hunter/timeline" className="btn ghost sm">Open command timeline <ArrowRight size={12} /></Link>}
      >
        <div className="grid-3">
          {WORKFLOW.map((step, index) => (
            <div className="row" style={{ alignItems: "flex-start", gap: 10 }} key={step.status}>
              <span className="circle-number">0{index + 1}</span>
              <div>
                <div className="strong" style={{ fontSize: 12 }}>{step.label}</div>
                <p className="small muted mt-6" style={{ lineHeight: 1.55 }}>{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Modal
        open={modalOpen}
        title="Open a new incident"
        subtitle="Manual cases still need an owner, a severity and a next action."
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setModalOpen(false)}>
              <X /> Cancel
            </button>
            <button type="button" className="btn danger" onClick={submit}>
              <Plus /> Open incident
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="incident-title">Title</label>
            <input
              id="incident-title"
              className="input"
              value={form.title}
              onChange={(event) => { setForm({ ...form, title: event.target.value }); setError(""); }}
              placeholder="e.g. Suspicious token replay on partner API"
            />
          </div>
          <div className="field">
            <label htmlFor="incident-severity">Severity</label>
            <select
              id="incident-severity"
              className="select"
              value={form.severity}
              onChange={(event) => setForm({ ...form, severity: event.target.value })}
            >
              {SEVERITIES.map((item) => (
                <option key={item} value={item} style={{ textTransform: "capitalize" }}>{item}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="incident-assignee">Owner</label>
            <select
              id="incident-assignee"
              className="select"
              value={form.assignee}
              onChange={(event) => setForm({ ...form, assignee: event.target.value })}
            >
              <option value="Unassigned">Unassigned</option>
              {state.team.map((member) => (
                <option key={member.id} value={member.name}>{member.name}</option>
              ))}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="incident-summary">What happened?</label>
            <textarea
              id="incident-summary"
              className="textarea"
              rows={4}
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
              placeholder="Summarise the signal, affected asset and immediate risk."
            />
          </div>
          <div className="field span-2">
            <label htmlFor="incident-tags">Tags</label>
            <input
              id="incident-tags"
              className="input"
              value={form.tags}
              onChange={(event) => setForm({ ...form, tags: event.target.value })}
              placeholder="identity, cloud, suspected-phishing"
            />
          </div>
        </div>
        {error && <div className="form-error mt-12">{error}</div>}
        <div className="notice mt-12">
          <User />
          <div>The case starts as <strong className="soft">open</strong>. Link detections and seal evidence from the case detail page.</div>
        </div>
      </Modal>
    </div>
  );
}
