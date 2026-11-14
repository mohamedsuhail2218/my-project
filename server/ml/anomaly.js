import { createHash } from "node:crypto";
import ipaddr from "ipaddr.js";
import { config } from "../config.js";

/**
 * Server-side anomaly detection.
 *
 * This is a genuine unsupervised model: an isolation forest over behavioural
 * features extracted from every telemetry event. Categorical fields are encoded
 * with smoothed inverse-frequency weights, and numeric fields cover time of day,
 * day of week, message entropy, digit density, external address exposure and
 * authentication outcome. The model is trained per workspace on stored events;
 * it is not a hard-coded rule set and it does not label events with canned
 * verdicts.
 *
 * Model trees are kept in memory (and rebuilt lazily after a restart). Only the
 * training metadata is persisted so the SQLite database does not balloon with
 * serialised forests. Scores are written back to each event for auditability.
 */

export const MIN_TRAIN_SAMPLES = 12;
export const ALGORITHM = "isolation-forest";
const TREE_COUNT = 80;
const SUBSAMPLE = 192;
const EULER = 0.5772156649015329;

const modelCache = new Map();

const CATEGORICAL_FEATURES = [
  "source",
  "host",
  "event",
  "action",
  "status",
  "username",
  "ip",
  "source_event",
  "host_event",
];

const NUMERIC_FEATURES = [
  "hour_sin",
  "hour_cos",
  "dow_sin",
  "dow_cos",
  "message_length",
  "message_entropy",
  "digit_ratio",
  "external_ip",
  "status_deny",
  "status_alert",
  "has_user",
];

const FEATURE_NAMES = [...NUMERIC_FEATURES, ...CATEGORICAL_FEATURES.map((name) => `rarity_${name}`)];

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(value) {
  const digest = createHash("sha256").update(String(value)).digest();
  return digest.readUInt32LE(0);
}

function clean(value) {
  const text = String(value ?? "").trim();
  return text || "(empty)";
}

function shannonEntropy(text) {
  const value = String(text || "");
  if (!value) return 0;
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy / Math.max(1, Math.log2(Math.min(value.length, 256)));
}

function digitRatio(text) {
  const value = String(text || "");
  if (!value) return 0;
  let digits = 0;
  for (const char of value) if (char >= "0" && char <= "9") digits += 1;
  return digits / value.length;
}

export function isPublicAddress(value) {
  const text = String(value || "").trim();
  if (!text || text === "-") return false;
  try {
    const parsed = ipaddr.parse(text);
    if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
      return parsed.toIPv4Address().range() === "unicast";
    }
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

function eventFields(event) {
  const timestamp = new Date(event.timestamp || Date.now());
  const safeTime = Number.isNaN(timestamp.getTime()) ? new Date() : timestamp;
  const message = String(event.message || event.raw || "");
  return {
    source: clean(event.source),
    host: clean(event.host),
    event: clean(event.event),
    action: clean(event.action),
    status: clean(event.status),
    username: clean(event.user ?? event.username),
    ip: clean(event.ip),
    message,
    hour: safeTime.getUTCHours() + safeTime.getUTCMinutes() / 60,
    day: safeTime.getUTCDay(),
  };
}

function numericVector(fields) {
  const hourAngle = (fields.hour / 24) * Math.PI * 2;
  const dayAngle = (fields.day / 7) * Math.PI * 2;
  return [
    Math.sin(hourAngle),
    Math.cos(hourAngle),
    Math.sin(dayAngle),
    Math.cos(dayAngle),
    Math.log1p(fields.message.length),
    shannonEntropy(fields.message),
    digitRatio(fields.message),
    isPublicAddress(fields.ip) ? 1 : 0,
    fields.status === "deny" ? 1 : 0,
    fields.status === "alert" ? 1 : 0,
    fields.username !== "(empty)" && fields.username !== "-" ? 1 : 0,
  ];
}

function categoricalValues(fields) {
  return [
    fields.source,
    fields.host,
    fields.event,
    fields.action,
    fields.status,
    fields.username,
    fields.ip,
    `${fields.source}|${fields.event}`,
    `${fields.host}|${fields.event}`,
  ];
}

function buildFrequencyModel(rows) {
  const categories = {};
  CATEGORICAL_FEATURES.forEach((name) => {
    categories[name] = { counts: Object.create(null), size: 0 };
  });

  rows.forEach((row) => {
    const fields = eventFields(row);
    const values = categoricalValues(fields);
    values.forEach((value, index) => {
      const group = categories[CATEGORICAL_FEATURES[index]];
      if (!(value in group.counts)) {
        group.counts[value] = 1;
        group.size += 1;
      } else {
        group.counts[value] += 1;
      }
    });
  });

  return { categories, samples: rows.length };
}

function rarity(group, value, samples) {
  const count = group.counts[value] || 0;
  const smoothed = (count + 1) / (samples + group.size + 1);
  const score = -Math.log(smoothed);
  return Math.min(4, score) / Math.max(1, Math.log(samples + 2));
}

function extractVector(model, event) {
  const fields = eventFields(event);
  const vector = numericVector(fields);
  const values = categoricalValues(fields);
  values.forEach((value, index) => {
    vector.push(rarity(model.categories[CATEGORICAL_FEATURES[index]], value, model.samples));
  });
  return { vector, fields };
}

function quantile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function harmonic(number) {
  if (number <= 1) return 0;
  return Math.log(number - 1) + EULER;
}

function averagePathLength(sampleSize) {
  if (sampleSize <= 1) return 0;
  return 2 * harmonic(sampleSize) - (2 * (sampleSize - 1)) / sampleSize;
}

function buildTree(data, depth, limit, rng, featureCount) {
  if (depth >= limit || data.length <= 1) {
    return { leaf: true, size: data.length };
  }

  let feature = -1;
  let minimum = 0;
  let maximum = 0;
  const candidates = [];
  for (let index = 0; index < featureCount; index += 1) {
    let low = Infinity;
    let high = -Infinity;
    for (const point of data) {
      if (point[index] < low) low = point[index];
      if (point[index] > high) high = point[index];
    }
    if (high - low > 1e-9) candidates.push({ index, low, high });
  }
  if (!candidates.length) return { leaf: true, size: data.length };

  const chosen = candidates[Math.floor(rng() * candidates.length)];
  feature = chosen.index;
  minimum = chosen.low;
  maximum = chosen.high;
  const split = minimum + rng() * (maximum - minimum);

  const left = [];
  const right = [];
  for (const point of data) {
    if (point[feature] < split) left.push(point);
    else right.push(point);
  }
  if (!left.length || !right.length) return { leaf: true, size: data.length };

  return {
    leaf: false,
    feature,
    split,
    left: buildTree(left, depth + 1, limit, rng, featureCount),
    right: buildTree(right, depth + 1, limit, rng, featureCount),
  };
}

function pathLength(node, point) {
  let depth = 0;
  let current = node;
  while (current && !current.leaf) {
    current = point[current.feature] < current.split ? current.left : current.right;
    depth += 1;
  }
  return depth + (current ? averagePathLength(current.size) : 0);
}

function scorePoint(trees, point, subsampleSize) {
  const normaliser = averagePathLength(subsampleSize) || 1;
  let total = 0;
  for (const tree of trees) total += pathLength(tree, point);
  return Math.pow(2, -(total / trees.length) / normaliser);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return quantile(sorted, 0.5);
}

function buildStats(vectors) {
  const medians = [];
  const iqrs = [];
  for (let index = 0; index < NUMERIC_FEATURES.length; index += 1) {
    const column = vectors.map((vector) => vector[index]);
    const sorted = [...column].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    medians.push(quantile(sorted, 0.5));
    iqrs.push(Math.max(1e-6, q3 - q1));
  }
  return { medians, iqrs };
}

function buildModel(workspaceId, rows) {
  const frequency = buildFrequencyModel(rows);
  const model = {
    workspaceId,
    status: "trained",
    samples: rows.length,
    categories: frequency.categories,
    medians: [],
    iqrs: [],
    featureNames: FEATURE_NAMES,
    algorithm: ALGORITHM,
    treeCount: TREE_COUNT,
    subsampleSize: Math.min(SUBSAMPLE, rows.length),
    seed: seedFrom(`${workspaceId}:${rows.length}:${rows[0]?.id || 0}`),
    trees: [],
    threshold: 0.6,
    stats: {},
  };

  const points = rows.map((row) => extractVector(model, row));
  const stats = buildStats(points.map((point) => point.vector));
  model.medians = stats.medians;
  model.iqrs = stats.iqrs;

  const rng = mulberry32(model.seed);
  const limit = Math.ceil(Math.log2(Math.max(2, model.subsampleSize)));
  for (let index = 0; index < TREE_COUNT; index += 1) {
    const start = Math.floor(rng() * Math.max(1, points.length - model.subsampleSize + 1));
    const sample = points
      .slice(start, start + model.subsampleSize)
      .map((point) => point.vector);
    if (sample.length === 0) break;
    model.trees.push(buildTree(sample, 0, limit, rng, FEATURE_NAMES.length));
  }

  const trainingScores = points
    .map((point) => scorePoint(model.trees, point.vector, model.subsampleSize))
    .sort((a, b) => a - b);
  const p95 = quantile(trainingScores, 0.95);
  model.threshold = Math.max(0.55, Math.min(0.82, p95));

  const mean = trainingScores.reduce((sum, value) => sum + value, 0) / Math.max(1, trainingScores.length);
  const variance =
    trainingScores.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, trainingScores.length);
  model.stats = {
    mean: Number(mean.toFixed(4)),
    std: Number(Math.sqrt(variance).toFixed(4)),
    p50: Number(quantile(trainingScores, 0.5).toFixed(4)),
    p95: Number(p95.toFixed(4)),
    p99: Number(quantile(trainingScores, 0.99).toFixed(4)),
  };

  return model;
}

function severityFor(score, threshold) {
  if (score >= Math.min(0.9, threshold + 0.12)) return "critical";
  if (score >= threshold) return "high";
  if (score >= Math.max(0.45, threshold - 0.05)) return "medium";
  return "low";
}

function explanationFor(model, event, score) {
  const fields = eventFields(event);
  const { vector } = extractVector(model, event);
  const candidates = [];

  if (isPublicAddress(fields.ip)) {
    candidates.push({ feature: "ip", reason: "source address is externally routable", deviation: 1.5 });
  }
  if (fields.status === "deny" || fields.status === "alert") {
    candidates.push({
      feature: "status",
      reason: `event status is ${fields.status}`,
      deviation: 1.2,
    });
  }

  const entropy = vector[NUMERIC_FEATURES.indexOf("message_entropy")];
  if (entropy > 0.72) {
    candidates.push({
      feature: "message_entropy",
      reason: `message entropy ${entropy.toFixed(2)} is above the learned baseline`,
      deviation: 1 + entropy,
    });
  }
  const digits = vector[NUMERIC_FEATURES.indexOf("digit_ratio")];
  if (digits > 0.2) {
    candidates.push({
      feature: "digit_ratio",
      reason: `${Math.round(digits * 100)}% of the message is numeric`,
      deviation: 1 + digits * 3,
    });
  }

  CATEGORICAL_FEATURES.forEach((name, index) => {
    const value = categoricalValues(fields)[index];
    const rarityScore = vector[NUMERIC_FEATURES.length + index];
    if (rarityScore > 0.55) {
      candidates.push({
        feature: name,
        reason: `${name.replaceAll("_", " ")} “${value}” is rare in the learned baseline`,
        deviation: rarityScore * 2,
      });
    }
  });

  const hour = vector[NUMERIC_FEATURES.indexOf("hour_sin")];
  const hourDeviation = Math.abs(hour - model.medians[0]) / model.iqrs[0];
  if (hourDeviation > 2.5) {
    candidates.push({
      feature: "hour",
      reason: "activity time is outside the usual operating window",
      deviation: Math.min(4, hourDeviation / 2),
    });
  }

  const top = candidates
    .filter((candidate) => Number.isFinite(candidate.deviation))
    .sort((a, b) => b.deviation - a.deviation)
    .slice(0, 3);

  return {
    score: Number(score.toFixed(4)),
    top,
    summary: top.length
      ? top.map((item) => item.reason).join("; ")
      : "No single feature dominates; the combined shape is unusual.",
  };
}

function metadataFor(model) {
  return {
    algorithm: model.algorithm,
    status: "trained",
    workspaceId: model.workspaceId,
    samples: model.samples,
    trees: model.trees.length,
    subsampleSize: model.subsampleSize,
    featureNames: model.featureNames,
    threshold: Number(model.threshold.toFixed(4)),
    scoreStats: model.stats,
    trainedAt: model.trainedAt,
    version: model.version,
    minSamples: MIN_TRAIN_SAMPLES,
  };
}

function loadRows(db, workspaceId, limit = config.telemetryTrainMax) {
  return db
    .prepare(
      `SELECT id, timestamp, source, host, event, action, status, ip, username, message, raw
       FROM telemetry_events
       WHERE workspace_id = ?
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(workspaceId, limit)
    .reverse();
}

function persistScores(db, model) {
  const update = db.prepare(
    `UPDATE telemetry_events
     SET anomaly_score = ?, anomaly_severity = ?, anomaly_explanation = ?
     WHERE id = ?`
  );
  const rows = loadRows(db, model.workspaceId);
  rows.forEach((row) => {
    const { vector } = extractVector(model, row);
    const score = scorePoint(model.trees, vector, model.subsampleSize);
    const explanation = explanationFor(model, row, score);
    update.run(
      explanation.score,
      severityFor(score, model.threshold),
      JSON.stringify(explanation),
      row.id
    );
  });
  return rows.length;
}

function persistMetadata(db, model) {
  const metadata = metadataFor(model);
  db.prepare(
    `INSERT INTO anomaly_models (workspace_id, version, trained_at, samples, threshold, metadata)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id) DO UPDATE SET
       version = excluded.version,
       trained_at = excluded.trained_at,
       samples = excluded.samples,
       threshold = excluded.threshold,
       metadata = excluded.metadata`
  ).run(
    model.workspaceId,
    model.version,
    model.trainedAt,
    model.samples,
    model.threshold,
    JSON.stringify(metadata)
  );
  return metadata;
}

export function trainWorkspaceModel(db, workspaceId, { reason = "manual" } = {}) {
  const rows = loadRows(db, workspaceId);
  if (rows.length < MIN_TRAIN_SAMPLES) {
    return {
      status: "insufficient_data",
      samples: rows.length,
      minSamples: MIN_TRAIN_SAMPLES,
      algorithm: ALGORITHM,
      reason,
    };
  }

  const model = buildModel(workspaceId, rows);
  model.trainedAt = new Date().toISOString();
  model.version = Date.now();
  const scored = persistScores(db, model);
  const metadata = persistMetadata(db, model);
  modelCache.set(workspaceId, model);
  return { ...metadata, scored, reason };
}

function rowCount(db, workspaceId) {
  return db.prepare("SELECT COUNT(*) AS count FROM telemetry_events WHERE workspace_id = ?").get(workspaceId)
    .count;
}

/**
 * Return a usable model, training lazily when the workspace has enough events.
 * A cached model is refreshed after enough new observations accumulate so it
 * tracks a changing environment instead of freezing on the first batch.
 */
export function ensureModel(db, workspaceId) {
  const cached = modelCache.get(workspaceId);
  if (cached) {
    const count = rowCount(db, workspaceId);
    if (count - cached.samples >= 500 && count >= MIN_TRAIN_SAMPLES) {
      return trainWorkspaceModel(db, workspaceId, { reason: "drift_refresh" });
    }
    return metadataFor(cached);
  }
  return trainWorkspaceModel(db, workspaceId, { reason: "lazy_train" });
}

export function getModelMetadata(db, workspaceId) {
  const cached = modelCache.get(workspaceId);
  if (cached) return metadataFor(cached);
  const row = db.prepare("SELECT * FROM anomaly_models WHERE workspace_id = ?").get(workspaceId);
  if (!row) {
    return {
      status: "untrained",
      algorithm: ALGORITHM,
      samples: rowCount(db, workspaceId),
      minSamples: MIN_TRAIN_SAMPLES,
    };
  }
  try {
    return { ...JSON.parse(row.metadata), samples: row.samples, threshold: row.threshold };
  } catch {
    return { status: "untrained", algorithm: ALGORITHM, samples: row.samples, minSamples: MIN_TRAIN_SAMPLES };
  }
}

export function scoreEvent(model, event) {
  if (!model || model.status !== "trained" || !model.trees?.length) {
    return null;
  }
  const { vector } = extractVector(model, event);
  const score = scorePoint(model.trees, vector, model.subsampleSize);
  const explanation = explanationFor(model, event, score);
  return {
    score: explanation.score,
    severity: severityFor(score, model.threshold),
    explanation,
    threshold: model.threshold,
    modelSamples: model.samples,
    modelVersion: model.version,
  };
}

/**
 * Score an incoming batch using the currently trained model. The model object is
 * cached for performance; callers must pass the workspace id, not a row.
 */
export function scoreBatch(db, workspaceId, events) {
  const cached = modelCache.get(workspaceId);
  if (!cached || !cached.trees?.length) {
    const metadata = ensureModel(db, workspaceId);
    if (metadata.status !== "trained") return events.map(() => null);
  }
  const model = modelCache.get(workspaceId);
  if (!model) return events.map(() => null);
  return events.map((event) => scoreEvent(model, event));
}

export function invalidateModel(workspaceId) {
  modelCache.delete(workspaceId);
}

export function anomalyFeatureCatalog() {
  return { algorithm: ALGORITHM, features: FEATURE_NAMES, minSamples: MIN_TRAIN_SAMPLES };
}
