import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import Brand from "./Brand";

export default function AuthLayout({ children }) {
  return (
    <div className="auth-shell">
      <aside className="auth-side grid-bg">
        <Brand />
        <div className="auth-quote">
          <span className="eyebrow violet">Digital Twin Cyber War</span>
          <h2>Rehearse the attack. Then prove the defence.</h2>
          <p>
            Model your infrastructure, run authorised attack paths against the twin and let HUNTER AI
            investigate the evidence. No production traffic. No guesswork.
          </p>
          <ul className="auth-quote-points">
            <li><CheckCircle2 /> Deterministic, explainable simulations</li>
            <li><CheckCircle2 /> Evidence-first detections and investigations</li>
            <li><CheckCircle2 /> A measurable self-healing loop</li>
          </ul>
        </div>
        <div className="auth-side-foot">
          <span className="row" style={{ gap: 7 }}><ShieldCheck size={13} /> SAFE-BY-DESIGN SIMULATION PLATFORM</span>
          <div className="mt-8">All workspace data is fictional and stored locally in this demo.</div>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="row" style={{ marginBottom: 24 }}>
            <Link to="/" className="btn ghost sm"><ArrowLeft /> Back to site</Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
