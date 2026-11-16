import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Command,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Network,
  Router,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sun,
  Ticket,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import Brand from '../components/Brand'
import { Badge, Modal, Spinner, cn } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useApi } from '../hooks/useApi'
import { relativeTime } from '../lib/utils'

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/monitoring', label: 'Network Monitoring', icon: Activity },
      { to: '/access-points', label: 'Access Points', icon: Router },
      { to: '/devices', label: 'Connected Devices', icon: Smartphone },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/anomalies', label: 'AI Anomaly Detection', icon: Bot },
      { to: '/troubleshooting', label: 'Smart Troubleshooting', icon: Wrench },
      { to: '/issues', label: 'Issue Management', icon: Ticket },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/testing', label: 'Automation Testing', icon: FlaskConical },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const ALL_NAV = NAV_GROUPS.flatMap((group) => group.items)

function Sidebar({ open, onClose, monitoringEnabled }) {
  const { user } = useAuth()
  const monitoringKnown = typeof monitoringEnabled === 'boolean'
  const monitoringActive = monitoringEnabled === true
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink-950/70 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col border-r border-app transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ background: 'var(--sidebar)', backdropFilter: 'blur(18px)' }}
      >
        <div className="flex h-[68px] items-center justify-between border-b border-app px-5">
          <Brand />
          <button onClick={onClose} className="rounded-lg p-1.5 text-subtle hover:bg-accent/5 hover:text-app lg:hidden" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-3 text-[8.5px] font-bold uppercase tracking-[0.19em] text-subtle">{group.label}</p>
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
        <div className="mx-3 mb-3 rounded-xl border border-app bg-accent/[0.03] p-3">
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
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-[11px] font-bold text-accent">
            {(user?.full_name || 'NP').split(' ').map((part) => part[0]).slice(0, 2).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-app">{user?.full_name}</p>
            <p className="truncate text-[9.5px] text-subtle"><span className="capitalize">{user?.role}</span> · {user?.email}</p>
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
    if (!term) return ALL_NAV
    return ALL_NAV.filter((item) => item.label.toLowerCase().includes(term))
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

function Notifications({ open, onClose }) {
  const navigate = useNavigate()
  const { data } = useApi('/dashboard/overview', { params: { hours: 24 }, pollMs: 60000 })
  const alerts = data?.recent_alerts || []
  if (!open) return null
  return (
    <>
      <button className="fixed inset-0 z-30 cursor-default" aria-label="Close notifications" onClick={onClose} />
      <div className="panel absolute right-0 top-11 z-40 w-[340px] animate-fade-up overflow-hidden">
        <div className="flex items-center justify-between border-b border-app px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-app">Network alerts</p>
            <p className="text-[9.5px] text-subtle">Anomalies, tickets and new devices</p>
          </div>
          <Badge tone={alerts.length ? 'warning' : 'success'}>{alerts.length} active</Badge>
        </div>
        <div className="max-h-[350px] overflow-y-auto">
          {alerts.slice(0, 6).map((alert) => (
            <button
              key={`${alert.kind}-${alert.id}`}
              onClick={() => { navigate(alert.path); onClose() }}
              className="flex w-full items-start gap-2.5 border-b border-app px-4 py-3 text-left transition last:border-0 hover:bg-accent/[0.035]"
            >
              <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md', alert.severity === 'Critical' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning')}>
                {alert.kind === 'unknown_device' ? <Smartphone className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-app">{alert.title}</span>
                <span className="mt-0.5 block line-clamp-2 text-[9.5px] leading-relaxed text-subtle">{alert.message}</span>
                <span className="mt-1 block text-[9px] text-subtle">{relativeTime(alert.created_at)}</span>
              </span>
            </button>
          ))}
          {!alerts.length && (
            <div className="flex flex-col items-center px-4 py-9 text-center">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <p className="mt-2 text-[11px] font-medium text-app">No active alerts</p>
              <p className="mt-0.5 text-[9.5px] text-subtle">Live telemetry and device approvals are clear.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { user, logout, hasRole } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: dashboard } = useApi('/dashboard/overview', { params: { hours: 24 }, pollMs: 60000 })

  const currentPage = ALL_NAV.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  )
  const alerts = dashboard?.recent_alerts || []

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
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-app px-4 backdrop-blur-xl sm:px-6" style={{ background: 'color-mix(in srgb, var(--bg) 84%, transparent)' }}>
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-muted transition hover:bg-accent/5 hover:text-app lg:hidden" aria-label="Open navigation">
            <Menu className="h-4.5 w-4.5" />
          </button>
          <div className="hidden items-center gap-2 text-[10px] text-subtle sm:flex">
            <CircleDot className="h-3 w-3 text-accent" />
            <span>Workspace</span>
            <span>/</span>
            <span className="font-medium text-muted">{currentPage?.label || 'NetPulse AI'}</span>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-app bg-accent/[0.03] px-2.5 py-1.5 text-[10px] text-subtle transition hover:border-accent/25 hover:text-muted md:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search workspace</span>
            <span className="code-chip ml-4 inline-flex items-center gap-0.5"><Command className="h-2.5 w-2.5" />K</span>
          </button>
          <div className={cn(
            'hidden items-center gap-1.5 rounded-md border px-2 py-1 text-[9px] font-medium sm:flex',
            dashboard?.monitoring?.enabled === true
              ? 'border-success/15 bg-success/[0.05] text-success'
              : 'border-warning/20 bg-warning/[0.06] text-warning',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dashboard?.monitoring?.enabled === true ? 'bg-success animate-pulse-ring' : 'bg-warning')} />
            {dashboard?.monitoring?.enabled === true ? 'Live probes' : dashboard?.monitoring?.enabled === false ? 'Probes paused' : 'Probe status'}
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
              {alerts.length > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning ring-2 ring-[var(--bg)]" />}
            </button>
            <Notifications open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
          </div>
          <div className="mx-1 hidden h-5 w-px bg-[var(--border)] sm:block" />
          <div className="relative">
            <button
              onClick={() => { setUserMenuOpen((value) => !value); setNotificationsOpen(false) }}
              className="flex items-center gap-2 rounded-lg p-1 pr-1.5 transition hover:bg-accent/5"
              aria-label="Open user menu"
              aria-expanded={userMenuOpen}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-[10px] font-bold text-accent">
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
        <footer className="mx-auto flex w-full max-w-[1600px] flex-col items-center justify-between gap-2 px-6 pb-6 pt-2 text-[9px] text-subtle sm:flex-row">
          <span>NetPulse AI · Authorized network monitoring only</span>
          <span className="flex items-center gap-1.5"><Network className="h-3 w-3" /> No fabricated live measurements</span>
        </footer>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
