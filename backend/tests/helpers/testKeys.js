import crypto from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { serializeNep413Payload } from "../../src/services/authVerifier.js";

/**
 * Derives a deterministic Ed25519 keypair from a seed identifier string.
 * Ensures tests are 100% reproducible and never touch real wallet private keys.
 *
 * @param {string} seedName - Unique string identifier (e.g. "alice", "bob")
 * @returns {{ name: string, publicKeyStr: string, publicKeyBytes: Uint8Array, secretKeyBytes: Uint8Array }}
 */
export function getTestKeyPair(seedName = "alice") {
  const seed = crypto.createHash("sha256").update(seedName).digest();
  const keypair = nacl.sign.keyPair.fromSeed(seed);
  const publicKeyStr = `ed25519:${bs58.encode(keypair.publicKey)}`;

  return {
    name: seedName,
    publicKeyStr,
    publicKeyBytes: keypair.publicKey,
    secretKeyBytes: keypair.secretKey,
  };
}

/**
 * Signs a NEP-413 payload using a deterministic test keypair.
 *
 * @param {object} keyPair - Keypair from getTestKeyPair
 * @param {object} params
 * @param {string} params.message
 * @param {Buffer|Uint8Array} params.nonce - Exactly 32 bytes
 * @param {string} params.recipient
 * @param {string|null} [params.callbackUrl]
 * @returns {{ serialized: Uint8Array, digest: Buffer, signatureBase64: string, signatureBytes: Uint8Array, publicKeyStr: string }}
 */
export function signNep413Payload(keyPair, { message, nonce, recipient, callbackUrl }) {
  const serialized = serializeNep413Payload({ message, nonce, recipient, callbackUrl });
  const digest = crypto.createHash("sha256").update(serialized).digest();
  const signature = nacl.sign.detached(digest, keyPair.secretKeyBytes);

  return {
    serialized,
    digest,
    signatureBase64: Buffer.from(signature).toString("base64"),
    signatureBytes: signature,
    publicKeyStr: keyPair.publicKeyStr,
  };
}

