import { CRITICALITY, SCENARIOS, SEED_RECOMMENDATIONS, CONTROL_LABELS } from "../data/mock";

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const KEY_CONTROLS = [
  "waf",
  "mfa",
  "edr",
  "patch",
  "segmentation",
  "backup",
  "dlp",
  "egress-filter",
  "rate-limit",
  "iam",
  "encryption",
  "artifact-signing",
];

const CONTROL_STRENGTH = {
  waf: 5,
  mfa: 6,
  edr: 6,
  patch: 4.5,
  segmentation: 8,
  backup: 5,
  dlp: 4,
  "egress-filter": 5,
  "rate-limit": 4,
  iam: 5,
  encryption: 3,
  "artifact-signing": 4,
  ips: 3,
  logging: 2,
  tls: 2,
  "spam-filter": 2,
  training: 1,
};

export function applyControl(assets, control, targetIds) {
  return assets.map((asset) => {
    if (!targetIds.includes(asset.id)) return asset;
    if (asset.controls.includes(control)) return asset;
    return { ...asset, controls: [...asset.controls, control] };
  });
}

export function applyControlByRecommendation(assets, control, recommendations = SEED_RECOMMENDATIONS) {
  const targets = recommendations
    .filter((rec) => rec.control === control)
    .flatMap((rec) => rec.targets);
  return applyControl(assets, control, [...new Set(targets)]);
}

export function assetRisk(asset) {
  const criticality = CRITICALITY[asset.criticality] || CRITICALITY.medium;
  const base = criticality.impact * 74 + asset.exposure * 26;
  const mitigation = asset.controls.reduce(
    (sum, control) => sum + (CONTROL_STRENGTH[control] || 2),
    0
  );
  return Math.round(clamp(base - Math.min(40, mitigation), 5, 97));
}

export function evaluateScenario(scenario, assets) {
  let chainBroken = false;
  const steps = scenario.steps.map((step, index) => {
    const source = assets.find((asset) => asset.id === step.from) || null;
    const target = assets.find((asset) => asset.id === step.to) || null;
    const reachable = !chainBroken;
    const hasControl = !!target?.controls?.includes(step.control);
    const blocked = reachable && hasControl;
    if (blocked) chainBroken = true;

    return {
      ...step,
      index,
      source,
      target,
      reachable,
      controlPresent: hasControl,
      status: !reachable ? "not-reached" : blocked ? "blocked" : "success",
      probability: blocked
        ? 4
        : Math.round(clamp(step.base * 100 - (index * 2) - (target?.controls?.length || 0) * 2, 8, 96)),
    };
  });

  const attackerSuccess = steps.length > 0 && steps.every((step) => step.status === "success");
  const firstBlocked = steps.findIndex((step) => step.status === "blocked");
  const completedSteps = steps.filter((step) => step.status === "success").length;

  return {
    steps,
    attackerSuccess,
    blockedAt: firstBlocked,
    completedSteps,
    totalSteps: steps.length,
    successProbability: attackerSuccess
      ? Math.round(
          steps.reduce((product, step) => product * (step.probability / 100), 1) * 100
        )
      : 0,
  };
}

export function scenarioRisk(scenario, assets) {
  const plan = evaluateScenario(scenario, assets);
  if (plan.attackerSuccess) return 96;
  const successes = plan.steps.filter((step) => step.status === "success").length;
  return clamp(12 + successes * 17, 8, 72);
}

export function computeRisk(assets) {
  const totalWeight = assets.reduce(
    (sum, asset) => sum + (CRITICALITY[asset.criticality]?.weight || 1),
    0
  );
  const weightedAssetRisk =
    assets.reduce(
      (sum, asset) => sum + assetRisk(asset) * (CRITICALITY[asset.criticality]?.weight || 1),
      0
    ) / Math.max(1, totalWeight);

  const scenarioScores = SCENARIOS.map((scenario) => scenarioRisk(scenario, assets));
  const scenarioAverage =
    scenarioScores.reduce((sum, value) => sum + value, 0) / Math.max(1, scenarioScores.length);

  const score = Math.round(clamp(weightedAssetRisk * 0.62 + scenarioAverage * 0.38, 5, 98));

  const criticalAssets = assets.filter((asset) => ["critical", "high"].includes(asset.criticality));
  const likelihood = Math.round(
    clamp(
      criticalAssets.reduce(
        (sum, asset) =>
          sum +
          (54 + asset.exposure * 30 - Math.min(30, asset.controls.length * 5.2)),
        0
      ) / Math.max(1, criticalAssets.length),
      5,
      97
    )
  );

  const weightedImpact =
    assets.reduce(
      (sum, asset) =>
        sum +
        (CRITICALITY[asset.criticality]?.impact || 0.5) *
          (CRITICALITY[asset.criticality]?.weight || 1),
      0
    ) / Math.max(1, totalWeight);

  const exposure = Math.round(
    (assets.reduce((sum, asset) => sum + asset.exposure, 0) / Math.max(1, assets.length)) * 100
  );

  const presentControls = new Set(assets.flatMap((asset) => asset.controls));
  const coverage = Math.round(
    (KEY_CONTROLS.filter((control) => presentControls.has(control)).length / KEY_CONTROLS.length) *
      100
  );

  return {
    score,
    likelihood,
    impact: Math.round(weightedImpact * 100),
    exposure,
    coverage,
    assetRisk: Math.round(weightedAssetRisk),
    scenarioRisk: Math.round(scenarioAverage),
    assetRisks: assets.map((asset) => ({ ...asset, risk: assetRisk(asset) })),
  };
}

export function riskLabel(score) {
  if (score >= 80) return { label: "Critical", tone: "critical" };
  if (score >= 60) return { label: "Elevated", tone: "high" };
  if (score >= 40) return { label: "Moderate", tone: "medium" };
  if (score >= 20) return { label: "Guarded", tone: "low" };
  return { label: "Hardened", tone: "success" };
}

export function recommendationImpact(assets, recommendation) {
  const after = applyControl(assets, recommendation.control, recommendation.targets);
  const before = computeRisk(assets).score;
  const next = computeRisk(after).score;
  return {
    before,
    after: next,
    delta: next - before,
    blockedScenarios: SCENARIOS.filter((scenario) => {
      const planBefore = evaluateScenario(scenario, assets);
      const planAfter = evaluateScenario(scenario, after);
      return planBefore.attackerSuccess && !planAfter.attackerSuccess;
    }),
  };
}

export function controlGaps(assets) {
  const present = new Set(assets.flatMap((asset) => asset.controls));
  return KEY_CONTROLS.filter((control) => !present.has(control)).map((control) => ({
    control,
    label: CONTROL_LABELS[control] || control,
  }));
}

export function uniqueControls(assets) {
  return [...new Set(assets.flatMap((asset) => asset.controls))];
}

export function severityRank(severity) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity] ?? 4;
}

export function statusTone(status) {
  return (
    {
      open: "critical",
      investigating: "high",
      contained: "medium",
      closed: "success",
      triaged: "low",
      ready: "success",
      running: "high",
      completed: "success",
      proposed: "medium",
      applied: "success",
      dismissed: "low",
    }[status] || "neutral"
  );
}
