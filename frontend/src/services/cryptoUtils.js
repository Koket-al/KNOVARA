/**
 * Client-Side Cryptographic Hashing Utilities
 *
 * Uses the standard Web Crypto API (crypto.subtle) to compute byte-level SHA-256 digests
 * for client-side evidence verification without transmitting private keys.
 */

/**
 * Computes SHA-256 digest of an ArrayBuffer or Uint8Array.
 * Returns lowercase 64-character hexadecimal string.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {Promise<string>}
 */
export async function calculateSha256Hex(buffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes SHA-256 digest of an ArrayBuffer or Uint8Array.
 * Returns Base64 string (NEP-177 reference_hash format).
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {Promise<string>}
 */
export async function calculateSha256Base64(buffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(hashBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Computes SHA-256 hex digest of a browser File object.
 *
 * @param {File} file
 * @returns {Promise<{ sha256Hex: string, sizeBytes: number }>}
 */
export async function calculateFileSha256(file) {
  const arrayBuffer = await file.arrayBuffer();
  const sha256Hex = await calculateSha256Hex(arrayBuffer);
  return {
    sha256Hex,
    sizeBytes: file.size,
  };
}

