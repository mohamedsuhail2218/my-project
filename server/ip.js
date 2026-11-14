import ipaddr from "ipaddr.js";

export function normalizeAddress(value) {
  if (!value) return null;
  let raw = String(value).trim();
  if (raw.startsWith("[") && raw.endsWith("]")) raw = raw.slice(1, -1);
  const zoneIndex = raw.indexOf("%");
  if (zoneIndex !== -1) raw = raw.slice(0, zoneIndex);
  if (!ipaddr.isValid(raw)) return null;
  let address = ipaddr.parse(raw);
  if (address.kind() === "ipv6" && address.isIPv4MappedAddress()) {
    address = address.toIPv4Address();
  }
  return address;
}

function parseRange(value) {
  if (value.includes("/")) return ipaddr.parseCIDR(value);
  const address = ipaddr.parse(value);
  return [address, address.kind() === "ipv4" ? 32 : 128];
}

export function parseAllowlist(text) {
  const ranges = [];
  String(text || "")
    .split(/\r?\n/)
    .forEach((line, index) => {
      const value = line.replace(/#.*$/, "").trim();
      if (!value) return;
      try {
        ranges.push(parseRange(value));
      } catch {
        throw new Error(`IP allowlist line ${index + 1} is not a valid IP address or CIDR range.`);
      }
    });
  return ranges;
}

export function validateAllowlist(text) {
  try {
    parseAllowlist(text);
    return null;
  } catch (error) {
    return error.message;
  }
}

export function isIpAllowed(ip, allowlistText) {
  let ranges;
  try {
    ranges = parseAllowlist(allowlistText);
  } catch {
    // A malformed stored policy must fail closed rather than silently allow all.
    return false;
  }
  if (ranges.length === 0) return true;
  const address = normalizeAddress(ip);
  if (!address) return false;
  return ranges.some(
    ([range, prefix]) => range.kind() === address.kind() && address.match(range, prefix)
  );
}
