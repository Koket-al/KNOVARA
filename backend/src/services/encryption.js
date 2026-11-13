import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Derives a consistent 32-byte key from GATEWAY_SECRET_KEY or fallback.
 */
function getMasterKey() {
  const secret = process.env.GATEWAY_SECRET_KEY || "knovara-default-gateway-secret-key-32b!";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts plaintext using AES-256-GCM with a fresh random IV.
 * @param {string} plaintext 
 * @returns {{ encrypted_secret: string, iv: string, auth_tag: string }}
 */
export function encryptSecret(plaintext) {
  if (!plaintext || typeof plaintext !== "string") {
    throw new Error("ERR_INVALID_PLAINTEXT: Plaintext must be a non-empty string");
  }

  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    encrypted_secret: encrypted,
    iv: iv.toString("hex"),
    auth_tag: authTag,
  };
}

/**
 * Decrypts AES-256-GCM ciphertext using the master key, IV, and auth tag.
 * @param {string} encryptedHex 
 * @param {string} ivHex 
 * @param {string} authTagHex 
 * @returns {string} Decrypted plaintext
 */
export function decryptSecret(encryptedHex, ivHex, authTagHex) {
  if (!encryptedHex || !ivHex || !authTagHex) {
    throw new Error("ERR_MISSING_CIPHERTEXT_COMPONENTS");
  }

  const key = getMasterKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

