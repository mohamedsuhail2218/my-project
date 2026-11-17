import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useEventStream } from "./useEventStream";

const INITIAL = {
  loaded: false,
  error: "",
  missing: false,
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
 *
 * Reads run one at a time. Parallel reads are what exposed the multi-instance
 * split on Vercel: five requests could cold-start two functions, and the
 * dashboard then mixed an authenticated instance with an unauthenticated one.
 * Sequential reads reuse the warm instance and let a partial outage keep the
 * panels that did load instead of blanking the whole view.
 */
export function useLiveHunter({ enabled = true } = {}) {
  const [state, setState] = useState(INITIAL);
  const [streamReady, setStreamReady] = useState(false);
  const aliveRef = useRef(true);
  const recoveryRef = useRef(0);

  const load = useCallback(async () => {
    const results = {};
    const failures = [];
    const reads = [
      ["telemetry", () => api.telemetry({ limit: 40 })],
      ["stats", () => api.telemetryStats()],
      ["detections", () => api.detections({ limit: 50 })],
      ["connectors", () => api.connectors()],
      ["network", () => api.networkStatus()],
    ];

    for (const [key, read] of reads) {
      try {
        results[key] = await read();
      } catch (error) {
        results[key] = null;
        failures.push(error);
      }
    }

    if (failures.length === 0) recoveryRef.current = 0;
    if (!aliveRef.current) return;
    setStreamReady(true);
    setState((current) => {
      const telemetry = results.telemetry;
      const stats = results.stats;
      const detections = results.detections;
      const connectors = results.connectors;
      const network = results.network;
      const succeeded = [telemetry, stats, detections, connectors, network].filter(Boolean).length;
      const fatal =
        succeeded === 0 && failures.length > 0
          ? failures.find((error) => error?.status !== 401) || null
          : null;

      return {
        ...current,
        loaded: true,
        error: fatal ? fatal.message || "Live HUNTER data could not be loaded." : "",
        missing: failures.length > 0,
        telemetry: telemetry?.events || current.telemetry,
        stats: stats || current.stats,
        detections: detections?.detections || current.detections,
        detectionStats: detections?.stats || current.detectionStats,
        connectors: connectors || current.connectors,
        network: network || current.network,
        lastEventAt:
          telemetry?.events?.[0]?.timestamp || stats?.latest || current.lastEventAt,
      };
    });
  }, []);

  /**
   * Apply a controlled-attack response without re-reading the dashboard.
   *
   * The simulation response already contains the injected events, updated
   * detections and both stat blocks. Re-reading here used to be harmless on a
   * single host, but on Vercel the follow-up read could be routed to a second
   * function instance whose ephemeral database has no matching session, which
   * produced a spurious 401 and an empty refresh.
   */
  const applySimulation = useCallback((result) => {
    if (!result) return;
    const incomingEvents = result.events || [];
    const incomingDetections = result.detections || [];
    setState((current) => {
      const telemetry = mergeEvents(current.telemetry, incomingEvents);
      return {
        ...current,
        telemetry,
        detections: mergeDetections(current.detections, incomingDetections),
        detectionStats: result.stats || current.detectionStats,
        stats: result.telemetryStats || current.stats,
        lastEventAt: telemetry[0]?.timestamp || current.lastEventAt,
      };
    });
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  // A cold start can route the first five reads to an instance that has no
  // matching session while the SSE connection lands on the instance that does.
  // Once the stream is open, retry the missing panels on that warm instance.
  useEffect(() => {
    if (!enabled || !state.loaded || state.streamState !== "open" || !state.missing) {
      return undefined;
    }
    if (recoveryRef.current >= 2) return undefined;
    recoveryRef.current += 1;
    const timer = setTimeout(() => load(), 500);
    return () => clearTimeout(timer);
  }, [enabled, state.loaded, state.streamState, state.missing, load]);

  useEventStream({
    path: enabled && streamReady ? "/telemetry/stream" : "",
    enabled: enabled && streamReady,
    onStateChange: (streamState) => {
      setState((current) => ({ ...current, streamState }));
    },
    onEvent: (message) => {
      if (message.event === "ready") {
        setState((current) => ({ ...current, streamState: "open" }));
        return;
      }
      if (message.event === "telemetry") {
        try {
          const payload = JSON.parse(message.data);
          const incoming = payload.events || [];
          setState((current) => {
            const known = new Set(current.telemetry.map((event) => event.id));
            const fresh = incoming.filter((event) => !known.has(event.id));
            return {
              ...current,
              streamState: "open",
              telemetry: mergeEvents(current.telemetry, incoming),
              lastEventAt: incoming[0]?.timestamp || current.lastEventAt,
              stats: current.stats
                ? {
                    ...current.stats,
                    total: Number(current.stats.total || 0) + fresh.length,
                    last24h: Number(current.stats.last24h || 0) + fresh.length,
                    latest: incoming[0]?.timestamp || current.stats.latest,
                  }
                : current.stats,
            };
          });
        } catch {
          // Ignore malformed frames; the stream stays open.
        }
        return;
      }
      if (message.event === "detection") {
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
      }
    },
  });

  return { ...state, refresh: load, applySimulation };
}
