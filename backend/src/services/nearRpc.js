import { config } from "../config/env.js";

/**
 * Custom error types for distinguishing RPC communication failures from authorization rejections.
 */
export class RpcCommunicationError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "RpcCommunicationError";
    this.status = 503;
    this.cause = cause;
  }
}

export class KeyNotEligibleError extends Error {
  constructor(message) {
    super(message);
    this.name = "KeyNotEligibleError";
    this.status = 403;
  }
}

/**
 * Verifies via NEAR RPC whether the provided public key belongs to the claimed account
 * and holds FullAccess permissions.
 *
 * @param {string} accountId - Claimed NEAR account ID (e.g. "alice.testnet")
 * @param {string} publicKey - Public key in standard NEAR format (e.g. "ed25519:...")
 * @param {object} [options] - Optional overrides for testing
 * @param {string} [options.rpcUrl] - Override RPC URL
 * @param {function} [options.fetchFn] - Override fetch implementation for mocking
 * @returns {Promise<boolean>} - Resolves to true if key is valid FullAccess; throws otherwise.
 */
export async function verifyFullAccessKey(accountId, publicKey, options = {}) {
  const rpcUrl = options.rpcUrl || config.NEAR_RPC_URL;
  const fetchImpl = options.fetchFn || globalThis.fetch;

  if (!publicKey || typeof publicKey !== "string" || !publicKey.startsWith("ed25519:")) {
    throw new KeyNotEligibleError("ERR_UNSUPPORTED_KEY_TYPE: Public key must use ed25519 scheme");
  }

  const payload = {
    jsonrpc: "2.0",
    id: "knovara-access-key-query",
    method: "query",
    params: {
      request_type: "view_access_key",
      finality: "optimistic",
      account_id: accountId,
      public_key: publicKey,
    },
  };

  let response;
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (netErr) {
    throw new RpcCommunicationError("ERR_NEAR_RPC_UNAVAILABLE: Network error connecting to NEAR RPC", netErr);
  }

  if (!response.ok) {
    throw new RpcCommunicationError(`ERR_NEAR_RPC_HTTP_${response.status}: NEAR RPC responded with HTTP ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new RpcCommunicationError("ERR_NEAR_RPC_RESPONSE_INVALID: Unable to parse JSON response from NEAR RPC", parseErr);
  }

  if (data.error) {
    const errorStr = JSON.stringify(data.error).toUpperCase();
    // If the key or account is not recognized on-chain, it is an authorization failure
    if (
      errorStr.includes("UNKNOWN_ACCESS_KEY") ||
      errorStr.includes("UNKNOWN_ACCOUNT") ||
      errorStr.includes("DOES NOT EXIST") ||
      errorStr.includes("ACCESS KEY")
    ) {
      throw new KeyNotEligibleError("ERR_KEY_NOT_FOUND_ON_ACCOUNT: The specified public key is not associated with this account");
    }

    // Other errors may be temporary node indexing lag or internal RPC errors
    throw new RpcCommunicationError(`ERR_NEAR_RPC_INTERNAL: ${data.error.message || JSON.stringify(data.error)}`);
  }

  const permission = data.result?.permission;

  if (permission === "FullAccess") {
    return true;
  }

  if (typeof permission === "object" && permission !== null && "FunctionCall" in permission) {
    throw new KeyNotEligibleError("ERR_KEY_NOT_ELIGIBLE_FULL_ACCESS: FunctionCall keys cannot authenticate wallet sessions");
  }

  throw new KeyNotEligibleError("ERR_KEY_NOT_ELIGIBLE_FULL_ACCESS: Key does not have FullAccess permission on-chain");
}
