import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Building2,
  CheckCircle2,
  ChevronRight,
  Copy,
  Crown,
  Globe,
  Lock,
  Mail,
  Plus,
  Play,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  ConfirmDialog,
  Modal,
  PageHeader,
  Panel,
  StatCard,
  UserAvatar,
} from "../../components/ui";
import { timeAgo, formatDate } from "../../lib/format";

const ROLES = ["Super Admin", "Security Analyst", "Twin Editor", "Read Only"];

export default function Workspace() {
  const { state, dispatch } = useApp();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", role: "Security Analyst" });
  const [orgDraft, setOrgDraft] = useState(state.org);
  const [inviteError, setInviteError] = useState("");
  const [removeMember, setRemoveMember] = useState(null);
  const [query, setQuery] = useState("");

  const runsThisMonth = useMemo(
    () =>
      state.runs.filter((run) => new Date(run.startedAt).getMonth() === new Date().getMonth())
        .length,
    [state.runs]
  );
  const zoneCounts = useMemo(
    () =>
      state.assets.reduce((acc, asset) => {
        acc[asset.zone] = (acc[asset.zone] || 0) + 1;
        return acc;
      }, {}),
    [state.assets]
  );
  const filteredTeam = state.team.filter((member) =>
    `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(query.toLowerCase())
  );

  const openOrgModal = () => {
    setOrgDraft(state.org);
    setOrgOpen(true);
  };

  const saveOrg = (event) => {
    event.preventDefault();
    dispatch({ type: "UPDATE_ORG", patch: orgDraft });
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Workspace updated", message: "Organization details were saved.", tone: "success" },
    });
    setOrgOpen(false);
  };

  const sendInvite = (event) => {
    event.preventDefault();
    setInviteError("");
    if (!invite.name.trim()) return setInviteError("Add the teammate's name.");
    if (!invite.email.includes("@")) return setInviteError("Enter a valid email address.");
    if (state.team.some((member) => member.email.toLowerCase() === invite.email.trim().toLowerCase())) {
      return setInviteError("That email is already a member of this workspace.");
    }
    if (state.team.length >= state.org.seats) {
      return setInviteError("All seats are in use. Update the subscription before inviting more people.");
    }
    dispatch({ type: "ADD_MEMBER", member: { ...invite, email: invite.email.trim() } });
    setInvite({ name: "", email: "", role: "Security Analyst" });
    setInviteOpen(false);
  };

  const copyWorkspaceId = async () => {
    try {
      await navigator.clipboard.writeText(`northwind-${state.org.domain.split(".")[0]}`);
      dispatch({
        type: "PUSH_TOAST",
        toast: { title: "Workspace ID copied", message: "The identifier is on your clipboard.", tone: "success" },
      });
    } catch {
      dispatch({
        type: "PUSH_TOAST",
        toast: { title: "Copy unavailable", message: "Clipboard access was blocked by the browser.", tone: "warning" },
      });
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Command · Organization workspace"
        title="One organization. One permissions model."
        subtitle="The twin, HUNTER AI, evidence and reports all belong to this workspace. Membership, access and quotas are shared across both systems."
        actions={
          <>
            <button type="button" className="btn outline" onClick={openOrgModal}>
              <Building2 /> Edit organization
            </button>
            <button type="button" className="btn primary" onClick={() => setInviteOpen(true)}>
              <Plus /> Invite teammate
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Twin assets" value={state.assets.length} icon={<Building2 />} tone="info" foot={`${state.edges.length} approved network links`} />
        <StatCard label="Workspace seats" value={`${state.team.length} / ${state.org.seats}`} icon={<Users />} tone="violet" foot={`${state.team.filter((member) => member.status === "invited").length} pending invitation(s)`} />
        <StatCard label="Simulations this month" value={runsThisMonth} icon={<Play />} tone="high" foot="Professional plan quota resets monthly" />
        <StatCard label="Evidence objects" value={state.evidence.length} icon={<ShieldCheck />} tone="success" foot="All records sealed and hashed" />
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Organization profile"
          icon={<Building2 size={15} />}
          action={<button type="button" className="btn ghost sm" onClick={openOrgModal}>Edit <ChevronRight size={12} /></button>}
        >
          <div className="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <span className="fp-avatar" style={{ width: 52, height: 52, borderRadius: 12, fontSize: 17 }}>
              {state.org.name.slice(0, 2).toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <h2 style={{ fontSize: 20 }}>{state.org.name}</h2>
                <Badge tone="violet"><Crown size={10} /> {state.org.plan}</Badge>
              </div>
              <div className="small muted mt-6">{state.org.industry} · {state.org.region} · {state.org.domain}</div>
              <div className="row wrap mt-12" style={{ gap: 7 }}>
                <Badge tone="info"><Users size={10} /> {state.team.length} / {state.org.seats} seats</Badge>
                <Badge tone="neutral"><Lock size={10} /> {state.security?.sessionTimeout || state.settings.sessionTimeout || "8 hours"} idle</Badge>
                <Badge tone={state.security?.ipAllowlist ? "success" : "neutral"}>
                  <Globe size={10} /> IP allowlist {state.security?.ipAllowlist ? "on" : "off"}
                </Badge>
                <Badge tone="info"><Globe size={10} /> {state.org.region}</Badge>
              </div>
            </div>
          </div>
          <div className="link-row mt-16">
            <span>Workspace ID</span>
            <span className="row" style={{ gap: 6 }}>
              <span className="v">northwind-{state.org.domain.split(".")[0]}</span>
              <button type="button" className="icon-btn bare" onClick={copyWorkspaceId} aria-label="Copy workspace id"><Copy size={12} /></button>
            </span>
          </div>
          <div className="link-row">
            <span>Primary domain</span><span className="v">{state.org.domain}</span>
          </div>
          <div className="link-row">
            <span>Workspace created</span><span className="v">18 Mar 2024</span>
          </div>
          <div className="link-row">
            <span>Data region</span><span className="v">{state.org.region} · isolated</span>
          </div>
        </Panel>

        <Panel title="Access guardrails" icon={<ShieldCheck size={15} />}>
          <div className="settings-row">
            <div>
              <div className="t">Session idle timeout</div>
              <div className="d">Enforced by the API on every authenticated request.</div>
            </div>
            <span className="badge info">{state.security?.sessionTimeout || state.settings.sessionTimeout || "8 hours"}</span>
          </div>
          <div className="settings-row">
            <div>
              <div className="t">IP allowlist</div>
              <div className="d">Restrict sign-in and sessions to approved CIDR ranges.</div>
            </div>
            <span className={`badge ${state.security?.ipAllowlist ? "success" : "neutral"}`}>
              {state.security?.ipAllowlist ? "Enforced" : "Any IP"}
            </span>
          </div>
          <div className="notice mt-12">
            <Lock />
            <div>
              <strong className="soft">Password authentication only.</strong> MFA and SAML SSO are not implemented in
              this build. Twin actions cannot reach production networks, and imported telemetry stays labelled as
              imported.
            </div>
          </div>
          <div className="mt-16">
            <Link to="/app/settings" className="btn outline block">Open security settings <ChevronRight /></Link>
          </div>
        </Panel>
      </div>

      <div className="invite-banner mt-12">
        <div className="row" style={{ gap: 12 }}>
          <span className="feature-icon" style={{ width: 34, height: 34 }}><Mail /></span>
          <div>
            <div className="strong">Bring the response team into the same evidence trail.</div>
            <div className="small muted mt-6">
              Analysts, twin editors and read-only stakeholders each get scoped access. {Math.max(0, state.org.seats - state.team.length)} seat(s) remain.
            </div>
          </div>
        </div>
        <button type="button" className="btn primary sm" onClick={() => setInviteOpen(true)}><Plus /> Invite</button>
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Team & roles"
          icon={<Users size={15} />}
          action={
            <div className="input-icon" style={{ width: 220 }}>
              <Mail />
              <input className="input" placeholder="Filter team…" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          }
          flush
        >
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredTeam.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="member-cell">
                        <UserAvatar name={member.name} />
                        <div>
                          <div className="member-name">
                            {member.name}
                            {member.email === state.user?.email && <span className="tag cyan" style={{ marginLeft: 6 }}>YOU</span>}
                          </div>
                          <div className="member-email">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        className="select"
                        style={{ height: 30, fontSize: 11, minWidth: 130 }}
                        value={member.role}
                        onChange={(event) =>
                          dispatch({ type: "UPDATE_MEMBER", id: member.id, patch: { role: event.target.value } })
                        }
                        aria-label={`Role for ${member.name}`}
                      >
                        {ROLES.map((role) => <option key={role}>{role}</option>)}
                      </select>
                    </td>
                    <td>
                      <Badge tone={member.status === "active" ? "success" : "medium"}>
                        {member.status === "active" ? "Active" : "Invited"}
                      </Badge>
                    </td>
                    <td className="small-meta">{member.lastActive ? timeAgo(member.lastActive) : "Not yet joined"}</td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn bare"
                        onClick={() => setRemoveMember(member)}
                        aria-label={`Remove ${member.name}`}
                        title="Remove member"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredTeam.length === 0 && <div className="empty-inline">No team members match “{query}”.</div>}
        </Panel>

        <div className="stack">
          <Panel title="Twin footprint" icon={<Building2 size={15} />}>
            {[
              ["Edge", "edge"],
              ["DMZ", "dmz"],
              ["Application", "app"],
              ["Identity & data", "data"],
              ["Cloud / corporate", "cloud"],
            ].map(([label, zone]) => (
              <div className="link-row" key={zone}>
                <span>{label}</span><span className="v">{zoneCounts[zone] || 0} assets</span>
              </div>
            ))}
            <div className="row between mt-12">
              <span className="small-meta">APPROVED LINKS</span>
              <span className="small soft">{state.edges.length}</span>
            </div>
            <Link to="/app/twin/builder" className="btn outline block mt-16">Open network builder <ChevronRight /></Link>
          </Panel>

          <Panel title="Recent workspace activity" icon={<Activity size={15} />} flush>
            <div className="activity-list">
              {state.activity.slice(0, 5).map((item) => (
                <div className="activity-item" key={item.id}>
                  <span className={`activity-icon ${item.tone || ""}`}><CheckCircle2 /></span>
                  <div>
                    <div className="activity-text">{item.text}</div>
                    <div className="activity-meta"><span>{item.actor}</span><span>·</span><span>{timeAgo(item.at)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={inviteOpen}
        title="Invite a teammate"
        subtitle="Seats are scoped to this workspace and shared by both systems."
        onClose={() => setInviteOpen(false)}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setInviteOpen(false)}>Cancel</button>
            <button type="submit" form="invite-form" className="btn primary"><Mail /> Send invitation</button>
          </>
        }
      >
        <form id="invite-form" onSubmit={sendInvite}>
          {inviteError && <div className="auth-inline-error mb-12">{inviteError}</div>}
          <div className="form-grid">
            <div className="field span-2">
              <label>Full name</label>
              <input className="input" value={invite.name} onChange={(event) => setInvite({ ...invite, name: event.target.value })} placeholder="e.g. Maya Chen" />
            </div>
            <div className="field span-2">
              <label>Work email</label>
              <input className="input" type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="analyst@northwind.io" />
            </div>
            <div className="field span-2">
              <label>Role</label>
              <select className="select" value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}>
                {ROLES.map((role) => <option key={role}>{role}</option>)}
              </select>
            </div>
          </div>
          <div className="notice mt-16">
            <ShieldCheck />
            <div>Invited members cannot apply fixes or seal evidence until an owner approves their role.</div>
          </div>
        </form>
      </Modal>

      <Modal
        open={orgOpen}
        title="Edit organization"
        onClose={() => setOrgOpen(false)}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setOrgOpen(false)}>Cancel</button>
            <button type="submit" form="org-form" className="btn primary">Save workspace</button>
          </>
        }
      >
        <form id="org-form" onSubmit={saveOrg}>
          <div className="form-grid">
            <div className="field span-2">
              <label>Organization name</label>
              <input className="input" value={orgDraft.name} onChange={(event) => setOrgDraft({ ...orgDraft, name: event.target.value })} required />
            </div>
            <div className="field">
              <label>Primary domain</label>
              <input className="input" value={orgDraft.domain} onChange={(event) => setOrgDraft({ ...orgDraft, domain: event.target.value })} required />
            </div>
            <div className="field">
              <label>Industry</label>
              <input className="input" value={orgDraft.industry} onChange={(event) => setOrgDraft({ ...orgDraft, industry: event.target.value })} />
            </div>
            <div className="field">
              <label>Data region</label>
              <select className="select" value={orgDraft.region} onChange={(event) => setOrgDraft({ ...orgDraft, region: event.target.value })}>
                <option>EU West</option>
                <option>US East</option>
                <option>AP South</option>
                <option>India</option>
              </select>
            </div>
            <div className="field">
              <label>Seat limit</label>
              <input className="input" type="number" min={Math.max(1, state.team.length)} value={orgDraft.seats} onChange={(event) => setOrgDraft({ ...orgDraft, seats: Number(event.target.value) })} />
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeMember)}
        title={`Remove ${removeMember?.name || "member"}?`}
        message={
          removeMember
            ? `${removeMember.email} will lose access to the twin, HUNTER AI, evidence and reports. Their audit history remains intact.`
            : ""
        }
        confirmLabel="Remove member"
        onConfirm={() => removeMember && dispatch({ type: "REMOVE_MEMBER", id: removeMember.id })}
        onClose={() => setRemoveMember(null)}
      />
    </div>
  );
}
