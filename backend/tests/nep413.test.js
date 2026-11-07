import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  NEP413_TAG,
  serializeNep413Payload,
  computeNep413Digest,
  verifyEd25519Signature,
} from "../src/services/authVerifier.js";
import { getTestKeyPair, signNep413Payload } from "./helpers/testKeys.js";

test("10. NEP-413 Tag constant strictly equals 2^31 + 413 (2147484061)", () => {
  assert.equal(NEP413_TAG, 2147484061);
  assert.equal(NEP413_TAG, Math.pow(2, 31) + 413);

  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(NEP413_TAG, 0);
  assert.equal(buf.toString("hex"), "9d010080");
});

test("11. Borsh serialization canonical byte structure without callbackUrl", () => {
  const nonce = crypto.randomBytes(32);
  const message = "Sign in to KNOVARA";
  const recipient = "koket-knovara-dev.testnet";

  const serialized = serializeNep413Payload({
    message,
    nonce,
    recipient,
    callbackUrl: null,
  });

  // Verify byte lengths:
  // 4 (tag) + 4 (msg len) + 18 (msg) + 32 (nonce) + 4 (rec len) + 25 (rec) + 1 (null option)
  const expectedLength = 4 + 4 + message.length + 32 + 4 + recipient.length + 1;
  assert.equal(serialized.length, expectedLength);

  // Check Tag is first 4 bytes
  assert.equal(Buffer.from(serialized.slice(0, 4)).readUInt32LE(0), 2147484061);

  // Check Option callbackUrl byte at the end is 0x00
  assert.equal(serialized[serialized.length - 1], 0);
});

test("12. Borsh serialization canonical byte structure with callbackUrl", () => {
  const nonce = crypto.randomBytes(32);
  const message = "Sign in to KNOVARA";
  const recipient = "koket-knovara-dev.testnet";
  const callbackUrl = "https://knovara.vercel.app/auth/callback";

  const serialized = serializeNep413Payload({
    message,
    nonce,
    recipient,
    callbackUrl,
  });

  // 4 (tag) + 4 (msg len) + msg + 32 (nonce) + 4 (rec len) + rec + 1 (option 1) + 4 (cb len) + cb
  const expectedLength = 4 + 4 + message.length + 32 + 4 + recipient.length + 1 + 4 + callbackUrl.length;
  assert.equal(serialized.length, expectedLength);

  // Check Option callbackUrl flag is 0x01
  const optionFlagIndex = 4 + 4 + message.length + 32 + 4 + recipient.length;
  assert.equal(serialized[optionFlagIndex], 1);
});

test("13. Rejects nonces that are not exactly 32 bytes", () => {
  assert.throws(
    () =>
      serializeNep413Payload({
        message: "Test",
        nonce: Buffer.alloc(31), // Too short!
        recipient: "test.testnet",
      }),
    /ERR_INVALID_NONCE_LENGTH/
  );

  assert.throws(
    () =>
      serializeNep413Payload({
        message: "Test",
        nonce: Buffer.alloc(33), // Too long!
        recipient: "test.testnet",
      }),
    /ERR_INVALID_NONCE_LENGTH/
  );
});

test("14. Valid Ed25519 signature verifies successfully", () => {
  const alice = getTestKeyPair("alice");
  const nonce = crypto.randomBytes(32);
  const params = {
    message: "Authenticate with KNOVARA",
    nonce,
    recipient: "koket-knovara-dev.testnet",
    callbackUrl: null,
  };

  const { digest, signatureBase64, publicKeyStr } = signNep413Payload(alice, params);

  const isValid = verifyEd25519Signature(digest, signatureBase64, publicKeyStr);
  assert.equal(isValid, true);
});

test("15. Tampered message digest causes signature verification to fail", () => {
  const alice = getTestKeyPair("alice");
  const nonce = crypto.randomBytes(32);
  const params = {
    message: "Authenticate with KNOVARA",
    nonce,
    recipient: "koket-knovara-dev.testnet",
    callbackUrl: null,
  };

  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, params);

  // Alter digest by 1 bit
  const tamperedDigest = computeNep413Digest({
    ...params,
    message: "Authenticate with MALICIOUS_APP",
  });

  const isValid = verifyEd25519Signature(tamperedDigest, signatureBase64, publicKeyStr);
  assert.equal(isValid, false);
});

test("16. Wrong public key causes signature verification to fail", () => {
  const alice = getTestKeyPair("alice");
  const bob = getTestKeyPair("bob");
  const nonce = crypto.randomBytes(32);
  const params = {
    message: "Authenticate with KNOVARA",
    nonce,
    recipient: "koket-knovara-dev.testnet",
    callbackUrl: null,
  };

  const { digest, signatureBase64 } = signNep413Payload(alice, params);

  // Bob's public key presented for Alice's signature
  const isValid = verifyEd25519Signature(digest, signatureBase64, bob.publicKeyStr);
  assert.equal(isValid, false);
});

test("17. Unsupported key schemes and invalid encodings are rejected with clean errors", () => {
  const digest = crypto.randomBytes(32);
  const sig = Buffer.alloc(64).toString("base64");

  assert.throws(
    () => verifyEd25519Signature(digest, sig, "secp256k1:invalid_key"),
    /ERR_UNSUPPORTED_KEY_TYPE/
  );

  assert.throws(
    () => verifyEd25519Signature(digest, sig, "ed25519:not_valid_base58_###!"),
    /ERR_INVALID_PUBLIC_KEY_ENCODING/
  );
});

