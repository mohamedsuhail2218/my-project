import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Gauge,
  GitBranch,
  Github,
  Globe2,
  Lock,
  Menu,
  Network,
  Play,
  ScanLine,
  ShieldCheck,
  Target,
  X,
  Zap,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import "../../styles/landing-nexus.css";

const NAV_ITEMS = [
  { to: "/product", label: "PLATFORM" },
  { to: "/pricing", label: "PRICING" },
];

const WORK = [
  {
    num: "01",
    tag: "DIGITAL TWIN",
    title: "MODEL THE BATTLEFIELD",
    body: "A live graph of your assets, identities and controls. Every attack is a testable chain of decisions against the twin, never production traffic.",
    to: "/product",
    preview: "twin",
  },
  {
    num: "02",
    tag: "HUNTER AI",
    title: "INVESTIGATE THE EVIDENCE",
    body: "Detection, correlation and an explainable answer. HUNTER shows the signal, the confidence and the exact events behind every conclusion.",
    to: "/product",
    preview: "hunter",
  },
  {
    num: "03",
    tag: "RESPONSE OPS",
    title: "PROVE THE FIX",
    body: "Approve a playbook, re-run the identical path and measure the risk that moved. Self-healing with evidence, not a promise.",
    to: "/product",
    preview: "response",
  },
];

const STATS = [
  { icon: Network, value: "12", label: "MODELLED ASSETS" },
  { icon: GitBranch, value: "10", label: "ATTACK SCENARIOS" },
  { icon: Zap, value: "05", label: "LIVE CAPABILITIES" },
  { icon: ShieldCheck, value: "00", label: "PRODUCTION TRAFFIC" },
];

const SIGNALS = [
  { icon: Network, name: "TWIN GRAPH", sub: "ASSETS + LINKS" },
  { icon: GitBranch, name: "SCENARIO ENGINE", sub: "DETERMINISTIC" },
  { icon: Gauge, name: "RISK ENGINE", sub: "EXPLAINABLE" },
  { icon: Brain, name: "HUNTER AI", sub: "EVIDENCE FIRST" },
  { icon: Target, name: "MITRE ATT&CK", sub: "TECHNIQUES" },
  { icon: Globe2, name: "THREAT INTEL", sub: "RDAP · OTX" },
];

function NexusMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M7 29 20 7" stroke="var(--nx-lime)" strokeWidth="3.4" strokeLinecap="square" />
      <path d="M15 33 28 11" stroke="var(--nx-lime)" strokeWidth="3.4" strokeLinecap="square" />
      <path d="M23 37 36 15" stroke="var(--nx-blue-bright)" strokeWidth="3.4" strokeLinecap="square" />
      <path d="M6 6h7M6 6v7" stroke="var(--nx-lime)" strokeWidth="1.1" opacity=".8" />
    </svg>
  );
}

function TwinCoreArt() {
  return (
    <div className="nx-art-stage">
      <div className="nx-art-halo" aria-hidden="true" />
      <div className="nx-art-grid" aria-hidden="true" />
      <svg
        className="nx-art-svg"
        viewBox="0 0 560 660"
        role="img"
        aria-label="Holographic digital twin core with an orbiting network of assets and controls"
      >
        <defs>
          <radialGradient id="nxCore" cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor="#e8fbff" stopOpacity=".95" />
            <stop offset="24%" stopColor="#66e5ff" stopOpacity=".62" />
            <stop offset="56%" stopColor="#1f4dff" stopOpacity=".22" />
            <stop offset="100%" stopColor="#1f4dff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="nxRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c8ff00" />
            <stop offset="52%" stopColor="#58e7ff" />
            <stop offset="100%" stopColor="#1f4dff" />
          </linearGradient>
          <pattern id="nxHeroGrid" width="34" height="34" patternUnits="userSpaceOnUse">
            <path d="M34 0H0V34" fill="none" stroke="rgba(132,186,255,.24)" strokeWidth=".55" />
          </pattern>
          <filter id="nxGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="nxGlobeClip">
            <circle cx="280" cy="330" r="148" />
          </clipPath>
        </defs>

        <rect width="560" height="660" fill="url(#nxHeroGrid)" opacity=".3" />
        <circle cx="280" cy="330" r="238" fill="url(#nxCore)" />

        <g className="nx-orbit" fill="none" stroke="url(#nxRing)" opacity=".7">
          <circle cx="280" cy="330" r="216" strokeWidth=".9" strokeDasharray="2 9" />
          <ellipse cx="280" cy="330" rx="218" ry="76" strokeWidth=".8" transform="rotate(-17 280 330)" />
          <ellipse cx="280" cy="330" rx="196" ry="58" strokeWidth=".7" transform="rotate(56 280 330)" />
        </g>

        <g clipPath="url(#nxGlobeClip)">
          <circle cx="280" cy="330" r="148" fill="#06122f" fillOpacity=".55" stroke="#64e6ff" strokeOpacity=".55" />
          <ellipse cx="280" cy="330" rx="148" ry="42" fill="none" stroke="#64e6ff" strokeOpacity=".25" />
          <ellipse cx="280" cy="330" rx="148" ry="86" fill="none" stroke="#64e6ff" strokeOpacity=".18" />
          <ellipse cx="280" cy="330" rx="148" ry="124" fill="none" stroke="#64e6ff" strokeOpacity=".12" />
          <ellipse cx="280" cy="330" rx="42" ry="148" fill="none" stroke="#64e6ff" strokeOpacity=".22" />
          <ellipse cx="280" cy="330" rx="86" ry="148" fill="none" stroke="#64e6ff" strokeOpacity=".16" />
          <ellipse cx="280" cy="330" rx="124" ry="148" fill="none" stroke="#64e6ff" strokeOpacity=".1" />
          <path
            className="nx-scan-line"
            d="M120 300 H440"
            stroke="#c8ff00"
            strokeWidth="1.4"
            opacity=".55"
          />
        </g>

        <g filter="url(#nxGlow)">
          <polygon
            points="280,255 344,292 344,366 280,403 216,366 216,292"
            fill="#1f4dff"
            fillOpacity=".14"
            stroke="#c8ff00"
            strokeWidth="1.45"
          />
          <polygon
            points="280,285 318,307 318,351 280,373 242,351 242,307"
            fill="#58e7ff"
            fillOpacity=".1"
            stroke="#58e7ff"
            strokeWidth="1"
          />
          <circle cx="280" cy="329" r="9" fill="#c8ff00" />
          <circle cx="280" cy="329" r="21" fill="none" stroke="#c8ff00" strokeOpacity=".5" />
          <circle cx="280" cy="329" r="34" fill="none" stroke="#c8ff00" strokeOpacity=".16" />
        </g>

        <g className="nx-nodes" stroke="#58e7ff" strokeOpacity=".5" fill="none">
          <path d="M280 329 120 218" strokeDasharray="2 6" />
          <path d="M280 329 438 194" strokeDasharray="2 6" />
          <path d="M280 329 470 442" strokeDasharray="2 6" />
          <path d="M280 329 148 470" strokeDasharray="2 6" />
          <path d="M280 329 330 112" strokeDasharray="2 6" />
          <path d="M280 329 386 546" strokeDasharray="2 6" />
        </g>

        {[
          { x: 120, y: 218, label: "EDGE", tone: "lime" },
          { x: 438, y: 194, label: "IDENTITY", tone: "cyan" },
          { x: 470, y: 442, label: "DATA", tone: "lime" },
          { x: 148, y: 470, label: "CONTROL", tone: "cyan" },
          { x: 330, y: 112, label: "CLOUD", tone: "cyan" },
          { x: 386, y: 546, label: "EVIDENCE", tone: "lime" },
        ].map((node) => (
          <g key={node.label} className={`nx-node nx-node-${node.tone}`}>
            <circle cx={node.x} cy={node.y} r="18" fill="#071126" fillOpacity=".85" stroke="currentColor" />
            <circle cx={node.x} cy={node.y} r="4" fill="currentColor" />
            <text
              x={node.x + 26}
              y={node.y + 3}
              fill="currentColor"
              fontSize="8"
              letterSpacing="2.4"
              fontFamily="var(--nx-mono)"
            >
              {node.label}
            </text>
          </g>
        ))}

        <g fill="#9db6e8" fontFamily="var(--nx-mono)" fontSize="7.5" letterSpacing="2.2" opacity=".62">
          <text x="34" y="46">SIMULATION LATTICE</text>
          <text x="368" y="620">HUNTER-CORE / v4.1</text>
        </g>
        <g stroke="#c8ff00" strokeWidth="1">
          <path d="M22 22h14M22 22v14" />
          <path d="M538 638h-14M538 638v-14" />
        </g>
      </svg>

      <div className="nx-chip nx-chip-a">
        <span>LIVE SIM</span>
        <strong>SIM-1042</strong>
      </div>
      <div className="nx-chip nx-chip-b">
        <span>RISK</span>
        <strong>74<em>/100</em></strong>
      </div>
      <div className="nx-chip nx-chip-c">
        <span>PATH</span>
        <strong>04 HOPS</strong>
      </div>
      <div className="nx-chip nx-chip-d">
        <span>STATUS</span>
        <strong>CONTAINED</strong>
      </div>
    </div>
  );
}

function TwinPreview() {
  return (
    <div className="nx-preview nx-preview-twin">
      <div className="nx-mini-bar">
        <span><i className="nx-live-dot" /> TWIN · SIM-1042</span>
        <span>LIVE</span>
      </div>
      <svg viewBox="0 0 320 160" className="nx-preview-svg" aria-hidden="true">
        <g stroke="rgba(120,180,255,.35)" strokeWidth="1" fill="none">
          <path d="M48 86 112 48 182 78 260 44" />
          <path d="M48 86 124 124 206 108 260 44" />
          <path d="M112 48 124 124" />
          <path d="M182 78 206 108" />
        </g>
        {[
          [48, 86, "edge"],
          [112, 48, "web"],
          [182, 78, "app"],
          [260, 44, "db"],
          [124, 124, "vpn"],
          [206, 108, "s3"],
        ].map(([x, y, name]) => (
          <g key={name}>
            <circle cx={x} cy={y} r="13" fill="#071126" stroke="#58e7ff" strokeWidth="1" />
            <circle cx={x} cy={y} r="3" fill="#c8ff00" />
            <text x={x} y={y + 25} textAnchor="middle" fill="#9db6e8" fontSize="6.5" fontFamily="var(--nx-mono)" letterSpacing="1">
              {name.toUpperCase()}
            </text>
          </g>
        ))}
        <g className="nx-risk-ring" transform="translate(282 128)">
          <circle r="19" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="3" />
          <circle r="19" fill="none" stroke="#f87171" strokeWidth="3" strokeDasharray="77 120" transform="rotate(-90)" />
          <text y="3" textAnchor="middle" fill="#f87171" fontSize="9" fontFamily="var(--nx-mono)">74</text>
        </g>
      </svg>
    </div>
  );
}

function HunterPreview() {
  return (
    <div className="nx-preview nx-preview-hunter">
      <div className="nx-mini-bar">
        <span><i className="nx-live-dot" /> HUNTER AI</span>
        <span className="nx-mini-accent">ONLINE</span>
      </div>
      <div className="nx-hunter-line">
        <span className="nx-sev nx-sev-high">HIGH</span>
        <div>
          <strong>T1190 · PUBLIC APP EXPLOIT</strong>
          <small>web-01 · 04:12:08Z · src 185.220.101.4</small>
        </div>
      </div>
      <div className="nx-hunter-line">
        <span className="nx-sev nx-sev-med">MED</span>
        <div>
          <strong>T1078 · VALID ACCOUNT</strong>
          <small>app-01 · 04:12:41Z · svc-api</small>
        </div>
      </div>
      <div className="nx-hunter-answer">
        <Brain size={12} />
        <span>Correlated 4 events. Path reaches db-01. Confidence 0.92.</span>
      </div>
    </div>
  );
}

function ResponsePreview() {
  return (
    <div className="nx-preview nx-preview-response">
      <div className="nx-mini-bar">
        <span>RESPONSE PLAYBOOK</span>
        <span className="nx-mini-accent">APPROVAL</span>
      </div>
      <div className="nx-response-step done">
        <span>01</span>
        <strong>BLOCK EDGE IP</strong>
        <CheckCircle2 size={12} />
      </div>
      <div className="nx-response-step done">
        <span>02</span>
        <strong>ISOLATE WEB-01</strong>
        <CheckCircle2 size={12} />
      </div>
      <div className="nx-response-step">
        <span>03</span>
        <strong>REVOKE SESSIONS</strong>
        <Lock size={12} />
      </div>
      <div className="nx-risk-delta">
        <span>RISK</span>
        <strong>74</strong>
        <ArrowRight size={14} />
        <strong className="good">21</strong>
      </div>
    </div>
  );
}

function WorkPreview({ type }) {
  if (type === "hunter") return <HunterPreview />;
  if (type === "response") return <ResponsePreview />;
  return <TwinPreview />;
}

function ConnectCore() {
  return (
    <svg viewBox="0 0 420 420" className="nx-connect-art" aria-hidden="true">
      <defs>
        <linearGradient id="nxConnectLine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c8ff00" />
          <stop offset="100%" stopColor="#58e7ff" />
        </linearGradient>
        <radialGradient id="nxConnectGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#58e7ff" stopOpacity=".5" />
          <stop offset="55%" stopColor="#1f4dff" stopOpacity=".2" />
          <stop offset="100%" stopColor="#1f4dff" stopOpacity="0" />
        </radialGradient>
        <filter id="nxConnectBlur">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <circle cx="210" cy="210" r="170" fill="url(#nxConnectGlow)" />
      <g className="nx-connect-rings" fill="none" stroke="url(#nxConnectLine)" opacity=".55">
        <circle cx="210" cy="210" r="160" strokeWidth=".8" strokeDasharray="2 10" />
        <ellipse cx="210" cy="210" rx="168" ry="58" strokeWidth=".7" transform="rotate(-22 210 210)" />
        <ellipse cx="210" cy="210" rx="168" ry="58" strokeWidth=".7" transform="rotate(58 210 210)" />
      </g>
      <g className="nx-cube" fill="none" stroke="url(#nxConnectLine)" strokeWidth="1.15">
        <polygon points="210,72 330,141 330,279 210,348 90,279 90,141" fill="#1f4dff" fillOpacity=".08" />
        <path d="M210 72 210 210 90 279" />
        <path d="M210 210 330 141" />
        <path d="M210 210 330 279" />
        <path d="M210 210 90 141" />
        <path d="M210 210 210 348" />
        <polygon points="210,108 294,157 294,263 210,312 126,263 126,157" fill="#58e7ff" fillOpacity=".05" />
      </g>
      <g filter="url(#nxConnectBlur)" opacity=".8">
        <circle cx="210" cy="210" r="26" fill="#58e7ff" />
      </g>
      <circle cx="210" cy="210" r="12" fill="#c8ff00" />
      <circle cx="210" cy="210" r="27" fill="none" stroke="#c8ff00" strokeOpacity=".55" />
      {[
        [210, 72],
        [330, 141],
        [330, 279],
        [210, 348],
        [90, 279],
        [90, 141],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#c8ff00" />
      ))}
    </svg>
  );
}

export default function Landing() {
  const { state } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const primary = state.user ? "/app" : "/signup";
  const primaryLabel = state.user ? "OPEN COMMAND CENTER" : "START FREE TRIAL";

  const focusMain = (event) => {
    event.preventDefault();
    document.getElementById("landing-main")?.focus();
  };

  return (
    <div className="nx-page">
      <a className="nx-skip" href="#landing-main" onClick={focusMain}>Skip to content</a>

      <header className="nx-header">
        <Link to="/" className="nx-brand" aria-label="Digital Twin Cyber War home">
          <NexusMark />
          <span className="nx-brand-text">
            <strong>DIGITAL TWIN</strong>
            <em>CYBER WAR</em>
          </span>
        </Link>

        <div className="nx-header-mid">
          SECURITY REHEARSAL PLATFORM <span>//</span> POWERED BY HUNTER AI
        </div>

        <nav className="nx-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <Link key={item.to} to={item.to}>{item.label}</Link>
          ))}
          <Link to={state.user ? "/app" : "/signin"}>{state.user ? "COMMAND CENTER" : "SIGN IN"}</Link>
          <Link to={primary} className="nx-nav-cta">
            {state.user ? "OPEN APP" : "START TRIAL"} <ArrowUpRight size={12} />
          </Link>
        </nav>

        <div className="nx-header-status">
          <span className="nx-live-dot" /> HUNTER AI ONLINE
        </div>

        <button
          type="button"
          className="nx-menu-btn"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          aria-controls="nx-mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>

        {menuOpen && (
          <nav id="nx-mobile-menu" className="nx-mobile-menu" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)}>{item.label}</Link>
            ))}
            <Link to={state.user ? "/app" : "/signin"} onClick={() => setMenuOpen(false)}>
              {state.user ? "COMMAND CENTER" : "SIGN IN"}
            </Link>
            <Link to={primary} className="nx-mobile-cta" onClick={() => setMenuOpen(false)}>
              {primaryLabel} <ArrowUpRight size={14} />
            </Link>
          </nav>
        )}
      </header>

      <main id="landing-main" tabIndex={-1} className="nx-main">
        <section className="nx-hero">
          <div className="nx-hero-grid" aria-hidden="true" />
          <div className="nx-hero-left">
            <div className="nx-kicker">
              <span className="nx-kicker-index">01</span>
              <span className="nx-kicker-line" />
              SECURITY REHEARSAL PLATFORM
            </div>

            <h1 className="nx-title">
              <span>DEFEND</span>
              <span className="nx-title-accent">BEYOND</span>
              <span>LIMITS</span>
            </h1>

            <p className="nx-lede">
              Rehearse the attack on a digital twin, not on production. Model the path, simulate the
              breach, and give HUNTER AI the evidence to prove what happened.
            </p>

            <div className="nx-actions">
              <Link to={primary} className="nx-btn nx-btn-lime">
                {primaryLabel} <ArrowRight size={16} />
              </Link>
              <Link to="/product" className="nx-btn nx-btn-ghost">
                <Play size={13} /> EXPLORE THE PLATFORM
              </Link>
            </div>

            <div className="nx-proof">
              <span><i /> NO PRODUCTION TRAFFIC</span>
              <span><i /> DETERMINISTIC SCENARIOS</span>
              <span><i /> EVIDENCE-FIRST INVESTIGATIONS</span>
            </div>

            <div className="nx-orbit-badge" aria-hidden="true">
              <svg viewBox="0 0 120 120">
                <defs>
                  <path id="nxBadgeCircle" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" />
                </defs>
                <text>
                  <textPath href="#nxBadgeCircle" startOffset="0%">
                    SIMULATE · DETECT · DEFEND ·
                  </textPath>
                </text>
              </svg>
              <Globe2 size={30} strokeWidth={1.1} />
            </div>
          </div>

          <div className="nx-hero-right">
            <div className="nx-hero-meta">
              <span>SECURE BY DESIGN</span>
              <span>LAT 01.29 / LON 103.85</span>
            </div>
            <TwinCoreArt />
            <div className="nx-vertical-label">SCROLL TO EXPLORE</div>
            <div className="nx-art-caption">
              <span>01 / DIGITAL TWIN CORE</span>
              <span>ISOLATED · AUTHORISED · OBSERVED</span>
            </div>
          </div>
        </section>

        <section className="nx-section nx-work" id="work">
          <div className="nx-section-head">
            <div>
              <div className="nx-eyebrow"><span>//</span> SELECTED WORK</div>
              <h2>THREE SYSTEMS.<br />ONE EVIDENCE TRAIL.</h2>
            </div>
            <div className="nx-section-aside">
              <ArrowUpRight size={20} />
              <p>
                A selection of platform surfaces built for teams that cannot test in production.
                Every conclusion is tied to a path, a measurement and a re-run.
              </p>
            </div>
          </div>

          <div className="nx-work-grid">
            {WORK.map((item) => (
              <article className="nx-work-card" key={item.num}>
                <div className="nx-work-top">
                  <span className="nx-work-num">{item.num}</span>
                  <span className="nx-work-tag">{item.tag}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <WorkPreview type={item.preview} />
                <Link to={item.to} className="nx-work-link">
                  VIEW CASE STUDY <span><ArrowUpRight size={13} /></span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="nx-stats" aria-label="Platform statistics">
          <div className="nx-stats-main">
            {STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div className="nx-stat" key={stat.label}>
                  <span className="nx-stat-icon"><Icon size={24} strokeWidth={1.2} /></span>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              );
            })}
          </div>
          <div className="nx-quote">
            <span className="nx-quote-symbol">“</span>
            <p>GOOD SECURITY<br />IS TESTED.<br />GREAT SECURITY<br />IS REHEARSED.</p>
            <span className="nx-quote-rule" />
            <small>SAFE BY DESIGN</small>
          </div>
        </section>

        <section className="nx-tools" aria-label="Platform and signals">
          <div className="nx-tools-head">
            <div className="nx-eyebrow"><span>//</span> PLATFORM &amp; SIGNALS</div>
            <h2>BUILT ON<br />REAL SIGNALS.</h2>
          </div>
          <div className="nx-tools-row">
            {SIGNALS.map((signal) => {
              const Icon = signal.icon;
              return (
                <div className="nx-tool" key={signal.name}>
                  <span className="nx-tool-icon"><Icon size={24} strokeWidth={1.15} /></span>
                  <strong>{signal.name}</strong>
                  <small>{signal.sub}</small>
                </div>
              );
            })}
          </div>
        </section>

        <section className="nx-connect" id="connect">
          <div className="nx-connect-copy">
            <div className="nx-eyebrow"><span>//</span> GET IN TOUCH</div>
            <h2>LET&apos;S<br /><span>CONNECT.</span></h2>
            <p>
              Bring your environment. We&apos;ll model it, attack it, and prove exactly what changed.
              Available for authorised security rehearsals.
            </p>
            <div className="nx-contact-list">
              <Link to={state.user ? "/app" : "/signup"}>
                <span><Play size={14} /> {state.user ? "OPEN THE COMMAND CENTER" : "OPEN THE DEMO"}</span>
                <ArrowUpRight size={14} />
              </Link>
              <Link to="/pricing">
                <span><Gauge size={14} /> VIEW PLANS &amp; PRICING</span>
                <ArrowUpRight size={14} />
              </Link>
              <Link to="/product">
                <span><ScanLine size={14} /> TAKE THE PLATFORM TOUR</span>
                <ArrowUpRight size={14} />
              </Link>
              <a href="https://github.com/mohamedsuhail2218/my-project" target="_blank" rel="noreferrer">
                <span><Github size={14} /> SOURCE REPOSITORY</span>
                <ArrowUpRight size={14} />
              </a>
            </div>
          </div>

          <div className="nx-connect-visual">
            <ConnectCore />
            <div className="nx-connect-tag">
              <span><i className="nx-live-dot" /> TWIN CORE ONLINE</span>
              <span>READY FOR REHEARSAL</span>
            </div>
          </div>

          <div className="nx-qr-block">
            <img src="/demo-qr.svg" alt="QR code linking to the project source repository" />
            <span className="nx-qr-label">SCAN TO VIEW SOURCE</span>
            <span className="nx-qr-sub">GITHUB / MY-PROJECT</span>
          </div>
        </section>
      </main>

      <div className="nx-marquee" aria-hidden="true">
        <div className="nx-marquee-track">
          {[0, 1].map((group) => (
            <div className="nx-marquee-group" key={group}>
              <span><i>✦</i> REHEARSE THE ATTACK</span>
              <span><i>✦</i> HUNT THE EVIDENCE</span>
              <span><i>✦</i> PROVE THE FIX</span>
              <span><i>✦</i> DEFEND BEYOND LIMITS</span>
            </div>
          ))}
        </div>
      </div>

      <footer className="nx-footer">
        <span>© {new Date().getFullYear()} DIGITAL TWIN CYBER WAR</span>
        <span>SAFE BY DESIGN · NO PRODUCTION TRAFFIC</span>
        <div>
          <Link to="/signin">SIGN IN</Link>
          <Link to="/signup">START TRIAL</Link>
        </div>
      </footer>
    </div>
  );
}
