import dns from "dns/promises";
import net from "net";

/**
 * Checks if an IPv4 or IPv6 address belongs to private/reserved ranges.
 * Private ranges:
 * - 127.0.0.0/8 (Loopback)
 * - 10.0.0.0/8 (Private RFC 1918)
 * - 172.16.0.0/12 (Private RFC 1918)
 * - 192.168.0.0/16 (Private RFC 1918)
 * - 169.254.0.0/16 (Link-local / AWS / GCP / Azure metadata 169.254.169.254)
 * - 0.0.0.0/8 (Current network)
 * - ::1 (IPv6 Loopback)
 * - fc00::/7 (IPv6 Unique Local)
 * - fe80::/10 (IPv6 Link-Local)
 */
export function isPrivateIp(ip) {
  if (!net.isIP(ip)) {
    return false;
  }

  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    // 127.0.0.0/8
    if (parts[0] === 127) return true;
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;

    return false;
  }

  // IPv6 checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
    if (normalized.startsWith("fe80:") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    return false;
  }

  return false;
}

/**
 * Validates a target URL against SSRF rules.
 * Resolves hostname via DNS and checks all resulting IPs against private ranges.
 *
 * @param {string} targetUrl 
 * @param {boolean} [allowLocalDev=false] 
 * @returns {Promise<{ allowed: boolean, reason?: string, resolvedIp?: string }>}
 */
export async function validateSsrfTarget(targetUrl, allowLocalDev = false) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (_e) {
    return { allowed: false, reason: "ERR_INVALID_URL: Could not parse target URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: `ERR_DISALLOWED_PROTOCOL: Protocol '${parsed.protocol}' is not allowed` };
  }

  const hostname = parsed.hostname;

  // Local development exception for demo provider on 127.0.0.1 / localhost
  if (allowLocalDev && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return { allowed: true, resolvedIp: "127.0.0.1" };
  }

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { allowed: false, reason: `ERR_SSRF_BLOCKED_IP: Direct connection to private IP '${hostname}' is prohibited` };
    }
    return { allowed: true, resolvedIp: hostname };
  }

  // Resolve DNS records
  try {
    const lookupResults = await dns.lookup(hostname, { all: true });
    for (const record of lookupResults) {
      if (isPrivateIp(record.address)) {
        return {
          allowed: false,
          reason: `ERR_SSRF_BLOCKED_DNS: Hostname '${hostname}' resolved to private IP '${record.address}'`,
        };
      }
    }
    return { allowed: true, resolvedIp: lookupResults[0]?.address };
  } catch (err) {
    return { allowed: false, reason: `ERR_DNS_RESOLUTION_FAILED: Failed to resolve hostname '${hostname}': ${err.message}` };
  }
}

