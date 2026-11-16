import { z } from "zod";
import { config } from "./config.js";
import { validateAllowlist } from "./ip.js";
import { PLAN_NAMES } from "./plans.js";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;

const COMMON_PASSWORDS = new Set([
  "password1234",
  "password123!",
  "qwerty123456",
  "letmein12345",
  "administrator",
  "welcome12345",
  "twindemo!2026",
  "correcthorsebatterystaple",
]);

const id = z.string().trim().min(1).max(120);
const longText = z.string().max(8000);

const entity = z.object({ id }).passthrough();

const asset = z
  .object({
    id,
    name: z.string().trim().min(1).max(120),
    criticality: z.enum(["critical", "high", "medium", "low"]),
    exposure: z.number().min(0).max(1),
    controls: z.array(z.string().max(80)).max(80),
  })
  .passthrough();

const edge = z
  .object({
    id,
    from: id,
    to: id,
  })
  .passthrough();

const log = z
  .object({
    id,
    timestamp: z.string().max(60),
    source: z.string().max(60),
    host: z.string().max(120),
    event: z.string().max(120),
    status: z.enum(["allow", "deny", "alert"]),
    message: longText,
  })
  .passthrough();

const collection = (max) => z.array(z.record(z.string(), z.unknown())).max(max);

function passwordBytesIssue(value, ctx) {
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Password must be at most ${MAX_PASSWORD_BYTES} bytes because bcrypt ignores anything longer.`,
    });
  }
}

const loginPassword = z
  .string()
  .min(1)
  .max(200)
  .superRefine((value, ctx) => passwordBytesIssue(value, ctx));

const strongPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH)
  .max(200)
  .superRefine((value, ctx) => {
    passwordBytesIssue(value, ctx);
    if (COMMON_PASSWORDS.has(value.toLowerCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "This password is too common. Choose a unique passphrase.",
      });
    }
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
      pattern.test(value)
    ).length;
    if (classes < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use at least three of: lowercase, uppercase, numbers and symbols.",
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: loginPassword,
  remember: z.boolean().optional().default(true),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  org: z.string().trim().min(2).max(120),
  password: strongPassword,
  terms: z.literal(true),
  inviteCode: z.string().trim().max(200).optional(),
});

export const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    title: z.string().trim().max(120).optional().default(""),
  })
  .strict();

export const planSchema = z
  .object({
    plan: z.enum(PLAN_NAMES),
  })
  .strict();

export const securityPolicySchema = z
  .object({
    sessionTimeoutMinutes: z.number().int().min(15).max(1440),
    ipAllowlist: z.string().max(2000),
  })
  .strict()
  .superRefine((policy, ctx) => {
    const error = validateAllowlist(policy.ipAllowlist);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ipAllowlist"], message: error });
    }
  });

export const workspaceSchema = z
  .object({
    schemaVersion: z.number().int().min(1).max(100).optional(),
    org: z
      .object({
        name: z.string().trim().min(1).max(120),
        domain: z.string().trim().max(120).optional(),
        // Accepted for compatibility but ignored: plan and seats are server-owned.
        plan: z.enum(PLAN_NAMES).optional(),
      })
      .passthrough(),
    settings: z.record(z.string(), z.unknown()).optional(),
    assets: z.array(asset).max(500),
    edges: z.array(edge).max(2000),
    runs: collection(5000),
    recommendations: collection(5000),
    detections: collection(10000),
    incidents: collection(5000),
    fingerprints: collection(1000),
    intel: collection(10000),
    evidence: collection(10000),
    reports: collection(2000),
    logs: z.array(log).max(25000),
    team: collection(1000),
    activity: collection(10000),
    notifications: collection(500),
  })
  .passthrough()
  .superRefine((workspace, ctx) => {
    const bytes = Buffer.byteLength(JSON.stringify(workspace), "utf8");
    if (bytes > config.maxWorkspaceBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Workspace payload exceeds the ${Math.floor(config.maxWorkspaceBytes / 1000)} kB limit.`,
      });
    }
  });

const telemetryEvent = z
  .object({
    eventId: z.string().trim().max(120).optional(),
    id: z.union([z.string().max(120), z.number()]).optional(),
    timestamp: z.string().trim().max(40).optional(),
    source: z.string().trim().max(60).optional(),
    host: z.string().trim().max(120).optional(),
    event: z.string().trim().max(120).optional(),
    action: z.string().trim().max(120).optional(),
    status: z.enum(["allow", "deny", "alert"]).optional(),
    ip: z.string().trim().max(64).optional(),
    user: z.string().trim().max(120).optional(),
    username: z.string().trim().max(120).optional(),
    message: longText.optional(),
    raw: z.string().max(16000).optional(),
  })
  .passthrough();

export const telemetryIngestSchema = z
  .object({
    source: z.string().trim().max(60).optional(),
    events: z.array(telemetryEvent).min(1).max(config.telemetryMaxBatch),
  })
  .strict();

export const telemetryTokenSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional().default("Log shipper"),
  })
  .strict();

export const networkFlowSchema = z
  .object({
    format: z.enum(["auto", "zeek", "suricata", "netflow", "generic"]).optional().default("auto"),
    source: z.string().trim().max(60).optional(),
    sensor: z.string().trim().max(120).optional(),
    flows: z.array(z.record(z.string(), z.unknown())).min(1).max(config.network.maxBatch),
  })
  .strict();

export const detectionStatusSchema = z
  .object({
    status: z.enum(["open", "triaged", "closed"]),
    note: z.string().trim().max(500).optional().default(""),
  })
  .strict();

export const detectionSimulationSchema = z
  .object({
    scenario: z
      .enum(["brute_force", "port_scan", "suspicious_beacon", "suspicious_egress", "all"])
      .optional()
      .default("all"),
  })
  .strict();

export const connectorPullSchema = z
  .object({
    since: z.string().trim().max(60).optional(),
    limit: z.number().int().min(1).max(1000).optional().default(200),
  })
  .strict();


export const assistantSchema = z
  .object({
    question: z.string().trim().min(3).max(2000),
    incidentId: z.string().trim().max(120).optional(),
    detectionId: z.string().trim().max(120).optional(),
  })
  .strict();

export const intelLookupSchema = z
  .object({
    indicator: z.string().trim().min(1).max(2048),
    refresh: z.union([z.boolean(), z.enum(["0", "1", "true", "false"])]).optional(),
  })
  .strict();

export const responseProposalSchema = z
  .object({
    playbookId: z.string().trim().min(1).max(80),
    target: z.string().trim().min(1).max(200),
    rationale: z.string().trim().max(1200).optional().default(""),
    incidentId: z.string().trim().max(120).optional(),
    detectionId: z.string().trim().max(120).optional(),
    eventId: z.number().int().positive().optional(),
  })
  .strict();

export const responseDecisionSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(500).optional().default(""),
  })
  .strict();

export const responseRuleSchema = z
  .object({
    playbookId: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    minScore: z.number().min(0.5).max(0.99),
  })
  .strict();

export const resetSchema = z.object({}).passthrough();

export function formatZodError(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
