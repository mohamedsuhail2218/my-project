import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  ChevronDown,
  CircleDot,
  Command,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Network,
  Router,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
  Ticket,
  TrendingUp,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import Brand from '../components/Brand'
import NotificationCenter from '../components/NotificationCenter'
import { Badge, Modal, cn } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { LiveProvider, useLive } from '../context/LiveContext'
import { useTheme } from '../context/ThemeContext'
import { useApi } from '../hooks/useApi'
import { relativeTime } from '../lib/utils'

const NAV_GROUPS = [
  {
    label: 'Command',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/monitoring', label: 'Real-Time Monitoring', icon: Activity },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/predictive', label: 'Predictive Analytics', icon: TrendingUp },
      { to: '/root-cause', label: 'Root Cause Analysis', icon: GitBranch },
      { to: '/security', label: 'Cybersecurity Intelligence', icon: ShieldAlert },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/optimization', label: 'Network Optimization', icon: SlidersHorizontal },
      { to: '/devices', label: 'Devices & Access Points', icon: Router },
      { to: '/anomalies', label: 'Anomalies & Issues', icon: AlertTriangle },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/reports', label: 'Reports & Analytics', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const SECONDARY_NAV = [
  { to: '/access-points', label: 'Access Point Inventory', icon: Router },
  { to: '/troubleshooting', label: 'Smart Troubleshooting', icon: Wrench },
  { to: '/issues', label: 'Issue Management', icon: Ticket },
  { to: '/testing', label: 'Automation Testing', icon: FlaskConical },
  { to: '/anomalies', label: 'AI Anomaly Detection', icon: Bot },
]

const ALL_NAV = [...NAV_GROUPS.flatMap((group) => group.items), ...SECONDARY_NAV]
const PALETTE_NAV = [...NAV_GROUPS.flatMap((group) => group.items), ...SECONDARY_NAV].filter(
  (item, index, list) => list.findIndex((candidate) => candidate.to === item.to) === index,
)

function Sidebar({ open, onClose, monitoringEnabled }) {
  const { user } = useAuth()
  const monitoringKnown = typeof monitoringEnabled === 'boolean'
  const monitoringActive = monitoringEnabled === true
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/75 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col border-r border-app transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ background: 'var(--sidebar)', backdropFilter: 'blur(20px) saturate(1.2)' }}
      >
        <div className="flex h-[68px] items-center justify-between border-b border-app px-5">
          <Brand />
          <button onClick={onClose} className="rounded-lg p-1.5 text-subtle hover:bg-accent/5 hover:text-app lg:hidden" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/[0.06] px-2.5 py-1.5">
          <Sparkles className="h-3 w-3 text-accent" />
          <span className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-accent">Autonomous mode</span>
          <span className="ml-auto h-1.5 w-1.5 animate-neon-breathe rounded-full bg-[var(--cyan)]" />
        </div>
        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-3 font-mono text-[8px] font-bold uppercase tracking-[0.22em] text-subtle">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}
                  >
                    <item.icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.9} />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="mx-3 mb-3 rounded-xl border border-app bg-accent/[0.035] p-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {monitoringActive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50" />}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', !monitoringKnown ? 'bg-neutral' : monitoringActive ? 'bg-success' : 'bg-warning')} />
            </span>
            <p className="text-[10px] font-semibold text-app">{!monitoringKnown ? 'Monitoring status' : monitoringActive ? 'Monitoring active' : 'Monitoring paused'}</p>
          </div>
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-subtle">
            {!monitoringKnown
              ? 'Checking scheduler status…'
              : monitoringActive
                ? 'Authorized local probes only. Simulated data is always labelled.'
                : 'Background probes are disabled in this deployment. Manual checks remain available.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 border-t border-app px-4 py-3.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-fill)] bg-[var(--accent-fill)] font-mono text-[10px] font-bold text-[var(--accent-ink)]">
            {(user?.full_name || 'NP').split(' ').map((part) => part[0]).slice(0, 2).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-app">{user?.full_name}</p>
            <p className="truncate font-mono text-[8.5px] uppercase tracking-[0.06em] text-subtle"><span className="capitalize">{user?.role}</span> · {user?.email}</p>
          </div>
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
        </div>
      </aside>
    </>
  )
}

function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const matches = useMemo(() => {
    const term = query.toLowerCase().trim()
    if (!term) return PALETTE_NAV
    return PALETTE_NAV.filter((item) => item.label.toLowerCase().includes(term))
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      window.setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  function choose(item) {
    navigate(item.to)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Command palette" subtitle="Jump to a workspace module" size="md">
      <div className="search-box">
        <Search className="h-4 w-4" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="input pl-10"
          placeholder="Search modules…"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[0]) choose(matches[0])
          }}
        />
      </div>
      <div className="mt-3 space-y-1">
        {matches.map((item) => (
          <button
            key={item.to}
            onClick={() => choose(item)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-muted transition hover:bg-accent/5 hover:text-app"
          >
            <item.icon className="h-4 w-4 text-accent" />
            <span className="flex-1">{item.label}</span>
            <span className="text-[9px] text-subtle">{item.to}</span>
          </button>
        ))}
        {!matches.length && <p className="py-8 text-center text-xs text-subtle">No modules match “{query}”.</p>}
      </div>
      <div className="mt-4 flex items-center gap-3 border-t border-app pt-3 text-[9px] text-subtle">
        <span><span className="code-chip">Enter</span> open first result</span>
        <span><span className="code-chip">Esc</span> close</span>
      </div>
    </Modal>
  )
}

function LivePill() {
  const { snapshot, transport } = useLive()
  const measurement = snapshot?.measurement
  const label =
    transport === 'websocket'
      ? 'Live socket'
      : transport === 'polling'
        ? 'Live polling'
        : transport === 'connecting'
          ? 'Connecting'
          : 'Feed offline'
  const tone =
    transport === 'websocket'
      ? 'border-cyan/30 bg-cyan/[0.07] text-cyan'
      : transport === 'polling'
        ? 'border-success/25 bg-success/[0.06] text-success'
        : transport === 'connecting'
          ? 'border-warning/25 bg-warning/[0.06] text-warning'
          : 'border-danger/25 bg-danger/[0.06] text-danger'
  return (
    <div className={cn('hidden items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.1em] md:flex', tone)}>
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', transport !== 'offline' && 'animate-pulse')} />
      <span>{label}</span>
      {measurement?.latency_ms != null && (
        <span className="border-l border-app pl-2 text-[8px] opacity-80">{Math.round(measurement.latency_ms)} ms</span>
      )}
    </div>
  )
}

function DashboardShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { user, logout, hasRole } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: dashboard } = useApi('/dashboard/overview', { params: { hours: 24 }, pollMs: 60000 })
  const { data: unreadData, reload: reloadUnread } = useApi('/notifications/unread-count', { pollMs: 30000 })

  const currentPage = ALL_NAV.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  )
  const unread = unreadData?.unread || 0

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function signOut() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-app">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} monitoringEnabled={dashboard?.monitoring?.enabled} />
      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-app px-4 backdrop-blur-xl sm:px-6" style={{ background: 'color-mix(in srgb, var(--bg) 82%, transparent)' }}>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/60 to-[var(--cyan)]/40" />
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-muted transition hover:bg-accent/5 hover:text-app lg:hidden" aria-label="Open navigation">
            <Menu className="h-4 w-4" />
          </button>
          <div className="hidden items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-subtle sm:flex">
            <CircleDot className="h-3 w-3 text-accent" />
            <span>Command</span>
            <span className="text-accent/60">/</span>
            <span className="text-muted">{currentPage?.label || 'NetPulse AI'}</span>
          </div>
          <div className="flex-1" />
          <LivePill />
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-app bg-accent/[0.03] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-subtle transition hover:border-accent/40 hover:text-muted xl:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search workspace</span>
            <span className="code-chip ml-4 inline-flex items-center gap-0.5"><Command className="h-2.5 w-2.5" />K</span>
          </button>
          <div className={cn(
            'hidden items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.1em] sm:flex',
            dashboard?.monitoring?.enabled === true
              ? 'border-success/25 bg-success/[0.06] text-success'
              : 'border-warning/25 bg-warning/[0.06] text-warning',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dashboard?.monitoring?.enabled === true ? 'bg-success animate-pulse-ring' : 'bg-warning')} />
            {dashboard?.monitoring?.enabled === true ? 'Probes on' : dashboard?.monitoring?.enabled === false ? 'Probes paused' : 'Probe status'}
          </div>
          <button onClick={toggleTheme} className="rounded-lg p-2 text-muted transition hover:bg-accent/5 hover:text-app" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <div className="relative">
            <button
              onClick={() => { setNotificationsOpen((value) => !value); setUserMenuOpen(false) }}
              className="relative rounded-lg p-2 text-muted transition hover:bg-accent/5 hover:text-app"
              aria-label="Open notifications"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-fill)] px-1 font-mono text-[8px] font-bold text-[var(--accent-ink)] ring-2 ring-[var(--bg)]">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            <NotificationCenter
              open={notificationsOpen}
              onClose={() => setNotificationsOpen(false)}
              onChanged={reloadUnread}
            />
          </div>
          <div className="mx-1 hidden h-5 w-px bg-[var(--border)] sm:block" />
          <div className="relative">
            <button
              onClick={() => { setUserMenuOpen((value) => !value); setNotificationsOpen(false) }}
              className="flex items-center gap-2 rounded-lg p-1 pr-1.5 transition hover:bg-accent/5"
              aria-label="Open user menu"
              aria-expanded={userMenuOpen}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--accent-fill)] bg-[var(--accent-fill)] font-mono text-[9px] font-bold text-[var(--accent-ink)]">
                {(user?.full_name || 'NP').split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </div>
              <ChevronDown className="hidden h-3 w-3 text-subtle sm:block" />
            </button>
            {userMenuOpen && (
              <>
                <button className="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onClick={() => setUserMenuOpen(false)} />
                <div className="panel absolute right-0 top-10 z-40 w-56 animate-fade-up overflow-hidden p-1.5">
                  <div className="border-b border-app px-2.5 py-2">
                    <p className="truncate text-[11px] font-semibold text-app">{user?.full_name}</p>
                    <p className="truncate text-[9.5px] text-subtle">{user?.email}</p>
                    <Badge tone={hasRole('admin') ? 'info' : 'neutral'} className="mt-1.5 capitalize">{user?.role}</Badge>
                  </div>
                  <button onClick={() => { setUserMenuOpen(false); navigate('/settings') }} className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-muted hover:bg-accent/5 hover:text-app">
                    <UserRound className="h-3.5 w-3.5" /> Account & settings
                  </button>
                  <button onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-danger hover:bg-danger/10">
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </main>
        <footer className="mx-auto flex w-full max-w-[1600px] flex-col items-center justify-between gap-2 px-6 pb-6 pt-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-subtle sm:flex-row">
          <span>NetPulse AI · Autonomous network intelligence & cybersecurity</span>
          <span className="flex items-center gap-1.5"><Network className="h-3 w-3" /> Real telemetry only · simulations labelled</span>
        </footer>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

export default function DashboardLayout() {
  return (
    <LiveProvider>
      <DashboardShell />
    </LiveProvider>
  )
}
