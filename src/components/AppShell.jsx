import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Archive,
  Bell,
  Brain,
  Building2,
  ChevronRight,
  Clock,
  Command,
  CreditCard,
  Crown,
  FileText,
  Fingerprint,
  Gauge,
  GitBranch,
  Globe,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Play,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  Sparkles,
  Target,
  Wrench,
  Boxes,
  X,
} from "lucide-react";
import Brand from "./Brand";
import CommandPalette from "./CommandPalette";
import { UserAvatar } from "./ui";
import { useApp } from "../state/AppState";
import { timeAgo } from "../lib/format";

export const NAV_GROUPS = [
  {
    label: "Command",
    items: [
      { to: "/app", label: "Command Center", icon: LayoutDashboard, end: true },
      { to: "/app/workspace", label: "Organization Workspace", icon: Building2 },
    ],
  },
  {
    label: "Digital Twin",
    tone: "cyan",
    items: [
      { to: "/app/twin", label: "Twin Overview", icon: Network, end: true },
      { to: "/app/twin/builder", label: "Network Builder", icon: Boxes },
      { to: "/app/twin/simulations", label: "Simulation Center", icon: Play },
      { to: "/app/twin/attack-paths", label: "Attack Paths", icon: GitBranch },
      { to: "/app/twin/risk", label: "Risk Analysis", icon: Gauge },
      { to: "/app/twin/red-blue", label: "Red vs Blue", icon: Target },
      { to: "/app/twin/self-healing", label: "Self-Healing", icon: Wrench },
      { to: "/app/twin/what-if", label: "What-If Comparison", icon: SlidersHorizontal },
      { to: "/app/twin/history", label: "Simulation History", icon: History },
    ],
  },
  {
    label: "HUNTER AI",
    tone: "violet",
    items: [
      { to: "/app/hunter", label: "HUNTER Dashboard", icon: Brain, end: true },
      { to: "/app/hunter/detections", label: "Threat Detection", icon: ShieldAlert },
      { to: "/app/hunter/logs", label: "Log Analysis", icon: ScrollText },
      { to: "/app/hunter/fingerprints", label: "Behavioural Fingerprints", icon: Fingerprint },
      { to: "/app/hunter/investigation", label: "Source Investigation", icon: Search },
      { to: "/app/hunter/incidents", label: "Incidents", icon: Siren },
      { to: "/app/hunter/intel", label: "Threat Intelligence", icon: Globe },
      { to: "/app/hunter/evidence", label: "Evidence", icon: Archive },
      { to: "/app/hunter/timeline", label: "Event Timeline", icon: Clock },
    ],
  },
  {
    label: "Shared",
    items: [
      { to: "/app/reports", label: "Security Reports", icon: FileText },
      { to: "/app/subscription", label: "Subscription", icon: CreditCard },
      { to: "/app/settings", label: "Settings", icon: Settings },
      { to: "/app/admin", label: "Super Admin", icon: Crown },
    ],
  },
];

const PLAN_LIMITS = { Starter: 5, Professional: 25, Enterprise: 200 };

export default function AppShell() {
  const { state, dispatch, runningRun, signOut } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef(null);

  const openIncidents = state.incidents.filter((incident) => incident.status !== "closed").length;
  const openDetections = state.detections.filter((detection) => detection.status === "open").length;
  const unread = state.notifications.filter((item) => !item.read).length;
  const limit = PLAN_LIMITS[state.org.plan] || 25;
  const thisMonth = new Date().getMonth();
  const usedRuns = state.runs.filter((run) => new Date(run.startedAt).getMonth() === thisMonth).length;

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => item.to !== "/app/admin" || state.user?.roleKey === "super_admin"
        ),
      })).filter((group) => group.items.length > 0),
    [state.user?.roleKey]
  );

  const navigation = useMemo(
    () =>
      visibleGroups.flatMap((group) =>
        group.items.map((item) => ({ ...item, group: group.label }))
      ),
    [visibleGroups]
  );

  const matched = useMemo(() => {
    const pathname = location.pathname.replace(/\/+$/, "") || "/app";
    return navigation
      .filter((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
      .sort((a, b) => b.to.length - a.to.length)[0];
  }, [location.pathname, navigation]);

  const detailLabel = useMemo(() => {
    if (location.pathname.startsWith("/app/hunter/incidents/")) {
      const id = location.pathname.split("/").filter(Boolean).pop();
      return state.incidents.find((incident) => incident.id === id)?.id || "Incident detail";
    }
    return null;
  }, [location.pathname, state.incidents]);

  useEffect(() => {
    setSidebarOpen(false);
    setPaletteOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const onClick = (event) => {
      if (!notificationsRef.current?.contains(event.target)) setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notificationsOpen]);

  const handleSignOut = async () => {
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Signed out", message: "Your workspace is saved to the server.", tone: "info" },
    });
    await signOut();
    navigate("/signin");
  };

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#app-content"
        onClick={(event) => {
          // HashRouter owns the URL hash, so focus the main landmark manually
          // instead of letting the browser treat this as a route change.
          event.preventDefault();
          document.getElementById("app-content")?.focus();
        }}
      >
        Skip to main content
      </a>
      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <aside className={`app-sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-top">
          <Brand to="/app" />
          <div className="row" style={{ marginTop: 9, paddingLeft: 2 }}>
            <span className="status-dot" style={{ color: "var(--green)", fontSize: 12 }}>Twin synced · {timeAgo(state.lastSyncedAt)}</span>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {visibleGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className={`nav-group-label ${group.tone || ""}`}>
                <span className="accent" />
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const badge =
                  item.to === "/app/hunter/incidents"
                    ? openIncidents
                    : item.to === "/app/hunter/detections"
                    ? openDetections
                    : null;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      [
                        "nav-link",
                        group.tone === "violet" ? "violet-active" : "",
                        isActive ? "active" : "",
                      ].join(" ").trim()
                    }
                  >
                    <Icon />
                    <span className="truncate">{item.label}</span>
                    {badge > 0 && <span className="nav-badge">{badge}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="quota-card">
            <div className="quota-top">
              <span>Simulation quota</span>
              <span>{usedRuns} / {limit}</span>
            </div>
            <div className="progress">
              <span style={{ width: `${Math.min(100, (usedRuns / limit) * 100)}%` }} />
            </div>
            <div className="quota-meta">
              <span>{state.org.plan}</span>
              <span>{state.assets.length} assets</span>
            </div>
          </div>
          <div className="user-card">
            <Link to="/app/settings" className="row" style={{ flex: 1, minWidth: 0, gap: 9 }}>
              <UserAvatar name={state.user?.name || "Analyst"} />
              <span className="user-card-info">
                <span className="user-card-name" style={{ display: "block" }}>{state.user?.name || "Analyst"}</span>
                <span className="user-card-role" style={{ display: "block" }}>{state.user?.role || "Member"}</span>
              </span>
            </Link>
            <button type="button" className="icon-btn bare" onClick={handleSignOut} aria-label="Sign out" title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="header-left">
            <button
              type="button"
              className="icon-btn mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <div className="breadcrumbs">
              <span className="crumb">{matched?.group || "Workspace"}</span>
              <ChevronRight />
              {detailLabel ? (
                <>
                  <Link className="crumb" to={matched?.to || "/app/hunter/incidents"}>{matched?.label}</Link>
                  <ChevronRight />
                  <span className="current">{detailLabel}</span>
                </>
              ) : (
                <span className="current">{matched?.label || "Command Center"}</span>
              )}
            </div>
          </div>
          <div className="header-right">
            <button
              type="button"
              className="header-sync"
              onClick={() => dispatch({ type: "SYNC_TWIN" })}
              title="Validate the twin model against the last approved snapshot"
            >
              <RefreshCw size={10} /> SYNCED {timeAgo(state.lastSyncedAt)}
            </button>
            {runningRun && (
              <Link
                to="/app/twin/simulations"
                className="header-sync"
                style={{ borderColor: "rgba(251,146,60,.28)", color: "#fdba74", background: "rgba(249,115,22,.07)" }}
              >
                <Sparkles size={10} /> {runningRun.id} RUNNING
              </Link>
            )}
            <button
              type="button"
              className="header-search"
              onClick={() => setPaletteOpen(true)}
            >
              <Search />
              <span>Search or jump to…</span>
              <span className="kbd">Ctrl K</span>
            </button>
            <div style={{ position: "relative" }} ref={notificationsRef}>
              <button
                type="button"
                className="icon-btn notification-btn"
                onClick={() => setNotificationsOpen((open) => !open)}
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
              >
                <Bell />
                {unread > 0 && <span className="unread" />}
              </button>
              {notificationsOpen && (
                <div className="popover">
                  <div className="popover-head">
                    <span>Notifications</span>
                    {unread > 0 ? (
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => dispatch({ type: "MARK_NOTIFICATIONS_READ" })}
                      >
                        Mark all read
                      </button>
                    ) : (
                      <span className="small dim">All caught up</span>
                    )}
                  </div>
                  <div className="popover-list">
                    {state.notifications.length === 0 && (
                      <div className="empty-state" style={{ padding: "28px 18px" }}>
                        <Bell size={20} />
                        <div className="small">No notifications yet.</div>
                      </div>
                    )}
                    {state.notifications.slice(0, 8).map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`notification-item ${item.tone || "info"} ${item.read ? "" : "unread"}`}
                        onClick={() => {
                          dispatch({ type: "MARK_NOTIFICATION_READ", id: item.id });
                          setNotificationsOpen(false);
                          if (item.to) navigate(item.to);
                        }}
                      >
                        <span className="dot" />
                        <span style={{ minWidth: 0 }}>
                          <span className="n-title" style={{ display: "block" }}>{item.title}</span>
                          <span className="n-detail" style={{ display: "block" }}>{item.detail}</span>
                          <span className="n-time" style={{ display: "block" }}>{timeAgo(item.at)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="app-content" id="app-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        navigation={navigation}
      />
    </div>
  );
}
