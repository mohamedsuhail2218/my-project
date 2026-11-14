import { createApp } from "./app.js";
import { bootstrapAdmin, createDatabase, pruneLegacyAudit, pruneSessions } from "./db.js";
import { config, validateRuntimeConfig } from "./config.js";

const { errors, warnings } = validateRuntimeConfig();
for (const warning of warnings) console.warn(`[config] ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`[config] ${error}`);
  console.error("[api] Refusing to start with an unsafe production configuration.");
  process.exit(1);
}

const db = createDatabase(config.dbPath);

if (config.bootstrapAdmin.email && config.bootstrapAdmin.password) {
  try {
    const created = await bootstrapAdmin(db, config.bootstrapAdmin);
    if (created) {
      console.log(`[api] Bootstrapped initial Super Admin ${created.email}.`);
    }
  } catch (error) {
    console.error("[api] Could not bootstrap the initial admin:", error.message);
    process.exit(1);
  }
}

const app = createApp({ db });
const server = app.listen(config.port, config.host, () => {
  console.log(`[api] Digital Twin Cyber War API listening on http://${config.host}:${config.port}`);
  console.log(`[api] SQLite database: ${config.dbPath}`);
  if (!config.isProduction) {
    console.log("[api] Development mode: Secure cookies and HSTS are disabled.");
  }
});

server.requestTimeout = config.requestTimeoutMs;
server.headersTimeout = config.headersTimeoutMs;
server.keepAliveTimeout = config.keepAliveTimeoutMs;

// Housekeeping is cheap and bounded. Audit rows created by this release are
// hash-chained and are never deleted; only pre-migration legacy rows expire.
const pruneTimer = setInterval(() => {
  try {
    const sessions = pruneSessions(db);
    const legacyAudit = pruneLegacyAudit(db);
    if (sessions || legacyAudit) {
      console.log(`[api] Pruned ${sessions} session(s) and ${legacyAudit} legacy audit row(s).`);
    }
  } catch (error) {
    console.error("[api] Pruning failed:", error.message);
  }
}, 6 * 60 * 60 * 1000);
pruneTimer.unref();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received, shutting down.`);
  const force = setTimeout(() => {
    console.error("[api] Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000);
  force.unref();
  clearInterval(pruneTimer);
  server.close(() => {
    try {
      db.close();
    } catch {
      // Ignore close errors.
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
