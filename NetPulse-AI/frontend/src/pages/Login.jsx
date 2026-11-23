import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Bot,
  Eye,
  EyeOff,
  Gauge,
  LockKeyhole,
  Mail,
  Moon,
  Radar,
  ShieldCheck,
  Sun,
  Wrench,
} from 'lucide-react'
import Brand from '../components/Brand'
import { Alert, Button, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

const FEATURES = [
  { icon: Radar, title: 'Live network telemetry', text: 'Real ICMP latency, jitter and packet-loss probes from this host.' },
  { icon: Bot, title: 'Isolation Forest AI', text: 'Explainable anomaly detection with cold-start transparency.' },
  { icon: Wrench, title: 'Guided troubleshooting', text: 'Rule-based diagnostics and automated issue tickets — no auto reconfiguration.' },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const { login, isAuthenticated, loading } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, loading, navigate])

  async function onSubmit(event) {
    event.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <Spinner className="h-6 w-6 text-accent" />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-app">
      <div className="login-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute -right-44 -top-44 h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle_at_36%_36%,rgba(168,85,247,0.52),rgba(88,28,135,0.18)_46%,transparent_70%)] blur-2xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-[440px] w-[440px] rounded-full bg-[rgba(34,211,238,0.09)] blur-[120px]" />
      <div className="absolute inset-x-0 top-0 h-0.5 bg-[var(--accent-fill)]" />

      <button
        onClick={toggleTheme}
        className="absolute right-5 top-5 z-20 border border-[var(--border-strong)] bg-[var(--panel)] p-2 text-muted transition hover:border-accent/50 hover:text-accent"
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1440px] items-center gap-12 px-5 py-12 lg:grid-cols-[1.08fr_.92fr] lg:px-12">
        <section className="hidden lg:block">
          <Brand />

          <div className="mt-14 max-w-2xl">
            <div className="mb-6 flex items-center gap-3 font-mono text-[9.5px] font-bold uppercase tracking-[0.24em] text-accent">
              <span className="h-2 w-2 bg-[var(--accent-fill)]" />
              Network intelligence · Autonomous defense
            </div>
            <h1 className="text-[clamp(64px,7.4vw,108px)] leading-[0.84] text-app">
              Read the
              <br />
              <span className="text-accent">pulse.</span>
            </h1>
            <p className="mt-7 max-w-lg text-[13px] leading-7 text-muted">
              NetPulse AI is an autonomous network intelligence and cybersecurity platform: real-time telemetry,
              predictive failure risk, explainable root-cause analysis, defensive security findings and accountable
              optimisation workflows.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap items-stretch gap-4">
            <div className="lime-frame -rotate-[3deg] bg-[var(--accent-fill)] px-5 py-4 text-[var(--accent-ink)]">
              <p className="font-mono text-[8.5px] font-bold uppercase tracking-[0.2em]">Live probes</p>
              <p className="font-display text-[30px] leading-none">24/7</p>
            </div>
            <div className="rotate-[2deg] border border-[rgba(168,85,247,0.5)] bg-[#170d29] px-5 py-4 text-[#e9d5ff]">
              <p className="font-mono text-[8.5px] font-bold uppercase tracking-[0.2em] text-[#c4a5ff]">AI model</p>
              <p className="font-display text-[30px] leading-none">Isolation Forest</p>
            </div>
          </div>

          <div className="mt-11 max-w-2xl border-y border-app">
            {FEATURES.map((feature, index) => (
              <div key={feature.title} className="flex items-start gap-5 border-b border-app py-4 last:border-b-0">
                <span className="font-mono text-[10px] font-bold text-accent">0{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[12px] font-semibold tracking-[0.04em] text-app">{feature.title}</h2>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-subtle">{feature.text}</p>
                </div>
                <feature.icon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
              </div>
            ))}
          </div>

          <div className="mt-8 flex max-w-2xl flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-subtle"><ShieldCheck className="h-3.5 w-3.5 text-success" /> RBAC protected</div>
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-subtle"><Activity className="h-3.5 w-3.5 text-accent" /> Real probes</div>
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-subtle"><LockKeyhole className="h-3.5 w-3.5 text-plum" /> JWT sessions</div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[440px]">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <div className="relative border border-[var(--border-strong)] bg-[var(--panel-solid)] p-6 sm:p-8">
            <div className="absolute inset-x-0 top-0 h-1 bg-[var(--accent-fill)]" />
            <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-plum/20 blur-3xl" />
            <div className="relative">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow mb-2">Secure access</p>
                  <h2 className="font-display text-[32px] leading-none text-app">Welcome back</h2>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-muted">Sign in to the NetPulse network intelligence workspace.</p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-accent/40 bg-accent/[0.05] text-accent">
                  <Gauge className="h-5 w-5" />
                </span>
              </div>

              {formError && <div className="mb-4"><Alert tone="danger">{formError}</Alert></div>}

              <form onSubmit={onSubmit} className="space-y-4">
                <label className="block">
                  <span className="label">Email address</span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
                    <input
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="input pl-9"
                      placeholder="admin@netpulse.ai"
                      aria-label="Email address"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="label">Password</span>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="input pl-9 pr-10"
                      placeholder="Enter your password"
                      aria-label="Password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-subtle transition hover:text-accent"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </label>
                <Button type="submit" variant="primary" loading={submitting} className="mt-1 w-full py-3">
                  Sign in to workspace <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </form>

              <div className="mt-5 border border-app bg-accent/[0.03] px-3 py-2.5">
                <p className="text-[9.5px] leading-relaxed text-subtle">
                  {import.meta.env.DEV ? (
                    <>
                      <span className="font-semibold text-muted">First run?</span> The administrator email and password come from
                      <span className="code-chip mx-1">backend/.env</span>. A random password is printed once in the backend console if none is configured.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-muted">Authorized access only.</span> Use the credentials issued by your
                      NetPulse administrator. Contact them if your access has expired.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-5 text-center font-mono text-[8.5px] uppercase leading-relaxed tracking-[0.14em] text-subtle">
            Authorized network monitoring only · No external scanning · Simulated records are labelled
          </p>
        </section>
      </div>
    </div>
  )
}
