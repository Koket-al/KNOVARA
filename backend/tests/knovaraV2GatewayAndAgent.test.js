import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import http from "node:http";
import { createApp } from "../src/app.js";
import { setupMockDatabase, clearMockDatabase } from "./helpers/mockDb.js";
import { encryptSecret, decryptSecret } from "../src/services/encryption.js";
import {
  issueCredential,
  validateToken,
  revokeCredential,
  rotateCredential,
  hashToken,
} from "../src/services/credentialService.js";
import { isPrivateIp, validateSsrfTarget } from "../src/services/ssrfFilter.js";
import { setMockRpcClient, resetMockRpcClient } from "../src/services/nearContract.js";
import { ApiProduct } from "../src/models/ApiProduct.js";
import { ProviderConfig } from "../src/models/ProviderConfig.js";
import { SubscriptionProjection } from "../src/models/SubscriptionProjection.js";
import { AgentProfile } from "../src/models/AgentProfile.js";
import { handleRequest } from "../../demo/advanced-materials-provider/server.js";

before(() => {
  setupMockDatabase();
});

beforeEach(() => {
  clearMockDatabase();
  resetMockRpcClient();
});

after(() => {
  clearMockDatabase();
  resetMockRpcClient();
});

test("KNOVARA 2.0: Cryptography, SSRF Firewall, Credential Engine & Gateway", async (t) => {
  const app = createApp();

  await t.test("1. AES-256-GCM: encrypts and decrypts provider secrets with fresh IVs", () => {
    const secret = "live_secret_key_998877";
    const enc1 = encryptSecret(secret);
    const enc2 = encryptSecret(secret);

    // Each encryption must use a unique random IV
    assert.notEqual(enc1.iv, enc2.iv);
    assert.notEqual(enc1.encrypted_secret, enc2.encrypted_secret);

    // Both decrypt back to original secret
    const dec1 = decryptSecret(enc1.encrypted_secret, enc1.iv, enc1.auth_tag);
    const dec2 = decryptSecret(enc2.encrypted_secret, enc2.iv, enc2.auth_tag);
    assert.equal(dec1, secret);
    assert.equal(dec2, secret);

    // Tampering with auth tag fails decryption
    const badTag = enc1.auth_tag.slice(0, -2) + "00";
    assert.throws(() => {
      decryptSecret(enc1.encrypted_secret, enc1.iv, badTag);
    });
  });

  await t.test("2. SSRF Firewall: blocks loopback, RFC 1918, and cloud metadata IPs", async () => {
    // Direct private IP literals
    assert.equal(isPrivateIp("127.0.0.1"), true);
    assert.equal(isPrivateIp("10.0.0.5"), true);
    assert.equal(isPrivateIp("172.16.1.1"), true);
    assert.equal(isPrivateIp("192.168.1.100"), true);
    assert.equal(isPrivateIp("169.254.169.254"), true); // AWS/GCP metadata
    assert.equal(isPrivateIp("::1"), true);
    assert.equal(isPrivateIp("8.8.8.8"), false); // Public DNS
    assert.equal(isPrivateIp("1.1.1.1"), false); // Public Cloudflare

    // SSRF URL validation
    const awsRes = await validateSsrfTarget("http://169.254.169.254/latest/meta-data/", false);
    assert.equal(awsRes.allowed, false);

    const privRes = await validateSsrfTarget("http://192.168.1.50:8080/admin", false);
    assert.equal(privRes.allowed, false);

    // Localhost disallowed when allowLocalDev is false
    const localDisallowed = await validateSsrfTarget("http://localhost:5050", false);
    assert.equal(localDisallowed.allowed, false);

    // Localhost allowed when allowLocalDev is true
    const localAllowed = await validateSsrfTarget("http://localhost:5050", true);
    assert.equal(localAllowed.allowed, true);
  });

  await t.test("3. Credential Engine: hashes tokens, validates expiry, revokes, and rotates", async () => {
    const rawExpires = new Date(Date.now() + 1000 * 3600);
    const issued = await issueCredential({
      agent_id: "agent-alpha",
      owner_account_id: "owner.testnet",
      agent_account_id: "agent.testnet",
      discovery_id: "disc-mat-001",
      api_product_id: "api-alloys-v1",
      subscription_id: "sub-100",
      expires_at: rawExpires,
    });

    assert.ok(issued.raw_token.startsWith("knov_live_"));
    assert.equal(issued.status, "active");

    // Validation succeeds with active token
    const val = await validateToken(issued.raw_token);
    assert.equal(val.valid, true);
    assert.equal(val.credential.agent_id, "agent-alpha");

    // Revocation invalidates token
    await revokeCredential(issued.credential_id, "owner.testnet");
    const valRevoked = await validateToken(issued.raw_token);
    assert.equal(valRevoked.valid, false);
    assert.equal(valRevoked.reason, "REVOKED");

    // Rotation creates a new token and revokes the old
    const rotated = await rotateCredential(issued.credential_id, "owner.testnet");
    assert.notEqual(rotated.raw_token, issued.raw_token);
    const valRotated = await validateToken(rotated.raw_token);
    assert.equal(valRotated.valid, true);
  });

  await t.test("4. Publisher API: registers OpenAPI 3.1 product and provider config", async () => {
    const openapiSpec = {
      openapi: "3.1.0",
      info: { title: "Aerospace Metallurgy API", version: "1.0.0" },
      paths: {
        "/v1/materials/recommendations": {
          post: {
            operationId: "get_material_recommendations",
            summary: "Recommend aerospace alloys",
          },
        },
      },
    };

    const res = await request(app)
      .post("/api/v1/api-products")
      .send({
        discovery_id: "disc-mat-001",
        token_id: "token-mat-001",
        title: "Aerospace Metallurgy API",
        openapi_spec: openapiSpec,
        monthly_price_near: 2.5,
      });

    assert.equal(res.status, 201);
    const prod = res.body.product;
    assert.equal(prod.discovery_id, "disc-mat-001");
    assert.equal(prod.monthly_price_near, 2.5);
    assert.equal(prod.monthly_price_yocto, "2500000000000000000000000");
    assert.equal(prod.endpoints.length, 1);
    assert.equal(prod.endpoints[0].operation_id, "get_material_recommendations");

    // Configure provider
    const confRes = await request(app)
      .post(`/api/v1/api-products/${prod.api_product_id}/provider-config`)
      .send({
        base_url: "http://localhost:5050",
        secret_token: "demo_adv_materials_secret_2026",
        header_name: "x-provider-api-key",
      });

    assert.equal(confRes.status, 200);
    assert.equal(confRes.body.provider_config.status, "active");
  });

  await t.test("5. Agent Profile & Intent: registers agent and prepares purchase intent", async () => {
    // Register product
    const product = await ApiProduct.create({
      api_product_id: "api-prod-001",
      discovery_id: "disc-mat-001",
      token_id: "token-mat-001",
      title: "Aerospace Metallurgy API",
      version: "1.0.0",
      canonical_spec_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      endpoints: [
        {
          path: "/v1/materials/recommendations",
          method: "POST",
          operation_id: "get_material_recommendations",
        },
      ],
      monthly_price_near: 2.5,
      monthly_price_yocto: "2500000000000000000000000",
      duration_days: 30,
      status: "draft",
    });

    // Register agent
    const agentRes = await request(app)
      .post("/api/v1/agent/profiles")
      .send({
        name: "Research Bot 01",
        owner_account_id: "owner.testnet",
        agent_account_id: "agent-01.testnet",
      });

    assert.equal(agentRes.status, 201);
    const agent = agentRes.body.agent;
    assert.equal(agent.owner_account_id, "owner.testnet");
    assert.equal(agent.agent_account_id, "agent-01.testnet");

    // Prepare intent when product is draft (no offer yet) -> 404
    const intentRes = await request(app)
      .post("/api/v1/agent/prepare-intent")
      .send({
        agent_id: agent.agent_id,
        discovery_id: "disc-mat-001",
      });

    assert.equal(intentRes.status, 404);

    // Set offer_id on product to simulate published state
    await ApiProduct.findOneAndUpdate(
      { discovery_id: "disc-mat-001" },
      { offer_id: "sub-offer-001", status: "published" }
    );

    const intentRes2 = await request(app)
      .post("/api/v1/agent/prepare-intent")
      .send({
        agent_id: agent.agent_id,
        discovery_id: "disc-mat-001",
      });

    assert.equal(intentRes2.status, 201);
    assert.ok(intentRes2.body.intent_id);
    assert.equal(intentRes2.body.transaction_payload.methodName, "subscribe_to_offer");
    assert.equal(intentRes2.body.transaction_payload.attachedDeposit, "2500000000000000000000000");
  });

  await t.test("6. API Gateway: End-to-end access control, secret injection, and upstream dispatch", async () => {
    // Start local demo provider server on random port
    const demoServer = http.createServer(handleRequest);
    await new Promise((resolve) => demoServer.listen(0, resolve));
    const demoPort = demoServer.address().port;
    const demoBaseUrl = `http://127.0.0.1:${demoPort}`;

    // Register product
    const prod = await ApiProduct.create({
      api_product_id: "api-prod-002",
      discovery_id: "disc-mat-001",
      token_id: "token-mat-001",
      title: "Aerospace Metallurgy API",
      version: "1.0.0",
      canonical_spec_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      endpoints: [
        {
          path: "/v1/materials/recommendations",
          method: "POST",
          operation_id: "get_material_recommendations",
        },
      ],
      monthly_price_near: 2.5,
      monthly_price_yocto: "2500000000000000000000000",
      duration_days: 30,
      offer_id: "sub-offer-001",
      status: "published",
    });

    const { encrypted_secret, iv, auth_tag } = encryptSecret("demo_adv_materials_secret_2026");

    await ProviderConfig.create({
      api_product_id: prod.api_product_id,
      base_url: demoBaseUrl,
      encrypted_secret,
      iv,
      auth_tag,
      header_name: "x-provider-api-key",
      status: "active",
    });

    // Create active subscription projection
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 86400 * 1000);

    await SubscriptionProjection.create({
      subscription_id: "sub-test-200",
      offer_id: "sub-offer-001",
      discovery_id: "disc-mat-001",
      token_id: "token-mat-001",
      subscriber_id: "agent-01.testnet",
      api_product_id: prod.api_product_id,
      openapi_spec_hash: prod.canonical_spec_hash,
      accepted_terms_hash: prod.canonical_spec_hash,
      price_yocto: "2500000000000000000000000",
      activated_at: now,
      expires_at: expiresAt,
      status: "Active",
      block_height: 1000,
      last_synced_at: now,
    });

    // Issue active credential
    const cred = await issueCredential({
      agent_id: "agent-01",
      owner_account_id: "owner.testnet",
      agent_account_id: "agent-01.testnet",
      discovery_id: "disc-mat-001",
      api_product_id: prod.api_product_id,
      subscription_id: "sub-test-200",
      expires_at: expiresAt,
    });

    // Test A: Missing Authorization header -> 401
    const resNoAuth = await request(app)
      .post("/api/v1/gateway/assets/disc-mat-001/operations/get_material_recommendations")
      .send({ application: "drone bracket" });
    assert.equal(resNoAuth.status, 401);

    // Test B: Token for different asset -> 403 (No cross-asset leakage)
    const resWrongAsset = await request(app)
      .post("/api/v1/gateway/assets/disc-unauthorized-999/operations/get_material_recommendations")
      .set("Authorization", `Bearer ${cred.raw_token}`)
      .send({ application: "drone bracket" });
    assert.equal(resWrongAsset.status, 403);

    // Test C: Disallowed operation -> 404
    const resBadOp = await request(app)
      .post("/api/v1/gateway/assets/disc-mat-001/operations/non_existent_operation")
      .set("Authorization", `Bearer ${cred.raw_token}`)
      .send({ application: "drone bracket" });
    assert.equal(resBadOp.status, 404);

    // Test D: Valid request through gateway to upstream provider
    const resSuccess = await request(app)
      .post("/api/v1/gateway/assets/disc-mat-001/operations/get_material_recommendations")
      .set("Authorization", `Bearer ${cred.raw_token}`)
      .send({
        application: "drone bracket",
        maximumDensity: 3.0,
        minimumTensileStrengthMpa: 400,
        corrosionResistance: "moderate",
      });

    assert.equal(resSuccess.status, 200);
    assert.ok(resSuccess.body.recommendations.length >= 2);
    assert.ok(resSuccess.body.disclaimer.includes("MMPDS-01"));

    // Test E: Cache freshness fallback when projection is older than 30s
    await SubscriptionProjection.findOneAndUpdate(
      { subscription_id: "sub-test-200" },
      { last_synced_at: new Date(Date.now() - 40000) } // 40 seconds old
    );

    // Mock NEAR RPC to return active on-chain subscription
    setMockRpcClient(async (method, params) => {
      if (params?.method_name === "get_subscription") {
        const payload = {
          subscription_id: "sub-test-200",
          offer_id: "sub-offer-001",
          discovery_id: "disc-mat-001",
          token_id: "token-mat-001",
          subscriber_id: "agent-01.testnet",
          api_product_id: prod.api_product_id,
          openapi_spec_hash: prod.canonical_spec_hash,
          accepted_terms_hash: prod.canonical_spec_hash,
          price_yocto: "2500000000000000000000000",
          activated_at: String(now.getTime() * 1_000_000),
          expires_at: String(expiresAt.getTime() * 1_000_000),
          status: { Active: { activated_at: 0, expires_at: 0 } },
        };
        return {
          result: Array.from(Buffer.from(JSON.stringify(payload), "utf8")),
        };
      }
      return null;
    });

    const resFreshSync = await request(app)
      .post("/api/v1/gateway/assets/disc-mat-001/operations/get_material_recommendations")
      .set("Authorization", `Bearer ${cred.raw_token}`)
      .send({ application: "drone bracket" });

    assert.equal(resFreshSync.status, 200);

    // Test F: Fail-closed policy when cache is stale and RPC fails
    await SubscriptionProjection.findOneAndUpdate(
      { subscription_id: "sub-test-200" },
      { last_synced_at: new Date(Date.now() - 40000) }
    );

    setMockRpcClient(async () => {
      throw new Error("RPC_NETWORK_DOWN");
    });

    const resFailClosed = await request(app)
      .post("/api/v1/gateway/assets/disc-mat-001/operations/get_material_recommendations")
      .set("Authorization", `Bearer ${cred.raw_token}`)
      .send({ application: "drone bracket" });

    assert.equal(resFailClosed.status, 503);

    demoServer.close();
  });
});
