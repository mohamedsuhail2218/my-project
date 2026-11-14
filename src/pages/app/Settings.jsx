import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Building2,
  CheckCircle2,
  Copy,
  Database,
  Download,
  KeyRound,
  Lock,
  Mail,
  Save,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  ConfirmDialog,
  Notice,
  PageHeader,
  Panel,
  UserAvatar,
} from "../../components/ui";
import { downloadFile, timeAgo } from "../../lib/format";
import { api } from "../../lib/api";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "security", label: "Security & access", icon: ShieldCheck },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data", label: "Data & privacy", icon: Database },
];

function ToggleRow({ title, detail, checked, onChange }) {
  return (
    <div className="settings-row">
      <div>
        <div className="t">{title}</div>
        <div className="d">{detail}</div>
      </div>
      <button
        type="button"
        className={`toggle${checked ? " on" : ""}`}
        onClick={onChange}
        aria-pressed={checked}
        aria-label={`Toggle ${title}`}
      />
    </div>
  );
}

export default function Settings() {
  const { state, dispatch, updateProfile, updateSecurityPolicy, resetWorkspace } = useApp();
  const [section, setSection] = useState("profile");
  const [resetOpen, setResetOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [profile, setProfile] = useState({
    name: state.user?.name || "",
    email: state.user?.email || "",
    title: state.user?.title || "",
  });
  const [org, setOrg] = useState(state.org);
  const [security, setSecurity] = useState({
    sessionTimeoutMinutes:
      state.security?.sessionTimeoutMinutes || state.settings.sessionTimeoutMinutes || 480,
    ipAllowlist: state.security?.ipAllowlist || state.settings.ipAllowlist || "",
  });
  const [ingestTokens, setIngestTokens] = useState([]);
  const [tokenLabel, setTokenLabel] = useState("Log shipper");
  const [newToken, setNewToken] = useState(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const isSuperAdmin = state.user?.roleKey === "super_admin";

  useEffect(() => {
    if (section !== "security" || !isSuperAdmin) return;
    let active = true;
    api
      .telemetryTokens()
      .then((result) => {
        if (active) {
          setIngestTokens(result.tokens || []);
          setTokenError("");
        }
      })
      .catch((requestError) => {
        if (active) setTokenError(requestError?.message || "Ingestion tokens are unavailable.");
      });
    return () => {
      active = false;
    };
  }, [section, isSuperAdmin]);

  useEffect(() => {
    setSecurity({
      sessionTimeoutMinutes:
        state.security?.sessionTimeoutMinutes || state.settings.sessionTimeoutMinutes || 480,
      ipAllowlist: state.security?.ipAllowlist || state.settings.ipAllowlist || "",
    });
  }, [
    state.security?.sessionTimeoutMinutes,
    state.security?.ipAllowlist,
    state.settings.sessionTimeoutMinutes,
    state.settings.ipAllowlist,
  ]);

  useEffect(() => {
    setProfile({
      name: state.user?.name || "",
      email: state.user?.email || "",
      title: state.user?.title || "",
    });
  }, [state.user?.name, state.user?.email, state.user?.title]);

  const createToken = async () => {
    setTokenBusy(true);
    setTokenError("");
    try {
      const result = await api.createTelemetryToken(tokenLabel.trim() || "Log shipper");
      setNewToken(result.token);
      const listed = await api.telemetryTokens();
      setIngestTokens(listed.tokens || []);
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Ingestion token created",
          message: "Copy it now. The token is stored as a hash and cannot be shown again.",
          tone: "success",
        },
      });
    } catch (requestError) {
      setTokenError(requestError?.message || "The token could not be created.");
    } finally {
      setTokenBusy(false);
    }
  };

  const revokeToken = async (tokenId) => {
    setTokenBusy(true);
    setTokenError("");
    try {
      await api.revokeTelemetryToken(tokenId);
      const listed = await api.telemetryTokens();
      setIngestTokens(listed.tokens || []);
      dispatch({
        type: "PUSH_TOAST",
        toast: { title: "Token revoked", message: "The shipper can no longer authenticate.", tone: "warning" },
      });
    } catch (requestError) {
      setTokenError(requestError?.message || "The token could not be revoked.");
    } finally {
      setTokenBusy(false);
    }
  };

  const copyToken = async (token) => {
    try {
      await navigator.clipboard.writeText(token);
      dispatch({
        type: "PUSH_TOAST",
        toast: { title: "Token copied", message: "Store it in your secret manager now.", tone: "success" },
      });
    } catch {
      dispatch({
        type: "PUSH_TOAST",
        toast: { title: "Clipboard unavailable", message: "Select the token and copy it manually.", tone: "warning" },
      });
    }
  };

  const usage = useMemo(() => {
    const currentMonth = new Date().getMonth();
    return {
      runs: state.runs.filter((run) => new Date(run.startedAt).getMonth() === currentMonth).length,
      assets: state.assets.length,
      seats: state.team.length,
    };
  }, [state.runs, state.assets.length, state.team.length]);

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!profile.name.trim()) {
      dispatch({
        type: "PUSH_TOAST",
        toast: { title: "Check the form", message: "A name is required.", tone: "warning" },
      });
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile({ name: profile.name.trim(), title: profile.title.trim() });
      dispatch({
        type: "PUSH_TOAST",
        toast: { title: "Profile saved", message: "Your workspace identity has been updated.", tone: "success" },
      });
    } catch (error) {
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Could not save profile",
          message: error?.message || "The API did not accept the update.",
          tone: "danger",
        },
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveWorkspace = (event) => {
    event.preventDefault();
    const { plan: _plan, seats: _seats, trialEnds: _trialEnds, ...editableOrg } = org;
    dispatch({ type: "UPDATE_ORG", patch: editableOrg });
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Workspace saved", message: "Organization details are up to date.", tone: "success" },
    });
  };

  const saveSecurity = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin) {
      dispatch({
        type: "PUSH_TOAST",
        toast: { title: "Not permitted", message: "Only a Super Admin can change the security policy.", tone: "warning" },
      });
      return;
    }
    setSavingSecurity(true);
    try {
      await updateSecurityPolicy({
        sessionTimeoutMinutes: Number(security.sessionTimeoutMinutes),
        ipAllowlist: security.ipAllowlist,
      });
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Security policy saved",
          message: "Session idle timeout and IP allowlist are now enforced by the API.",
          tone: "success",
        },
      });
    } catch (error) {
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Could not save the policy",
          message: error?.message || "The API rejected the security policy.",
          tone: "danger",
        },
      });
    } finally {
      setSavingSecurity(false);
    }
  };

  const exportWorkspace = () => {
    const { toasts, ...persisted } = state;
    downloadFile(
      "northwind-workspace-export.json",
      JSON.stringify({ exportedAt: new Date().toISOString(), workspace: persisted }, null, 2),
      "application/json"
    );
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Workspace exported", message: "A local JSON snapshot was downloaded.", tone: "success" },
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Shared · Settings"
        title="Workspace settings"
        subtitle="Identity, access and notification preferences are shared across the digital twin and HUNTER AI. Security policy changes are enforced by the API."
        actions={<Badge tone="success"><CheckCircle2 size={11} /> Autosaved locally</Badge>}
      />

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={section === item.id ? "active" : ""}
                onClick={() => setSection(item.id)}
              >
                <Icon /> {item.label}
              </button>
            );
          })}
        </nav>

        <div className="stack">
          {section === "profile" && (
            <Panel
              title="Your profile"
              icon={<User size={15} />}
              action={<UserAvatar name={profile.name || "Analyst"} size="lg" />}
            >
              <form onSubmit={saveProfile}>
                <div className="form-grid">
                  <div className="field">
                    <label>Full name</label>
                    <input className="input" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
                  </div>
                  <div className="field">
                    <label>Work email</label>
                    <div className="input-icon">
                      <Mail />
                      <input className="input" type="email" value={profile.email} readOnly disabled />
                    </div>
                    <span className="hint">Email changes are managed by a workspace owner.</span>
                  </div>
                  <div className="field">
                    <label>Job title</label>
                    <input className="input" value={profile.title} onChange={(event) => setProfile({ ...profile, title: event.target.value })} placeholder="Security Engineering Lead" />
                  </div>
                  <div className="field">
                    <label>Role</label>
                    <input className="input" value={state.user?.role || "Analyst"} disabled />
                  </div>
                </div>
                <div className="notice mt-16">
                  <ShieldCheck />
                  <div>Role changes are managed by a workspace owner from Organization Workspace.</div>
                </div>
                <div className="form-actions">
                  <Link to="/app/workspace" className="btn outline">Manage team</Link>
                  <button type="submit" className="btn primary" disabled={savingProfile}>
                    <Save /> {savingProfile ? "Saving…" : "Save profile"}
                  </button>
                </div>
              </form>
            </Panel>
          )}

          {section === "workspace" && (
            <Panel title="Organization workspace" icon={<Building2 size={15} />}>
              <form onSubmit={saveWorkspace}>
                <div className="form-grid">
                  <div className="field">
                    <label>Organization name</label>
                    <input className="input" value={org.name} onChange={(event) => setOrg({ ...org, name: event.target.value })} />
                  </div>
                  <div className="field">
                    <label>Primary domain</label>
                    <input className="input" value={org.domain} onChange={(event) => setOrg({ ...org, domain: event.target.value })} />
                  </div>
                  <div className="field">
                    <label>Industry</label>
                    <input className="input" value={org.industry} onChange={(event) => setOrg({ ...org, industry: event.target.value })} />
                  </div>
                  <div className="field">
                    <label>Data region</label>
                    <select className="select" value={org.region} onChange={(event) => setOrg({ ...org, region: event.target.value })}>
                      <option>EU West</option>
                      <option>US East</option>
                      <option>AP South</option>
                      <option>India</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Seat limit</label>
                    <input className="input" type="number" value={state.org.seats} disabled />
                    <span className="hint">Seats are derived from the server-owned plan.</span>
                  </div>
                  <div className="field">
                    <label>Current plan</label>
                    <input className="input" value={state.org.plan} disabled />
                  </div>
                </div>
                <div className="form-actions">
                  <Link to="/app/subscription" className="btn outline">Manage subscription</Link>
                  <button type="submit" className="btn primary"><Save /> Save workspace</button>
                </div>
              </form>
            </Panel>
          )}

          {section === "security" && (
            <>
              <Panel title="Authentication & sessions" icon={<Lock size={15} />}>
                <form onSubmit={saveSecurity}>
                  {!isSuperAdmin && (
                    <Notice tone="warning">
                      Only a Super Admin can change the session and network policy for this workspace.
                    </Notice>
                  )}
                  <div className="settings-row">
                    <div>
                      <div className="t">Session idle timeout</div>
                      <div className="d">Sign members out after this period without activity. Enforced on every authenticated request.</div>
                    </div>
                    <select
                      className="select"
                      style={{ width: 150 }}
                      value={security.sessionTimeoutMinutes}
                      onChange={(event) => setSecurity({ ...security, sessionTimeoutMinutes: Number(event.target.value) })}
                      disabled={!isSuperAdmin}
                    >
                      <option value={60}>1 hour</option>
                      <option value={240}>4 hours</option>
                      <option value={480}>8 hours</option>
                      <option value={1440}>24 hours</option>
                    </select>
                  </div>
                  <div className="field mt-16">
                    <label>IP allowlist</label>
                    <textarea
                      className="textarea"
                      style={{ minHeight: 76 }}
                      value={security.ipAllowlist}
                      onChange={(event) => setSecurity({ ...security, ipAllowlist: event.target.value })}
                      placeholder="One CIDR range per line, e.g. 203.0.113.0/24"
                      disabled={!isSuperAdmin}
                    />
                    <div className="small dim">
                      Leave blank to allow any authenticated IP. The API validates every entry and enforces the list at
                      sign-in and on each session request. Your current address must remain allowed.
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn primary" disabled={!isSuperAdmin || savingSecurity}>
                      <Save /> {savingSecurity ? "Saving…" : "Save security policy"}
                    </button>
                  </div>
                </form>
                <div className="notice mt-16">
                  <ShieldCheck />
                  <div>
                    Password-only authentication is active. MFA and SAML SSO are not implemented in this build, so no
                    control claims they are enforced.
                  </div>
                </div>
              </Panel>

              {isSuperAdmin && (
                <Panel title="Telemetry ingestion tokens" icon={<KeyRound size={15} />}>
                  <p className="small muted" style={{ lineHeight: 1.6 }}>
                    Create a workspace-scoped bearer token for a log shipper. Tokens authenticate{" "}
                    <span className="mono">POST /api/telemetry/ingest</span>, are stored as SHA-256 hashes and can be
                    revoked at any time.
                  </p>
                  <div className="row mt-12" style={{ gap: 8 }}>
                    <input
                      className="input"
                      value={tokenLabel}
                      onChange={(event) => setTokenLabel(event.target.value)}
                      placeholder="Shipper label, e.g. edge-firewall"
                      aria-label="Ingestion token label"
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="btn outline" onClick={createToken} disabled={tokenBusy}>
                      <KeyRound /> {tokenBusy ? "Working…" : "Create token"}
                    </button>
                  </div>
                  {tokenError && <div className="form-error mt-12">{tokenError}</div>}
                  {newToken && (
                    <div className="notice mt-12">
                      <ShieldCheck />
                      <div>
                        <strong className="soft">Copy this token now — it will not be shown again.</strong>
                        <div className="mono mt-8" style={{ fontSize: 10.5, wordBreak: "break-all" }}>{newToken.token}</div>
                        <button type="button" className="btn outline sm mt-10" onClick={() => copyToken(newToken.token)}>
                          <Copy size={12} /> Copy token
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="kv-list mt-16">
                    {ingestTokens.map((token) => (
                      <div className="kv-row" key={token.id}>
                        <span>
                          <span className="strong" style={{ display: "block", fontSize: 11 }}>{token.label}</span>
                          <span className="small-meta">
                            {token.prefix}… · created {timeAgo(token.created_at)}
                            {token.last_used_at ? ` · used ${timeAgo(token.last_used_at)}` : " · never used"}
                            {token.revoked_at ? " · revoked" : ""}
                          </span>
                        </span>
                        <span className="row" style={{ gap: 6 }}>
                          <Badge tone={token.revoked_at ? "neutral" : "success"}>{token.revoked_at ? "revoked" : "active"}</Badge>
                          {!token.revoked_at && (
                            <button type="button" className="btn ghost sm" onClick={() => revokeToken(token.id)} disabled={tokenBusy}>
                              <Trash2 size={12} /> Revoke
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                    {!ingestTokens.length && !tokenError && (
                      <div className="empty-inline">No ingestion token has been created for this workspace.</div>
                    )}
                  </div>
                  <div className="notice mt-12">
                    <ShieldAlert />
                    <div>
                      A token can only write telemetry for this workspace. It cannot read incidents, run response
                      playbooks or change security policy.
                    </div>
                  </div>
                </Panel>
              )}

              <Panel title="Audit & telemetry" icon={<KeyRound size={15} />}>
                <ToggleRow
                  title="Share anonymous product telemetry"
                  detail="A local UI preference in this demo. No usage data leaves the browser."
                  checked={state.settings.telemetry}
                  onChange={() => dispatch({ type: "UPDATE_SETTINGS", patch: { telemetry: !state.settings.telemetry } })}
                />
                <div className="notice mt-12">
                  <ShieldCheck />
                  <div>
                    Sign-in, failure, logout, workspace save, plan change and policy change events are written to the
                    server-side hash-chained audit trail. Simulation activity remains local to this demo workspace.
                    {state.activity.length} UI events are currently retained.
                  </div>
                </div>
              </Panel>
            </>
          )}

          {section === "notifications" && (
            <Panel title="Alert routing" icon={<Bell size={15} />}>
              <ToggleRow
                title="Email alerts"
                detail="Send workspace alerts to the signed-in user's email."
                checked={state.settings.emailAlerts}
                onChange={() => dispatch({ type: "UPDATE_SETTINGS", patch: { emailAlerts: !state.settings.emailAlerts } })}
              />
              <ToggleRow
                title="Critical-only mode"
                detail="Suppress low and medium notifications outside the HUNTER queue."
                checked={state.settings.criticalOnly}
                onChange={() => dispatch({ type: "UPDATE_SETTINGS", patch: { criticalOnly: !state.settings.criticalOnly } })}
              />
              <ToggleRow
                title="Weekly posture digest"
                detail="A Monday brief covering risk movement, new detections and pending fixes."
                checked={state.settings.weeklyDigest}
                onChange={() => dispatch({ type: "UPDATE_SETTINGS", patch: { weeklyDigest: !state.settings.weeklyDigest } })}
              />
              <ToggleRow
                title="Simulation completion alerts"
                detail="Notify when a run finishes, succeeds or is blocked."
                checked={state.settings.simulationAlerts}
                onChange={() => dispatch({ type: "UPDATE_SETTINGS", patch: { simulationAlerts: !state.settings.simulationAlerts } })}
              />
              <Notice tone="info" className="mt-12">
                Preferences save immediately. In-app notifications are always available from the bell menu.
              </Notice>
            </Panel>
          )}

          {section === "data" && (
            <>
              <Panel title="Data retention" icon={<Database size={15} />}>
                <div className="settings-row">
                  <div>
                    <div className="t">Evidence retention</div>
                    <div className="d">How long sealed evidence and imported logs remain available.</div>
                  </div>
                  <select
                    className="select"
                    style={{ width: 150 }}
                    value={state.settings.retentionDays}
                    onChange={(event) => {
                      dispatch({ type: "UPDATE_SETTINGS", patch: { retentionDays: event.target.value } });
                      dispatch({
                        type: "PUSH_TOAST",
                        toast: { title: "Retention updated", message: `Evidence retained for ${event.target.value} days.`, tone: "success" },
                      });
                    }}
                  >
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="180">180 days</option>
                    <option value="365">365 days</option>
                  </select>
                </div>
                <div className="kv-list mt-16">
                  <div className="kv-row"><span className="k">Persistence</span><span className="v mono">SQLite + versioned local cache</span></div>
                  <div className="kv-row"><span className="k">Assets</span><span className="v">{usage.assets}</span></div>
                  <div className="kv-row"><span className="k">Simulations this month</span><span className="v">{usage.runs}</span></div>
                  <div className="kv-row"><span className="k">Evidence objects</span><span className="v">{state.evidence.length}</span></div>
                  <div className="kv-row"><span className="k">Team seats</span><span className="v">{usage.seats} / {state.org.seats}</span></div>
                </div>
                <div className="row wrap mt-16">
                  <button type="button" className="btn outline" onClick={exportWorkspace}><Download /> Export workspace JSON</button>
                  <button type="button" className="btn ghost" onClick={() => setSection("profile")}><SlidersHorizontal /> Profile settings</button>
                </div>
              </Panel>

              {state.user?.roleKey === "super_admin" && (
                <div className="danger-zone">
                  <h3>Reset the demo workspace</h3>
                  <p>
                    Restores the seeded Northwind twin, detections, incidents, evidence and settings. Your current
                    sign-in is kept. This cannot be undone.
                  </p>
                  <button type="button" className="btn danger mt-12" onClick={() => setResetOpen(true)}>
                    <Trash2 /> Reset demo data
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        title="Reset the demo workspace?"
        message="All simulations, applied fixes, detections, incidents, evidence, reports, team changes and local preferences will return to the seeded state. Your sign-in is preserved."
        confirmLabel="Reset everything"
        onConfirm={async () => {
          try {
            await resetWorkspace();
            dispatch({
              type: "PUSH_TOAST",
              toast: { title: "Workspace reset", message: "The Northwind demo data has been restored.", tone: "success" },
            });
          } catch (error) {
            dispatch({
              type: "PUSH_TOAST",
              toast: { title: "Reset failed", message: error?.message || "The API did not reset the workspace.", tone: "danger" },
            });
          }
        }}
        onClose={() => setResetOpen(false)}
      />
    </div>
  );
}
