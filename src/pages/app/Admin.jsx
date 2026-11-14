import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Archive,
  Brain,
  Building2,
  CheckCircle2,
  ChevronRight,
  Crown,
  Database,
  Download,
  FileText,
  Gauge,
  Globe,
  KeyRound,
  Lock,
  Network,
  Play,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  Siren,
  Sparkles,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  ConfirmDialog,
  Notice,
  PageHeader,
  Panel,
  StatCard,
  UserAvatar,
} from "../../components/ui";
import { downloadFile, formatDateTime, timeAgo, toCsv } from "../../lib/format";
import { api } from "../../lib/api";

const FEATURE_FLAGS = [
  {
    id: "simulations",
    label: "Digital twin simulations",
    detail: "Allow scenario execution against authorised twin models.",
    icon: Play,
  },
  {
    id: "hunter",
    label: "HUNTER AI detections",
    detail: "Run rule, statistical and behavioural detection pipelines.",
    icon: Brain,
  },
  {
    id: "selfHealing",
    label: "Self-healing controls",
    detail: "Let analysts apply controls and re-run paths to validate risk movement.",
    icon: Wrench,
  },
  {
    id: "fingerprints",
    label: "Behavioural fingerprints",
    detail: "Cluster actor timing, tooling and infrastructure signals.",
    icon: FingerprintIcon,
  },
  {
    id: "evidenceVault",
    label: "Sealed evidence vault",
    detail: "Allow hash verification and immutable chain-of-custody records.",
    icon: Archive,
  },
  {
    id: "multiWorkspace",
    label: "Multi-workspace administration",
    detail: "Enterprise entitlement for separate business units and clients.",
    icon: Globe,
  },
];

function FingerprintIcon(props) {
  return <Sparkles {...props} />;
}

const SERVICES = [
  { name: "API gateway", region: "eu-west-1", latency: "38 ms", status: "Operational" },
  { name: "Twin graph store", region: "eu-west-1", latency: "12 ms", status: "Operational" },
  { name: "Scenario engine", region: "eu-west-1", latency: "61 ms", status: "Operational" },
  { name: "HUNTER inference", region: "eu-central-1", latency: "84 ms", status: "Operational" },
  { name: "Evidence vault", region: "eu-west-1", latency: "44 ms", status: "Operational" },
  { name: "Report renderer", region: "eu-west-1", latency: "103 ms", status: "Degraded" },
  { name: "Notification worker", region: "eu-west-1", latency: "21 ms", status: "Operational" },
];

export default function Admin() {
  const { state, dispatch, risk, resetWorkspace } = useApp();
  const [flags, setFlags] = useState({
    simulations: true,
    hunter: true,
    selfHealing: true,
    fingerprints: true,
    evidenceVault: true,
    multiWorkspace: false,
  });
  const [tab, setTab] = useState("overview");
  const [resetOpen, setResetOpen] = useState(false);
  const [auditData, setAuditData] = useState({ events: [], verified: null, checked: 0, truncated: false });
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");

  const isAdmin = state.user?.role === "Super Admin";
  const activeMembers = state.team.filter((member) => member.status === "active").length;
  const operationalServices = SERVICES.filter((service) => service.status === "Operational").length;

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    setAuditLoading(true);
    setAuditError("");
    api
      .audit({ limit: 100 })
      .then((data) => {
        if (!cancelled) setAuditData(data);
      })
      .catch((error) => {
        if (!cancelled) setAuditError(error?.message || "Could not load the server audit trail.");
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch when the audit tab is opened so operators see fresh events.
  }, [isAdmin, tab]);

  const auditRows = useMemo(
    () =>
      (auditData.events || []).map((event) => ({
        id: event.id,
        time: event.created_at,
        type: event.action,
        detail: event.detail || "—",
        ip: event.ip || "unknown",
        hash: event.entry_hash || "",
      })),
    [auditData.events]
  );

  const exportAudit = () => {
    downloadFile(
      "northwind-admin-audit.csv",
      toCsv(auditRows, [
        { label: "Timestamp", value: (row) => row.time },
        { label: "Action", value: (row) => row.type },
        { label: "Detail", value: (row) => row.detail },
        { label: "Source IP", value: (row) => row.ip },
        { label: "Entry hash", value: (row) => row.hash },
      ]),
      "text/csv"
    );
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Audit log exported", message: `${auditRows.length} server events written to CSV.`, tone: "success" },
    });
  };

  const runMaintenance = (label) => {
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: label, message: "Control-plane task completed against the demo workspace.", tone: "success" },
    });
  };

  if (!isAdmin) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Shared · Super Admin"
          title="Control plane access"
          subtitle="This area is limited to workspace Super Admins."
        />
        <Panel>
          <div className="empty-state" style={{ padding: "60px 20px" }}>
            <Lock size={30} />
            <div className="strong">Your role does not include Super Admin access.</div>
            <div className="small">
              Signed in as {state.user?.name} · {state.user?.role}. An owner can change your role from Organization Workspace.
            </div>
            <Link to="/app/workspace" className="btn outline sm mt-12"><Users /> Open organization workspace</Link>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Shared · Super Admin"
        title="Control plane"
        subtitle="Workspace administration, feature entitlements, service health and the audit trail. This demo exposes the controls without connecting to external infrastructure."
        actions={
          <>
            <button type="button" className="btn outline" onClick={exportAudit}><Download /> Export audit log</button>
            <button
              type="button"
              className="btn primary"
              onClick={() => dispatch({ type: "SYNC_TWIN" })}
            >
              <RefreshCw /> Synchronise services
            </button>
          </>
        }
      />

      <div className="row wrap between mb-16" style={{ gap: 12 }}>
        <div className="tabs" style={{ flex: 1, minWidth: 260 }}>
          {[
            ["overview", "Overview", Gauge],
            ["features", "Feature entitlements", Settings2],
            ["team", "Access control", Users],
            ["audit", "Audit trail", FileText],
            ["system", "System health", Server],
          ].map(([id, label, Icon]) => (
            <button type="button" key={id} className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <Badge tone="success"><CheckCircle2 size={10} /> {operationalServices}/{SERVICES.length} services healthy</Badge>
      </div>

      {tab === "overview" && (
        <>
          <div className="stat-grid">
            <StatCard label="Workspace members" value={state.team.length} icon={<Users />} tone="violet" foot={`${activeMembers} active · ${state.team.length - activeMembers} invited`} />
            <StatCard label="Twin assets" value={state.assets.length} icon={<Network />} tone="info" foot={`${state.edges.length} approved links`} />
            <StatCard label="Detection events" value={state.logs.length} icon={<ShieldCheck />} tone="success" foot={`${state.detections.length} correlated detections`} />
            <StatCard label="Workspace risk" value={risk.score} unit="/ 100" icon={<Gauge />} tone="high" foot={`${risk.coverage}% control coverage`} />
          </div>

          <div className="content-grid split-2-1">
            <Panel title="Workspace overview" icon={<Building2 size={15} />}>
              <div className="row" style={{ alignItems: "flex-start", gap: 15, flexWrap: "wrap" }}>
                <span className="fp-avatar" style={{ width: 48, height: 48 }}>{state.org.name.slice(0, 2).toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <h2 style={{ fontSize: 18 }}>{state.org.name}</h2>
                    <Badge tone="violet"><Crown size={10} /> {state.org.plan}</Badge>
                    <Badge tone="success">Active</Badge>
                  </div>
                  <div className="small muted mt-6">{state.org.domain} · {state.org.industry} · {state.org.region}</div>
                  <div className="small-meta mt-8">Workspace ID northwind-{state.org.domain.split(".")[0]} · Created 18 Mar 2024</div>
                </div>
              </div>
              <div className="mini-stat-row mt-20">
                <div className="mini-stat"><div className="k">Simulations</div><div className="v">{state.runs.length}</div></div>
                <div className="mini-stat"><div className="k">Incidents</div><div className="v">{state.incidents.length}</div></div>
                <div className="mini-stat"><div className="k">Evidence</div><div className="v">{state.evidence.length}</div></div>
                <div className="mini-stat"><div className="k">Reports</div><div className="v">{state.reports.length}</div></div>
              </div>
              <div className="row wrap mt-16" style={{ gap: 8 }}>
                <Link to="/app/workspace" className="btn outline sm"><Users /> Manage team</Link>
                <Link to="/app/subscription" className="btn ghost sm"><Crown /> Subscription</Link>
                <Link to="/app/settings" className="btn ghost sm"><Settings2 /> Workspace settings</Link>
              </div>
            </Panel>

            <Panel title="Control plane checklist" icon={<ShieldCheck size={15} />}>
              {[
                ["MFA enforced", false],
                ["SAML SSO enforced", false],
                ["Audit hash chain verified", auditData.verified === true],
                ["IP allowlist configured", Boolean(state.security?.ipAllowlist)],
                ["Session idle timeout active", Boolean(state.security?.sessionTimeoutMinutes)],
                ["No open critical incidents", !state.incidents.some((incident) => incident.severity === "critical" && incident.status !== "closed")],
                ["Audit export available", auditRows.length > 0],
              ].map(([label, done]) => (
                <div className="link-row" key={label}>
                  <span className="row" style={{ gap: 7 }}>
                    {done ? <CheckCircle2 size={13} className="green" /> : <AlertTriangle size={13} className="amber" />}
                    {label}
                  </span>
                  <span className={`badge ${done ? "success" : "medium"}`}>{done ? "PASS" : "REVIEW"}</span>
                </div>
              ))}
              <Notice tone="warning" className="mt-12">
                <AlertTriangle />
                <div>
                  MFA and SAML SSO are not implemented in this build. {state.incidents.filter((incident) => incident.status !== "closed").length} open
                  response task(s) remain.
                </div>
              </Notice>
            </Panel>
          </div>

          <div className="content-grid split-2-1">
            <Panel title="Recent admin activity" icon={<Activity size={15} />} flush>
              <div className="activity-list">
                {state.activity.slice(0, 6).map((item) => (
                  <div className="activity-item" key={item.id}>
                    <span className={`activity-icon ${item.tone || ""}`}><Activity /></span>
                    <div>
                      <div className="activity-text">{item.text}</div>
                      <div className="activity-meta"><span>{item.actor}</span><span>·</span><span>{timeAgo(item.at)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Workspace distribution" icon={<Crown size={15} />}>
              <div className="kv-list">
                {["Super Admin", "Security Analyst", "Twin Editor", "Read Only"].map((role) => (
                  <div className="kv-row" key={role}>
                    <span className="k">{role}</span>
                    <span className="v">{state.team.filter((member) => member.role === role).length} seat(s)</span>
                  </div>
                ))}
              </div>
              <hr className="divider" />
              <div className="kv-list">
                <div className="kv-row"><span className="k">Professional quota</span><span className="v">{state.runs.filter((run) => new Date(run.startedAt).getMonth() === new Date().getMonth()).length} / 25</span></div>
                <div className="kv-row"><span className="k">Evidence integrity</span><span className="v green">100%</span></div>
                <div className="kv-row"><span className="k">HUNTER confidence</span><span className="v">{Math.round((state.detections.reduce((sum, detection) => sum + detection.confidence, 0) / Math.max(1, state.detections.length)) * 100)}% mean</span></div>
              </div>
            </Panel>
          </div>
        </>
      )}

      {tab === "features" && (
        <div className="content-grid split-2-1">
          <Panel title="Feature entitlements" icon={<Settings2 size={15} />}>
            <p className="small muted">
              Toggle product capabilities for this workspace. Changes apply immediately to the demo UI and
              are not persisted after a page reload.
            </p>
            <div className="mt-12">
              {FEATURE_FLAGS.map((flag) => {
                const Icon = flag.icon;
                return (
                  <div className="settings-row" key={flag.id}>
                    <div className="row" style={{ gap: 11, alignItems: "flex-start" }}>
                      <span className="scenario-icon" style={{ marginTop: 1 }}><Icon /></span>
                      <div>
                        <div className="t">{flag.label}</div>
                        <div className="d">{flag.detail}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`toggle${flags[flag.id] ? " on" : ""}`}
                      onClick={() => {
                        setFlags({ ...flags, [flag.id]: !flags[flag.id] });
                        dispatch({
                          type: "PUSH_TOAST",
                          toast: {
                            title: `${flag.label} ${flags[flag.id] ? "disabled" : "enabled"}`,
                            message: "The entitlement change was applied locally.",
                            tone: flags[flag.id] ? "warning" : "success",
                          },
                        });
                      }}
                      aria-pressed={flags[flag.id]}
                      aria-label={`Toggle ${flag.label}`}
                    />
                  </div>
                );
              })}
            </div>
          </Panel>
          <div className="stack">
            <Panel title="Entitlement summary" icon={<ShieldCheck size={15} />}>
              <div className="kv-list">
                <div className="kv-row"><span className="k">Enabled</span><span className="v">{Object.values(flags).filter(Boolean).length} of {Object.keys(flags).length}</span></div>
                <div className="kv-row"><span className="k">Plan</span><span className="v">{state.org.plan}</span></div>
                <div className="kv-row"><span className="k">Multi-workspace</span><span className="v">{flags.multiWorkspace ? "Enabled" : "Enterprise only"}</span></div>
                <div className="kv-row"><span className="k">Scope</span><span className="v">Northwind Systems</span></div>
              </div>
              <Notice tone="info" className="mt-12">
                Entitlement changes are reversible and do not delete workspace data.
              </Notice>
            </Panel>
            <Panel title="Dangerous defaults" icon={<AlertTriangle size={15} />}>
              <p className="small muted">
                HUNTER detection and evidence sealing should remain enabled in any workspace used for
                investigations. Disabling them removes the supporting control narrative from reports.
              </p>
            </Panel>
          </div>
        </div>
      )}

      {tab === "team" && (
        <Panel title="Access control" icon={<Users size={15} />} flush>
          <div className="invite-banner" style={{ margin: 14 }}>
            <div>
              <div className="strong">Workspace membership</div>
              <div className="small muted mt-6">Roles are enforced across both systems. Only Super Admins can access this control plane.</div>
            </div>
            <Link to="/app/workspace" className="btn outline sm"><Users /> Invite from workspace</Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th><th>Last active</th></tr></thead>
              <tbody>
                {state.team.map((member) => (
                  <tr key={member.id}>
                    <td><div className="member-cell"><UserAvatar name={member.name} /><div className="member-name">{member.name}</div></div></td>
                    <td className="small-meta">{member.email}</td>
                    <td>
                      <select
                        className="select"
                        style={{ width: 155, height: 30, fontSize: 11 }}
                        value={member.role}
                        onChange={(event) => dispatch({ type: "UPDATE_MEMBER", id: member.id, patch: { role: event.target.value } })}
                      >
                        {["Super Admin", "Security Analyst", "Twin Editor", "Read Only"].map((role) => <option key={role}>{role}</option>)}
                      </select>
                    </td>
                    <td><Badge tone={member.status === "active" ? "success" : "medium"}>{member.status}</Badge></td>
                    <td className="small-meta">{member.lastActive ? timeAgo(member.lastActive) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === "audit" && (
        <Panel
          title="Server audit trail"
          icon={<FileText size={15} />}
          action={<button type="button" className="btn outline sm" onClick={exportAudit} disabled={auditLoading}><Download /> Export CSV</button>}
          flush
        >
          {auditError && <Notice tone="danger">{auditError}</Notice>}
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Timestamp</th><th>Action</th><th>Detail</th><th>Source IP</th></tr></thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr key={row.id}>
                    <td className="small-meta nowrap">{formatDateTime(row.time)}</td>
                    <td>
                      <Badge tone={row.type.includes("failed") || row.type.includes("blocked") ? "danger" : row.type.includes("plan") || row.type.includes("security") ? "violet" : "neutral"}>
                        {row.type}
                      </Badge>
                    </td>
                    <td className="small">{row.detail}</td>
                    <td className="mono small-meta">{row.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-footer">
            <span className="small muted">
              {auditLoading
                ? "Loading server audit events…"
                : `${auditRows.length} most recent server events. Hash chain: ${auditData.verified ? "verified" : "not verified"} (${auditData.checked || 0} entries checked${auditData.truncated ? ", truncated" : ""}).`}
            </span>
          </div>
        </Panel>
      )}

      {tab === "system" && (
        <div className="content-grid split-2-1">
          <Panel title="Service health" icon={<Server size={15} />}>
            {SERVICES.map((service) => (
              <div className="server-status" key={service.name}>
                <span className={`dot`} style={{ color: service.status === "Operational" ? "var(--green)" : "var(--amber)" }} />
                <span className="soft">{service.name}</span>
                <span className="small-meta">{service.region}</span>
                <span className="v" style={{ color: service.status === "Operational" ? "var(--green)" : "var(--amber)" }}>
                  {service.latency} · {service.status}
                </span>
              </div>
            ))}
            <Notice tone="warning" className="mt-12">
              <AlertTriangle />
              <div>Report renderer is degraded in this simulation. Generated reports still render locally.</div>
            </Notice>
          </Panel>
          <div className="stack">
            <Panel title="Maintenance actions" icon={<Wrench size={15} />}>
              <div className="stack-6">
                <button type="button" className="btn outline block" onClick={() => runMaintenance("Twin index rebuilt")}><RefreshCw /> Rebuild twin index</button>
                <button type="button" className="btn outline block" onClick={() => runMaintenance("HUNTER normaliser re-run")}><Brain /> Re-run log normaliser</button>
                <button type="button" className="btn outline block" onClick={() => runMaintenance("Signing keys rotated")}><KeyRound /> Rotate evidence keys</button>
                <button type="button" className="btn outline block" onClick={() => runMaintenance("Storage cleanup completed")}><Database /> Prune expired storage</button>
              </div>
              <p className="small dim mt-12">Maintenance actions are simulated and record no external changes.</p>
            </Panel>
            <Panel title="Platform version" icon={<Sparkles size={15} />}>
              <div className="kv-list">
                <div className="kv-row"><span className="k">Twin engine</span><span className="v">v2.8.4</span></div>
                <div className="kv-row"><span className="k">HUNTER AI</span><span className="v">v4.1.0</span></div>
                <div className="kv-row"><span className="k">Normaliser</span><span className="v">v3.2.1</span></div>
                <div className="kv-row"><span className="k">Workspace schema</span><span className="v">2026.11</span></div>
                <div className="kv-row"><span className="k">Region</span><span className="v">{state.org.region}</span></div>
              </div>
              <Link to="/app/reports" className="btn outline block mt-12">Open reports <ChevronRight /></Link>
            </Panel>
          </div>
        </div>
      )}

      {tab === "overview" && (
        <div className="danger-zone mt-12">
          <div className="row between" style={{ gap: 16, flexWrap: "wrap" }}>
            <div>
              <h3>Re-seed the demonstration workspace</h3>
              <p>Restores every seeded asset, simulation, detection, incident, evidence object and setting. The current sign-in remains.</p>
            </div>
            <button type="button" className="btn danger" onClick={() => setResetOpen(true)}><Trash2 /> Reset demo</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        title="Re-seed the demonstration workspace?"
        message="All local changes will be replaced by the seeded Northwind Systems data. This is intended for demonstrations only."
        confirmLabel="Re-seed workspace"
        onConfirm={async () => {
          try {
            await resetWorkspace();
            dispatch({ type: "PUSH_TOAST", toast: { title: "Workspace re-seeded", message: "The demo data has been restored.", tone: "success" } });
          } catch (error) {
            dispatch({ type: "PUSH_TOAST", toast: { title: "Re-seed failed", message: error?.message || "The API did not reset the workspace.", tone: "danger" } });
          }
        }}
        onClose={() => setResetOpen(false)}
      />
    </div>
  );
}
