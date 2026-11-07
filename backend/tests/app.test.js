import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { setupMockDatabase, clearMockDatabase } from "./helpers/mockDb.js";

before(() => {
  setupMockDatabase();
});

after(() => {
  clearMockDatabase();
});

test("1. Backend startup and health endpoint returns 200 OK with correct metadata", async () => {
  const app = createApp();
  const res = await request(app).get("/health");

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.network, "testnet");
  assert.equal(res.body.contract, "koket-knovara-dev.testnet");
  assert.equal(res.body.database, "connected");
  assert.ok(res.body.timestamp);
});

test("2. Health endpoint is also accessible at /api/health and /api/v1/health", async () => {
  const app = createApp();

  const res1 = await request(app).get("/api/health");
  assert.equal(res1.status, 200);
  assert.equal(res1.body.status, "ok");

  const res2 = await request(app).get("/api/v1/health");
  assert.equal(res2.status, 200);
  assert.equal(res2.body.status, "ok");
});

test("3. Security middleware sets Helmet security headers", async () => {
  const app = createApp();
  const res = await request(app).get("/health");

  assert.ok(res.headers["x-content-type-options"], "nosniff");
  assert.ok(res.headers["x-dns-prefetch-control"]);
  assert.ok(res.headers["x-frame-options"]);
});

test("4. CORS configuration permits credentials and configured origin", async () => {
  const app = createApp();
  const res = await request(app)
    .options("/api/v1/auth/challenge")
    .set("Origin", "http://localhost:3000")
    .set("Access-Control-Request-Method", "POST");

  assert.equal(res.status, 204);
  assert.equal(res.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.equal(res.headers["access-control-allow-credentials"], "true");
});

test("5. Undefined routes return structured 404 JSON", async () => {
  const app = createApp();
  const res = await request(app).get("/api/v1/nonexistent-endpoint");

  assert.equal(res.status, 404);
  assert.equal(res.body.code, "ERR_NOT_FOUND");
});

