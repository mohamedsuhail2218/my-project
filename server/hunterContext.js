import { getWorkspaceRow, workspaceForClient } from "./db.js";
import { normalizeIndicator } from "./services/threatIntel.js";
import { queryTelemetry, topAnomalies } from "./telemetry.js";

/**
 * Build a bounded evidence pack for the natural-language assistant.
 *
 * Retrieval is deterministic and inspectable: the client receives the same
 * sources that were placed in the model prompt. The model is never asked to
 * recall telemetry from its weights.
 */

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "what",
  "which",
  "when",
  "where",
  "who",
  "why",
  "how",
  "does",
  "did",
  "was",
  "were",
  "are",
  "is",
  "has",
  "have",
  "had",
  "from",
  "into",
  "about",
  "that",
  "this",
  "these",
  "those",
  "should",
  "could",
  "would",
  "tell",
  "show",
  "explain",
  "investigate",
  "evidence",
  "incident",
  "detection",
  "telemetry",
]);

function indicatorsIn(question) {
  const candidates = String(question || "").match(
    /(?:[a-f0-9]{64})|(?:\b\d{1,3}(?:\.\d{1,3}){3}\b)|(?:\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b)|(?:https?:\/\/[^\s]+)/gi
  ) || [];
  const seen = new Set();
  const normalized = [];
  candidates.forEach((candidate) => {
    const parsed = normalizeIndicator(candidate);
    if (parsed && !seen.has(parsed.value)) {
      seen.add(parsed.value);
      normalized.push(parsed);
    }
  });
  return normalized.slice(0, 3);
}

function keywordsIn(question) {
  return String(question || "")
    .toLowerCase()
    .split(/[^a-z0-9_.:@-]+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
    .slice(0, 4);
}

function trim(value, max = 400) {
  return String(value ?? "").slice(0, max);
}

function eventSource(event) {
  return {
    kind: "telemetry",
    id: `EVT-${event.id}`,
    title: `${event.event} on ${event.host}`,
    detail: `${event.timestamp} · ${event.source} · ${event.status} · ${
      event.anomalyScore === null ? "unscored" : `anomaly ${event.anomalyScore}`
    } · ${trim(event.message, 500)}`,
    to: `/app/hunter/logs?focus=SVR-${event.id}`,
    event,
  };
}

export function buildAssistantContext(db, workspaceId, { question, incidentId = null, detectionId = null }) {
  const row = getWorkspaceRow(db, workspaceId);
  if (!row) {
    const error = new Error("Workspace not found.");
    error.code = "workspace_not_found";
    throw error;
  }
  const workspace = workspaceForClient(row);
  const indicators = indicatorsIn(question);
  const keywords = keywordsIn(question);

  const telemetryById = new Map();
  indicators.forEach((indicator) => {
    queryTelemetry(db, workspaceId, { q: indicator.value, limit: 12 }).forEach((event) => {
      telemetryById.set(event.id, event);
    });
  });
  keywords.forEach((keyword) => {
    queryTelemetry(db, workspaceId, { q: keyword, limit: 10 }).forEach((event) => {
      telemetryById.set(event.id, event);
    });
  });
  const anomalies = topAnomalies(db, workspaceId, { limit: 8 });
  anomalies.forEach((event) => telemetryById.set(event.id, event));

  const telemetry = [...telemetryById.values()]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);

  const selectedIncident = incidentId
    ? workspace.incidents.find((incident) => incident.id === incidentId) || null
    : null;
  const incidents = selectedIncident
    ? [selectedIncident]
    : [...workspace.incidents]
        .filter((incident) => incident.status !== "closed")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5);

  const linkedDetectionIds = new Set(incidents.flatMap((incident) => incident.detectionIds || []));
  const detections = workspace.detections
    .filter(
      (detection) =>
        detection.id === detectionId ||
        linkedDetectionIds.has(detection.id) ||
        (detection.assetId && keywords.includes(String(detection.assetId).toLowerCase()))
    )
    .slice(0, 10);

  const intel = workspace.intel
    .filter((ioc) => ioc.verdict === "malicious" || ioc.verdict === "suspicious")
    .slice(0, 8);

  const sources = [];
  let ref = 1;
  const nextRef = () => `S${ref++}`;

  const incidentSources = incidents.map((incident) => {
    const entry = {
      ref: nextRef(),
      kind: "incident",
      id: incident.id,
      title: incident.title,
      detail: `${incident.severity} · ${incident.status} · owner ${incident.assignee} · ${trim(
        incident.summary,
        700
      )}`,
      to: `/app/hunter/incidents/${incident.id}`,
    };
    sources.push(entry);
    return entry;
  });

  const detectionSources = detections.map((detection) => {
    const entry = {
      ref: nextRef(),
      kind: "detection",
      id: detection.id,
      title: detection.title,
      detail: `${detection.severity} · ${detection.status} · ${detection.assetId} · ${trim(
        detection.description,
        500
      )}`,
      to: `/app/hunter/detections?focus=${detection.id}`,
    };
    sources.push(entry);
    return entry;
  });

  const telemetrySources = telemetry.map((event) => {
    const entry = { ref: nextRef(), ...eventSource(event) };
    sources.push(entry);
    return entry;
  });

  const intelSources = intel.map((ioc) => {
    const entry = {
      ref: nextRef(),
      kind: "intel",
      id: ioc.id,
      title: `${ioc.verdict} ${ioc.type} indicator`,
      detail: `${ioc.value} · ${ioc.confidence}% confidence · ${ioc.source} · tags ${(
        ioc.tags || []
      ).join(", ")}`,
      to: `/app/hunter/intel?focus=${ioc.id}`,
    };
    sources.push(entry);
    return entry;
  });

  const context = {
    generatedAt: new Date().toISOString(),
    organisation: workspace.org?.name || row.name,
    question,
    indicators: indicators.map((indicator) => indicator.value),
    counts: {
      incidents: incidents.length,
      detections: detections.length,
      telemetry: telemetry.length,
      intel: intel.length,
    },
    incidents: incidentSources.map((entry) => ({
      ref: entry.ref,
      id: entry.id,
      title: entry.title,
      detail: entry.detail,
    })),
    detections: detectionSources.map((entry) => ({
      ref: entry.ref,
      id: entry.id,
      title: entry.title,
      detail: entry.detail,
    })),
    telemetry: telemetrySources.map((entry) => ({
      ref: entry.ref,
      id: entry.id,
      timestamp: entry.event.timestamp,
      source: entry.event.source,
      host: entry.event.host,
      event: entry.event.event,
      user: entry.event.user,
      ip: entry.event.ip,
      status: entry.event.status,
      message: trim(entry.event.message, 600),
      anomalyScore: entry.event.anomalyScore,
      anomalySeverity: entry.event.anomalySeverity,
      anomalyExplanation: entry.event.anomalyExplanation?.summary || null,
    })),
    intel: intelSources.map((entry) => ({
      ref: entry.ref,
      id: entry.id,
      detail: entry.detail,
    })),
  };

  let promptContext = JSON.stringify(context, null, 2);
  if (promptContext.length > 16_000) {
    promptContext = `${promptContext.slice(0, 16_000)}\n…evidence truncated at the server limit.`;
  }

  return { sources, promptContext, context, workspace };
}
