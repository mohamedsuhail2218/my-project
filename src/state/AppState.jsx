import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  SCENARIO_BY_ID,
  SCENARIOS,
} from "../data/mock";
import {
  createInitialState,
  migrateState,
  readCachedState,
  clearCachedState,
  writeCachedState,
} from "../data/initialState";
import {
  applyControl,
  applyControlByRecommendation,
  computeRisk,
  evaluateScenario,
} from "../lib/engine";
import { api } from "../lib/api";
import { uid } from "../lib/format";

function loadInitialState() {
  return readCachedState() || createInitialState();
}

function toast(state, toastInput) {
  return {
    ...state,
    toasts: [
      ...state.toasts.slice(-2),
      {
        id: uid("toast"),
        ...toastInput,
      },
    ],
  };
}

function notify(state, { title, detail, tone = "info", to = null }) {
  return {
    ...state,
    notifications: [
      {
        id: uid("ntf"),
        title,
        detail,
        tone,
        to,
        at: new Date().toISOString(),
        read: false,
      },
      ...state.notifications,
    ].slice(0, 30),
  };
}

function activity(state, { type, text, actor, tone = "info" }) {
  return {
    ...state,
    activity: [
      {
        id: uid("act"),
        type,
        text,
        actor,
        tone,
        at: new Date().toISOString(),
      },
      ...state.activity,
    ].slice(0, 40),
  };
}

function nextRunId(runs) {
  const highest = runs.reduce((max, run) => {
    const value = Number(String(run.id).replace(/\D/g, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 1042);
  return `SIM-${highest + 1}`;
}

function nextIncidentId(incidents) {
  const highest = incidents.reduce((max, incident) => {
    const value = Number(String(incident.id).replace(/\D/g, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 2041);
  return `INC-${highest + 1}`;
}

function nextDetectionId(detections) {
  const highest = detections.reduce((max, detection) => {
    const value = Number(String(detection.id).replace(/\D/g, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 8814);
  return `DET-${highest + 1}`;
}

function finishRun(state, run, executed) {
  const plan = run.plan || [];
  const attackerSuccess =
    plan.length > 0 && plan.every((step) => step.status === "success");
  const riskAfter = computeRisk(state.assets).score;
  const completedAt = new Date().toISOString();
  const started = new Date(run.startedAt).getTime();
  const scenario = SCENARIO_BY_ID[run.scenarioId];

  const findings = plan
    .filter((step) => step.status === "success")
    .map((step) => `${step.technique.split("·")[0].trim()} succeeded: ${step.successFactor}`)
    .concat(
      plan
        .filter((step) => step.status === "blocked")
        .map((step) => `${step.technique.split("·")[0].trim()} blocked: ${step.blockedFactor}`)
    );

  const finishedRun = {
    ...run,
    status: "completed",
    completedAt,
    durationMs: Math.max(1200, Date.now() - started),
    attackerSuccess,
    reachedStep: plan.filter((step) => step.status === "success").length,
    riskBefore: run.riskBefore,
    riskAfter,
    findings:
      findings.length > 0
        ? findings
        : ["The simulation completed without an evidence-backed finding."],
    executed,
  };

  let next = {
    ...state,
    runs: state.runs.map((item) => (item.id === run.id ? finishedRun : item)),
  };

  if (attackerSuccess && run.mode !== "red-blue" && scenario) {
    const detectionId = nextDetectionId(next.detections);
    const detection = {
      id: detectionId,
      title: scenario.name,
      severity: scenario.severity,
      status: "open",
      confidence: 0.9,
      source: "rule",
      technique: scenario.steps[0].technique.split("·")[0].trim(),
      techniqueName: scenario.steps[0].technique.split("·")[1]?.trim() || "Attack path",
      assetId: scenario.target,
      firstSeen: completedAt,
      lastSeen: completedAt,
      events: plan.length * 12,
      description: `Simulation ${run.id} reproduced the ${scenario.name} path against the authorised digital twin. Attacker reached ${scenario.target}.`,
      evidenceIds: [],
      incidentId: null,
      assignee: "Unassigned",
      simulationId: run.id,
    };

    next = { ...next, detections: [detection, ...next.detections] };

    if (["critical", "high"].includes(scenario.severity)) {
      const incidentId = nextIncidentId(next.incidents);
      const incident = {
        id: incidentId,
        title: `${scenario.name} — validation run ${run.id}`,
        severity: scenario.severity,
        status: "open",
        assignee: state.user?.name || "Unassigned",
        createdAt: completedAt,
        updatedAt: completedAt,
        detectionIds: [detectionId],
        summary: `A scheduled twin simulation reproduced this path. ${plan.length - (finishedRun.reachedStep || 0)} control gap(s) were observed. Validate against production telemetry before closure.`,
        containment: "Pending analyst review.",
        nextAction: "Review the simulation evidence and apply the recommended controls.",
        tags: ["simulation", scenario.category.toLowerCase().replaceAll(" ", "-")],
        simulationId: run.id,
      };
      next = {
        ...next,
        incidents: [incident, ...next.incidents],
        detections: next.detections.map((item) =>
          item.id === detectionId ? { ...item, incidentId } : item
        ),
      };
      next = notify(next, {
        title: `${incidentId} opened after ${run.id}`,
        detail: `${scenario.name} reached the target in the twin. Review the path and recommended fixes.`,
        tone: "critical",
        to: `/app/hunter/incidents/${incidentId}`,
      });
    }
  }

  next = activity(next, {
    type: "simulation",
    text: `${run.id} completed · ${
      attackerSuccess ? `attacker reached ${scenario?.target || "target"}` : "attack path blocked"
    }`,
    actor: state.user?.name || "System",
    tone: attackerSuccess ? "critical" : "success",
  });

  next = toast(next, {
    title: `Simulation ${run.id} completed`,
    message: attackerSuccess
      ? "The attack path succeeded in the twin. A validation incident was opened."
      : "All path hops were blocked by the modelled controls.",
    tone: attackerSuccess ? "danger" : "success",
  });

  return next;
}

function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE_WORKSPACE": {
      const next = migrateState(action.workspace, {
        orgName: state.org?.name,
      });
      return { ...next, user: action.user ?? state.user };
    }
    case "SET_SESSION_USER":
      return { ...state, user: action.user || null };
    case "SIGN_IN": {
      return { ...state, user: action.user || null };
    }
    case "SIGN_OUT":
      // Drop tenant data from memory as well as from localStorage. The next
      // sign-in hydrates a fresh, server-authoritative workspace snapshot.
      return createInitialState();

    case "START_RUN": {
      if (state.runs.some((run) => run.status === "running")) return state;
      const scenario = SCENARIO_BY_ID[action.scenarioId];
      if (!scenario) return state;
      const evaluation = evaluateScenario(scenario, state.assets);
      const riskBefore = computeRisk(state.assets).score;
      const run = {
        id: nextRunId(state.runs),
        scenarioId: scenario.id,
        mode: action.mode || "single",
        status: "running",
        startedAt: new Date().toISOString(),
        completedAt: null,
        durationMs: null,
        riskBefore,
        riskAfter: null,
        attackerSuccess: null,
        reachedStep: 0,
        totalSteps: evaluation.steps.length,
        findings: [],
        initiatedBy: state.user?.name || "Analyst",
        plan: evaluation.steps.map((step) => ({
          index: step.index,
          from: step.from,
          to: step.to,
          technique: step.technique,
          narrative: step.narrative,
          control: step.control,
          controlPresent: step.controlPresent,
          successFactor: step.successFactor,
          blockedFactor: step.blockedFactor,
          status: step.status,
          probability: step.probability,
          base: step.base,
          reachable: step.reachable,
        })),
        executed: [],
        cursor: 0,
      };
      let next = {
        ...state,
        runs: [run, ...state.runs],
        lastSyncedAt: new Date().toISOString(),
      };
      next = activity(next, {
        type: "simulation",
        text: `${run.id} started · ${scenario.name}`,
        actor: state.user?.name || "Analyst",
        tone: "info",
      });
      next = toast(next, {
        title: `${run.id} started`,
        message: `${scenario.name} is executing against the authorised twin.`,
        tone: "info",
      });
      return next;
    }

    case "ADVANCE_RUN": {
      const run = state.runs.find((item) => item.id === action.id);
      if (!run || run.status !== "running") return state;
      const plan = run.plan || [];
      const nextStep = plan[run.cursor];
      if (!nextStep) return finishRun(state, run, run.executed || []);
      const executed = [...(run.executed || []), { ...nextStep, revealedAt: new Date().toISOString() }];
      const cursor = run.cursor + 1;
      const updatedRun = { ...run, cursor, executed };
      let next = {
        ...state,
        runs: state.runs.map((item) => (item.id === run.id ? updatedRun : item)),
      };
      if (cursor >= plan.length) {
        next = finishRun(next, updatedRun, executed);
      }
      return next;
    }

    case "CANCEL_RUN": {
      const run = state.runs.find((item) => item.id === action.id);
      if (!run) return state;
      let next = {
        ...state,
        runs: state.runs.map((item) =>
          item.id === action.id
            ? {
                ...item,
                status: "cancelled",
                completedAt: new Date().toISOString(),
                attackerSuccess: false,
              }
            : item
        ),
      };
      next = toast(next, {
        title: `${run.id} cancelled`,
        message: "The simulation was stopped before completion.",
        tone: "warning",
      });
      return next;
    }

    case "APPLY_FIX": {
      const recommendation = state.recommendations.find((rec) => rec.id === action.id);
      if (!recommendation || recommendation.status === "applied") return state;
      const assets = applyControl(state.assets, recommendation.control, recommendation.targets);
      const riskBefore = computeRisk(state.assets).score;
      const riskAfter = computeRisk(assets).score;
      let next = {
        ...state,
        assets,
        recommendations: state.recommendations.map((rec) =>
          rec.id === action.id
            ? {
                ...rec,
                status: "applied",
                appliedAt: new Date().toISOString(),
                appliedBy: state.user?.name || "Analyst",
                appliedDelta: riskAfter - riskBefore,
              }
            : rec
        ),
        lastSyncedAt: new Date().toISOString(),
      };
      next = activity(next, {
        type: "fix",
        text: `Applied: ${recommendation.title}`,
        actor: state.user?.name || "Analyst",
        tone: "success",
      });
      next = notify(next, {
        title: "Control applied to the twin",
        detail: `${recommendation.title}. Re-run a simulation to validate the change.`,
        tone: "success",
        to: "/app/twin/self-healing",
      });
      next = toast(next, {
        title: "Control applied",
        message: `${recommendation.title} — overall risk moved ${riskBefore} → ${riskAfter}.`,
        tone: "success",
      });
      return next;
    }

    case "DISMISS_FIX":
      return {
        ...state,
        recommendations: state.recommendations.map((rec) =>
          rec.id === action.id ? { ...rec, status: "dismissed" } : rec
        ),
      };

    case "RESTORE_FIX":
      return {
        ...state,
        recommendations: state.recommendations.map((rec) =>
          rec.id === action.id ? { ...rec, status: "proposed" } : rec
        ),
      };

    case "APPLY_CONTROLS": {
      let assets = state.assets;
      action.controls.forEach((control) => {
        assets = applyControlByRecommendation(assets, control, state.recommendations);
      });
      const riskBefore = computeRisk(state.assets).score;
      const riskAfter = computeRisk(assets).score;
      let next = {
        ...state,
        assets,
        recommendations: state.recommendations.map((rec) =>
          action.controls.includes(rec.control) && rec.status !== "applied"
            ? {
                ...rec,
                status: "applied",
                appliedAt: new Date().toISOString(),
                appliedBy: state.user?.name || "Analyst",
              }
            : rec
        ),
        lastSyncedAt: new Date().toISOString(),
      };
      next = activity(next, {
        type: "fix",
        text: `Applied ${action.controls.length} projected control${action.controls.length === 1 ? "" : "s"} to the twin`,
        actor: state.user?.name || "Analyst",
        tone: "success",
      });
      next = toast(next, {
        title: "Projection applied",
        message: `Risk moved from ${riskBefore} to ${riskAfter}. Run a simulation to validate.`,
        tone: "success",
      });
      return next;
    }

    case "ADD_ASSET": {
      const id = action.asset.name
        ? action.asset.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : uid("asset");
      if (state.assets.some((asset) => asset.id === id)) {
        return toast(state, {
          title: "Asset id already exists",
          message: "Choose a unique hostname for the new asset.",
          tone: "danger",
        });
      }
      const asset = {
        controls: [],
        services: [],
        seeds: [],
        exposure: 0.4,
        x: 445,
        y: 255,
        ...action.asset,
        id,
      };
      let next = { ...state, assets: [...state.assets, asset], lastSyncedAt: new Date().toISOString() };
      next = activity(next, {
        type: "twin",
        text: `Asset ${asset.name} added to the twin`,
        actor: state.user?.name || "Analyst",
        tone: "info",
      });
      next = toast(next, {
        title: "Asset added",
        message: `${asset.name} is now part of the digital twin.`,
        tone: "success",
      });
      return next;
    }

    case "UPDATE_ASSET":
      return {
        ...state,
        assets: state.assets.map((asset) =>
          asset.id === action.id ? { ...asset, ...action.patch } : asset
        ),
        lastSyncedAt: new Date().toISOString(),
      };

    case "REMOVE_ASSET": {
      let next = {
        ...state,
        assets: state.assets.filter((asset) => asset.id !== action.id),
        edges: state.edges.filter(
          (edge) => edge.from !== action.id && edge.to !== action.id
        ),
        lastSyncedAt: new Date().toISOString(),
      };
      next = toast(next, {
        title: "Asset removed",
        message: "Connected links were removed from the twin.",
        tone: "warning",
      });
      return next;
    }

    case "ADD_EDGE": {
      if (action.edge.from === action.edge.to) return state;
      const exists = state.edges.some(
        (edge) =>
          (edge.from === action.edge.from && edge.to === action.edge.to) ||
          (edge.from === action.edge.to && edge.to === action.edge.from)
      );
      if (exists) {
        return toast(state, {
          title: "Link already exists",
          message: "Those assets are already connected.",
          tone: "warning",
        });
      }
      return {
        ...state,
        edges: [{ id: uid("edge"), ...action.edge }, ...state.edges],
        lastSyncedAt: new Date().toISOString(),
      };
    }

    case "REMOVE_EDGE":
      return { ...state, edges: state.edges.filter((edge) => edge.id !== action.id) };

    case "UPDATE_INCIDENT": {
      let next = {
        ...state,
        incidents: state.incidents.map((incident) =>
          incident.id === action.id
            ? { ...incident, ...action.patch, updatedAt: new Date().toISOString() }
            : incident
        ),
      };
      next = activity(next, {
        type: "incident",
        text: `${action.id} updated${action.patch.status ? ` → ${action.patch.status}` : ""}`,
        actor: state.user?.name || "Analyst",
        tone: "info",
      });
      next = toast(next, {
        title: `${action.id} updated`,
        message: action.patch.status
          ? `Incident status is now ${action.patch.status}.`
          : "Incident details were saved.",
        tone: "success",
      });
      return next;
    }

    case "ADD_INCIDENT_FROM_DETECTION": {
      const detection = state.detections.find((item) => item.id === action.detectionId);
      if (!detection) return state;
      const incidentId = nextIncidentId(state.incidents);
      const incident = {
        id: incidentId,
        title: detection.title,
        severity: detection.severity,
        status: "open",
        assignee: state.user?.name || "Unassigned",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        detectionIds: [detection.id],
        summary: detection.description,
        containment: "Pending analyst review.",
        nextAction: "Triage the linked detection and preserve the supporting evidence.",
        tags: [detection.source, detection.technique],
      };
      let next = {
        ...state,
        incidents: [incident, ...state.incidents],
        detections: state.detections.map((item) =>
          item.id === detection.id ? { ...item, incidentId, status: "triaged" } : item
        ),
      };
      next = activity(next, {
        type: "incident",
        text: `${incidentId} opened from ${detection.id}`,
        actor: state.user?.name || "Analyst",
        tone: "high",
      });
      next = toast(next, {
        title: `${incidentId} opened`,
        message: "The detection is now tracked as an incident.",
        tone: "success",
      });
      return next;
    }

    case "UPDATE_DETECTION":
      return {
        ...state,
        detections: state.detections.map((detection) =>
          detection.id === action.id ? { ...detection, ...action.patch } : detection
        ),
      };

    case "ADD_DETECTION": {
      const detectionId = nextDetectionId(state.detections);
      const now = new Date().toISOString();
      const detection = {
        id: detectionId,
        status: "open",
        assignee: "Unassigned",
        evidenceIds: [],
        incidentId: null,
        firstSeen: now,
        lastSeen: now,
        ...action.detection,
      };
      let next = { ...state, detections: [detection, ...state.detections] };
      next = activity(next, {
        type: "detection",
        text: `${detectionId} created from ${detection.source} signal`,
        actor: state.user?.name || "Analyst",
        tone: detection.severity === "critical" ? "critical" : "high",
      });
      next = toast(next, {
        title: `${detectionId} opened`,
        message: `${detection.title} is now in the detection queue.`,
        tone: "success",
      });
      return next;
    }

    case "ADD_IOC": {
      const ioc = {
        id: uid("IOC"),
        verdict: "suspicious",
        sightings: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        ...action.ioc,
      };
      let next = { ...state, intel: [ioc, ...state.intel] };
      next = toast(next, {
        title: "Indicator added",
        message: `${ioc.value} is now tracked in threat intelligence.`,
        tone: "success",
      });
      return next;
    }

    case "ADD_EVIDENCE": {
      const evidence = {
        id: uid("EV"),
        status: "sealed",
        uploadedAt: new Date().toISOString(),
        uploadedBy: state.user?.name || "Analyst",
        chain: [
          {
            time: new Date().toISOString(),
            action: "Uploaded and hashed",
            actor: state.user?.name || "Analyst",
          },
        ],
        ...action.evidence,
      };
      let next = {
        ...state,
        evidence: [evidence, ...state.evidence],
        incidents: state.incidents.map((incident) =>
          incident.id === evidence.incidentId
            ? {
                ...incident,
                updatedAt: new Date().toISOString(),
                summary: incident.summary,
              }
            : incident
        ),
      };
      next = activity(next, {
        type: "evidence",
        text: `${evidence.id} added to the evidence vault`,
        actor: state.user?.name || "Analyst",
        tone: "info",
      });
      next = toast(next, {
        title: "Evidence sealed",
        message: "SHA-256 digest recorded and the chain of custody was updated.",
        tone: "success",
      });
      return next;
    }

    case "ADD_REPORT": {
      const report = {
        id: uid("RPT"),
        status: "ready",
        createdAt: new Date().toISOString(),
        author: state.user?.name || "Analyst",
        size: "1.2 MB",
        ...action.report,
      };
      let next = { ...state, reports: [report, ...state.reports] };
      next = activity(next, {
        type: "report",
        text: `${report.id} generated · ${report.title}`,
        actor: state.user?.name || "Analyst",
        tone: "success",
      });
      next = toast(next, {
        title: "Report generated",
        message: `${report.id} is ready to download.`,
        tone: "success",
      });
      return next;
    }

    case "ADD_LOG": {
      const log = {
        id: uid("LOG"),
        timestamp: new Date().toISOString(),
        status: "allow",
        ...action.log,
      };
      return { ...state, logs: [log, ...state.logs] };
    }

    case "ADD_MEMBER": {
      const member = {
        id: uid("u"),
        status: "invited",
        lastActive: null,
        ...action.member,
      };
      let next = { ...state, team: [...state.team, member] };
      next = toast(next, {
        title: "Invitation sent",
        message: `${member.email} was invited as ${member.role}.`,
        tone: "success",
      });
      return next;
    }

    case "UPDATE_MEMBER":
      return {
        ...state,
        team: state.team.map((member) =>
          member.id === action.id ? { ...member, ...action.patch } : member
        ),
      };

    case "UPDATE_ORG":
      return { ...state, org: { ...state.org, ...action.patch } };

    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case "MARK_NOTIFICATIONS_READ":
      return {
        ...state,
        notifications: state.notifications.map((item) => ({ ...item, read: true })),
      };

    case "MARK_NOTIFICATION_READ":
      return {
        ...state,
        notifications: state.notifications.map((item) =>
          item.id === action.id ? { ...item, read: true } : item
        ),
      };

    case "SYNC_TWIN": {
      const next = {
        ...state,
        lastSyncedAt: new Date().toISOString(),
      };
      return toast(next, {
        title: "Twin synchronised",
        message: `${state.assets.length} assets and ${state.edges.length} links match the last approved model.`,
        tone: "success",
      });
    }

    case "PUSH_TOAST":
      return toast(state, action.toast || { title: "Done", message: "", tone: "success" });

    case "ADD_INCIDENT": {
      const incidentId = nextIncidentId(state.incidents);
      const incident = {
        id: incidentId,
        status: "open",
        assignee: state.user?.name || "Unassigned",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        detectionIds: [],
        containment: "Pending analyst review.",
        nextAction: "Triage the incident and link supporting evidence.",
        tags: [],
        ...action.incident,
      };
      let next = { ...state, incidents: [incident, ...state.incidents] };
      next = activity(next, {
        type: "incident",
        text: `${incidentId} opened manually`,
        actor: state.user?.name || "Analyst",
        tone: "high",
      });
      next = notify(next, {
        title: `${incidentId} opened`,
        detail: incident.title,
        tone: "high",
        to: `/app/hunter/incidents/${incidentId}`,
      });
      next = toast(next, {
        title: `${incidentId} opened`,
        message: "The incident is now tracked in the response queue.",
        tone: "success",
      });
      return next;
    }

    case "REMOVE_MEMBER": {
      const member = state.team.find((item) => item.id === action.id);
      if (!member) return state;
      if (member.email === state.user?.email) {
        return toast(state, {
          title: "Cannot remove yourself",
          message: "Assign another workspace owner before removing your own seat.",
          tone: "danger",
        });
      }
      let next = { ...state, team: state.team.filter((item) => item.id !== action.id) };
      next = activity(next, {
        type: "workspace",
        text: `${member.name} was removed from the workspace`,
        actor: state.user?.name || "Analyst",
        tone: "warning",
      });
      next = toast(next, {
        title: "Member removed",
        message: `${member.email} no longer has access to this workspace.`,
        tone: "warning",
      });
      return next;
    }

    case "REMOVE_TOAST":
      return { ...state, toasts: state.toasts.filter((item) => item.id !== action.id) };

    case "RESET_DEMO": {
      const fresh = createInitialState({
        orgName: state.org?.name,
        domain: state.org?.domain,
        plan: state.org?.plan,
        trialEnds: state.org?.trialEnds,
      });
      return { ...fresh, user: state.user };
    }

    default:
      return state;
  }
}

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
  const [authReady, setAuthReady] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const stateRef = useRef(state);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const cacheTimerRef = useRef(null);

  stateRef.current = state;

  const runningRun = useMemo(
    () => state.runs.find((run) => run.status === "running"),
    [state.runs]
  );

  useEffect(() => {
    if (!runningRun) return undefined;
    const timer = setTimeout(() => {
      dispatch({ type: "ADVANCE_RUN", id: runningRun.id });
    }, 1000);
    return () => clearTimeout(timer);
  }, [runningRun?.id, runningRun?.cursor]);

  const hydrateWorkspace = useCallback(async (fallbackUser) => {
    const result = await api.getWorkspace();
    dispatch({
      type: "HYDRATE_WORKSPACE",
      workspace: result.workspace,
      user: result.user || fallbackUser,
    });
    hydratedRef.current = true;
    return result;
  }, []);

  const refreshWorkspace = useCallback(async () => {
    const result = await hydrateWorkspace(stateRef.current.user);
    return result.workspace;
  }, [hydrateWorkspace]);

  const signIn = useCallback(
    async (credentials) => {
      const { user } = await api.login(credentials);
      await hydrateWorkspace(user);
      return user;
    },
    [hydrateWorkspace]
  );

  const signUp = useCallback(
    async (payload) => {
      // Registration returns a generic 202 and deliberately does not create a
      // session. The user signs in afterwards, so account existence cannot be
      // inferred from an automatic authentication.
      return api.register(payload);
    },
    []
  );

  const signOut = useCallback(async () => {
    clearTimeout(saveTimerRef.current);
    clearTimeout(cacheTimerRef.current);
    saveTimerRef.current = null;
    cacheTimerRef.current = null;
    try {
      await api.logout();
    } catch {
      // A network failure must not trap the user in a signed-in shell.
    }
    hydratedRef.current = false;
    setSaveState("idle");
    dispatch({ type: "SIGN_OUT" });
    clearCachedState();
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const { user } = await api.updateProfile(payload);
    dispatch({ type: "SET_SESSION_USER", user });
    return user;
  }, []);

  const changePlan = useCallback(
    async (plan) => {
      const result = await api.setPlan(plan);
      const user = result.user || stateRef.current.user;
      if (user) dispatch({ type: "SET_SESSION_USER", user });
      await hydrateWorkspace(user);
      return result;
    },
    [hydrateWorkspace]
  );

  const updateSecurityPolicy = useCallback(
    async (policy) => {
      const result = await api.updateSecurityPolicy(policy);
      await hydrateWorkspace(stateRef.current.user);
      return result;
    },
    [hydrateWorkspace]
  );

  const resetWorkspace = useCallback(async () => {
    const result = await api.resetWorkspace();
    dispatch({
      type: "HYDRATE_WORKSPACE",
      workspace: result.workspace,
      user: result.user || stateRef.current.user,
    });
    return result.workspace;
  }, []);

  // Bootstrap the session from the API. Authentication is authoritative: cached
  // workspace data is only a rendering hint until this request resolves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user } = await api.session();
        if (cancelled) return;
        if (!user) {
          hydratedRef.current = false;
          dispatch({ type: "SIGN_OUT" });
          // The server confirmed there is no session. Remove the tenant
          // rendering cache so an expired session cannot leave workspace data
          // readable in localStorage on a shared browser.
          clearCachedState();
          return;
        }
        await hydrateWorkspace(user);
      } catch {
        if (!cancelled) {
          hydratedRef.current = false;
          dispatch({ type: "SET_SESSION_USER", user: null });
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateWorkspace]);

  // Persist the workspace to SQLite with a debounce, and always mirror it into
  // the versioned local cache so an API outage does not blank the interface.
  useEffect(() => {
    if (!state.user) return undefined;

    clearTimeout(cacheTimerRef.current);
    cacheTimerRef.current = setTimeout(() => {
      if (stateRef.current.user) writeCachedState(stateRef.current);
    }, 400);

    if (!hydratedRef.current) return undefined;
    if (state.user.roleKey === "read_only") return undefined;
    if (saveTimerRef.current) return undefined;

    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      const latest = stateRef.current;
      if (!latest.user || latest.user.roleKey === "read_only") return;
      const { user, toasts, ...workspace } = latest;
      setSaveState("saving");
      try {
        await api.saveWorkspace(workspace);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 1200);

    return undefined;
  }, [state, authReady]);

  useEffect(
    () => () => {
      clearTimeout(saveTimerRef.current);
      clearTimeout(cacheTimerRef.current);
    },
    []
  );

  const value = useMemo(
    () => ({
      state,
      dispatch,
      runningRun,
      risk: computeRisk(state.assets),
      scenarios: SCENARIOS,
      authReady,
      saveState,
      signIn,
      signUp,
      signOut,
      updateProfile,
      changePlan,
      updateSecurityPolicy,
      refreshWorkspace,
      resetWorkspace,
    }),
    [
      state,
      runningRun,
      authReady,
      saveState,
      signIn,
      signUp,
      signOut,
      updateProfile,
      changePlan,
      updateSecurityPolicy,
      refreshWorkspace,
      resetWorkspace,
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useApp() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error("useApp must be used inside AppStateProvider");
  return context;
}
