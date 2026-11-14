import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  Brain,
  Building2,
  CheckCircle2,
  Clock,
  Cloud,
  Database,
  Eye,
  Fingerprint,
  Gauge,
  GitBranch,
  Layers,
  Lock,
  Network,
  Play,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Target,
  Terminal,
  Wrench,
} from "lucide-react";
import { useApp } from "../../state/AppState";

function HeroTopology() {
  const nodes = [
    { id: "fw", x: 62, y: 150, label: "edge-fw-01", sub: "FIREWALL", critical: false },
    { id: "web", x: 185, y: 100, label: "web-01", sub: "PUBLIC WEB", critical: false },
    { id: "vpn", x: 185, y: 203, label: "vpn-01", sub: "VPN", critical: false },
    { id: "app", x: 310, y: 146, label: "app-01", sub: "CUSTOMER API", critical: true },
    { id: "db", x: 438, y: 100, label: "db-01", sub: "CUSTOMER DB", critical: true },
    { id: "s3", x: 438, y: 205, label: "s3-archive", sub: "ARCHIVE", critical: true },
  ];
  return (
    <svg className="hero-topology" viewBox="0 0 520 290" aria-hidden="true">
      {[
        { x: 10, y: 55, w: 105, h: 190, label: "EDGE" },
        { x: 135, y: 55, w: 105, h: 190, label: "DMZ" },
        { x: 260, y: 55, w: 105, h: 190, label: "APPLICATION" },
        { x: 385, y: 55, w: 125, h: 190, label: "DATA / CLOUD" },
      ].map((zone) => (
        <g key={zone.label}>
          <rect className="zone" x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="7" />
          <text className="zone-label" x={zone.x + 9} y={zone.y + 15}>{zone.label}</text>
        </g>
      ))}
      <path className="link" d="M62 150 L185 100" />
      <path className="link" d="M62 150 L185 203" />
      <path className="link" d="M185 203 L310 146" />
      <path className="link" d="M185 100 L310 146" />
      <path className="link" d="M310 146 L438 100" />
      <path className="link" d="M310 146 L438 205" />
      <path className="attack-link" d="M62 150 L185 100" />
      <path className="attack-link" d="M185 100 L310 146" />
      <path className="attack-link" d="M310 146 L438 100" />
      <path className="attack-link" d="M438 100 L438 205" opacity="0.55" />
      {nodes.map((node) => (
        <g key={node.id} className={`node${node.critical ? " critical" : ""}`} transform={`translate(${node.x}, ${node.y})`}>
          <rect className="node-body" x="-38" y="-18" width="76" height="36" rx="6" />
          <circle className="pulse" cx="0" cy="0" r="8" opacity={node.id === "app" ? 1 : 0} />
          <text className="node-label" x="-30" y="-2">{node.label}</text>
          <text className="node-sub" x="-30" y="10">{node.sub}</text>
        </g>
      ))}
    </svg>
  );
}

const FEATURES = [
  {
    icon: GitBranch,
    title: "Attack-path visualisation",
    body: "Animated movement from entry point to target, with firewall boundaries, control gaps and the exact hop that stopped the attacker.",
  },
  {
    icon: Gauge,
    title: "Explainable risk scoring",
    body: "Every score decomposes into likelihood, impact, exposure and control coverage. No black-box number without a reason.",
  },
  {
    icon: Target,
    title: "Red Team vs Blue Team",
    body: "Automated attacker and defender compete over the same model. Every round records the technique, control and measured outcome.",
  },
  {
    icon: Wrench,
    title: "Self-healing loop",
    body: "Approve a fix, apply it to the virtual network, re-run the identical simulation and compare the evidence side by side.",
  },
  {
    icon: Fingerprint,
    title: "Behavioural fingerprints",
    body: "HUNTER AI clusters timing, tooling and infrastructure signals into an explainable actor profile instead of a mystery score.",
  },
  {
    icon: Lock,
    title: "Evidence with provenance",
    body: "Chain of custody, SHA-256 digests and a clear separation between simulated activity, imported logs and external intelligence.",
  },
];

const STEPS = [
  { n: "01", title: "Model", body: "Describe the assets, links, identities and controls that make up your environment." },
  { n: "02", title: "Simulate", body: "Rehearse a known technique chain against the twin using deterministic rules." },
  { n: "03", title: "Investigate", body: "Correlate detections, logs and intelligence into a defensible timeline." },
  { n: "04", title: "Harden", body: "Apply the control, re-run the path and prove the risk moved." },
];

const EXECUTION_ROWS = [
  {
    idx: "01",
    path: "edge-fw-01 → web-01",
    technique: "T1190 · Exploit public-facing application",
    factor: "No WAF or virtual patching in front of the portal",
    outcome: "Bypassed",
    success: true,
  },
  {
    idx: "02",
    path: "web-01 → app-01",
    technique: "T1059 · Command and scripting interpreter",
    factor: "nginx 1.18 parser weakness (+0.18)",
    outcome: "Bypassed",
    success: true,
  },
  {
    idx: "03",
    path: "app-01 → db-01",
    technique: "T1078 · Valid accounts",
    factor: "App tier can reach the data tier directly (+0.24)",
    outcome: "Bypassed",
    success: true,
  },
  {
    idx: "04",
    path: "db-01 → s3-archive",
    technique: "T1567 · Exfiltration over web service",
    factor: "Unrestricted egress from the data tier",
    outcome: "Bypassed",
    success: true,
  },
];

export default function Landing() {
  const { state } = useApp();
  const primary = state.user ? "/app" : "/signup";
  const primaryLabel = state.user ? "Open the command center" : "Start a free trial";

  return (
    <div>
      <section className="hero grid-bg">
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="eyebrow">Digital Twin Cyber War · Powered by HUNTER AI</span>
            </div>
            <h1>
              Rehearse the attack on a <span className="accent">digital twin</span>, not on production.
            </h1>
            <p className="hero-lede">
              Simulate attacks. Detect threats. Investigate attack patterns. Defend the future. Digital Twin
              Cyber War models your infrastructure; HUNTER AI investigates the evidence in your logs.
            </p>
            <div className="hero-actions">
              <Link to={primary} className="btn primary lg">{primaryLabel} <ArrowRight /></Link>
              <Link to="/product" className="btn outline lg"><Play /> Explore the platform</Link>
            </div>
            <div className="hero-meta">
              <span>No production traffic</span>
              <span>Deterministic scenarios</span>
              <span>Evidence-first investigations</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-terminal-card scan">
              <div className="hero-terminal-bar">
                <div className="hero-terminal-dots"><i /><i /><i /></div>
                <div className="hero-terminal-label"><span className="live">● LIVE</span> · AUTHORISED TWIN · SIM-1042</div>
                <Terminal size={13} style={{ color: "var(--faint)" }} />
              </div>
              <HeroTopology />
              <div className="hero-stat-strip">
                <div>
                  <div className="k">Overall risk</div>
                  <div className="v" style={{ color: "#fca5a5" }}>74 <span className="tiny dim" style={{ fontWeight: 400 }}>/ 100</span></div>
                </div>
                <div>
                  <div className="k">Attack paths</div>
                  <div className="v">10 <span className="tiny dim" style={{ fontWeight: 400 }}>modelled</span></div>
                </div>
                <div>
                  <div className="k">Blocked hops</div>
                  <div className="v" style={{ color: "#6ee7b7" }}>6 <span className="tiny dim" style={{ fontWeight: 400 }}>this run</span></div>
                </div>
              </div>
              <div className="hero-status-rail">
                <span className="dot" style={{ color: "var(--red)" }} />
                ATTACK PATH SUCCEEDED
                <span className="path">web-01 → app-01 → db-01</span>
              </div>
            </div>
            <div className="public-note mt-12" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span className="row" style={{ gap: 6 }}><ShieldCheck size={12} /> Every simulation is isolated from production.</span>
              <span className="mono" style={{ fontSize: 8.5 }}>HUNTER-CORE v4.1</span>
            </div>
          </div>
        </div>
      </section>

      <div className="proof-strip">
        <div className="proof-inner">
          <span className="proof-label">Built for teams that cannot test in production</span>
          <div className="proof-items">
            <span><Building2 /> Financial services</span>
            <span><Layers /> SaaS platforms</span>
            <span><ShieldAlert /> Healthcare</span>
            <span><Network /> Critical infrastructure</span>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">One workspace, two systems</span>
          <h2 className="mt-12">Model the battlefield. Then investigate what happened.</h2>
          <p>
            The twin gives you a safe, deterministic environment for attack rehearsal. HUNTER AI gives you the
            evidence discipline to understand what was attempted, what succeeded and what to fix first.
          </p>
        </div>
        <div className="two-system-grid">
          <article className="panel system-card cyan">
            <div className="halo" />
            <Network className="system-icon" strokeWidth={1.3} />
            <div className="system-kicker">System A</div>
            <h3>Digital Twin Cyber War</h3>
            <p>
              A faithful, interactive replica of your network, identities and controls. Every attack is a chain of
              testable decisions against that model — never live traffic.
            </p>
            <ul className="system-list">
              <li><CheckCircle2 /> Visual network builder</li>
              <li><CheckCircle2 /> Ten attack scenarios</li>
              <li><CheckCircle2 /> Explainable risk scores</li>
              <li><CheckCircle2 /> Red vs Blue rounds</li>
              <li><CheckCircle2 /> Self-healing fixes</li>
              <li><CheckCircle2 /> What-if comparison</li>
            </ul>
            <div className="mt-20">
              <Link to="/app/twin/simulations" className="btn outline sm">Open simulation center <ArrowRight /></Link>
            </div>
          </article>

          <article className="panel system-card violet">
            <div className="halo" />
            <Brain className="system-icon" strokeWidth={1.3} />
            <div className="system-kicker">System B</div>
            <h3>HUNTER AI</h3>
            <p>
              An evidence-first detection and investigation layer. HUNTER normalises authorised logs, correlates
              behaviour and explains its confidence instead of hiding behind a score.
            </p>
            <ul className="system-list">
              <li><CheckCircle2 /> Threat detection</li>
              <li><CheckCircle2 /> Log analysis</li>
              <li><CheckCircle2 /> Behavioural fingerprints</li>
              <li><CheckCircle2 /> Source investigation</li>
              <li><CheckCircle2 /> Incident timeline</li>
              <li><CheckCircle2 /> Sealed evidence vault</li>
            </ul>
            <div className="mt-20">
              <Link to="/app/hunter" className="btn violet sm">Open HUNTER dashboard <ArrowRight /></Link>
            </div>
          </article>
        </div>
      </section>

      <section className="section banded" id="platform">
        <div className="section-inner">
          <div className="section-head">
            <span className="eyebrow">The platform</span>
            <h2 className="mt-12">From replica to response, without gaps.</h2>
            <p>
              Every feature shares the same model, role system and evidence trail. Simulated results, imported
              telemetry and external intelligence are always labelled separately.
            </p>
          </div>
          <div className="feature-grid">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <article className="panel feature-card w4 lift" key={feature.title}>
                  <div className="feature-icon"><Icon /></div>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head center">
          <span className="eyebrow">The loop</span>
          <h2 className="mt-12">A security loop you can prove.</h2>
          <p>No “trust us” dashboards. Every recommendation is tied to a path, a measurement and a re-run.</p>
        </div>
        <div className="steps-grid">
          {STEPS.map((step) => (
            <article className="step-cell" key={step.n}>
              <div className="num">{step.n}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section tight" style={{ paddingTop: 0 }}>
        <div className="sim-preview-grid">
          <div className="sim-preview-copy">
            <span className="eyebrow">Simulation engine</span>
            <h2 className="mt-12">A scenario is not a video. It is a chain of testable decisions.</h2>
            <p>
              Each hop uses modelled controls, deterministic success factors and an explicit probability. When a
              control is present, the chain stops — and the interface tells you exactly why.
            </p>
            <p>
              Switch to Red vs Blue and the same model plays both sides: the attacker proposes a technique, the
              defender answers with a control, and the round is scored on observed evidence.
            </p>
            <div className="fine row" style={{ gap: 14 }}>
              <span className="row" style={{ gap: 6 }}><ScanLine size={12} className="cyan" /> Deterministic</span>
              <span className="row" style={{ gap: 6 }}><ShieldCheck size={12} className="green" /> Authorised</span>
              <span className="row" style={{ gap: 6 }}><Lock size={12} className="violet" /> Evidence-backed</span>
            </div>
            <div className="mt-20">
              <Link to="/app/twin/attack-paths" className="btn outline">See an attack path <ArrowRight /></Link>
            </div>
          </div>
          <div className="panel execution-panel">
            <div className="execution-head">
              <span>SIM-1042 · WEB INJECTION TO EXFILTRATION</span>
              <span className="live"><span className="dot" /> LIVE</span>
            </div>
            {EXECUTION_ROWS.map((row) => (
              <div className="execution-row" key={row.idx}>
                <div className="idx">{row.idx}</div>
                <div>
                  <div className="path-label">{row.path}</div>
                  <div className="technique">{row.technique}</div>
                  <div className="factor">{row.factor}</div>
                </div>
                <span className={`outcome${row.success ? " success" : ""}`}>{row.outcome}</span>
              </div>
            ))}
            <div className="panel-footer" style={{ padding: "11px 16px", fontSize: 9, color: "var(--faint)", fontFamily: "var(--mono)" }}>
              4 hops · attacker reached db-01 · risk unchanged at 74 · evidence generated
            </div>
          </div>
        </div>
      </section>

      <section className="section banded">
        <div className="section-inner">
          <div className="section-head">
            <span className="eyebrow">Architecture</span>
            <h2 className="mt-12">Two systems, one evidence trail.</h2>
            <p>
              The twin and HUNTER share a single organization model, role system and audit trail. Nothing is
              disconnected, and nothing is silently mixed.
            </p>
          </div>
          <div className="arch-grid">
            <article className="panel arch-card">
              <Building2 />
              <h3>One organization model</h3>
              <p>Assets, identities, incidents, evidence and reports belong to one workspace with one permissions model.</p>
            </article>
            <article className="panel arch-card">
              <h3 style={{ marginTop: 0 }}>Reference architecture</h3>
              <div className="arch-services mt-16">
                <span className="arch-service">Twin graph</span>
                <span className="arch-service">Scenario engine</span>
                <span className="arch-service">Risk engine</span>
                <span className="arch-service">Event normaliser</span>
                <span className="arch-service">Behaviour models</span>
                <span className="arch-service">Evidence vault</span>
                <span className="arch-service">Case manager</span>
                <span className="arch-service">Report builder</span>
              </div>
              <p className="mt-12">
                Deterministic by default. Simulated entities cannot trigger production actions, and imported logs
                stay explicitly labelled.
              </p>
            </article>
            <article className="panel arch-card">
              <ShieldCheck />
              <h3>Safe by design</h3>
              <p>No production traffic, no live exploitation and no hidden automation. Every action is scoped, logged and reversible.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="panel cta-band" style={{ background: "radial-gradient(700px 300px at 0% 0%, rgba(6,182,212,.1), transparent 65%), #07101d" }}>
          <div>
            <span className="eyebrow">Start with the twin you already know</span>
            <h2 className="mt-12">Test the path before it becomes an incident.</h2>
            <p>
              The Northwind demo workspace is loaded with 12 assets, 10 scenarios and weeks of investigation
              evidence. Open it in one click — no sign-up required in this demo.
            </p>
          </div>
          <div className="cta-actions">
            <Link to={primary} className="btn primary lg">{primaryLabel} <ArrowRight /></Link>
            <Link to="/pricing" className="btn outline lg">View plans</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
