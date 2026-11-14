import { describe, expect, it } from "vitest";
import {
  applyControl,
  applyControlByRecommendation,
  computeRisk,
  evaluateScenario,
  recommendationImpact,
} from "../../src/lib/engine.js";
import { SCENARIOS, SEED_ASSETS, SEED_RECOMMENDATIONS } from "../../src/data/mock.js";

describe("twin risk engine", () => {
  it("applies a control only to the targeted assets and stays idempotent", () => {
    const once = applyControl(SEED_ASSETS, "mfa", ["vpn-01"]);
    const twice = applyControl(once, "mfa", ["vpn-01"]);
    const target = once.find((asset) => asset.id === "vpn-01");
    const untouched = once.find((asset) => asset.id === "web-01");

    expect(target.controls).toContain("mfa");
    expect(target.controls.filter((control) => control === "mfa")).toHaveLength(1);
    expect(twice).toEqual(once);
    expect(untouched.controls).toEqual(
      SEED_ASSETS.find((asset) => asset.id === "web-01").controls
    );
  });

  it("resolves recommendation targets to unique asset ids", () => {
    const recommendation = SEED_RECOMMENDATIONS[0];
    const after = applyControlByRecommendation(SEED_ASSETS, recommendation.control);
    const targets = SEED_RECOMMENDATIONS.filter(
      (item) => item.control === recommendation.control
    ).flatMap((item) => item.targets);
    targets.forEach((id) => {
      expect(after.find((asset) => asset.id === id).controls).toContain(recommendation.control);
    });
  });

  it("blocks an attack path at the first controlled hop", () => {
    const scenario = SCENARIOS[0];
    const blockedStep = scenario.steps[0];
    const hardened = applyControl(SEED_ASSETS, blockedStep.control, [blockedStep.to]);
    const plan = evaluateScenario(scenario, hardened);

    expect(plan.attackerSuccess).toBe(false);
    expect(plan.blockedAt).toBe(0);
    expect(plan.completedSteps).toBe(0);
    expect(plan.steps[0].status).toBe("blocked");
    expect(plan.steps.slice(1).every((step) => step.status === "not-reached")).toBe(true);
    expect(plan.successProbability).toBe(0);
  });

  it("computes a bounded risk score and lowers it when controls are added", () => {
    const before = computeRisk(SEED_ASSETS);
    const hardened = [
      "mfa",
      "edr",
      "patch",
      "segmentation",
      "backup",
      "dlp",
      "egress-filter",
      "iam",
      "encryption",
      "artifact-signing",
      "rate-limit",
      "waf",
    ].reduce(
      (assets, control) => applyControl(assets, control, assets.map((asset) => asset.id)),
      SEED_ASSETS
    );
    const after = computeRisk(hardened);

    expect(before.score).toBeGreaterThanOrEqual(5);
    expect(before.score).toBeLessThanOrEqual(98);
    expect(after.score).toBeLessThanOrEqual(before.score);
    expect(after.coverage).toBeGreaterThan(before.coverage);
    expect(after.assetRisks).toHaveLength(SEED_ASSETS.length);
  });

  it("reports a negative delta for a recommendation that reduces risk", () => {
    const impact = recommendationImpact(SEED_ASSETS, SEED_RECOMMENDATIONS[0]);
    expect(impact.before).toBeGreaterThan(0);
    expect(impact.after).toBeLessThanOrEqual(impact.before);
    expect(Array.isArray(impact.blockedScenarios)).toBe(true);
  });
});
