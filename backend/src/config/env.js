import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from process.cwd() first, then fallback to backend/.env relative to this config file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
  PORT: parseInt(process.env.PORT || "5000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  ALLOWED_CALLBACK_ORIGINS: process.env.ALLOWED_CALLBACK_ORIGINS
    ? process.env.ALLOWED_CALLBACK_ORIGINS.split(",").map((s) => s.trim().toLowerCase())
    : [
        "http://localhost:3000",
        "https://knovara.vercel.app",
        process.env.FRONTEND_ORIGIN?.trim().toLowerCase(),
      ].filter(Boolean),
  TRUST_PROXY: process.env.TRUST_PROXY || "1",
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/knovara",
  SESSION_SECRET: process.env.SESSION_SECRET || "knovara_dev_insecure_session_secret_32bytes_min",
  SESSION_MAX_AGE_MS: parseInt(process.env.SESSION_MAX_AGE_MS || String(24 * 60 * 60 * 1000), 10), // 24 hours
  NEAR_NETWORK: process.env.NEAR_NETWORK || "testnet",
  NEAR_CONTRACT_ID: process.env.NEAR_CONTRACT_ID || "koket-knovara-dev.testnet",
  NEAR_RPC_URL: process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org",
  NONCE_TTL_SECONDS: parseInt(process.env.NONCE_TTL_SECONDS || "300", 10), // 5 minutes

  // Cloudflare R2 Object Storage
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || "mock-cf-account",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || "mock-r2-access-key",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || "mock-r2-secret-key",
  R2_EVIDENCE_BUCKET: process.env.R2_EVIDENCE_BUCKET || "knovara-evidence",
  R2_REGION: process.env.R2_REGION || "auto",
  R2_ENDPOINT_URL: process.env.R2_ENDPOINT_URL || (process.env.CLOUDFLARE_ACCOUNT_ID ? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` : "https://mock.r2.cloudflarestorage.com"),
  R2_UPLOAD_URL_TTL_SECONDS: parseInt(process.env.R2_UPLOAD_URL_TTL_SECONDS || "900", 10), // 15 minutes
  MAX_EVIDENCE_FILE_BYTES: parseInt(process.env.MAX_EVIDENCE_FILE_BYTES || "104857600", 10), // 100 MB
  PUBLIC_API_BASE_URL: process.env.PUBLIC_API_BASE_URL
    ? process.env.PUBLIC_API_BASE_URL.replace(/\/$/, "")
    : `http://localhost:${process.env.PORT || "5000"}`,
};

/**
 * Validates the public metadata API base URL.
 * In production: strictly enforces HTTPS, rejects localhost, loopback, and private networks.
 * In development/test: allows localhost HTTP.
 *
 * @param {string} url
 * @param {string} [nodeEnv]
 * @returns {string} - Validated origin string
 */
export function validatePublicApiBaseUrl(url, nodeEnv = config.NODE_ENV) {
  if (!url || typeof url !== "string" || !url.trim()) {
    if (nodeEnv === "production") {
      throw new Error("ERR_CONFIG: PUBLIC_API_BASE_URL is required in production");
    }
    return "http://localhost:5000";
  }

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch (_e) {
    throw new Error(`ERR_CONFIG: PUBLIC_API_BASE_URL '${url}' is not a valid absolute URL`);
  }

  if (nodeEnv === "production") {
    if (parsed.protocol !== "https:") {
      throw new Error(`ERR_CONFIG: PUBLIC_API_BASE_URL must use HTTPS protocol in production (received '${parsed.protocol}')`);
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      throw new Error(`ERR_CONFIG: PUBLIC_API_BASE_URL '${url}' points to localhost or private network, forbidden in production`);
    }
  }

  return parsed.origin;
}

// Validate critical production configurations
if (config.NODE_ENV === "production") {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("ERR_CONFIG: SESSION_SECRET must be at least 32 characters in production");
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("ERR_CONFIG: MONGODB_URI is required in production");
  }
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("ERR_CONFIG: Cloudflare R2 credentials (CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are required in production");
  }
  validatePublicApiBaseUrl(config.PUBLIC_API_BASE_URL, "production");
}

