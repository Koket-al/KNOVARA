import express from "express";
import { validateToken } from "../services/credentialService.js";
import { SubscriptionProjection } from "../models/SubscriptionProjection.js";
import { ApiProduct } from "../models/ApiProduct.js";
import { ProviderConfig } from "../models/ProviderConfig.js";
import { validateSsrfTarget } from "../services/ssrfFilter.js";
import { decryptSecret } from "../services/encryption.js";
import * as nearContract from "../services/nearContract.js";

const router = express.Router();
const CACHE_FRESHNESS_TTL_MS = 30000; // 30-second bounded freshness window

/**
 * Validates cache freshness and synchronizes against NEAR RPC when stale.
 * Fails closed with 503 if RPC is unavailable and cached state is stale.
 */
async function verifySubscriptionFreshness(subscriptionId) {
  let projection = await SubscriptionProjection.findOne({ subscription_id: subscriptionId });
  const now = Date.now();

  const isStale =
    !projection ||
    now - new Date(projection.last_synced_at).getTime() > CACHE_FRESHNESS_TTL_MS;

  if (isStale) {
    try {
      const onChain = await nearContract.getSubscription(subscriptionId);
      if (!onChain) {
        return { authorized: false, reason: "ON_CHAIN_SUBSCRIPTION_NOT_FOUND", status: 403 };
      }

      const activatedAt = new Date(Number(BigInt(onChain.activated_at) / 1_000_000n));
      const expiresAt = new Date(Number(BigInt(onChain.expires_at) / 1_000_000n));
      const isExpired = now > expiresAt.getTime();

      projection = await SubscriptionProjection.findOneAndUpdate(
        { subscription_id: subscriptionId },
        {
          subscription_id: subscriptionId,
          offer_id: onChain.offer_id,
          discovery_id: onChain.discovery_id,
          token_id: onChain.token_id,
          subscriber_id: onChain.subscriber_id.toLowerCase(),
          api_product_id: onChain.api_product_id,
          openapi_spec_hash: onChain.openapi_spec_hash,
          accepted_terms_hash: onChain.accepted_terms_hash,
          price_yocto: String(onChain.price_yocto),
          activated_at: activatedAt,
          expires_at: expiresAt,
          status: isExpired ? "Expired" : "Active",
          last_synced_at: new Date(),
        },
        { upsert: true, new: true }
      );
    } catch (rpcErr) {
      // Fail closed policy: if cache is stale and RPC fails, deny access
      return {
        authorized: false,
        reason: `ERR_RPC_FRESHNESS_UNAVAILABLE: Authoritative chain state could not be verified: ${rpcErr.message}`,
        status: 503,
      };
    }
  }

  // Check expiration timestamp
  if (projection.status === "Expired" || now > new Date(projection.expires_at).getTime()) {
    if (projection.status !== "Expired") {
      projection.status = "Expired";
      await projection.save();
    }
    return { authorized: false, reason: "SUBSCRIPTION_EXPIRED", status: 403 };
  }

  return { authorized: true, projection };
}

/**
 * POST /api/v1/gateway/assets/:assetId/operations/:operationId
 *
 * Secure reverse proxy executing access control, SSRF validation,
 * secret injection, and upstream dispatch.
 */
router.post("/assets/:assetId/operations/:operationId", async (req, res) => {
  const { assetId, operationId } = req.params;

  // 1. Extract Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "ERR_UNAUTHORIZED: Missing or malformed Authorization header. Expected 'Bearer knov_live_...'",
    });
  }

  const rawToken = authHeader.slice(7).trim();

  // 2. Validate token against ApiCredential database
  const credValidation = await validateToken(rawToken);
  if (!credValidation || !credValidation.valid) {
    const reason = credValidation?.reason || "INVALID_TOKEN";
    return res.status(401).json({
      error: `ERR_INVALID_CREDENTIAL: Token is ${reason.toLowerCase()}`,
    });
  }

  const cred = credValidation.credential;

  // 3. Prevent cross-asset access
  if (cred.discovery_id !== assetId) {
    return res.status(403).json({
      error: `ERR_FORBIDDEN_ASSET: Credential was issued for asset '${cred.discovery_id}', not '${assetId}'`,
    });
  }

  // 4. Verify 30-second bounded subscription freshness with authoritative RPC fallback
  const freshness = await verifySubscriptionFreshness(cred.subscription_id);
  if (!freshness.authorized) {
    return res.status(freshness.status).json({
      error: `ERR_SUBSCRIPTION_UNAUTHORIZED: ${freshness.reason}`,
    });
  }

  // 5. Look up ApiProduct and allowed operations
  const product = await ApiProduct.findOne({ discovery_id: assetId });
  if (!product) {
    return res.status(404).json({
      error: `ERR_PRODUCT_NOT_FOUND: No registered API product found for asset '${assetId}'`,
    });
  }

  const endpoint = product.endpoints.find(
    (e) => e.operation_id.toLowerCase() === operationId.toLowerCase()
  );

  if (!endpoint) {
    return res.status(404).json({
      error: `ERR_OPERATION_NOT_ALLOWED: Operation '${operationId}' is not defined in the published API specification`,
    });
  }

  // 6. Look up ProviderConfig
  const provider = await ProviderConfig.findOne({ api_product_id: product.api_product_id });
  if (!provider) {
    return res.status(502).json({
      error: `ERR_PROVIDER_NOT_CONFIGURED: Upstream provider configuration not found for product '${product.api_product_id}'`,
    });
  }

  if (provider.status !== "active") {
    return res.status(503).json({
      error: `ERR_PROVIDER_SUSPENDED: Provider service is currently ${provider.status}`,
    });
  }

  // 7. SSRF Validation
  const allowLocalDev =
    process.env.NODE_ENV === "test" ||
    process.env.ALLOW_LOCAL_GATEWAY_UPSTREAM === "true";

  const ssrfCheck = await validateSsrfTarget(provider.base_url, allowLocalDev);
  if (!ssrfCheck.allowed) {
    return res.status(403).json({
      error: `ERR_SSRF_FIREWALL_BLOCKED: Upstream destination failed SSRF security check: ${ssrfCheck.reason}`,
    });
  }

  // 8. Decrypt upstream credentials
  let upstreamSecret;
  try {
    upstreamSecret = decryptSecret(
      provider.encrypted_secret,
      provider.iv,
      provider.auth_tag
    );
  } catch (decErr) {
    return res.status(500).json({
      error: `ERR_CREDENTIAL_DECRYPTION_FAILED: Failed to decrypt provider credentials: ${decErr.message}`,
    });
  }

  // 9. Dispatch to upstream provider
  const upstreamUrl = new URL(endpoint.path, provider.base_url).toString();
  const controller = new AbortController();
  const timeoutMs = provider.timeout_ms || 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const forwardHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
    [provider.header_name || "x-provider-api-key"]: upstreamSecret,
  };

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: endpoint.method || "POST",
      headers: forwardHeaders,
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const resContentType = upstreamRes.headers.get("content-type") || "";
    if (resContentType.includes("application/json")) {
      const data = await upstreamRes.json();
      return res.status(upstreamRes.status).json(data);
    } else {
      const text = await upstreamRes.text();
      return res.status(upstreamRes.status).send(text);
    }
  } catch (upstreamErr) {
    clearTimeout(timeoutId);
    if (upstreamErr.name === "AbortError") {
      return res.status(504).json({
        error: `ERR_GATEWAY_TIMEOUT: Upstream provider timed out after ${timeoutMs}ms`,
      });
    }
    return res.status(502).json({
      error: `ERR_BAD_GATEWAY: Failed to communicate with upstream provider: ${upstreamErr.message}`,
    });
  }
});

export default router;

