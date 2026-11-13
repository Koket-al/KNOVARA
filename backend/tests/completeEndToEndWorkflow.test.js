import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import http from "node:http";
import { createApp } from "../src/app.js";
import { setupMockDatabase, clearMockDatabase } from "./helpers/mockDb.js";
import { setMockRpcClient, resetMockRpcClient } from "../src/services/nearContract.js";
import { executeTool } from "../../mcp-server/server.js";
import { saveLocalCredential } from "../../mcp-server/credentialStore.js";
import { handleRequest } from "../../demo/advanced-materials-provider/server.js";

before(() => {
  setupMockDatabase();
  clearMockDatabase();
  resetMockRpcClient();
});

after(() => {
  clearMockDatabase();
  resetMockRpcClient();
});

test("KNOVARA 2.0: Full-Stack End-to-End Autonomous Agent Licensing Flow", async (t) => {
  const app = createApp();

  // 1. Start Standalone Demo Publisher Provider on dynamic port
  const demoServer = http.createServer(handleRequest);
  await new Promise((resolve) => demoServer.listen(0, resolve));
  const demoPort = demoServer.address().port;
  const demoBaseUrl = `http://127.0.0.1:${demoPort}`;

  t.after(() => demoServer.close());

  // Also start Express backend test server so MCP tool can call it over HTTP
  const backendServer = http.createServer(app);
  await new Promise((resolve) => backendServer.listen(0, resolve));
  const backendPort = backendServer.address().port;
  process.env.KNOVARA_BACKEND_URL = `http://127.0.0.1:${backendPort}`;

  t.after(() => backendServer.close());

  let discoveryId = "disc-mat-e2e-01";
  let tokenId = "token-mat-e2e-01";
  let apiProductId;
  let offerId;
  let agentId;
  let intentId;
  let subscriptionId;
  let rawToken;

  await t.test("Stage 1: Publisher registers OpenAPI 3.1 product and encrypts upstream secret", async () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Aerospace Materials Discovery API", version: "1.0.0" },
      paths: {
        "/v1/materials/recommendations": {
          post: {
            operationId: "get_material_recommendations",
            summary: "Recommend aerospace alloys and composites",
          },
        },
      },
    };

    const prodRes = await request(app)
      .post("/api/v1/api-products")
      .send({
        discovery_id: discoveryId,
        token_id: tokenId,
        title: "Aerospace Materials Discovery API",
        version: "1.0.0",
        openapi_spec: spec,
        monthly_price_near: 1.0, // 1 NEAR
      });

    assert.equal(prodRes.status, 201);
    apiProductId = prodRes.body.product.api_product_id;
    assert.ok(apiProductId);
    assert.equal(prodRes.body.product.monthly_price_yocto, "1000000000000000000000000");

    // Configure upstream provider
    const confRes = await request(app)
      .post(`/api/v1/api-products/${apiProductId}/provider-config`)
      .send({
        base_url: demoBaseUrl,
        secret_token: "demo_adv_materials_secret_2026",
        header_name: "x-provider-api-key",
      });

    assert.equal(confRes.status, 200);
    assert.equal(confRes.body.provider_config.status, "active");

    // Prepare on-chain offer intent
    const offerRes = await request(app)
      .post(`/api/v1/api-products/${apiProductId}/prepare-offer-intent`)
      .send({});

    assert.equal(offerRes.status, 200);
    offerId = offerRes.body.offer_id;
    assert.ok(offerId);
    assert.equal(offerRes.body.intent.methodName, "create_api_subscription_offer");
    assert.equal(offerRes.body.intent.args.duration_days, undefined); // 30-day fixed in contract
  });

  await t.test("Stage 2: Human owner links dedicated agent NEAR account", async () => {
    const agentRes = await request(app)
      .post("/api/v1/agent/profiles")
      .send({
        name: "Autonomous Materials Explorer",
        owner_account_id: "human-owner.testnet",
        agent_account_id: "agent-explorer.testnet",
      });

    assert.equal(agentRes.status, 201);
    agentId = agentRes.body.agent.agent_id;
    assert.equal(agentRes.body.agent.agent_account_id, "agent-explorer.testnet");
    assert.equal(agentRes.body.agent.verification_status, "verified");
  });

  await t.test("Stage 3: AI agent autonomously discovers API via MCP tool", async () => {
    const searchResult = await executeTool("knovara_search_assets", {
      query: "aerospace alloy drone bracket",
      max_price_near: 5,
    });

    assert.ok(searchResult.recommendations.length >= 1);
    const match = searchResult.recommendations[0];
    assert.equal(match.api_product_id, apiProductId);
    assert.equal(match.monthly_price_near, 1.0);
    assert.ok(match.recommendation_reason.includes("verified operations"));
  });

  await t.test("Stage 4: Agent prepares purchase intent for human owner approval", async () => {
    const intentRes = await request(app)
      .post("/api/v1/agent/prepare-intent")
      .send({
        agent_id: agentId,
        discovery_id: discoveryId,
        api_product_id: apiProductId,
      });

    assert.equal(intentRes.status, 201);
    intentId = intentRes.body.intent_id;
    subscriptionId = intentRes.body.subscription_id;
    assert.ok(intentId);
    assert.ok(subscriptionId);
    assert.equal(intentRes.body.transaction_payload.methodName, "subscribe_to_offer");
    assert.equal(intentRes.body.transaction_payload.args.subscription_id, subscriptionId);
    assert.equal(intentRes.body.transaction_payload.attachedDeposit, "1000000000000000000000000");
  });

  await t.test("Stage 5: Human owner approves and dedicated agent account subscribes on-chain", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 86400 * 1000);

    // Mock authoritative NEAR contract state
    setMockRpcClient(async (method, params) => {
      if (params?.method_name === "get_subscription") {
        const payload = {
          subscription_id: subscriptionId,
          offer_id: offerId,
          discovery_id: discoveryId,
          token_id: tokenId,
          subscriber_id: "agent-explorer.testnet",
          api_product_id: apiProductId,
          openapi_spec_hash: "a".repeat(64),
          accepted_terms_hash: "a".repeat(64),
          price_yocto: "1000000000000000000000000",
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

    // Issue API credential for confirmed subscription
    const issueRes = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/issue-credential`)
      .send({});

    assert.equal(issueRes.status, 201);
    rawToken = issueRes.body.credential.raw_token;
    assert.ok(rawToken.startsWith("knov_live_"));
    assert.equal(issueRes.body.credential.agent_id, agentId);

    // Secure local MCP host adapter saves credential locally
    saveLocalCredential(discoveryId, rawToken);
  });

  await t.test("Stage 6: AI Agent consumes proprietary provider API via MCP & Gateway", async () => {
    // Tool call without raw token in arguments! MCP host injects it locally
    const apiResult = await executeTool("knovara_call_asset_api", {
      asset_id: discoveryId,
      operation_id: "get_material_recommendations",
      parameters: {
        application: "drone bracket",
        maximumDensity: 3.0,
        minimumTensileStrengthMpa: 400,
        corrosionResistance: "moderate",
      },
    });

    assert.ok(apiResult.recommendations.length >= 2);
    // Highest ranked material
    const topPick = apiResult.recommendations[0];
    assert.ok(topPick.materialId);
    assert.ok(topPick.name);
    assert.ok(topPick.densityGcm3 <= 3.0);
    assert.ok(topPick.tensileStrengthMpa >= 400);
    assert.ok(topPick.standardReference.includes("MMPDS-01") || topPick.standardReference.includes("NASA"));
    assert.ok(apiResult.disclaimer.includes("MMPDS-01"));
  });

  await t.test("Stage 7: Security invariant: Cross-asset access is strictly forbidden", async () => {
    await assert.rejects(
      async () => {
        await executeTool("knovara_call_asset_api", {
          asset_id: "disc-other-unauthorized-999",
          operation_id: "get_material_recommendations",
          parameters: {},
        });
      },
      /ERR_NO_LOCAL_CREDENTIAL/
    );
  });
});
