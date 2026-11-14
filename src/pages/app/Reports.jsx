import React, { useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import {
  Badge,
  Drawer,
  Modal,
  PageHeader,
  Panel,
  StatCard,
} from "../../components/ui";
import { downloadFile, formatDate, formatDateTime, timeAgo } from "../../lib/format";

const REPORT_TYPES = ["Executive", "Incident", "Simulation", "Compliance"];

const TYPE_TONE = {
  Executive: "violet",
  Incident: "critical",
  Simulation: "info",
  Compliance: "success",
};

function reportMarkdown(report, state, risk) {
  return `# ${report.title}

**Report ID:** ${report.id}
**Type:** ${report.type}
**Scope:** ${report.scope}
**Generated:** ${formatDateTime(report.createdAt)}
**Author:** ${report.author}
**Workspace:** ${state.org.name}

## Executive summary

${report.summary}

## Current posture

- Overall twin risk: ${risk.score}/100
- Likelihood: ${risk.likelihood}/100
- Impact: ${risk.impact}/100
- Control coverage: ${risk.coverage}%
- Open detections: ${state.detections.filter((item) => item.status === "open").length}
- Active incidents: ${state.incidents.filter((item) => item.status !== "closed").length}
- Evidence objects sealed: ${state.evidence.length}
- Assets modelled: ${state.assets.length}

## Recent simulations

${state.runs
  .slice(0, 5)
  .map(
    (run) =>
      `- ${run.id} · ${run.status} · attacker ${run.attackerSuccess ? "succeeded" : "blocked"} · risk ${run.riskBefore ?? "-"} → ${run.riskAfter ?? "-"}`
  )
  .join("\n")}

## Priority recommendations

${state.recommendations
  .filter((rec) => rec.status === "proposed")
  .map((rec) => `- ${rec.title} (${rec.category}, ${rec.effort} effort)`)
  .join("\n") || "- No outstanding recommendations."}

## Evidence and provenance

All findings in this report are generated from the authorised Northwind Systems digital twin.
Simulated activity is labelled separately from imported telemetry. This demo does not contain
production data.

---
Digital Twin Cyber War · HUNTER AI · Safe-by-design simulation platform
`;
}

export default function Reports() {
  const { state, dispatch, risk } = useApp();
  const [type, setType] = useState("All");
  const [query, setQuery] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [draft, setDraft] = useState({
    title: "",
    type: "Executive",
    scope: "Whole workspace",
    summary: "",
  });
  const [schedules, setSchedules] = useState({
    weekly: true,
    incident: true,
    simulation: false,
  });

  const filtered = useMemo(
    () =>
      state.reports.filter(
        (report) =>
          (type === "All" || report.type === type) &&
          `${report.title} ${report.id} ${report.scope} ${report.author}`
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [state.reports, type, query]
  );

  const generatedThisMonth = useMemo(
    () =>
      state.reports.filter(
        (report) => new Date(report.createdAt).getMonth() === new Date().getMonth()
      ).length,
    [state.reports]
  );

  const openGenerate = () => {
    setDraft({
      title: "",
      type: "Executive",
      scope: "Whole workspace",
      summary: "",
    });
    setGenerateOpen(true);
  };

  const submitReport = (event) => {
    event.preventDefault();
    const title = draft.title.trim() || `${draft.type} security report — ${formatDate(new Date())}`;
    dispatch({
      type: "ADD_REPORT",
      report: {
        title,
        type: draft.type,
        scope: draft.scope,
        summary:
          draft.summary.trim() ||
          `Generated from the current twin posture: risk ${risk.score}/100, ${state.detections.filter((item) => item.status === "open").length} open detections and ${state.incidents.filter((item) => item.status !== "closed").length} active incidents.`,
        size: `${(0.8 + Math.random() * 2.3).toFixed(1)} MB`,
      },
    });
    setGenerateOpen(false);
  };

  const download = (report) => {
    downloadFile(
      `${report.id}_${report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`,
      reportMarkdown(report, state, risk),
      "text/markdown"
    );
    dispatch({
      type: "PUSH_TOAST",
      toast: { title: "Report downloaded", message: `${report.id} was exported as Markdown.`, tone: "success" },
    });
  };

  const previewReport = preview
    ? state.reports.find((report) => report.id === preview.id) || preview
    : null;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Shared · Security reports"
        title="Evidence that can leave the building."
        subtitle="Every report is generated from the current twin posture, linked investigations and sealed evidence. Simulated and imported activity remains clearly separated."
        actions={
          <>
            <button
              type="button"
              className="btn outline"
              onClick={() => dispatch({ type: "PUSH_TOAST", toast: { title: "Template refreshed", message: "Report templates match the current posture model.", tone: "success" } })}
            >
              <RefreshCw /> Refresh templates
            </button>
            <button type="button" className="btn primary" onClick={openGenerate}>
              <Plus /> Generate report
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Reports available" value={state.reports.length} icon={<FileText />} tone="info" foot="All generated from workspace state" />
        <StatCard label="Generated this month" value={generatedThisMonth} icon={<BarChart3 />} tone="violet" foot="Executive, incident and simulation packs" />
        <StatCard label="Evidence linked" value={state.evidence.length} icon={<CheckCircle2 />} tone="success" foot="Sealed and hash-verified" />
        <StatCard label="Scheduled exports" value={Object.values(schedules).filter(Boolean).length} icon={<Clock />} tone="high" foot="Demo schedules, no email delivery" />
      </div>

      <div className="content-grid split-2-1">
        <Panel
          title="Report library"
          icon={<FileText size={15} />}
          action={<span className="small-meta">{filtered.length} OF {state.reports.length}</span>}
          flush
        >
          <div className="filters-bar">
            <div className="input-icon search" style={{ maxWidth: 280 }}>
              <Filter />
              <input
                className="input"
                placeholder="Search reports, scopes, authors…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="chip-row">
              {["All", ...REPORT_TYPES].map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`chip${type === item ? " active" : ""}`}
                  onClick={() => setType(item)}
                >
                  {item}
                  <span className="count">
                    {item === "All"
                      ? state.reports.length
                      : state.reports.filter((report) => report.type === item).length}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid-3" style={{ padding: 14 }}>
            {filtered.map((report) => (
              <article className="panel report-card" key={report.id}>
                <div className="report-head">
                  <span className="report-icon"><FileText /></span>
                  <Badge tone={TYPE_TONE[report.type] || "neutral"}>{report.type}</Badge>
                </div>
                <div className="report-title">{report.title}</div>
                <p className="report-summary">{report.summary}</p>
                <div className="report-meta">
                  <span>{report.id}</span>
                  <span>·</span>
                  <span>{report.size}</span>
                  <span>·</span>
                  <span>{timeAgo(report.createdAt)}</span>
                </div>
                <div className="report-meta">
                  <span>Scope: {report.scope}</span>
                  <span>·</span>
                  <span>{report.author}</span>
                </div>
                <div className="report-actions">
                  <button type="button" className="btn outline sm" onClick={() => setPreview(report)}>
                    <Eye /> Preview
                  </button>
                  <button type="button" className="btn ghost sm" onClick={() => download(report)}>
                    <Download /> Export
                  </button>
                </div>
              </article>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="empty-state">
              <FileText size={26} />
              <div className="strong">No reports match those filters.</div>
              <div className="small">Try another type or clear the search.</div>
              <button type="button" className="btn outline sm" onClick={() => { setQuery(""); setType("All"); }}>
                Reset filters
              </button>
            </div>
          )}
        </Panel>

        <div className="stack">
          <Panel title="Automation" icon={<Sparkles size={15} />}>
            <p className="small muted">
              Scheduled packs are built from the latest workspace state. In this demo they are generated on
              demand only.
            </p>
            <div className="mt-12">
              {[
                ["weekly", "Weekly executive brief", "Every Monday, 08:00 UTC"],
                ["incident", "Incident closure pack", "When a case is closed"],
                ["simulation", "Simulation evidence pack", "After every red/blue round"],
              ].map(([key, title, detail]) => (
                <div className="settings-row" key={key}>
                  <div>
                    <div className="t">{title}</div>
                    <div className="d">{detail}</div>
                  </div>
                  <button
                    type="button"
                    className={`toggle${schedules[key] ? " on" : ""}`}
                    onClick={() => setSchedules({ ...schedules, [key]: !schedules[key] })}
                    aria-pressed={schedules[key]}
                    aria-label={`Toggle ${title}`}
                  />
                </div>
              ))}
            </div>
            <div className="notice mt-12">
              <Clock />
              <div>Automation is local to this demo. Production delivery would use the workspace notification channel.</div>
            </div>
          </Panel>

          <Panel title="Posture snapshot" icon={<BarChart3 size={15} />}>
            <div className="kv-list">
              <div className="kv-row"><span className="k">Overall risk</span><span className="v" style={{ color: "var(--amber)" }}>{risk.score} / 100</span></div>
              <div className="kv-row"><span className="k">Potential attack paths</span><span className="v">{state.scenarios.length}</span></div>
              <div className="kv-row"><span className="k">Open detections</span><span className="v">{state.detections.filter((item) => item.status === "open").length}</span></div>
              <div className="kv-row"><span className="k">Active incidents</span><span className="v">{state.incidents.filter((item) => item.status !== "closed").length}</span></div>
              <div className="kv-row"><span className="k">Control coverage</span><span className="v">{risk.coverage}%</span></div>
              <div className="kv-row"><span className="k">Evidence integrity</span><span className="v green">100%</span></div>
            </div>
            <div className="mt-16">
              <button type="button" className="btn primary block" onClick={openGenerate}>
                <Plus /> Build from snapshot
              </button>
            </div>
          </Panel>

          <Panel title="Report format" icon={<FileText size={15} />}>
            <p className="small muted">
              Exports include a Markdown narrative, posture snapshot, simulation history,
              recommendation queue and evidence provenance. PDF rendering is represented by print-ready
              Markdown in this demo.
            </p>
          </Panel>
        </div>
      </div>

      <Modal
        open={generateOpen}
        title="Generate a security report"
        subtitle="The current twin posture and incident state are captured at generation time."
        onClose={() => setGenerateOpen(false)}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setGenerateOpen(false)}>Cancel</button>
            <button type="submit" form="report-form" className="btn primary"><FileText /> Generate</button>
          </>
        }
      >
        <form id="report-form" onSubmit={submitReport}>
          <div className="form-grid">
            <div className="field span-2">
              <label>Report title</label>
              <input className="input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. Q4 attack surface review" />
            </div>
            <div className="field">
              <label>Report type</label>
              <select className="select" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
                {REPORT_TYPES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Scope</label>
              <select className="select" value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })}>
                <option>Whole workspace</option>
                <option>Digital twin only</option>
                <option>HUNTER AI only</option>
                <option>Latest simulation</option>
                <option>Open incidents</option>
              </select>
            </div>
            <div className="field span-2">
              <label>Analyst summary (optional)</label>
              <textarea className="textarea" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="Add context the generated posture cannot infer." />
            </div>
          </div>
          <div className="notice mt-16">
            <CheckCircle2 />
            <div>The report is generated from local workspace state and can be exported immediately.</div>
          </div>
        </form>
      </Modal>

      <Drawer
        open={Boolean(previewReport)}
        title={previewReport?.title || "Report preview"}
        subtitle={`${previewReport?.id} · ${previewReport?.type} · ${formatDate(previewReport?.createdAt)}`}
        onClose={() => setPreview(null)}
        footer={
          <>
            <button type="button" className="btn primary" onClick={() => previewReport && download(previewReport)}>
              <Download /> Export Markdown
            </button>
            <button type="button" className="btn outline" onClick={() => setPreview(null)}><X /> Close</button>
          </>
        }
      >
        {previewReport && (
          <>
            <div className="row wrap mb-12" style={{ gap: 7 }}>
              <Badge tone={TYPE_TONE[previewReport.type] || "neutral"}>{previewReport.type}</Badge>
              <Badge tone="success">Ready</Badge>
              <span className="small-meta">{previewReport.size}</span>
            </div>
            <div className="report-preview">
              <h3>Executive summary</h3>
              <p>{previewReport.summary}</p>
              <h3>Current posture</h3>
              <ul>
                <li>Overall risk <strong>{risk.score}/100</strong> ({risk.covered || `${risk.coverage}%`} control coverage)</li>
                <li>{state.detections.filter((item) => item.status === "open").length} open detections and {state.incidents.filter((item) => item.status !== "closed").length} active incidents</li>
                <li>{state.assets.length} assets and {state.edges.length} approved links in the Northwind twin</li>
                <li>{state.evidence.length} sealed evidence objects, chain of custody intact</li>
              </ul>
              <h3>Recent simulations</h3>
              <ul>
                {state.runs.slice(0, 4).map((run) => (
                  <li key={run.id}>
                    <code>{run.id}</code> · {state.scenarios.find((scenario) => scenario.id === run.scenarioId)?.name || run.scenarioId} ·{" "}
                    {run.attackerSuccess ? "attacker succeeded" : "attack blocked"} · risk {run.riskBefore ?? "—"} → {run.riskAfter ?? "—"}
                  </li>
                ))}
              </ul>
              <h3>Priority recommendations</h3>
              <ul>
                {state.recommendations.filter((rec) => rec.status === "proposed").slice(0, 5).map((rec) => (
                  <li key={rec.id}>{rec.title} <span className="small dim">({rec.category} · {rec.effort} effort)</span></li>
                ))}
              </ul>
              <h3>Provenance</h3>
              <p>
                This preview is generated from the authorized digital twin and HUNTER workspace. Simulated
                activity is labelled separately from imported logs. No production traffic is represented.
              </p>
            </div>
            <div className="notice success mt-16">
              <CheckCircle2 />
              <div>Report ID {previewReport.id} · generated {formatDateTime(previewReport.createdAt)} by {previewReport.author}.</div>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
