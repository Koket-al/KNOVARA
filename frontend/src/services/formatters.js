/**
 * KNOVARA Numeric & Cryptographic Formatters
 *
 * Provides exact conversions between yoctoNEAR (10^24) and NEAR,
 * basis points (10000 = 100%) and percentages, and truncated hash representations.
 */

const YOCTO_PER_NEAR = 10n ** 24n;

/**
 * Converts a yoctoNEAR decimal string to a human-readable NEAR string.
 * Uses exact BigInt integer division and fractional padding.
 *
 * @param {string|number} yocto
 * @param {number} [maxDecimals=4]
 * @returns {string}
 */
export function yoctoToNear(yocto, maxDecimals = 4) {
  if (!yocto || yocto === "0") return "0";
  try {
    const rawStr = String(yocto).trim();
    const isNegative = rawStr.startsWith("-");
    const cleanStr = isNegative ? rawStr.slice(1) : rawStr;
    const value = BigInt(cleanStr);

    const wholePart = value / YOCTO_PER_NEAR;
    const remainder = value % YOCTO_PER_NEAR;

    if (remainder === 0n) {
      return `${isNegative ? "-" : ""}${wholePart.toString()}`;
    }

    // Pad remainder to 24 decimal digits
    const remStr = remainder.toString().padStart(24, "0");
    const trimmed = remStr.slice(0, maxDecimals).replace(/0+$/, "");

    if (!trimmed) {
      return `${isNegative ? "-" : ""}${wholePart.toString()}`;
    }

    return `${isNegative ? "-" : ""}${wholePart.toString()}.${trimmed}`;
  } catch (_e) {
    return "0";
  }
}

/**
 * Converts a decimal NEAR string to an exact 24-decimal yoctoNEAR string.
 *
 * @param {string|number} near
 * @returns {string}
 */
export function nearToYocto(near) {
  if (!near || near === "0") return "0";
  const str = String(near).trim();
  const parts = str.split(".");
  const whole = parts[0] || "0";
  const fraction = (parts[1] || "").slice(0, 24);
  const paddedFraction = fraction.padEnd(24, "0");

  const wholeYocto = BigInt(whole) * YOCTO_PER_NEAR;
  const fractionYocto = BigInt(paddedFraction);
  return (wholeYocto + fractionYocto).toString();
}

/**
 * Formats basis points (10,000 basis points = 100.00%)
 *
 * @param {number} bps
 * @returns {string}
 */
export function formatBasisPoints(bps) {
  const num = Number(bps);
  if (isNaN(num)) return "0.00%";
  return `${(num / 100).toFixed(2)}%`;
}

/**
 * Truncates long hex or base64 hashes for compact technical display.
 *
 * @param {string} hash
 * @param {number} [prefix=8]
 * @param {number} [suffix=6]
 * @returns {string}
 */
export function truncateHash(hash, prefix = 8, suffix = 6) {
  if (!hash || typeof hash !== "string") return "";
  if (hash.length <= prefix + suffix + 3) return hash;
  return `${hash.slice(0, prefix)}...${hash.slice(-suffix)}`;
}

/**
 * Formats ISO date string to clean editorial format.
 *
 * @param {string|Date} dateVal
 * @returns {string}
 */
export function formatDate(dateVal) {
  if (!dateVal) return "—";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "—";
    return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  } catch (_e) {
    return "—";
  }
}

/**
 * Formats gas amount into Tgas.
 *
 * @param {string|number} gasString
 * @returns {string}
 */
export function formatGasToTgas(gasString) {
  if (!gasString) return "0 Tgas";
  try {
    const val = BigInt(String(gasString));
    const tgas = val / (10n ** 12n);
    return `${tgas.toString()} Tgas`;
  } catch (_e) {
    return `${gasString} gas`;
  }
}

