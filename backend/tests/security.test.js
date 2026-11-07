import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { requireAuth } from "../src/middleware/auth.js";
import { setupMockDatabase, clearMockDatabase } from "./helpers/mockDb.js";
import { getTestKeyPair, signNep413Payload } from "./helpers/testKeys.js";
import { createMockNearRpc } from "./helpers/mockRpc.js";

before(() => {
  setupMockDatabase();
});

beforeEach(() => {
  clearMockDatabase();
});

after(() => {
  clearMockDatabase();
});

test("30. requireAuth middleware rejects unauthenticated requests with 401", async () => {
  const app = createApp({
    configureRoutes: (appInstance) => {
      appInstance.get("/api/v1/protected-resource", requireAuth, (req, res) => {
        res.json({ secret: "data", accountId: req.user.accountId });
      });
    },
  });

  const res = await request(app).get("/api/v1/protected-resource");
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "ERR_UNAUTHENTICATED");
});

test("31. requireAuth middleware permits authenticated sessions", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp({
    configureRoutes: (appInstance) => {
      appInstance.get("/api/v1/protected-resource", requireAuth, (req, res) => {
        res.json({ secret: "data", accountId: req.user.accountId });
      });
    },
  });

  const agent = request.agent(app);

  // Authenticate
  const chal = await agent.post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient, callbackUrl } = chal.body;
  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  await agent.post("/api/v1/auth/verify").send({
    accountId: "alice.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  });

  // Access protected endpoint
  const res = await agent.get("/api/v1/protected-resource");
  assert.equal(res.status, 200);
  assert.equal(res.body.secret, "data");
  assert.equal(res.body.accountId, "alice.testnet");
});

test("32. Session ID is rotated upon login to prevent session fixation", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();
  const agent = request.agent(app);

  // Initial call sets pre-auth session cookie
  const initRes = await agent.get("/api/v1/auth/session");
  const initCookie = initRes.headers["set-cookie"]?.[0]?.split(";")[0];

  // Challenge and verify
  const chal = await agent.post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  const { nonceHex, state, message, recipient, callbackUrl } = chal.body;
  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  const verifyRes = await agent.post("/api/v1/auth/verify").send({
    accountId: "alice.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  });

  const postAuthCookie = verifyRes.headers["set-cookie"]?.[0]?.split(";")[0];

  assert.ok(postAuthCookie);
  if (initCookie) {
    // Session ID was rotated
    assert.notEqual(initCookie, postAuthCookie);
  }
});

test("33. Error responses never leak stack traces or internal secrets", async () => {
  const app = createApp();

  // Trigger error
  const res = await request(app).post("/api/v1/auth/verify").send({
    accountId: "test.testnet",
    publicKey: "invalid_key",
    signature: "invalid_sig",
    nonceHex: "invalid_nonce",
    state: "invalid_state",
  });

  assert.equal(res.body.stack, undefined);
  assert.ok(res.body.error);
  assert.ok(res.body.code);
});

test("34. Backend never returns private keys, seeds, or confidential credentials in any payload", async () => {
  const alice = getTestKeyPair("alice");
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();

  const chal = await request(app).post("/api/v1/auth/challenge").send({ accountId: "alice.testnet" });
  assert.equal(chal.body.privateKey, undefined);
  assert.equal(chal.body.secretKey, undefined);
  assert.equal(chal.body.seed, undefined);

  const { nonceHex, state, message, recipient, callbackUrl } = chal.body;
  const { signatureBase64, publicKeyStr } = signNep413Payload(alice, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
    callbackUrl,
  });

  const verifyRes = await request(app).post("/api/v1/auth/verify").send({
    accountId: "alice.testnet",
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  });

  assert.equal(verifyRes.body.privateKey, undefined);
  assert.equal(verifyRes.body.secretKey, undefined);
  assert.equal(verifyRes.body.seed, undefined);
  assert.equal(verifyRes.body.user.privateKey, undefined);
});
