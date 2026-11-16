import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

const INITIAL = {
  loaded: false,
  error: "",
  telemetry: [],
  stats: null,
  detections: [],
  detectionStats: null,
  connectors: null,
  network: null,
  streamState: "idle",
  lastEventAt: null,
};

function mergeEvents(current, incoming) {
  const map = new Map(current.map((event) => [event.id, event]));
  incoming.forEach((event) => map.set(event.id, event));
  return [...map.values()].sort((left, right) => right.id - left.id).slice(0, 120);
}

function mergeDetections(current, incoming) {
  const map = new Map(current.map((detection) => [detection.id, detection]));
  incoming.forEach((detection) => map.set(detection.id, detection));
  return [...map.values()].sort(
    (left, right) => new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime()
  );
}

/**
 * Live HUNTER data for a dashboard: the same server telemetry, detection rules
 * and connector registry used by the log explorer, kept current over SSE.
 */
export function useLiveHunter({ enabled = true } = {}) {
  const [state, setState] = useState(INITIAL);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const [telemetry, stats, detections, connectors, network] = await Promise.all([
        api.telemetry({ limit: 40 }),
        api.telemetryStats(),
        api.detections({ limit: 50 }),
        api.connectors(),
        api.networkStatus(),
      ]);
      if (!aliveRef.current) return;
      setState((current) => ({
        ...current,
        loaded: true,
        error: "",
        telemetry: telemetry.events || [],
        stats: stats || null,
        detections: detections.detections || [],
        detectionStats: detections.stats || null,
        connectors: connectors || null,
        network: network || null,
        lastEventAt: telemetry.events?.[0]?.timestamp || stats?.latest || null,
      }));
    } catch (error) {
      if (!aliveRef.current) return;
      setState((current) => ({
        ...current,
        loaded: true,
        error: error?.message || "Live HUNTER data could not be loaded.",
      }));
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!enabled) return undefined;
    let stream;
    try {
      stream = new EventSource(api.streamUrl("/telemetry/stream"));
    } catch {
      setState((current) => ({ ...current, streamState: "error" }));
      return undefined;
    }
    setState((current) => ({ ...current, streamState: "connecting" }));

    const onReady = () => setState((current) => ({ ...current, streamState: "open" }));
    const onTelemetry = (message) => {
      try {
        const payload = JSON.parse(message.data);
        const incoming = payload.events || [];
        setState((current) => ({
          ...current,
          streamState: "open",
          telemetry: mergeEvents(current.telemetry, incoming),
          lastEventAt: incoming[0]?.timestamp || current.lastEventAt,
          stats: current.stats
            ? {
                ...current.stats,
                total: Number(current.stats.total || 0) + incoming.length,
                last24h: Number(current.stats.last24h || 0) + incoming.length,
                latest: incoming[0]?.timestamp || current.stats.latest,
              }
            : current.stats,
        }));
      } catch {
        // Ignore malformed frames; EventSource keeps the connection alive.
      }
    };
    const onDetection = (message) => {
      try {
        const payload = JSON.parse(message.data);
        const incoming = payload.detections || [];
        setState((current) => ({
          ...current,
          streamState: "open",
          detections: mergeDetections(current.detections, incoming),
          detectionStats: payload.stats || current.detectionStats,
        }));
      } catch {
        // Ignore malformed frames.
      }
    };

    stream.addEventListener("ready", onReady);
    stream.addEventListener("telemetry", onTelemetry);
    stream.addEventListener("detection", onDetection);
    stream.onerror = () => setState((current) => ({ ...current, streamState: "error" }));

    return () => {
      stream.removeEventListener("ready", onReady);
      stream.removeEventListener("telemetry", onTelemetry);
      stream.removeEventListener("detection", onDetection);
      stream.close();
    };
  }, [enabled]);

  return { ...state, refresh: load };
}
