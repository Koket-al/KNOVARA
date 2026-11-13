import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const STORE_DIR = path.join(os.homedir(), ".knovara");
const STORE_FILE = path.join(STORE_DIR, "credentials.json");

// In-memory credential cache
const inMemoryStore = new Map();

/**
 * Initializes secure credential storage directory with restricted permissions (0700).
 */
function ensureSecureStoreDir() {
  try {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { mode: 0o700, recursive: true });
    }
  } catch (_e) {}
}

/**
 * Saves a credential locally with restricted 0600 file permissions.
 * Never exposes the raw token to the LLM context.
 */
export function saveLocalCredential(assetId, token) {
  inMemoryStore.set(assetId, token);

  try {
    ensureSecureStoreDir();
    let data = {};
    if (fs.existsSync(STORE_FILE)) {
      data = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    }
    data[assetId] = token;
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), {
      mode: 0o600,
      encoding: "utf8",
    });
  } catch (_err) {
    // If filesystem is restricted in sandbox, in-memory store remains authoritative
  }
}

/**
 * Retrieves the local bearer credential for an asset.
 */
export function getLocalCredential(assetId) {
  if (inMemoryStore.has(assetId)) {
    return inMemoryStore.get(assetId);
  }

  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
      if (data[assetId]) {
        inMemoryStore.set(assetId, data[assetId]);
        return data[assetId];
      }
    }
  } catch (_err) {}

  // Fallback to environment variable if configured
  const envVar = `KNOVARA_TOKEN_${assetId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  return process.env.KNOVARA_GATEWAY_TOKEN || null;
}

