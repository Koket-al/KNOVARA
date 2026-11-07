import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { User } from "../src/models/User.js";
import { AuthChallenge } from "../src/models/AuthChallenge.js";
import { setupMockDatabase, clearMockDatabase, challengeStore, userStore } from "./helpers/mockDb.js";

before(() => {
  setupMockDatabase();
});

beforeEach(() => {
  clearMockDatabase();
});

after(() => {
  clearMockDatabase();
});

test("6. User model schema validation: requires account_id without password or email", async () => {
  const user = new User({
    account_id: "ALICE.testnet",
  });

  // Schema validates lowercase trimming
  assert.equal(user.account_id, "alice.testnet");
  assert.equal(user.status, "active");
  assert.ok(user.created_at);
  assert.ok(user.last_login_at);

  // Assert no email, password, or private key attributes exist in schema
  assert.equal(user.email, undefined);
  assert.equal(user.password, undefined);
  assert.equal(user.privateKey, undefined);
});

test("7. AuthChallenge model validates 32-byte (64 hex char) nonce", async () => {
  const nonce = crypto.randomBytes(32).toString("hex");
  const state = crypto.randomBytes(16).toString("hex");

  const challenge = new AuthChallenge({
    nonce,
    account_id: "bob.testnet",
    state,
    message: "Authenticate with KNOVARA",
    recipient: "koket-knovara-dev.testnet",
    expires_at: new Date(Date.now() + 300000),
    consumed: false,
  });

  await challenge.save();

  assert.equal(challenge.nonce.length, 64);
  assert.equal(challenge.account_id, "bob.testnet");
  assert.equal(challenge.state.length, 32);
  assert.equal(challenge.consumed, false);
});

test("8. AuthChallenge atomic one-time consumption (findOneAndDelete)", async () => {
  const nonce = crypto.randomBytes(32).toString("hex");
  const challenge = new AuthChallenge({
    nonce,
    account_id: "charlie.testnet",
    state: "csrf_state_123",
    message: "Authenticate with KNOVARA",
    recipient: "koket-knovara-dev.testnet",
    expires_at: new Date(Date.now() + 300000),
    consumed: false,
  });

  await challenge.save();
  assert.equal(challengeStore.docs.size, 1);

  // First atomic consumption succeeds and burns record
  const consumed = await AuthChallenge.findOneAndDelete({ nonce });
  assert.ok(consumed);
  assert.equal(consumed.nonce, nonce);
  assert.equal(challengeStore.docs.size, 0);

  // Second atomic consumption returns null (replay defense)
  const replay = await AuthChallenge.findOneAndDelete({ nonce });
  assert.equal(replay, null);
});

test("9. User upsert atomically increments login timestamp and preserves created_at", async () => {
  const t1 = new Date("2026-01-01T00:00:00Z");
  const user1 = await User.findOneAndUpdate(
    { account_id: "dave.testnet" },
    { $set: { last_login_at: t1 }, $setOnInsert: { created_at: t1, status: "active" } },
    { upsert: true, new: true }
  );

  assert.equal(user1.account_id, "dave.testnet");
  assert.equal(user1.created_at, t1);
  assert.equal(user1.last_login_at, t1);

  // Later login
  const t2 = new Date("2026-01-02T12:00:00Z");
  const user2 = await User.findOneAndUpdate(
    { account_id: "dave.testnet" },
    { $set: { last_login_at: t2 }, $setOnInsert: { created_at: t2, status: "active" } },
    { upsert: true, new: true }
  );

  assert.equal(user2.account_id, "dave.testnet");
  assert.equal(user2.created_at, t1); // Preserved!
  assert.equal(user2.last_login_at, t2); // Updated!
});
