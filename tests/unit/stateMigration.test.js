import { describe, expect, it } from "vitest";
import {
  LEGACY_STORAGE_KEY,
  STATE_SCHEMA_VERSION,
  createInitialState,
  migrateState,
  readCachedState,
  writeCachedState,
  clearCachedState,
} from "../../src/data/initialState.js";

describe("versioned workspace state", () => {
  it("creates a complete, server-authenticated initial workspace", () => {
    const state = createInitialState({ orgName: "Acme Security", plan: "Starter" });
    expect(state.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(state.user).toBeNull();
    expect(state.org.name).toBe("Acme Security");
    expect(state.org.plan).toBe("Starter");
    expect(state.scenarios.length).toBeGreaterThan(0);
    expect(state.assets.length).toBeGreaterThan(0);
    expect(state.notifications.length).toBeGreaterThan(0);
  });

  it("migrates a v1 localStorage payload without trusting its user", () => {
    const legacy = {
      user: { email: "legacy@example.com", role: "Super Admin" },
      org: { name: "Legacy Org", domain: "legacy.test", plan: "Professional" },
      assets: [{ id: "a1" }],
      edges: [],
      runs: [{ id: "run-1" }],
      detections: "not-an-array",
      logs: [],
      toasts: [{ id: "stale" }],
    };

    const migrated = migrateState(legacy);
    expect(migrated.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(migrated.user).toBeNull();
    expect(migrated.org.name).toBe("Legacy Org");
    expect(migrated.assets).toEqual([{ id: "a1" }]);
    expect(migrated.detections.length).toBeGreaterThan(0);
    expect(migrated.runs[0].plan).toEqual([]);
    expect(migrated.runs[0].executed).toEqual([]);
    expect(migrated.scenarios.length).toBeGreaterThan(0);
    expect(migrated.toasts).toEqual([]);
  });

  it("recovers from corrupt or empty input", () => {
    expect(migrateState(null).schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(migrateState("nope").assets.length).toBeGreaterThan(0);
    expect(migrateState({ assets: null, logs: {} }).assets.length).toBeGreaterThan(0);
  });

  it("round-trips through the versioned local cache and clears both keys", () => {
    const store = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
      },
    };

    const state = createInitialState({ orgName: "Cache Org" });
    writeCachedState({ ...state, user: { email: "should-not-persist@example.com" }, toasts: [{ id: "t" }] });

    const raw = JSON.parse(store.get("dtcw-workspace-cache-v2"));
    expect(raw.user).toBeUndefined();
    expect(raw.toasts).toBeUndefined();
    expect(raw.org.name).toBe("Cache Org");

    const cached = readCachedState();
    expect(cached.org.name).toBe("Cache Org");
    expect(cached.user).toBeNull();

    store.set(LEGACY_STORAGE_KEY, JSON.stringify({ org: { name: "Old" } }));
    expect(readCachedState().org.name).toBe("Cache Org");

    clearCachedState();
    expect(store.size).toBe(0);
    expect(readCachedState()).toBeNull();
    delete globalThis.window;
  });
});
