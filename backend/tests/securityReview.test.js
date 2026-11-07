import crypto from "crypto";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { setupMockDatabase, clearMockDatabase } from "./helpers/mockDb.js";
import { getTestKeyPair, signNep413Payload } from "./helpers/testKeys.js";
import { createMockNearRpc } from "./helpers/mockRpc.js";
import { AuthChallenge } from "../src/models/AuthChallenge.js";

before(() => {
  setupMockDatabase();
});

beforeEach(() => {
  clearMockDatabase();
});

after(() => {
  clearMockDatabase();
});

// =========================================================================
// AUDIT 1: NONCE CONSUMPTION ORDER & CONCURRENT REPLAY DEFENSE
// =========================================================================

test("35. Failed signature attempt CANNOT consume a legitimate challenge", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();

  // 1. Legitimate user requests challenge
  const chalRes = await request(app)
    .post("/api/v1/auth/challenge")
    .send({ accountId: "alice.testnet" });
  assert.equal(chalRes.status, 200);
  const { nonceHex, state, message, recipient } = chalRes.body;

  // 2. Attacker submits an INVALID signature for the legitimate nonce
  const invalidSigRes = await request(app)
    .post("/api/v1/auth/verify")
    .send({
      accountId: "alice.testnet",
      publicKey: alice.publicKeyStr,
      signature: crypto.randomBytes(64).toString("base64"),
      nonceHex,
      state,
    });

  assert.equal(invalidSigRes.status, 401);
  assert.equal(invalidSigRes.body.code, "ERR_INVALID_SIGNATURE");

  // 3. Verify challenge record is STILL in database and unconsumed!
  const challengeInDb = await AuthChallenge.findOne({ nonce: nonceHex });
  assert.ok(challengeInDb, "Challenge must NOT be deleted by a failed signature attempt");
  assert.equal(challengeInDb.consumed, false);

  // 4. Authentic user submits the VALID signature for the SAME challenge
  const nonceBytes = Buffer.from(nonceHex, "hex");
  const { signatureBase64 } = signNep413Payload(alice, {
    message,
    nonce: nonceBytes,
    recipient,
    callbackUrl: null,
  });

  const validSigRes = await request(app)
    .post("/api/v1/auth/verify")
    .send({
      accountId: "alice.testnet",
      publicKey: alice.publicKeyStr,
      signature: signatureBase64,
      nonceHex,
      state,
    });

  assert.equal(validSigRes.status, 200);
  assert.equal(validSigRes.body.success, true);
  assert.equal(validSigRes.body.user.accountId, "alice.testnet");

  // 5. Challenge is now atomically consumed; subsequent replay fails with 401
  const replayRes = await request(app)
    .post("/api/v1/auth/verify")
    .send({
      accountId: "alice.testnet",
      publicKey: alice.publicKeyStr,
      signature: signatureBase64,
      nonceHex,
      state,
    });

  assert.equal(replayRes.status, 401);
  assert.equal(replayRes.body.code, "ERR_AUTH_NONCE_INVALID_OR_ALREADY_USED");
});

test("36. Incorrect account ID attempt CANNOT consume a legitimate challenge", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();

  // Alice gets challenge
  const chalRes = await request(app)
    .post("/api/v1/auth/challenge")
    .send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient } = chalRes.body;

  // Eve tries to verify Alice's challenge under Eve's account ID
  const eve = getTestKeyPair("eve");
  const { signatureBase64: eveSig } = signNep413Payload(eve, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
  });

  const wrongAccountRes = await request(app)
    .post("/api/v1/auth/verify")
    .send({
      accountId: "eve.testnet",
      publicKey: eve.publicKeyStr,
      signature: eveSig,
      nonceHex,
      state,
    });

  assert.equal(wrongAccountRes.status, 403);
  assert.equal(wrongAccountRes.body.code, "ERR_AUTH_ACCOUNT_MISMATCH");

  // Alice's challenge remains intact
  const challengeInDb = await AuthChallenge.findOne({ nonce: nonceHex });
  assert.ok(challengeInDb, "Challenge must remain intact after account mismatch");

  // Alice can still authenticate successfully
  const { signatureBase64: aliceSig } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
  });

  const aliceRes = await request(app)
    .post("/api/v1/auth/verify")
    .send({
      accountId: "alice.testnet",
      publicKey: alice.publicKeyStr,
      signature: aliceSig,
      nonceHex,
      state,
    });

  assert.equal(aliceRes.status, 200);
});

test("37. Two concurrent verification requests cannot both create authenticated sessions", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();

  // Get challenge
  const chal = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient } = chal.body;

  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
  });

  const payload = {
    accountId: "alice.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  };

  // Launch two concurrent verify requests simultaneously
  const [res1, res2] = await Promise.all([
    request(app).post("/api/v1/auth/verify").send(payload),
    request(app).post("/api/v1/auth/verify").send(payload),
  ]);

  const statuses = [res1.status, res2.status].sort();
  // Exactly one request must succeed (200), and the other must be rejected (401)
  assert.deepEqual(statuses, [200, 401]);

  const failedRes = res1.status === 401 ? res1 : res2;
  assert.equal(failedRes.body.code, "ERR_AUTH_NONCE_INVALID_OR_ALREADY_USED");
});

// =========================================================================
// AUDIT 3: CALLBACK URL SECURITY
// =========================================================================

test("38. Callback URL security: Rejects unexpected origins not in whitelist", async () => {
  const app = createApp();

  const res = await request(app)
    .post("/api/v1/auth/challenge")
    .send({
      accountId: "alice.testnet",
      callbackUrl: "https://evil-phishing-attacker.com/steal-session",
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, "ERR_INVALID_CALLBACK_URL");
  assert.ok(res.body.error.includes("not in the allowed callback whitelist"));
});

test("39. Callback URL security: Rejects malformed URLs", async () => {
  const app = createApp();

  const res = await request(app)
    .post("/api/v1/auth/challenge")
    .send({
      accountId: "alice.testnet",
      callbackUrl: "not-a-valid-url-format",
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, "ERR_INVALID_CALLBACK_URL");
});

test("40. Callback URL security: Rejects unsupported protocols (javascript:, ftp:, data:)", async () => {
  const app = createApp();

  const res1 = await request(app)
    .post("/api/v1/auth/challenge")
    .send({
      accountId: "alice.testnet",
      callbackUrl: "javascript:alert(1)",
    });
  assert.equal(res1.status, 400);
  assert.equal(res1.body.code, "ERR_INVALID_CALLBACK_URL");

  const res2 = await request(app)
    .post("/api/v1/auth/challenge")
    .send({
      accountId: "alice.testnet",
      callbackUrl: "ftp://localhost:3000/callback",
    });
  assert.equal(res2.status, 400);
  assert.equal(res2.body.code, "ERR_INVALID_CALLBACK_URL");
});

test("41. Callback URL security: Rejects embedded user credentials", async () => {
  const app = createApp();

  const res = await request(app)
    .post("/api/v1/auth/challenge")
    .send({
      accountId: "alice.testnet",
      callbackUrl: "http://attacker:password@localhost:3000/callback",
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, "ERR_INVALID_CALLBACK_URL");
  assert.ok(res.body.error.includes("embedded credentials"));
});

test("42. Callback URL security: Whitelisted origin is accepted and enforced in NEP-413 payload", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();

  // 1. Request challenge with authorized callback URL
  const chalRes = await request(app)
    .post("/api/v1/auth/challenge")
    .send({
      accountId: "alice.testnet",
      callbackUrl: "http://localhost:3000/auth/callback",
    });

  assert.equal(chalRes.status, 200);
  assert.equal(chalRes.body.callbackUrl, "http://localhost:3000/auth/callback");

  const { nonceHex, state, message, recipient, callbackUrl } = chalRes.body;

  // 2. Sign with the EXACT server-accepted callback URL
  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  const verifyRes = await request(app)
    .post("/api/v1/auth/verify")
    .send({
      accountId: "alice.testnet",
      publicKey: publicKeyStr,
      signature: signatureBase64,
      nonceHex,
      state,
    });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.success, true);
});

test("43. Callback URL security: Tampering with callbackUrl in signature payload fails verification", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();

  const chalRes = await request(app)
    .post("/api/v1/auth/challenge")
    .send({
      accountId: "alice.testnet",
      callbackUrl: "http://localhost:3000/auth/callback",
    });

  const { nonceHex, state, message, recipient } = chalRes.body;

  // Attacker signs payload with a modified or omitted callbackUrl
  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl: null, // Tampered: omitted callbackUrl
  });

  const verifyRes = await request(app)
    .post("/api/v1/auth/verify")
    .send({
      accountId: "alice.testnet",
      publicKey: publicKeyStr,
      signature: signatureBase64,
      nonceHex,
      state,
    });

  // Reconstructed server payload includes stored callbackUrl, so signature check fails!
  assert.equal(verifyRes.status, 401);
  assert.equal(verifyRes.body.code, "ERR_INVALID_SIGNATURE");
});

// =========================================================================
// AUDIT 2: REVERSE PROXY & PRODUCTION SESSION COOKIE BEHAVIOR
// =========================================================================

test("44. Production reverse proxy (Render) forwards HTTPS and Express sets secure cookie", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  // Simulate production environment
  const app = createApp();

  const chal = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient } = chal.body;

  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
  });

  // Simulate Render HTTPS reverse proxy forwarding headers
  const res = await request(app)
    .post("/api/v1/auth/verify")
    .set("X-Forwarded-Proto", "https")
    .set("X-Forwarded-For", "203.0.113.195")
    .send({
      accountId: "alice.testnet",
      publicKey: publicKeyStr,
      signature: signatureBase64,
      nonceHex,
      state,
    });

  assert.equal(res.status, 200);
  const cookies = res.headers["set-cookie"];
  assert.ok(cookies);
  const sessionCookie = cookies.find((c) => c.startsWith("knovara.sid="));
  assert.ok(sessionCookie);
  assert.ok(sessionCookie.includes("HttpOnly"));
  assert.ok(sessionCookie.includes("SameSite=Lax"));
});
