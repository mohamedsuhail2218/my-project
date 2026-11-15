import { createApp } from "../server/app.js";
import {
  bootstrapAdmin,
  createDatabase,
  pruneLegacyAudit,
  pruneSessions,
} from "../server/db.js";
import { config, validateRuntimeConfig } from "../server/config.js";

// Vercel rewrites /api/* to this function through /api/index. The query marker
// carries the original path so Express can route it unchanged.
const REWRITE_MARKER = "__dtcw_path";

export function restoreApiUrl(req) {
  const raw = req.url || "";
  const queryIndex = raw.indexOf("?");
  if (queryIndex === -1) return;

  const pathname = raw.slice(0, queryIndex);
  if (pathname !== "/api/index" && pathname !== "/api/index/") return;

  const params = new URLSearchParams(raw.slice(queryIndex + 1));
  const captured = params.getAll(REWRITE_MARKER)[0];
  if (captured === undefined) return;

  // The first marker is the path Vercel captured. Any marker supplied by the
  // client is ignored so a crafted query cannot rewrite the API path.
  params.delete(REWRITE_MARKER);
  const search = params.toString();
  req.url = `/api${captured ? `/${captured}` : ""}${search ? `?${search}` : ""}`;
}

let appPromise;

async function initialize() {
  const { errors, warnings } = validateRuntimeConfig();
  for (const warning of warnings) console.warn(`[config] ${warning}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`[config] ${error}`);
    throw new Error("Refusing to start with an unsafe production configuration.");
  }

  const db = createDatabase(config.dbPath);

  if (config.bootstrapAdmin.email && config.bootstrapAdmin.password) {
    const created = await bootstrapAdmin(db, config.bootstrapAdmin);
    if (created) {
      console.log(`[api] Bootstrapped initial Super Admin ${created.email}.`);
    }
  }

  try {
    pruneSessions(db);
    pruneLegacyAudit(db);
  } catch (error) {
    console.warn(`[api] Session pruning skipped: ${error.message}`);
  }

  return createApp({ db });
}

function getApp() {
  if (!appPromise) {
    appPromise = initialize().catch((error) => {
      appPromise = undefined;
      throw error;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  restoreApiUrl(req);
  try {
    const app = await getApp();
    app(req, res);
  } catch (error) {
    console.error("[api] Serverless initialization failed:", error);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "Server initialization failed." }));
    }
  }
}
