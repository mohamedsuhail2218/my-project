import { config } from "../config.js";
import { connectorError, formBody, httpJson } from "./http.js";

const cache = new Map();

/**
 * Client-credentials token for Microsoft identity platform APIs. Tokens are
 * cached in memory until shortly before expiry; secrets never leave the server.
 */
export async function azureToken({ tenantId, clientId, clientSecret, scope, source }) {
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(`${source} connector is not configured.`);
  }
  const cacheKey = `${tenantId}:${clientId}:${scope}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const body = formBody({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });
  const response = await httpJson(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      source: `${source} identity`,
      timeoutMs: config.connectors.timeoutMs,
    }
  );
  if (!response?.access_token) {
    throw new Error(`${source}: identity endpoint returned no access token.`);
  }
  const expiresAt = Date.now() + Math.max(60, Number(response.expires_in) || 3600) * 1000;
  cache.set(cacheKey, { token: response.access_token, expiresAt });
  return response.access_token;
}

export function azureConfigured(settings) {
  return Boolean(settings.tenantId && settings.clientId && settings.clientSecret);
}

export { connectorError };
