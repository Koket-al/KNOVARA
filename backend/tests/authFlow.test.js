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

test("18. POST /api/v1/auth/challenge issues 32-byte nonce, separate CSRF state, and 5-min expiration", async () => {
  const app = createApp();
  const res = await request(app)
    .post("/api/v1/auth/challenge")
    .send({ accountId: "alice.testnet" });

  assert.equal(res.status, 200);
  assert.ok(res.body.nonceHex);
  assert.equal(res.body.nonceHex.length, 64); // 32 bytes hex
  assert.ok(res.body.state);
  assert.equal(res.body.state.length, 32); // 16 bytes hex
  assert.notEqual(res.body.nonceHex, res.body.state); // Strictly separate!
  assert.equal(res.body.recipient, "koket-knovara-dev.testnet");
  assert.ok(res.body.expiresAt);

  // Check TTL is ~5 minutes in the future
  const expiresMs = new Date(res.body.expiresAt).getTime();
  const diffMinutes = (expiresMs - Date.now()) / (1000 * 60);
  assert.ok(diffMinutes >= 4.9 && diffMinutes <= 5.1);
});

test("19. Consecutive challenges produce unique nonces and CSRF states", async () => {
  const app = createApp();

  const res1 = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const res2 = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });

  assert.notEqual(res1.body.nonceHex, res2.body.nonceHex);
  assert.notEqual(res1.body.state, res2.body.state);
});

test("20. Challenge request with invalid or missing accountId returns 400 Bad Request", async () => {
  const app = createApp();

  const res1 = await request(app).post("/api/v1/auth/challenge").send({});
  assert.equal(res1.status, 400);
  assert.equal(res1.body.code, "ERR_INVALID_ACCOUNT_ID");

  const res2 = await request(app).post("/api/v1/auth/challenge").send({ accountId: "   " });
  assert.equal(res2.status, 400);
  assert.equal(res2.body.code, "ERR_INVALID_ACCOUNT_ID");
});

test("21. Successful wallet authentication sets secure HttpOnly cookie and creates User", async () => {
  const alice = getTestKeyPair("alice");
  const mockFetch = createMockNearRpc({ permission: "FullAccess" });
  globalThis.fetch = mockFetch;

  const app = createApp();

  // 1. Get challenge
  const chalRes = await request(app)
    .post("/api/v1/auth/challenge")
    .send({ accountId: "alice.testnet" });

  const { nonceHex, state, message, recipient, callbackUrl } = chalRes.body;

  // 2. Sign NEP-413 payload using test key
  const nonceBytes = Buffer.from(nonceHex, "hex");
  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: nonceBytes,
    recipient,
    callbackUrl,
  });

  // 3. Verify
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
  assert.equal(verifyRes.body.user.accountId, "alice.testnet");
  assert.equal(verifyRes.body.user.status, "active");

  // Verify Set-Cookie header is present with HttpOnly
  const cookies = verifyRes.headers["set-cookie"];
  assert.ok(cookies);
  const sessionCookie = cookies.find((c) => c.startsWith("knovara.sid="));
  assert.ok(sessionCookie);
  assert.ok(sessionCookie.includes("HttpOnly"));
  assert.ok(sessionCookie.includes("SameSite=Lax"));
});

test("22. Nonce replay defense: second verification of same nonce is rejected with 401", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();

  const chal = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient, callbackUrl } = chal.body;

  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  const payload = {
    accountId: "alice.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  };

  // First verify: 200 OK
  const res1 = await request(app).post("/api/v1/auth/verify").send(payload);
  assert.equal(res1.status, 200);

  // Second verify: REPLAY REJECTED with 401!
  const res2 = await request(app).post("/api/v1/auth/verify").send(payload);
  assert.equal(res2.status, 401);
  assert.equal(res2.body.code, "ERR_AUTH_NONCE_INVALID_OR_ALREADY_USED");
});

test("23. Expired challenge nonce is rejected with 401", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();

  const chal = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient, callbackUrl } = chal.body;

  // Manually backdate the challenge in DB to simulate expiration
  const stored = await AuthChallenge.findOne({ nonce: nonceHex });
  stored.expires_at = new Date(Date.now() - 1000); // 1 second in the past
  await stored.save();

  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  const res = await request(app).post("/api/v1/auth/verify").send({
    accountId: "alice.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.code, "ERR_AUTH_CHALLENGE_EXPIRED");
});

test("24. CSRF state mismatch is rejected with 403 Forbidden", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();

  const chal = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, message, recipient, callbackUrl } = chal.body;

  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  const res = await request(app).post("/api/v1/auth/verify").send({
    accountId: "alice.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state: "MALICIOUS_TAMPERED_CSRF_STATE",
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.code, "ERR_AUTH_CSRF_STATE_MISMATCH");
});

test("25. Signer account mismatch is rejected with 403 Forbidden", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();

  // Challenge issued for Alice
  const chal = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient, callbackUrl } = chal.body;

  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  // Submitted claiming to be Eve!
  const res = await request(app).post("/api/v1/auth/verify").send({
    accountId: "eve.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.code, "ERR_AUTH_ACCOUNT_MISMATCH");
});

test("26. Non-FullAccess (FunctionCall) key is rejected with 403 Forbidden", async () => {
  const alice = getTestKeyPair("alice");
  // Mock RPC returning FunctionCall key permission
  globalThis.fetch = createMockNearRpc({ permission: "FunctionCall" });

  const app = createApp();

  const chal = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient, callbackUrl } = chal.body;

  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  const res = await request(app).post("/api/v1/auth/verify").send({
    accountId: "alice.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.code, "ERR_KEY_NOT_ELIGIBLE_FULL_ACCESS");
});

test("27. Key not associated with account on RPC is rejected with 403", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ errorCode: "UNKNOWN_ACCESS_KEY" });

  const app = createApp();

  const chal = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient, callbackUrl } = chal.body;

  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  const res = await request(app).post("/api/v1/auth/verify").send({
    accountId: "alice.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.code, "ERR_KEY_NOT_FOUND_ON_ACCOUNT");
});

test("28. Temporary RPC network failure returns 503 Service Unavailable", async () => {
  const alice = getTestKeyPair("alice");
  // Simulate network disconnect / RPC 500
  globalThis.fetch = createMockNearRpc({ networkError: true });

  const app = createApp();

  const chal = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient, callbackUrl } = chal.body;

  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  const res = await request(app).post("/api/v1/auth/verify").send({
    accountId: "alice.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  });

  assert.equal(res.status, 503);
  assert.equal(res.body.code, "ERR_BLOCKCHAIN_UNAVAILABLE");
});

test("29. Session lifecycle: verification, session query, and logout invalidation", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const agent = request.agent(createApp());

  // Check unauthenticated session
  const unauthRes = await agent.get("/api/v1/auth/session");
  assert.equal(unauthRes.status, 200);
  assert.equal(unauthRes.body.authenticated, false);

  // Authenticate
  const chal = await agent.post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient, callbackUrl } = chal.body;
  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  const loginRes = await agent.post("/api/v1/auth/verify").send({
    accountId: "alice.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.success, true);

  // Check authenticated session
  const authRes = await agent.get("/api/v1/auth/session");
  assert.equal(authRes.status, 200);
  assert.equal(authRes.body.authenticated, true);
  assert.equal(authRes.body.user.accountId, "alice.testnet");

  // Logout
  const logoutRes = await agent.post("/api/v1/auth/logout");
  assert.equal(logoutRes.status, 200);
  assert.equal(logoutRes.body.success, true);

  // Check session is now cleared
  const afterLogoutRes = await agent.get("/api/v1/auth/session");
  assert.equal(afterLogoutRes.status, 200);
  assert.equal(afterLogoutRes.body.authenticated, false);
});

