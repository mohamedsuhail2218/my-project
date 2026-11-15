import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Copy,
  Crown,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Lock,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  Modal,
  Notice,
  PageHeader,
  Panel,
  Progress,
  StatCard,
} from "../../components/ui";
import { downloadFile, formatDate, timeAgo } from "../../lib/format";

const PLANS = {
  Starter: { price: 14999, limit: 5, assets: 8, seats: 3, description: "A safe rehearsal space for a small team." },
  Professional: { price: 39999, limit: 25, assets: 40, seats: 10, description: "Continuous validation plus HUNTER investigations." },
  Enterprise: { price: null, limit: 9999, assets: 9999, seats: 9999, description: "Custom models, SSO and multi-workspace." },
};

// Direct UPI collection number for this workspace. Payments are settled outside
// the app; no card data is collected and transfers are verified by the owner.
const PAYMENT_UPI = "8939144690";
const formatInr = (value) => `₹${value.toLocaleString("en-IN")}`;

const INVOICES = [
  { id: "INV-2026-11", date: "01 Nov 2026", amount: "₹39,999", plan: "Professional", status: "Paid" },
  { id: "INV-2026-10", date: "01 Oct 2026", amount: "₹39,999", plan: "Professional", status: "Paid" },
  { id: "INV-2026-09", date: "01 Sep 2026", amount: "₹39,999", plan: "Professional", status: "Paid" },
  { id: "INV-2026-08", date: "01 Aug 2026", amount: "₹39,999", plan: "Professional", status: "Paid" },
];

export default function Subscription() {
  const { state, dispatch, risk, changePlan: requestPlanChange } = useApp();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);
  const canManagePlan = state.user?.roleKey === "super_admin";

  const plan = PLANS[state.org.plan] || PLANS.Professional;
  const currentMonth = new Date().getMonth();
  const usage = useMemo(() => {
    const runs = state.runs.filter((run) => new Date(run.startedAt).getMonth() === currentMonth).length;
    return {
      runs,
      assets: state.assets.length,
      seats: state.team.length,
      evidence: state.evidence.length,
    };
  }, [state.runs, state.assets.length, state.team.length, state.evidence.length]);

  const changePlan = async (name) => {
    if (name === state.org.plan || changingPlan) return;
    if (!canManagePlan) {
      dispatch({
        type: "PUSH_TOAST",
        toast: { title: "Not permitted", message: "Only a Super Admin can change the plan.", tone: "warning" },
      });
      return;
    }
    setChangingPlan(true);
    try {
      await requestPlanChange(name);
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: `Plan updated to ${name}`,
          message: "The plan change was recorded. Payment is settled separately by UPI and was not processed by this app.",
          tone: "success",
        },
      });
    } catch (error) {
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Could not change the plan",
          message: error?.message || "The API rejected the plan change.",
          tone: "danger",
        },
      });
    } finally {
      setChangingPlan(false);
    }
  };

  const copyUpi = async () => {
    try {
      await navigator.clipboard.writeText(PAYMENT_UPI);
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Payment number copied",
          message: `${PAYMENT_UPI} is ready to paste into your UPI app.`,
          tone: "success",
        },
      });
    } catch {
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Clipboard unavailable",
          message: `The UPI / mobile payment number is ${PAYMENT_UPI}.`,
          tone: "warning",
        },
      });
    }
  };

  const openInvoice = () => {
    downloadFile(
      "northwind-invoices.csv",
      ["Invoice,Date,Plan,Amount,Status", ...INVOICES.map((invoice) => [invoice.id, invoice.date, invoice.plan, invoice.amount.replace("₹", "INR "), invoice.status].join(","))].join("\n"),
      "text/csv"
    );
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Invoices exported", message: "Billing history was downloaded as CSV.", tone: "success" },
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Shared · Subscription"
        title="A plan that matches the way you test."
        subtitle="Billing is a direct UPI transfer; this app never receives or stores card data. Plan changes are server-owned and applied by a Super Admin after the transfer is verified."
        actions={
          <Link to="/pricing" className="btn outline"><ExternalLink /> Compare public plans</Link>
        }
      />

      <div className="plan-hero">
        <div>
          <div className="row wrap" style={{ gap: 9 }}>
            <span className="plan-name">{state.org.plan}</span>
            <Badge tone="violet"><Crown size={10} /> Active subscription</Badge>
          </div>
          <p className="small muted mt-6">{plan.description}</p>
          <div className="row wrap mt-12" style={{ gap: 14 }}>
            <span className="small-meta row" style={{ gap: 5 }}><Calendar size={11} /> Activated after payment verification</span>
            <span className="small-meta row" style={{ gap: 5 }}><Smartphone size={11} /> UPI · {PAYMENT_UPI}</span>
            <span className="small-meta row" style={{ gap: 5 }}><ShieldCheck size={11} /> GST invoice on request</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="brief-number" style={{ color: "var(--cyan)" }}>
            {plan.price ? formatInr(plan.price) : "Custom"}
          </div>
          <div className="small-meta">PER MONTH · {state.org.region}</div>
          <div className="row mt-12" style={{ justifyContent: "flex-end", gap: 7 }}>
            <button type="button" className="btn outline sm" onClick={() => setPaymentOpen(true)}><Smartphone /> Pay via UPI</button>
            <button type="button" className="btn primary sm" onClick={() => changePlan("Enterprise")} disabled={!canManagePlan || changingPlan}><Sparkles /> Upgrade</button>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Monthly simulations" value={`${usage.runs} / ${plan.limit > 1000 ? "∞" : plan.limit}`} icon={<Zap />} tone="high" foot="Quota resets on the first of each month" />
        <StatCard label="Twin assets" value={`${usage.assets} / ${plan.assets > 1000 ? "∞" : plan.assets}`} icon={<Gauge />} tone="info" foot="Counts every node in the graph" />
        <StatCard label="Seats in use" value={`${usage.seats} / ${state.org.seats}`} icon={<Crown />} tone="violet" foot={`${state.team.filter((member) => member.invited !== "invited").length} active members`} />
        <StatCard label="Evidence storage" value={`${(usage.evidence * 0.74 + 1.2).toFixed(1)} GB`} icon={<Lock />} tone="success" foot="of 20 GB Professional storage" />
      </div>

      <div className="content-grid split-2-1">
        <Panel title="Usage this cycle" icon={<Gauge size={15} />}>
          <div className="usage-list">
            <div className="usage-row">
              <div className="t"><span>Simulation quota</span><span>{usage.runs} / {plan.limit > 1000 ? "unlimited" : plan.limit}</span></div>
              <Progress value={Math.min(100, (usage.runs / Math.min(plan.limit, 1000)) * 100)} tone="amber" />
            </div>
            <div className="usage-row">
              <div className="t"><span>Twin assets</span><span>{usage.assets} / {plan.assets > 1000 ? "unlimited" : plan.assets}</span></div>
              <Progress value={Math.min(100, (usage.assets / Math.min(plan.assets, 1000)) * 100)} />
            </div>
            <div className="usage-row">
              <div className="t"><span>Seats</span><span>{usage.seats} / {state.org.seats}</span></div>
              <Progress value={Math.min(100, (usage.seats / state.org.seats) * 100)} tone="violet" />
            </div>
            <div className="usage-row">
              <div className="t"><span>Evidence storage</span><span>{(usage.evidence * 0.74 + 1.2).toFixed(1)} GB / 20 GB</span></div>
              <Progress value={Math.min(100, ((usage.evidence * 0.74 + 1.2) / 20) * 100)} tone="green" />
            </div>
            <div className="usage-row">
              <div className="t"><span>Control coverage</span><span>{risk.coverage}% · increasing</span></div>
              <Progress value={risk.coverage} tone="green" />
            </div>
          </div>
          <div className="notice mt-16">
            <ShieldCheck />
            <div>Professional includes advanced simulations, HUNTER AI, what-if, fingerprints, Red vs Blue and self-healing recommendations.</div>
          </div>
        </Panel>

        <Panel title="Pay by UPI" icon={<Smartphone size={15} />}>
          <div style={{ padding: 16, border: "1px solid var(--border-soft)", borderRadius: 10, background: "linear-gradient(135deg, rgba(6,182,212,.08), rgba(139,92,246,.05))" }}>
            <div className="row between">
              <span className="badge info">UPI · MANUAL VERIFICATION</span>
              <Smartphone size={19} className="dim" />
            </div>
            <div className="small-meta mt-20">PAY TO UPI / MOBILE NUMBER</div>
            <div className="row between mt-6">
              <span className="mono" style={{ fontSize: 20, letterSpacing: ".08em" }}>{PAYMENT_UPI}</span>
              <button type="button" className="btn ghost sm" onClick={copyUpi}>
                <Copy size={12} /> Copy
              </button>
            </div>
            <div className="row between mt-12">
              <span className="small-meta">{plan.price ? `${formatInr(plan.price)} / month` : "Custom amount"}</span>
              <span className="small-meta">{state.org.plan}</span>
            </div>
          </div>
          <div className="link-row mt-12"><span>Destination</span><span className="v">UPI / mobile number</span></div>
          <div className="link-row"><span>Billing email</span><span className="v">{state.user?.email || "billing@northwind.io"}</span></div>
          <div className="link-row"><span>Currency</span><span className="v">INR</span></div>
          <button type="button" className="btn outline block mt-12" onClick={() => setPaymentOpen(true)}>
            <Smartphone /> Payment instructions
          </button>
          <div className="notice mt-12">
            <ShieldCheck />
            <div>HUNTER never asks for your UPI PIN, OTP or card CVV. Only pay to the number above and keep the transaction reference.</div>
          </div>
        </Panel>
      </div>

      <div className="content-grid split-2-1">
        <Panel title="Change plan" icon={<Sparkles size={15} />}>
          {!canManagePlan && (
            <Notice tone="warning">
              Only a Super Admin can change the workspace plan. Ask an owner if you need an upgrade.
            </Notice>
          )}
          <div className="grid-3">
            {Object.entries(PLANS).map(([name, details]) => {
              const active = name === state.org.plan;
              return (
                <div className={`scenario-card${active ? " active" : ""}`} key={name}>
                  <div className="scenario-top">
                    <span className="scenario-icon"><Crown /></span>
                    {active ? <Badge tone="success">Current</Badge> : <Badge tone="neutral">{details.limit > 1000 ? "Custom" : `${details.limit} runs`}</Badge>}
                  </div>
                  <div className="scenario-name">{name}</div>
                  <div className="price-value" style={{ marginTop: 10 }}>
                    {details.price ? <strong style={{ fontSize: 23 }}>{formatInr(details.price)}</strong> : <strong style={{ fontSize: 23 }}>Custom</strong>}
                    <span>{details.price ? "/ mo" : ""}</span>
                  </div>
                  <p className="scenario-summary">{details.description}</p>
                  <button
                    type="button"
                    className={`btn block sm mt-12 ${active ? "outline" : name === "Professional" ? "primary" : "outline"}`}
                    onClick={() => changePlan(name)}
                    disabled={active || !canManagePlan || changingPlan}
                  >
                    {active ? <><CheckCircle2 /> Active plan</> : <>Choose {name} <ArrowRight /></>}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="pricing-note" style={{ textAlign: "left" }}>
            Plan changes are server-owned and limited to Super Admins. Choosing a plan does not charge or verify
            payment: settle the amount by UPI first, then the owner applies the plan after confirming the transfer.
          </p>
        </Panel>

        <Panel
          title="Invoices"
          icon={<FileText size={15} />}
          action={<button type="button" className="btn ghost sm" onClick={openInvoice}><Download /> Export</button>}
          flush
        >
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {INVOICES.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <div className="strong" style={{ fontSize: 13 }}>{invoice.id}</div>
                      <div className="small-meta mt-6">{invoice.plan}</div>
                    </td>
                    <td className="small-meta">{invoice.date}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{invoice.amount}</td>
                    <td><Badge tone="success">{invoice.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-footer">
            <span className="small muted">Sample invoice history for the demo workspace. Real GST invoices are issued by the workspace owner after a UPI transfer is verified.</span>
          </div>
        </Panel>
      </div>

      <Panel className="mt-12" title="Plan entitlements" icon={<ShieldCheck size={15} />}>
        <div className="grid-3">
          {[
            ["Advanced simulations", true],
            ["HUNTER detections", true],
            ["What-if comparison", true],
            ["Behavioural fingerprints", true],
            ["Red vs Blue rounds", true],
            ["Self-healing recommendations", true],
            ["Historical analytics", true],
            ["Multi-workspace", state.org.plan === "Enterprise"],
            ["Priority support", state.org.plan === "Enterprise"],
          ].map(([label, enabled]) => (
            <div key={label} className="row" style={{ gap: 8, opacity: enabled ? 1 : 0.42 }}>
              {enabled ? <CheckCircle2 size={14} className="green" /> : <Lock size={13} className="dim" />}
              <span className="small soft">{label}</span>
              {!enabled && <Badge tone="neutral" className="nowrap"><Lock size={9} /> Enterprise</Badge>}
            </div>
          ))}
        </div>
      </Panel>

      <Modal
        open={paymentOpen}
        title="Pay by UPI"
        subtitle="Send the plan amount directly to the workspace UPI / mobile number. Plan activation is manual."
        onClose={() => setPaymentOpen(false)}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setPaymentOpen(false)}>Close</button>
            <button type="button" className="btn primary" onClick={copyUpi}>
              <Copy /> Copy {PAYMENT_UPI}
            </button>
          </>
        }
      >
        <div className="result-hero">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow violet">PAYMENT AMOUNT · {state.org.plan.toUpperCase()}</div>
            <div className="brief-number mt-6" style={{ color: "var(--cyan)" }}>
              {plan.price ? formatInr(plan.price) : "Custom"}
            </div>
            <div className="small-meta mt-6">
              {plan.price ? "PER MONTH · INR" : "AGREE THE AMOUNT WITH YOUR OWNER FIRST"}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div className="small-meta">PAY TO UPI / MOBILE</div>
            <div className="mono" style={{ fontSize: 18, letterSpacing: ".08em" }}>{PAYMENT_UPI}</div>
            <button type="button" className="btn ghost sm mt-6" onClick={copyUpi}>
              <Copy size={12} /> Copy
            </button>
          </div>
        </div>

        <div className="drawer-section">
          <div className="label">How to pay</div>
          <div className="stack-6">
            <div className="kv-row"><span className="k">1</span><span className="v">Open any UPI app and choose pay to mobile or UPI.</span></div>
            <div className="kv-row"><span className="k">2</span><span className="v">Enter {PAYMENT_UPI} and confirm the payee name shown by your app.</span></div>
            <div className="kv-row">
              <span className="k">3</span>
              <span className="v">
                Pay {plan.price ? `${formatInr(plan.price)} for ${state.org.plan}` : "the agreed Enterprise amount"} and
                add your workspace name as the payment note.
              </span>
            </div>
            <div className="kv-row"><span className="k">4</span><span className="v">Keep the UTR / transaction reference and send it to your workspace Super Admin.</span></div>
          </div>
        </div>

        <div className="notice warning mt-12">
          <ShieldCheck />
          <div>
            <strong>Manual verification.</strong> This app cannot see or verify UPI transfers. A Super Admin must
            confirm receipt before the plan changes. Never share your UPI PIN, OTP or CVV with anyone.
          </div>
        </div>

        <div className="notice mt-12">
          <FileText />
          <div>Need a GST invoice? Send the transaction reference to your workspace owner; invoices are issued after the transfer is verified.</div>
        </div>
      </Modal>
    </div>
  );
}
