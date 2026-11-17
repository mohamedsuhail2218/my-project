import { useEffect, useRef } from "react";
import { streamEvents } from "./api";

/**
 * Subscribe to a fetch-based Server-Sent Events endpoint.
 *
 * The browser reconnects with a bounded backoff when the function times out or
 * the network drops. A 401 (expired session) waits longer than a normal drop so
 * an unauthenticated tab does not hammer the API.
 */
export function useEventStream({ path, enabled = true, onEvent, onStateChange }) {
  const eventRef = useRef(onEvent);
  const stateRef = useRef(onStateChange);

  eventRef.current = onEvent;
  stateRef.current = onStateChange;

  useEffect(() => {
    if (!enabled || !path) return undefined;

    let cancelled = false;
    let controller = new AbortController();
    let timer = null;
    let attempt = 0;
    let authFailures = 0;

    const schedule = (delayMs) => {
      if (cancelled) return;
      timer = setTimeout(run, delayMs);
    };

    const run = async () => {
      if (cancelled) return;
      controller = new AbortController();
      stateRef.current?.("connecting");
      try {
        const { retryMs } = await streamEvents(path, {
          signal: controller.signal,
          onEvent: (event) => {
            attempt = 0;
            eventRef.current?.(event);
          },
          onStateChange: (state) => {
            if (state === "open") authFailures = 0;
            if (!cancelled) stateRef.current?.(state);
          },
        });
        if (cancelled) return;
        // The server ended the stream cleanly (for example, the function hit its
        // maximum duration). Reconnect at the interval it advertised.
        stateRef.current?.("connecting");
        schedule(retryMs);
      } catch (error) {
        if (cancelled || error?.name === "AbortError") return;
        stateRef.current?.("error");
        const status = Number(error?.status || 0);
        let delay;
        if (status === 401) {
          authFailures += 1;
          delay = authFailures >= 2 ? 20_000 : 1_000;
        } else {
          authFailures = 0;
          delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 4));
        }
        attempt += 1;
        schedule(delay);
      }
    };

    run();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, enabled]);
}
