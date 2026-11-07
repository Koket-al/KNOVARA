import crypto from "crypto";
import { serialize } from "borsh";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { config } from "../config/env.js";
import { AuthChallenge } from "../models/AuthChallenge.js";
import { verifyFullAccessKey } from "./nearRpc.js";

/**
 * NEP-413 Tag constant: 2^31 + 413 = 2147484061 (u32 little-endian)
 */
export const NEP413_TAG = 2147484061;

/**
 * Official Borsh schema for NEP-413 Payload struct.
 * Note: `state` is NOT part of the Borsh schema per NEP-413 standard.
 */
export const nep413BorshSchema = {
  struct: {
    tag: "u32",
    message: "string",
    nonce: { array: { type: "u8", len: 32 } },
    recipient: "string",
    callbackUrl: { option: "string" },
  },
};

/**
 * Serializes a NEP-413 Payload using canonical Borsh binary encoding.
 *
 * @param {object} params
 * @param {string} params.message
 * @param {Buffer|Uint8Array} params.nonce - Exactly 32 bytes
 * @param {string} params.recipient
 * @param {string|null} [params.callbackUrl]
 * @returns {Uint8Array} - Canonical Borsh binary serialization
 */
export function serializeNep413Payload({ message, nonce, recipient, callbackUrl }) {
  if (!nonce || nonce.length !== 32) {
    throw new Error("ERR_INVALID_NONCE_LENGTH: NEP-413 nonce must be exactly 32 bytes");
  }

  const payload = {
    tag: NEP413_TAG,
    message: String(message),
    nonce: Array.from(nonce),
    recipient: String(recipient),
    callbackUrl: callbackUrl ? String(callbackUrl) : null,
  };

  return serialize(nep413BorshSchema, payload);
}

/**
 * Computes the 32-byte SHA-256 digest of the Borsh-serialized NEP-413 payload.
 *
 * @param {object} params
 * @returns {Buffer} - 32-byte SHA-256 hash
 */
export function computeNep413Digest(params) {
  const serialized = serializeNep413Payload(params);
  return crypto.createHash("sha256").update(serialized).digest();
}

/**
 * Verifies an Ed25519 detached signature against a 32-byte message digest.
 *
 * @param {Buffer|Uint8Array} messageDigest - 32-byte SHA-256 hash
 * @param {string} signatureBase64 - Base64-encoded 64-byte Ed25519 signature
 * @param {string} publicKeyStr - Standard NEAR public key string (e.g. "ed25519:Base58Key...")
 * @returns {boolean}
 */
export function verifyEd25519Signature(messageDigest, signatureBase64, publicKeyStr) {
  if (!publicKeyStr || typeof publicKeyStr !== "string" || !publicKeyStr.startsWith("ed25519:")) {
    throw new Error("ERR_UNSUPPORTED_KEY_TYPE: Public key must use ed25519 scheme");
  }

  const base58Part = publicKeyStr.replace("ed25519:", "");
  let pubKeyBytes;
  try {
    pubKeyBytes = bs58.decode(base58Part);
  } catch (decodeErr) {
    throw new Error("ERR_INVALID_PUBLIC_KEY_ENCODING: Failed to decode base58 public key");
  }

  if (pubKeyBytes.length !== 32) {
    throw new Error("ERR_INVALID_PUBLIC_KEY_LENGTH: Ed25519 public key must decode to exactly 32 bytes");
  }

  let sigBytes;
  try {
    sigBytes = Buffer.from(signatureBase64, "base64");
  } catch (sigErr) {
    throw new Error("ERR_INVALID_SIGNATURE_ENCODING: Failed to decode base64 signature");
  }

  if (sigBytes.length !== 64) {
    throw new Error("ERR_INVALID_SIGNATURE_LENGTH: Ed25519 signature must decode to exactly 64 bytes");
  }

  return nacl.sign.detached.verify(messageDigest, sigBytes, pubKeyBytes);
}

/**
 * Validates and normalizes client-provided callback URLs.
 * Rejects unexpected origins, malformed URLs, embedded credentials, and unsupported protocols.
 *
 * @param {string|null} callbackUrl
 * @returns {string|null} - Normalized URL string or null if not provided
 */
export function validateCallbackUrl(callbackUrl) {
  if (callbackUrl === null || callbackUrl === undefined || callbackUrl === "") {
    return null;
  }

  if (typeof callbackUrl !== "string") {
    throw new Error("ERR_INVALID_CALLBACK_URL: Callback URL must be a string");
  }

  let parsed;
  try {
    parsed = new URL(callbackUrl);
  } catch (_err) {
    throw new Error("ERR_INVALID_CALLBACK_URL: Malformed callback URL syntax");
  }

  // Reject unsupported protocols (strictly http for localhost or https)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ERR_INVALID_CALLBACK_URL: Unsupported protocol in callback URL");
  }

  // Reject credentials in URL (e.g. https://user:pass@host)
  if (parsed.username || parsed.password) {
    throw new Error("ERR_INVALID_CALLBACK_URL: Callback URL cannot contain embedded credentials");
  }

  // HTTP is only permitted on localhost / 127.0.0.1
  if (parsed.protocol === "http:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("ERR_INVALID_CALLBACK_URL: Plain HTTP is only permitted for localhost development");
  }

  // Origin check against whitelist
  const allowedOrigins = new Set(
    (config.ALLOWED_CALLBACK_ORIGINS || []).map((o) => o.toLowerCase().replace(/\/$/, ""))
  );
  if (config.FRONTEND_ORIGIN) {
    allowedOrigins.add(config.FRONTEND_ORIGIN.toLowerCase().replace(/\/$/, ""));
  }

  const candidateOrigin = parsed.origin.toLowerCase().replace(/\/$/, "");
  if (!allowedOrigins.has(candidateOrigin)) {
    throw new Error(`ERR_INVALID_CALLBACK_URL: Origin '${candidateOrigin}' is not in the allowed callback whitelist`);
  }

  return parsed.toString();
}

/**
 * Generates and stores a new cryptographically secure authentication challenge.
 *
 * @param {string} accountId - NEAR account ID requesting authentication
 * @param {object} [options]
 * @param {string} [options.recipient] - Override recipient (defaults to contract ID)
 * @param {string} [options.message] - Custom sign message
 * @param {string} [options.callbackUrl] - Optional callback URL
 * @returns {Promise<{ nonceHex: string, state: string, recipient: string, callbackUrl: string|null, message: string, expiresAt: string }>}
 */
export async function generateChallenge(accountId, options = {}) {
  if (!accountId || typeof accountId !== "string" || !accountId.trim()) {
    throw new Error("ERR_INVALID_ACCOUNT_ID: A valid NEAR account ID is required");
  }

  const cleanAccountId = accountId.trim().toLowerCase();
  const nonceBytes = crypto.randomBytes(32);
  const nonceHex = nonceBytes.toString("hex");
  const state = crypto.randomBytes(16).toString("hex");
  const message = options.message || "Authenticate with KNOVARA";
  const recipient = options.recipient || config.NEAR_CONTRACT_ID;
  const callbackUrl = validateCallbackUrl(options.callbackUrl);
  const expiresAt = new Date(Date.now() + config.NONCE_TTL_SECONDS * 1000);

  const challenge = new AuthChallenge({
    nonce: nonceHex,
    account_id: cleanAccountId,
    state,
    message,
    recipient,
    callback_url: callbackUrl,
    expires_at: expiresAt,
    consumed: false,
  });

  await challenge.save();

  return {
    nonceHex,
    state,
    recipient,
    callbackUrl,
    message,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Verifies a NEP-413 signature against the server-authoritative stored challenge,
 * validates on-chain key permissions via NEAR RPC, and atomically burns the challenge
 * ONLY after all cryptographic and blockchain verifications succeed.
 *
 * @param {object} params
 * @param {string} params.accountId
 * @param {string} params.publicKey - e.g. "ed25519:..."
 * @param {string} params.signature - Base64 encoded signature
 * @param {string} params.nonceHex - 64 hex characters
 * @param {string} params.state - CSRF state token
 * @param {object} [options] - Optional overrides for RPC mocking
 * @returns {Promise<{ success: boolean, accountId: string }>}
 */
export async function verifyAndConsumeChallenge(
  { accountId, publicKey, signature, nonceHex, state },
  options = {}
) {
  if (!accountId || !publicKey || !signature || !nonceHex || !state) {
    throw new Error("ERR_MISSING_REQUIRED_AUTH_FIELDS: accountId, publicKey, signature, nonceHex, and state are required");
  }

  const cleanAccountId = accountId.trim().toLowerCase();
  const cleanNonce = nonceHex.trim().toLowerCase();

  // Step 1: Retrieve stored challenge without consuming it yet
  const challenge = await AuthChallenge.findOne({ nonce: cleanNonce });
  if (!challenge) {
    throw new Error("ERR_AUTH_NONCE_INVALID_OR_ALREADY_USED");
  }

  // Step 2: Explicit application-level expiration check (independent of MongoDB background TTL cleanup)
  const now = new Date();
  if (now.getTime() > challenge.expires_at.getTime()) {
    throw new Error("ERR_AUTH_CHALLENGE_EXPIRED");
  }

  // Step 3: CSRF State validation against stored challenge
  if (challenge.state !== state) {
    throw new Error("ERR_AUTH_CSRF_STATE_MISMATCH");
  }

  // Step 4: Account ID matching against stored challenge
  if (challenge.account_id !== cleanAccountId) {
    throw new Error("ERR_AUTH_ACCOUNT_MISMATCH");
  }

  // Step 5: Construct Borsh payload using SERVER-STORED parameters (prevents client parameter tampering)
  const nonceBytes = Buffer.from(challenge.nonce, "hex");
  const messageDigest = computeNep413Digest({
    message: challenge.message,
    nonce: nonceBytes,
    recipient: challenge.recipient,
    callbackUrl: challenge.callback_url,
  });

  // Step 6: Verify Ed25519 cryptographic signature
  const isValidSignature = verifyEd25519Signature(messageDigest, signature, publicKey);
  if (!isValidSignature) {
    // SECURITY INVARIANT: Do NOT consume the challenge on invalid signature.
    // Legitimate user challenges cannot be DoS-consumed by forged/failed signature attempts.
    throw new Error("ERR_INVALID_SIGNATURE");
  }

  // Step 7: Verify Key Ownership and FullAccess status via NEAR RPC
  await verifyFullAccessKey(cleanAccountId, publicKey, options);

  // Step 8: ONLY AFTER signature and RPC verification succeed, ATOMICALLY CONSUME the challenge!
  // Conditional query matches nonce, account_id, state, and non-expired timestamp.
  const consumedChallenge = await AuthChallenge.findOneAndDelete({
    nonce: cleanNonce,
    account_id: cleanAccountId,
    state: state,
    expires_at: { $gt: now },
  });

  if (!consumedChallenge) {
    // If a concurrent replay attempt already consumed it, or it expired in this exact millisecond
    throw new Error("ERR_AUTH_NONCE_INVALID_OR_ALREADY_USED");
  }

  return {
    success: true,
    accountId: cleanAccountId,
  };
}

