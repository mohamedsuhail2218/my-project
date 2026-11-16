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
  Sparkles,
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
      <div className="login-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-accent/10 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-gold/10 blur-[120px]" />
      <button
        onClick={toggleTheme}
        className="absolute right-5 top-5 z-20 rounded-lg border border-app bg-accent/[0.03] p-2 text-muted transition hover:text-app"
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1320px] items-center gap-10 px-5 py-10 lg:grid-cols-[1.08fr_.92fr] lg:px-10">
        <section className="hidden lg:block">
          <Brand />
          <div className="mt-12 max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              <Sparkles className="h-3 w-3" /> Intelligent network operations
            </div>
            <h1 className="font-display text-[46px] font-bold leading-[1.06] tracking-[-0.035em] text-app">
              See the network.
              <br />
              <span className="bg-gradient-to-r from-accent via-accent-strong to-gold bg-clip-text text-transparent">Understand the signal.</span>
            </h1>
            <p className="mt-5 max-w-lg text-[13px] leading-7 text-muted">
              NetPulse AI turns authorized Wi-Fi observations into live diagnostics, explainable machine-learning anomalies,
              guided troubleshooting and accountable issue workflows.
            </p>
          </div>

          <div className="mt-10 grid max-w-2xl gap-3">
            {FEATURES.map((feature, index) => (
              <div key={feature.title} className={`panel flex items-start gap-3.5 p-3.5 animate-fade-up animate-delay-${index + 1}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/15 bg-accent/10 text-accent">
                  <feature.icon className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-xs font-semibold text-app">{feature.title}</h2>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-subtle">{feature.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-9 flex max-w-xl items-center gap-5 border-t border-app pt-5">
            <div className="flex items-center gap-2 text-[10px] text-subtle"><ShieldCheck className="h-3.5 w-3.5 text-success" /> RBAC protected</div>
            <div className="flex items-center gap-2 text-[10px] text-subtle"><Activity className="h-3.5 w-3.5 text-accent" /> Real probes</div>
            <div className="flex items-center gap-2 text-[10px] text-subtle"><LockKeyhole className="h-3.5 w-3.5 text-muted" /> JWT sessions</div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[430px]">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <div className="panel relative overflow-hidden p-6 shadow-glow sm:p-8">
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
            <div className="mb-7">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                <Gauge className="h-5 w-5" />
              </div>
              <h2 className="font-display text-[22px] font-bold tracking-tight text-app">Welcome back</h2>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">Sign in to the NetPulse network intelligence workspace.</p>
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-subtle transition hover:text-app"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </label>
              <Button type="submit" variant="primary" loading={submitting} className="mt-1 w-full py-2.5">
                Sign in to workspace <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </form>

            <div className="mt-5 rounded-lg border border-app bg-accent/[0.03] px-3 py-2.5">
              <p className="text-[9.5px] leading-relaxed text-subtle">
                <span className="font-semibold text-muted">First run?</span> The administrator email and password come from
                <span className="code-chip mx-1">backend/.env</span>. A random password is printed once in the backend console if none is configured.
              </p>
            </div>
          </div>
          <p className="mt-5 text-center text-[9.5px] leading-relaxed text-subtle">
            Authorized network monitoring only · No external scanning · Simulated records are labelled
          </p>
        </section>
      </div>
    </div>
  )
}
