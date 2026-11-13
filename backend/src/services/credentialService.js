import crypto from "crypto";
import { ApiCredential } from "../models/ApiCredential.js";

/**
 * Computes SHA-256 digest of a token string.
 * @param {string} token 
 * @returns {string} 64-char lowercase hex
 */
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a new high-entropy API credential for an active subscription.
 * Format: knov_live_<64-hex>
 */
export async function issueCredential({
  agent_id,
  owner_account_id,
  agent_account_id,
  discovery_id,
  api_product_id,
  subscription_id,
  expires_at,
  scopes = ["read", "execute"],
}) {
  const secretEntropy = crypto.randomBytes(32).toString("hex");
  const rawToken = `knov_live_${secretEntropy}`;
  const tokenHash = hashToken(rawToken);
  const tokenPrefix = `knov_live_${secretEntropy.slice(0, 8)}...`;
  const credentialId = `cred-${crypto.randomUUID()}`;

  const credential = await ApiCredential.create({
    credential_id: credentialId,
    token_hash: tokenHash,
    token_prefix: tokenPrefix,
    agent_id,
    owner_account_id,
    agent_account_id,
    discovery_id,
    api_product_id,
    subscription_id,
    scopes,
    expires_at,
    status: "active",
  });

  return {
    credential_id: credentialId,
    raw_token: rawToken, // Returned ONLY once upon creation
    token_prefix: tokenPrefix,
    agent_id,
    subscription_id,
    expires_at,
    status: "active",
  };
}

/**
 * Revokes an existing credential immediately.
 */
export async function revokeCredential(credential_id, owner_account_id) {
  const query = { credential_id };
  if (owner_account_id) {
    query.owner_account_id = owner_account_id.toLowerCase();
  }

  const cred = await ApiCredential.findOne(query);
  if (!cred) {
    throw new Error("ERR_CREDENTIAL_NOT_FOUND");
  }

  cred.status = "revoked";
  cred.revoked_at = new Date();
  await cred.save();

  return cred;
}

/**
 * Rotates an existing credential: immediately revokes the old one and issues a new one.
 */
export async function rotateCredential(credential_id, owner_account_id) {
  const oldCred = await revokeCredential(credential_id, owner_account_id);

  return issueCredential({
    agent_id: oldCred.agent_id,
    owner_account_id: oldCred.owner_account_id,
    agent_account_id: oldCred.agent_account_id,
    discovery_id: oldCred.discovery_id,
    api_product_id: oldCred.api_product_id,
    subscription_id: oldCred.subscription_id,
    expires_at: oldCred.expires_at,
    scopes: oldCred.scopes,
  });
}

/**
 * Finds and validates a credential by raw bearer token.
 */
export async function validateToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string" || !rawToken.startsWith("knov_live_")) {
    return null;
  }

  const tokenHash = hashToken(rawToken);
  const cred = await ApiCredential.findOne({ token_hash: tokenHash });
  if (!cred) {
    return null;
  }

  // Check revocation
  if (cred.status === "revoked" || cred.revoked_at) {
    return { valid: false, reason: "REVOKED", credential: cred };
  }

  // Check expiration
  if (new Date() > new Date(cred.expires_at)) {
    if (cred.status !== "expired") {
      cred.status = "expired";
      await cred.save();
    }
    return { valid: false, reason: "EXPIRED", credential: cred };
  }

  return { valid: true, credential: cred };
}

