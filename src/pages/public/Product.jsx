import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileSearch,
  Fingerprint,
  GitBranch,
  Gauge,
  Lock,
  Network,
  ScrollText,
  ShieldCheck,
  Siren,
  Target,
  Wrench,
} from "lucide-react";
import { useApp } from "../../state/AppState";

function MiniTwin() {
  return (
    <div className="mini-map">
      <svg className="hero-topology" viewBox="0 0 400 210" style={{ transform: "scale(1.02)", transformOrigin: "center" }}>
        <path className="link" d="M55 105 L150 75" />
        <path className="link" d="M55 105 L150 145" />
        <path className="link" d="M150 75 L265 105" />
        <path className="link" d="M150 145 L265 105" />
        <path className="link" d="M265 105 L345 70" />
        <path className="link" d="M265 105 L345 150" />
        <path className="attack-link" d="M55 105 L150 75" />
        <path className="attack-link" d="M150 75 L265 105" />
        <path className="attack-link" d="M265 105 L345 150" />
        {[
          { x: 55, y: 105, label: "edge-fw", sub: "EDGE" },
          { x: 150, y: 75, label: "web-01", sub: "DMZ" },
          { x: 150, y: 145, label: "vpn-01", sub: "DMZ" },
          { x: 265, y: 105, label: "app-01", sub: "APP", critical: true },
          { x: 345, y: 70, label: "db-01", sub: "DATA", critical: true },
          { x: 345, y: 150, label: "s3", sub: "CLOUD", critical: true },
        ].map((node) => (
          <g key={node.label} className={`node${node.critical ? " critical" : ""}`} transform={`translate(${node.x}, ${node.y})`}>
            <rect className="node-body" x="-30" y="-14" width="60" height="28" rx="5" />
            <text className="node-label" x="-24" y="-2" style={{ fontSize: 10.5 }}>{node.label}</text>
            <text className="node-sub" x="-24" y="9" style={{ fontSize: 10 }}>{node.sub}</text>
          </g>
        ))}
      </svg>
      <div className="mini-row" style={{ position: "absolute", left: 10, bottom: 10 }}>
        <span className="mini-pill hot">ATTACK PATH ACTIVE</span>
        <span className="mini-pill">4 hops</span>
      </div>
    </div>
  );
}

function MiniDetection() {
  return (
    <div className="mini-dashboard">
      <div className="mini-top">
        <div className="mini-tile"><div className="k">Open detections</div><div className="v" style={{ color: "#fca5a5" }}>7</div></div>
        <div className="mini-tile"><div className="k">Mean confidence</div><div className="v">88%</div></div>
        <div className="mini-tile"><div className="k">Active incidents</div><div className="v">3</div></div>
      </div>
      <div className="mini-map" style={{ height: 165, padding: 10 }}>
        <div className="stack-6">
          {[
            ["Encoded PowerShell on ws-042", "critical", "97%"],
            ["Password spray on vpn-01", "high", "94%"],
            ["Anonymous bucket listing", "high", "89%"],
            ["DNS beaconing to new domain", "medium", "78%"],
          ].map(([title, tone, confidence]) => (
            <div key={title} className="row between" style={{ padding: "7px 8px", border: "1px solid var(--border-soft)", borderRadius: 6, background: "rgba(8,15,29,.65)" }}>
              <span className="row" style={{ gap: 7, minWidth: 0 }}>
                <span className={`dot ${tone === "critical" ? "pulse" : ""}`} style={{ color: tone === "critical" ? "var(--red)" : tone === "high" ? "var(--orange)" : "var(--amber)" }} />
                <span className="small truncate" style={{ color: "var(--text-soft)" }}>{title}</span>
              </span>
              <span className="mono tiny dim">{confidence}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mini-row">
        <span className="mini-pill hot">2 escalated</span>
        <span className="mini-pill">4 auto-triaged</span>
        <span className="mini-pill">1 false positive</span>
      </div>
    </div>
  );
}

function MiniEvidence() {
  return (
    <div className="mini-dashboard">
      <div className="mini-top">
        <div className="mini-tile"><div className="k">Evidence sealed</div><div className="v">5</div></div>
        <div className="mini-tile"><div className="k">Chain integrity</div><div className="v" style={{ color: "#6ee7b7" }}>100%</div></div>
        <div className="mini-tile"><div className="k">Linked incidents</div><div className="v">3</div></div>
      </div>
      <div className="mini-map" style={{ height: 196, padding: 10 }}>
        {[
          ["ws-042_memory.raw.gz", "sha256:7f21c9…b4d0", "Memory capture"],
          ["vpn-01_auth.log", "sha256:2c84ae…91f3", "Authentication log"],
          ["cloudtrail_archive.jsonl", "sha256:9a03bd…c2e8", "Cloud audit trail"],
        ].map(([name, hash, type]) => (
          <div key={name} style={{ padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
            <div className="mono" style={{ fontSize: 12, color: "var(--text-soft)" }}>{name}</div>
            <div className="tiny dim mt-6">{type}</div>
            <div className="mono mt-6" style={{ fontSize: 10.5, color: "#7dd3fc" }}>{hash}</div>
          </div>
        ))}
      </div>
      <div className="mini-row">
        <span className="mini-pill">Immutable</span>
        <span className="mini-pill">Time-stamped</span>
        <span className="mini-pill">WORM vault</span>
      </div>
    </div>
  );
}

export default function Product() {
  const { state } = useApp();
  const primary = state.user ? "/app" : "/signup";
  const [activeTab, setActiveTab] = useState("twin");

  const go = (id, tab) => {
    setActiveTab(tab);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <section className="product-hero grid-bg">
        <div className="product-hero-inner">
          <span className="eyebrow">The platform</span>
          <h1>Two systems. One defensible security loop.</h1>
          <p>
            Digital Twin Cyber War gives you a safe copy of your environment to attack. HUNTER AI gives you the
            evidence discipline to investigate what happened. They share one organization model, one role system
            and one audit trail.
          </p>
          <div className="product-tabs">
            <button type="button" className={activeTab === "twin" ? "active" : ""} onClick={() => go("twin-system", "twin")}>
              Digital Twin Cyber War
            </button>
            <button type="button" className={activeTab === "hunter" ? "active" : ""} onClick={() => go("hunter-system", "hunter")}>
              HUNTER AI
            </button>
            <button type="button" className={activeTab === "foundation" ? "active" : ""} onClick={() => go("foundation", "foundation")}>
              Shared foundation
            </button>
          </div>
        </div>
      </section>

      <div className="section" style={{ paddingTop: 0, paddingBottom: 0 }} id="twin-system">
        <div className="product-showcase">
          <div>
            <span className="eyebrow">Digital Twin Cyber War</span>
            <h2 className="mt-12">Attack paths that end in a decision.</h2>
            <p>
              Build a live graph of assets, links, identities and controls. Run a scenario and watch every hop
              resolve against the model — with the exact factor that allowed or blocked it.
            </p>
            <ul className="product-list">
              <li><CheckCircle2 /> Interactive network builder with 12 asset types</li>
              <li><CheckCircle2 /> Ten scenario chains mapped to MITRE ATT&amp;CK techniques</li>
              <li><CheckCircle2 /> Red vs Blue rounds and a measurable self-healing loop</li>
              <li><CheckCircle2 /> What-if projections before you apply a control</li>
              <li><CheckCircle2 /> Deterministic results you can reproduce and export</li>
            </ul>
            <div className="mt-24">
              <Link to="/app/twin" className="btn primary">Open the twin <ArrowRight /></Link>
            </div>
          </div>
          <div className="panel product-visual">
            <div className="mini-top">
              <div className="mini-tile"><div className="k">Risk score</div><div className="v" style={{ color: "#fca5a5" }}>74</div></div>
              <div className="mini-tile"><div className="k">Assets</div><div className="v">12</div></div>
              <div className="mini-tile"><div className="k">Blocked hops</div><div className="v" style={{ color: "#6ee7b7" }}>6</div></div>
            </div>
            <MiniTwin />
          </div>
        </div>

        <div className="product-showcase reverse">
          <div>
            <span className="eyebrow">Explainable by default</span>
            <h2 className="mt-12">Risk that decomposes into reasons.</h2>
            <p>
              Every score is a function of likelihood, impact, exposure and control coverage. Open a recommendation
              and see the projected reduction before you commit the change.
            </p>
            <ul className="product-list">
              <li><CheckCircle2 /> Weighted asset risk by criticality</li>
              <li><CheckCircle2 /> Scenario-level exposure across ten paths</li>
              <li><CheckCircle2 /> Control coverage and outstanding gaps</li>
              <li><CheckCircle2 /> Ranked recommendations with projected delta</li>
            </ul>
            <div className="mt-24">
              <Link to="/app/twin/risk" className="btn outline">Explore risk analysis <ArrowRight /></Link>
            </div>
          </div>
          <div className="panel product-visual">
            <div className="row" style={{ alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div className="risk-ring" style={{ width: 130, height: 130 }}>
                <svg width="130" height="130" viewBox="0 0 130 130">
                  <circle className="ring-track" cx="65" cy="65" r="56" fill="none" strokeWidth="8" />
                  <circle cx="65" cy="65" r="56" fill="none" stroke="#fb923c" strokeWidth="8" strokeLinecap="round" strokeDasharray="351.8" strokeDashoffset="91" />
                </svg>
                <div className="risk-ring-center"><strong style={{ color: "#fb923c" }}>74</strong><span>RISK / 100</span></div>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                {[
                  ["Likelihood", 68, "amber"],
                  ["Impact", 81, "red"],
                  ["Exposure", 56, "violet"],
                  ["Control coverage", 42, "green"],
                ].map(([label, value, tone]) => (
                  <div key={label} className="factor-row" style={{ gridTemplateColumns: "100px 1fr 30px", marginTop: 9 }}>
                    <span className="k">{label}</span>
                    <div className={`progress ${tone}`}><span style={{ width: `${value}%` }} /></div>
                    <span className="v">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mini-row mt-20">
              <span className="mini-pill hot">3 critical assets</span>
              <span className="mini-pill">7 open controls</span>
              <span className="mini-pill">10 paths modelled</span>
            </div>
          </div>
        </div>
      </div>

      <section className="section banded" id="hunter-system">
        <div className="section-inner">
          <div className="product-showcase" style={{ paddingTop: 0 }}>
            <div>
              <span className="eyebrow violet">HUNTER AI</span>
              <h2 className="mt-12">Evidence-first detection, not alert theatre.</h2>
              <p>
                HUNTER normalises authorised logs, correlates behaviour and explains its confidence. Every
                detection links to the events, assets and evidence that produced it.
              </p>
              <ul className="product-list">
                <li><CheckCircle2 /> Rule, statistical and behavioural detections</li>
                <li><CheckCircle2 /> Log ingestion with a raw-event inspector</li>
                <li><CheckCircle2 /> Behavioural fingerprints with visible signals</li>
                <li><CheckCircle2 /> Source investigation across every workspace entity</li>
                <li><CheckCircle2 /> Incident case management and a sealed evidence vault</li>
              </ul>
              <div className="mt-24">
                <Link to="/app/hunter" className="btn violet">Open HUNTER AI <ArrowRight /></Link>
              </div>
            </div>
            <div className="panel product-visual">
              <MiniDetection />
            </div>
          </div>

          <div className="product-showcase reverse">
            <div>
              <span className="eyebrow violet">Investigations that hold up</span>
              <h2 className="mt-12">From raw event to sealed evidence.</h2>
              <p>
                Follow a source across detections, incidents, logs and intelligence. Preserve the chain of custody.
                Export a technical report without losing the thread from hypothesis to proof.
              </p>
              <ul className="product-list">
                <li><CheckCircle2 /> Pivot across IPs, domains, hashes and users</li>
                <li><CheckCircle2 /> SHA-256 evidence sealing and chain of custody</li>
                <li><CheckCircle2 /> Correlated event timeline across both systems</li>
                <li><CheckCircle2 /> Executive and technical report generation</li>
              </ul>
              <div className="mt-24">
                <Link to="/app/hunter/evidence" className="btn outline">See the evidence vault <ArrowRight /></Link>
              </div>
            </div>
            <div className="panel product-visual">
              <MiniEvidence />
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="foundation">
        <div className="section-head center">
          <span className="eyebrow">Shared foundation</span>
          <h2 className="mt-12">Safe by design, not by promise.</h2>
          <p>
            Simulated entities cannot trigger production actions. Imported logs stay explicitly labelled. Every
            change is scoped, logged and reversible.
          </p>
        </div>
        <div className="arch-grid">
          <article className="panel arch-card">
            <Network />
            <h3>One graph, one truth</h3>
            <p>The twin, detections and investigations all point back to the same asset identity.</p>
          </article>
          <article className="panel arch-card">
            <ShieldCheck />
            <h3>Guardrails on every action</h3>
            <p>Authorised sources only, with role checks, audit events and a replayable simulation history.</p>
          </article>
          <article className="panel arch-card">
            <Lock />
            <h3>Evidence you can defend</h3>
            <p>Sealed records, immutable hashes and a clear separation between simulation and reality.</p>
          </article>
        </div>
        <div className="panel cta-band mt-24">
          <div>
            <span className="eyebrow">Ready to run the loop?</span>
            <h2 className="mt-12">Start with a rehearsal, end with a measurable fix.</h2>
            <p>Open the Northwind demo workspace and run a scenario in under a minute.</p>
          </div>
          <div className="cta-actions">
            <Link to={primary} className="btn primary lg">Open the workspace <ArrowRight /></Link>
            <Link to="/pricing" className="btn outline lg">Compare plans</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
