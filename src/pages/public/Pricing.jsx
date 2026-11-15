import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Check,
  Crown,
  HelpCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { useApp } from "../../state/AppState";

const PLANS = [
  {
    id: "Starter",
    name: "Starter",
    icon: Zap,
    desc: "For a small security team that needs a safe place to rehearse its first attack paths.",
    monthly: 14999,
    annual: 11999,
    limits: ["5 simulations / month", "8 twin assets", "3 analyst seats"],
    features: [
      { label: "Basic simulations", included: true },
      { label: "HUNTER detections", included: false },
      { label: "What-if comparison", included: false },
      { label: "Behavioural fingerprints", included: false },
      { label: "Red vs Blue rounds", included: false },
      { label: "Self-healing recommendations", included: true },
      { label: "Historical analytics", included: false },
      { label: "Multi-workspace", included: false },
    ],
    cta: "Start free trial",
  },
  {
    id: "Professional",
    name: "Professional",
    icon: Sparkles,
    desc: "For product and security teams running continuous validation alongside detection and response.",
    monthly: 39999,
    annual: 31999,
    limits: ["25 simulations / month", "40 twin assets", "10 analyst seats"],
    features: [
      { label: "Advanced simulations", included: true },
      { label: "HUNTER detections", included: true },
      { label: "What-if comparison", included: true },
      { label: "Behavioural fingerprints", included: true },
      { label: "Red vs Blue rounds", included: true },
      { label: "Self-healing recommendations", included: true },
      { label: "Historical analytics", included: true },
      { label: "Multi-workspace", included: false },
    ],
    cta: "Start 14-day trial",
    featured: true,
    flag: "Most teams choose this",
  },
  {
    id: "Enterprise",
    name: "Enterprise",
    icon: Crown,
    desc: "For regulated organisations that need custom models, SSO, and complete evidence workflows.",
    custom: true,
    limits: ["Unlimited simulations", "Unlimited assets", "Custom seats"],
    features: [
      { label: "Advanced simulations", included: true },
      { label: "HUNTER detections", included: true },
      { label: "What-if comparison", included: true },
      { label: "Behavioural fingerprints", included: true },
      { label: "Red vs Blue rounds", included: true },
      { label: "Self-healing recommendations", included: true },
      { label: "Historical analytics", included: true },
      { label: "Multi-workspace", included: true },
    ],
    cta: "Talk to sales",
  },
];

function formatINR(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Pricing() {
  const { state } = useApp();
  const [annual, setAnnual] = useState(false);
  const primary = state.user ? "/app" : "/signup";

  return (
    <div>
      <section className="product-hero grid-bg">
        <div className="product-hero-inner">
          <span className="eyebrow">Pricing</span>
          <h1>Plans that grow with your security program.</h1>
          <p>
            Start with a small twin, then add detections, investigations, evidence and unlimited rehearsal as
            your team matures. Every plan runs in the same isolated workspace.
          </p>
          <div className="row wrap mt-24" style={{ gap: 14 }}>
            <div className="product-tabs" style={{ marginTop: 0 }}>
              <button type="button" className={!annual ? "active" : ""} onClick={() => setAnnual(false)}>
                Monthly
              </button>
              <button type="button" className={annual ? "active" : ""} onClick={() => setAnnual(true)}>
                Annual · save 20%
              </button>
            </div>
            <span className="pricing-inr-note" style={{ marginTop: 0 }}>
              <Smartphone size={13} /> Prices in INR, settled by UPI after signup.
            </span>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 54 }}>
        <div className="pricing-grid">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const price = annual ? plan.annual : plan.monthly;
            return (
              <article className={`panel price-card${plan.featured ? " featured" : ""}`} key={plan.id}>
                {plan.flag && <span className="price-flag">{plan.flag}</span>}
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div className="price-name">{plan.name}</div>
                    <p className="price-desc">{plan.desc}</p>
                  </div>
                  <span
                    className="stat-icon"
                    style={{
                      width: 34,
                      height: 34,
                      color: plan.featured ? "var(--cyan)" : "var(--muted)",
                    }}
                  >
                    <Icon size={16} />
                  </span>
                </div>

                <div className="price-value">
                  {plan.custom ? (
                    <strong style={{ fontSize: 30 }}>Custom</strong>
                  ) : (
                    <>
                      <strong>{formatINR(price)}</strong>
                      <span>/ {annual ? "month, billed yearly" : "month"}</span>
                    </>
                  )}
                </div>
                <div className="price-limits">
                  {plan.limits.map((limit) => (
                    <span key={limit}>{limit}</span>
                  ))}
                </div>
                <ul className="price-features">
                  {plan.features.map((feature) => (
                    <li key={feature.label} style={{ opacity: feature.included ? 1 : 0.42 }}>
                      {feature.included ? <Check size={14} /> : <span style={{ width: 14, flexShrink: 0 }}>—</span>}
                      {feature.label}
                    </li>
                  ))}
                </ul>
                <Link
                  to={plan.custom ? "/app/subscription" : primary}
                  className={`btn block ${plan.featured ? "primary" : "outline"}`}
                >
                  {plan.cta} <ArrowRight />
                </Link>
              </article>
            );
          })}
        </div>

        <div className="row wrap mt-24" style={{ justifyContent: "center", gap: 18 }}>
          <span className="status-dot" style={{ color: "var(--green)", fontSize: 12.5 }}>
            No production traffic
          </span>
          <span className="status-dot" style={{ color: "var(--green)", fontSize: 12.5 }}>
            Cancel any time
          </span>
          <span className="status-dot" style={{ color: "var(--green)", fontSize: 12.5 }}>
            14-day Professional trial
          </span>
        </div>

        <div className="grid-3 mt-24">
          <div className="panel pad">
            <ShieldCheck size={19} className="cyan" />
            <h3 className="mt-12" style={{ fontSize: 14 }}>Simulation isolation</h3>
            <p className="small muted mt-6">
              Attack paths execute against a deterministic model. No live packets, no production credentials
              and no exploitation tooling.
            </p>
          </div>
          <div className="panel pad">
            <Building2 size={19} className="violet" />
            <h3 className="mt-12" style={{ fontSize: 14 }}>Workspace guardrails</h3>
            <p className="small muted mt-6">
              Role-based access, SSO, MFA enforcement, scoped seats and an audit trail are shared by the twin
              and HUNTER AI.
            </p>
          </div>
          <div className="panel pad">
            <HelpCircle size={19} className="amber" />
            <h3 className="mt-12" style={{ fontSize: 14 }}>What counts as a simulation?</h3>
            <p className="small muted mt-6">
              One scenario execution against the twin. Red vs Blue rounds and self-healing re-runs count
              toward the same monthly quota.
            </p>
          </div>
        </div>

        <div className="panel cta-band mt-24">
          <div>
            <span className="eyebrow">Still deciding?</span>
            <h2 className="mt-12">Open the demo workspace before you choose.</h2>
            <p>
              The Northwind Systems workspace is fully loaded with 12 assets, 10 scenarios, detections,
              evidence and reports. Explore it in one click.
            </p>
          </div>
          <div className="cta-actions">
            <Link to="/app" className="btn primary lg">Open the demo <ArrowRight /></Link>
            <Link to="/product" className="btn outline lg">Take the product tour</Link>
          </div>
        </div>

        <div className="pricing-note">
          Prices shown exclude taxes. This demo does not process payments; workspace billing is settled directly by
          UPI and plan changes are applied by a Super Admin after the transfer is verified.
        </div>
      </section>
    </div>
  );
}
