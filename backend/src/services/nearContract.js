import { config } from "../config/env.js";

/**
 * Custom error hierarchy for NEAR RPC and Smart Contract interactions.
 */
export class NearRpcError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = "NearRpcError";
    this.status = status;
    this.details = details;
  }
}

export class NearContractPanicError extends NearRpcError {
  constructor(message, panicMessage) {
    super(message, 400, { panicMessage });
    this.name = "NearContractPanicError";
    this.panicMessage = panicMessage;
  }
}

export class NearMethodNotFoundError extends NearRpcError {
  constructor(message, method) {
    super(message, 404, { method });
    this.name = "NearMethodNotFoundError";
  }
}

export class NearAccountNotFoundError extends NearRpcError {
  constructor(message, accountId) {
    super(message, 404, { accountId });
    this.name = "NearAccountNotFoundError";
  }
}

export class NearRpcTimeoutError extends NearRpcError {
  constructor(message) {
    super(message, 504);
    this.name = "NearRpcTimeoutError";
  }
}

export class NearRpcRateLimitError extends NearRpcError {
  constructor(message) {
    super(message, 429);
    this.name = "NearRpcRateLimitError";
  }
}

let customRpcClient = null;

/**
 * Sets a custom or mock RPC client for testing.
 * @param {object|null} client
 */
export function setMockRpcClient(client) {
  customRpcClient = client;
}

/**
 * Resets the custom RPC client.
 */
export function resetMockRpcClient() {
  customRpcClient = null;
}

/**
 * Executes a JSON-RPC call to NEAR Testnet RPC with timeout and retry support.
 *
 * @param {string} method - JSON-RPC method name (e.g. "query", "tx")
 * @param {object|Array} params - JSON-RPC parameters
 * @param {object} [options]
 * @param {string} [options.rpcUrl]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRetries]
 * @returns {Promise<any>}
 */
export async function executeJsonRpc(method, params, options = {}) {
  if (customRpcClient) {
    if (typeof customRpcClient === "function") {
      return customRpcClient(method, params, options);
    }
    if (typeof customRpcClient.execute === "function") {
      return customRpcClient.execute(method, params, options);
    }
  }

  const rpcUrl = options.rpcUrl || config.NEAR_RPC_URL || "https://rpc.testnet.near.org";
  const timeoutMs = options.timeoutMs || 10000;
  const maxRetries = options.maxRetries ?? 2;
  const fetchImpl = options.fetchFn || globalThis.fetch;

  let attempt = 0;
  let lastError;

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `knovara-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          method,
          params,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        lastError = new NearRpcRateLimitError("ERR_NEAR_RPC_RATE_LIMIT: NEAR RPC rate limit reached");
        if (attempt <= maxRetries) {
          await new Promise((res) => setTimeout(res, 500 * attempt));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        lastError = new NearRpcError(
          `ERR_NEAR_RPC_HTTP_${response.status}: NEAR RPC responded with HTTP ${response.status}`,
          response.status >= 500 ? 503 : response.status
        );
        if (attempt <= maxRetries && response.status >= 500) {
          await new Promise((res) => setTimeout(res, 300 * attempt));
          continue;
        }
        throw lastError;
      }

      const data = await response.json();

      if (data.error) {
        const errObj = data.error;
        const errStr = typeof errObj === "string" ? errObj : JSON.stringify(errObj);

        // Inspect contract panics and missing methods
        if (errStr.includes("MethodNotFound") || errStr.includes("Method not found")) {
          throw new NearMethodNotFoundError(`ERR_NEAR_METHOD_NOT_FOUND: Method does not exist on contract`, params?.method_name);
        }

        if (errStr.includes("AccountDoesNotExist") || errStr.includes("does not exist while viewing")) {
          throw new NearAccountNotFoundError(`ERR_NEAR_ACCOUNT_NOT_FOUND: Target contract account does not exist`, params?.account_id);
        }

        if (errStr.includes("HostError(GuestPanic") || errStr.includes("CompilationError") || errStr.includes("FunctionCallError")) {
          throw new NearContractPanicError(`ERR_NEAR_CONTRACT_PANIC: Smart contract execution panicked`, errStr);
        }

        throw new NearRpcError(`ERR_NEAR_RPC_ERROR: ${errObj.message || errStr}`, 500, errObj);
      }

      return data.result;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === "AbortError") {
        lastError = new NearRpcTimeoutError(`ERR_NEAR_RPC_TIMEOUT: Request timed out after ${timeoutMs}ms`);
      } else if (err instanceof NearRpcError) {
        throw err;
      } else {
        lastError = new NearRpcError(`ERR_NEAR_RPC_NETWORK: ${err.message}`, 503, err);
      }

      if (attempt <= maxRetries) {
        await new Promise((res) => setTimeout(res, 300 * attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError;
}

/**
 * Calls a read-only view method on the deployed KNOVARA contract.
 *
 * @param {string} methodName - Exact contract method name
 * @param {object} [args={}] - Method arguments (JSON-serializable)
 * @param {object} [options]
 * @param {string} [options.contractId] - Override contract ID
 * @param {string} [options.finality="final"] - Finality level
 * @returns {Promise<any>} - Decoded JSON response or primitive
 */
export async function callViewMethod(methodName, args = {}, options = {}) {
  const contractId = options.contractId || config.NEAR_CONTRACT_ID || "koket-knovara-dev.testnet";
  const finality = options.finality || "final";

  const argsJson = JSON.stringify(args || {});
  const argsBase64 = Buffer.from(argsJson, "utf8").toString("base64");

  const queryParams = {
    request_type: "call_function",
    finality,
    account_id: contractId,
    method_name: methodName,
    args_base64: argsBase64,
  };

  const result = await executeJsonRpc("query", queryParams, options);

  if (!result || !Array.isArray(result.result)) {
    throw new NearRpcError(`ERR_NEAR_VIEW_INVALID_PAYLOAD: Missing byte array in call_function result for '${methodName}'`);
  }

  // Handle empty byte array (void / null result)
  if (result.result.length === 0) {
    return null;
  }

  const utf8String = Buffer.from(result.result).toString("utf8");

  try {
    return JSON.parse(utf8String);
  } catch (_e) {
    // If output is bare string or scalar that is valid JSON representation
    return utf8String;
  }
}

/**
 * Retrieves the status and receipt execution outcomes for a transaction.
 * Requests execution milestone wait_until: "FINAL" where supported.
 *
 * @param {string} txHash - Base58 transaction hash
 * @param {string} senderAccountId - Account ID of the transaction signer
 * @param {object} [options]
 * @param {string} [options.waitUntil] - Optional milestone (e.g. "FINAL")
 * @param {string} [options.method] - Explicit RPC method ("EXPERIMENTAL_tx_status" | "tx")
 * @returns {Promise<object>} - Execution outcome including status and receipt outcomes
 */
export async function getTransactionStatus(txHash, senderAccountId, options = {}) {
  if (!txHash || typeof txHash !== "string" || !txHash.trim()) {
    throw new NearRpcError("ERR_INVALID_TX_HASH: A non-empty transaction hash is required", 400);
  }

  if (!senderAccountId || typeof senderAccountId !== "string" || !senderAccountId.trim()) {
    throw new NearRpcError("ERR_INVALID_SENDER_ACCOUNT: Sender account ID is required for transaction query", 400);
  }

  const cleanTxHash = txHash.trim();
  const cleanSender = senderAccountId.trim();
  const rpcMethod = options.method || (options.waitUntil ? "EXPERIMENTAL_tx_status" : "tx");

  let params;
  if (rpcMethod === "EXPERIMENTAL_tx_status" || options.waitUntil) {
    params = {
      tx_hash: cleanTxHash,
      sender_account_id: cleanSender,
      wait_until: options.waitUntil || "FINAL",
    };
  } else {
    params = [cleanTxHash, cleanSender];
  }

  try {
    return await executeJsonRpc(rpcMethod, params, options);
  } catch (err) {
    // Compatibility fallback: if EXPERIMENTAL_tx_status or object params not supported by node
    if (rpcMethod === "EXPERIMENTAL_tx_status" || (typeof params === "object" && !Array.isArray(params))) {
      const errStr = String(err?.message || "");
      if (
        errStr.includes("MethodNotFound") ||
        errStr.includes("Invalid params") ||
        errStr.includes("parse error") ||
        err instanceof NearMethodNotFoundError
      ) {
        return await executeJsonRpc("tx", [cleanTxHash, cleanSender], options);
      }
    }
    throw err;
  }
}

// =========================================================================
// AUTHORITATIVE CONTRACT VIEW CLIENT METHODS
// =========================================================================

/**
 * Retrieves the contract administrator account ID.
 */
export async function getAdminId(options = {}) {
  return callViewMethod("get_admin_id", {}, options);
}

/**
 * Retrieves the measured minimum storage deposit in yoctoNEAR.
 */
export async function getStorageMinDeposit(options = {}) {
  return callViewMethod("get_storage_min_deposit", {}, options);
}

/**
 * Retrieves NEP-145 storage balance bounds ({ min, max }).
 */
export async function getStorageBalanceBounds(options = {}) {
  return callViewMethod("storage_balance_bounds", {}, options);
}

/**
 * Retrieves NEP-145 storage balance for an account ({ total, available } or null).
 */
export async function getStorageBalanceOf(accountId, options = {}) {
  return callViewMethod("storage_balance_of", { account_id: accountId }, options);
}

/**
 * Retrieves internal account dependency counts for an account.
 */
export async function getAccountDependencyCounts(accountId, options = {}) {
  return callViewMethod("get_account_dependency_counts", { account_id: accountId }, options);
}

/**
 * Retrieves NEP-177 contract metadata.
 */
export async function getNftMetadata(options = {}) {
  return callViewMethod("nft_metadata", {}, options);
}

/**
 * Retrieves standard NEP-171 token details for a token ID.
 */
export async function getNftToken(tokenId, options = {}) {
  return callViewMethod("nft_token", { token_id: tokenId }, options);
}

/**
 * Retrieves total supply of minted Discovery Rights Passport NFTs.
 */
export async function getNftTotalSupply(options = {}) {
  return callViewMethod("nft_total_supply", {}, options);
}

/**
 * Retrieves registered discovery details by token ID.
 */
export async function getDiscovery(tokenId, options = {}) {
  return callViewMethod("get_discovery", { token_id: tokenId }, options);
}

/**
 * Looks up the NFT token ID associated with a discovery identifier.
 */
export async function getTokenIdForDiscovery(discoveryId, options = {}) {
  return callViewMethod("get_token_id_for_discovery", { discovery_id: discoveryId }, options);
}

/**
 * Retrieves claimable royalty earnings for an account in yoctoNEAR.
 */
export async function getClaimableBalance(accountId, options = {}) {
  return callViewMethod("get_claimable_balance", { account_id: accountId }, options);
}

/**
 * Retrieves aggregate outstanding royalty liabilities in yoctoNEAR.
 */
export async function getTotalRoyaltyLiabilities(options = {}) {
  return callViewMethod("get_total_royalty_liabilities", {}, options);
}

/**
 * Retrieves pending in-flight royalty withdrawal amount in yoctoNEAR.
 */
export async function getPendingRoyaltyWithdrawals(options = {}) {
  return callViewMethod("get_pending_royalty_withdrawals", {}, options);
}

/**
 * Retrieves licensing offer details by offer ID.
 */
export async function getLicenseOffer(offerId, options = {}) {
  return callViewMethod("get_license_offer", { offer_id: offerId }, options);
}

/**
 * Retrieves all licensing offers associated with a discovery.
 */
export async function getLicenseOffersForDiscovery(discoveryId, options = {}) {
  return callViewMethod("get_license_offers_for_discovery", { discovery_id: discoveryId }, options);
}

/**
 * Retrieves license request details by request ID.
 */
export async function getLicenseRequest(requestId, options = {}) {
  return callViewMethod("get_license_request", { request_id: requestId }, options);
}

/**
 * Alias for `getLicenseRequest` matching contract interface.
 */
export async function getLicense(licenseId, options = {}) {
  return callViewMethod("get_license", { license_id: licenseId }, options);
}

/**
 * Retrieves all license requests associated with a discovery.
 */
export async function getLicenseRequestsForDiscovery(discoveryId, options = {}) {
  return callViewMethod("get_license_requests_for_discovery", { discovery_id: discoveryId }, options);
}

/**
 * Retrieves all license requests associated with an offer.
 */
export async function getLicenseRequestsForOffer(offerId, options = {}) {
  return callViewMethod("get_license_requests_for_offer", { offer_id: offerId }, options);
}

/**
 * Retrieves API subscription offer details by offer ID.
 */
export async function getApiSubscriptionOffer(offerId, options = {}) {
  return callViewMethod("get_api_subscription_offer", { offer_id: offerId }, options);
}

/**
 * Retrieves all API subscription offers associated with a discovery.
 */
export async function getSubscriptionOffersByDiscovery(discoveryId, options = {}) {
  return callViewMethod("get_subscription_offers_by_discovery", { discovery_id: discoveryId }, options);
}

/**
 * Retrieves active subscription details by subscription ID.
 */
export async function getSubscription(subscriptionId, options = {}) {
  return callViewMethod("get_subscription", { subscription_id: subscriptionId }, options);
}

/**
 * Retrieves all subscriptions held by a dedicated agent account.
 */
export async function getSubscriptionsByAgent(agentId, options = {}) {
  return callViewMethod("get_subscriptions_by_agent", { agent_id: agentId }, options);
}
