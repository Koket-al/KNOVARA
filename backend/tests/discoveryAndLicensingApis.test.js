import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { setupMockDatabase, clearMockDatabase } from "./helpers/mockDb.js";
import { setupMockR2, clearMockR2 } from "./helpers/mockR2.js";
import { getTestKeyPair, signNep413Payload } from "./helpers/testKeys.js";
import { createMockNearRpc } from "./helpers/mockRpc.js";
import * as nearContract from "../src/services/nearContract.js";
import { DiscoveryProjection } from "../src/models/DiscoveryProjection.js";
import { LicenseOfferProjection } from "../src/models/LicenseOfferProjection.js";
import { LicenseRequestProjection } from "../src/models/LicenseRequestProjection.js";
import { config } from "../src/config/env.js";

before(() => {
  setupMockDatabase();
  setupMockR2();
});

beforeEach(() => {
  clearMockDatabase();
  clearMockR2();
  nearContract.resetMockRpcClient();
});

after(() => {
  clearMockDatabase();
  clearMockR2();
  nearContract.resetMockRpcClient();
});

function encodeViewResult(data) {
  if (data === null || data === undefined) {
    return { result: [] };
  }
  return {
    result: Array.from(Buffer.from(JSON.stringify(data), "utf8")),
    logs: [],
    block_height: 123456,
    block_hash: "mock-block-hash",
  };
}

async function createAuthAgent(accountName = "alice") {
  const keyPair = getTestKeyPair(accountName);
  const accountId = `${accountName}.testnet`;
  globalThis.fetch = createMockNearRpc({ permission: "FullAccess" });

  const app = createApp();
  const agent = request.agent(app);

  const chalRes = await agent.post("/api/v1/auth/challenge").send({ accountId });
  const { nonceHex, state, message, recipient } = chalRes.body;

  const { signatureBase64, publicKeyStr } = signNep413Payload(keyPair, {
    message,
    nonce: Buffer.from(nonceHex, "hex"),
    recipient,
  });

  const verifyRes = await agent.post("/api/v1/auth/verify").send({
    accountId,
    publicKey: publicKeyStr,
    signature: signatureBase64,
    nonceHex,
    state,
  });

  assert.equal(verifyRes.status, 200);
  return { agent, app, accountId };
}

describe("Discovery & Licensing Application APIs", () => {
  describe("Discovery Browsing & Search", () => {
    it("1. GET /api/v1/discoveries supports pagination, search, and category filtering", async () => {
      const app = createApp();

      // Seed mock discoveries
      await DiscoveryProjection.create({
        discovery_id: "disc-biotech-1",
        token_id: "disc-biotech-1",
        custodian_id: "alice.testnet",
        rights_controller_id: "alice.testnet",
        public_metadata: {
          title: "CRISPR-Cas9 Vector",
          description: "High specificity precision enzyme vector",
          category: "BIOTECHNOLOGY",
          tags: ["crispr", "genomics"],
        },
        evidence_manifest_hash: "a".repeat(64),
        reference: "https://api.knovara.test/api/v1/metadata/disc-biotech-1/1.0.0",
        reference_hash: "b".repeat(64),
        beneficiary_splits: [{ account_id: "alice.testnet", basis_points: 10000 }],
        registered_at: new Date("2026-01-01T00:00:00.000Z"),
        block_height: 100,
        sync_status: "SYNCED",
      });

      await DiscoveryProjection.create({
        discovery_id: "disc-quantum-2",
        token_id: "disc-quantum-2",
        custodian_id: "carol.testnet",
        rights_controller_id: "carol.testnet",
        public_metadata: {
          title: "Superconducting Qubit Architecture",
          description: "Low-noise multi-qubit processor design",
          category: "QUANTUM_COMPUTING",
          tags: ["quantum", "hardware"],
        },
        evidence_manifest_hash: "c".repeat(64),
        reference: "https://api.knovara.test/api/v1/metadata/disc-quantum-2/1.0.0",
        reference_hash: "d".repeat(64),
        beneficiary_splits: [{ account_id: "carol.testnet", basis_points: 10000 }],
        registered_at: new Date("2026-02-01T00:00:00.000Z"),
        block_height: 101,
        sync_status: "SYNCED",
      });

      // 1. All discoveries
      const allRes = await request(app).get("/api/v1/discoveries");
      assert.equal(allRes.status, 200);
      assert.equal(allRes.body.discoveries.length, 2);
      assert.equal(allRes.body.pagination.total, 2);

      // 2. Filter by category
      const catRes = await request(app).get("/api/v1/discoveries?category=BIOTECHNOLOGY");
      assert.equal(catRes.status, 200);
      assert.equal(catRes.body.discoveries.length, 1);
      assert.equal(catRes.body.discoveries[0].discovery_id, "disc-biotech-1");

      // 3. Search by text query
      const searchRes = await request(app).get("/api/v1/discoveries?q=Qubit");
      assert.equal(searchRes.status, 200);
      assert.equal(searchRes.body.discoveries.length, 1);
      assert.equal(searchRes.body.discoveries[0].discovery_id, "disc-quantum-2");

      // 4. Sorting
      const sortRes = await request(app).get("/api/v1/discoveries?sort=oldest");
      assert.equal(sortRes.status, 200);
      assert.equal(sortRes.body.discoveries[0].discovery_id, "disc-biotech-1");
    });

    it("2. GET /api/v1/discoveries/:discoveryId returns discovery projection or 404", async () => {
      const app = createApp();

      await DiscoveryProjection.create({
        discovery_id: "disc-detail-101",
        token_id: "disc-detail-101",
        custodian_id: "alice.testnet",
        rights_controller_id: "alice.testnet",
        public_metadata: {
          title: "Synthetic Photoreceptor",
          description: "High quantum yield artificial retinal cell",
          category: "NEUROSCIENCE",
        },
        evidence_manifest_hash: "e".repeat(64),
        reference: "https://api.knovara.test/api/v1/metadata/disc-detail-101/1.0.0",
        reference_hash: "f".repeat(64),
        beneficiary_splits: [{ account_id: "alice.testnet", basis_points: 10000 }],
        registered_at: new Date(),
        block_height: 105,
        sync_status: "SYNCED",
      });

      const foundRes = await request(app).get("/api/v1/discoveries/disc-detail-101");
      assert.equal(foundRes.status, 200);
      assert.equal(foundRes.body.discovery.discovery_id, "disc-detail-101");

      const notFoundRes = await request(app).get("/api/v1/discoveries/nonexistent-xyz");
      assert.equal(notFoundRes.status, 404);
      assert.equal(notFoundRes.body.code, "ERR_DISCOVERY_NOT_FOUND");
    });

    it("3. GET /api/v1/discoveries/:discoveryId/passport returns live contract NFT record", async () => {
      const app = createApp();
      const discoveryId = "disc-detail-101";

      await DiscoveryProjection.create({
        discovery_id: discoveryId,
        token_id: discoveryId,
        custodian_id: "alice.testnet",
        rights_controller_id: "alice.testnet",
        public_metadata: { title: "Synthetic Photoreceptor" },
        evidence_manifest_hash: "e".repeat(64),
        reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
        reference_hash: "f".repeat(64),
        beneficiary_splits: [{ account_id: "alice.testnet", basis_points: 10000 }],
        registered_at: new Date(),
        block_height: 105,
        sync_status: "SYNCED",
      });

      const onChainNft = {
        token_id: discoveryId,
        owner_id: "alice.testnet",
        metadata: {
          title: "Synthetic Photoreceptor",
          reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
          reference_hash: "f".repeat(64),
        },
      };

      nearContract.setMockRpcClient(async (method, params) => {
        if (method === "query" && params.method_name === "nft_token") {
          return encodeViewResult(onChainNft);
        }
        throw new Error(`Unexpected RPC call: ${method}`);
      });

      const res = await request(app).get(`/api/v1/discoveries/${discoveryId}/passport`);
      assert.equal(res.status, 200);
      assert.equal(res.body.tokenId, discoveryId);
      assert.equal(res.body.token.owner_id, "alice.testnet");
    });

    it("4. GET /api/v1/discoveries/:discoveryId/offers returns offers for the discovery", async () => {
      const app = createApp();
      const discoveryId = "disc-detail-101";

      await LicenseOfferProjection.create({
        offer_id: "offer-pub-1",
        discovery_id: discoveryId,
        rights_controller_id: "alice.testnet",
        scope: "commercial_exclusive",
        price_yocto: "10000000000000000000000000",
        terms_hash: "1".repeat(64),
        duration_days: 365,
        is_active: true,
        block_height: 120,
      });

      const res = await request(app).get(`/api/v1/discoveries/${discoveryId}/offers`);
      assert.equal(res.status, 200);
      assert.equal(res.body.offers.length, 1);
      assert.equal(res.body.offers[0].offer_id, "offer-pub-1");
    });
  });

  describe("Licensing Offers & Requests Authorization", () => {
    it("5. GET /api/v1/licenses/offers/:offerId returns offer details", async () => {
      const app = createApp();
      const offerId = "offer-single-1";

      await LicenseOfferProjection.create({
        offer_id: offerId,
        discovery_id: "disc-detail-101",
        rights_controller_id: "alice.testnet",
        scope: "academic_noncommercial",
        price_yocto: "500000000000000000000000",
        terms_hash: "2".repeat(64),
        duration_days: 180,
        is_active: true,
        block_height: 130,
      });

      const res = await request(app).get(`/api/v1/licenses/offers/${offerId}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.offer.offer_id, offerId);
      assert.equal(res.body.offer.price_yocto, "500000000000000000000000");

      const notFoundRes = await request(app).get("/api/v1/licenses/offers/unknown-offer");
      assert.equal(notFoundRes.status, 404);
    });

    it("6. GET /api/v1/licenses/offers/:offerId/requests enforces privacy: controller sees all, buyer sees own", async () => {
      const offerId = "offer-perm-1";
      const discoveryId = "disc-detail-101";

      await LicenseOfferProjection.create({
        offer_id: offerId,
        discovery_id: discoveryId,
        rights_controller_id: "alice.testnet",
        scope: "commercial_exclusive",
        price_yocto: "1000000000000000000000000",
        terms_hash: "3".repeat(64),
        duration_days: 365,
        is_active: true,
        block_height: 139,
      });

      // Seed two requests from different buyers
      await LicenseRequestProjection.create({
        request_id: "req-bob-1",
        offer_id: offerId,
        discovery_id: discoveryId,
        buyer_id: "bob.testnet",
        rights_controller_id: "alice.testnet",
        scope: "commercial_exclusive",
        price_yocto: "1000000000000000000000000",
        accepted_terms_hash: "3".repeat(64),
        status: "Requested",
        requested_at: new Date(),
        block_height: 140,
      });

      await LicenseRequestProjection.create({
        request_id: "req-carol-1",
        offer_id: offerId,
        discovery_id: discoveryId,
        buyer_id: "carol.testnet",
        rights_controller_id: "alice.testnet",
        scope: "commercial_exclusive",
        price_yocto: "1000000000000000000000000",
        accepted_terms_hash: "3".repeat(64),
        status: "Requested",
        requested_at: new Date(),
        block_height: 141,
      });

      // Rights Controller (alice) sees both requests
      const { agent: aliceAgent } = await createAuthAgent("alice");
      const aliceRes = await aliceAgent.get(`/api/v1/licenses/offers/${offerId}/requests`);
      assert.equal(aliceRes.status, 200);
      assert.equal(aliceRes.body.requests.length, 2);

      // Buyer (bob) sees ONLY bob's request
      const { agent: bobAgent } = await createAuthAgent("bob");
      const bobRes = await bobAgent.get(`/api/v1/licenses/offers/${offerId}/requests`);
      assert.equal(bobRes.status, 200);
      assert.equal(bobRes.body.requests.length, 1);
      assert.equal(bobRes.body.requests[0].request_id, "req-bob-1");
    });

    it("7. GET /api/v1/licenses/requests/:requestId enforces controller and buyer authorization", async () => {
      const requestId = "req-auth-1";

      await LicenseRequestProjection.create({
        request_id: requestId,
        offer_id: "offer-auth-1",
        discovery_id: "disc-detail-101",
        buyer_id: "bob.testnet",
        rights_controller_id: "alice.testnet",
        scope: "commercial_exclusive",
        price_yocto: "1000000000000000000000000",
        accepted_terms_hash: "3".repeat(64),
        status: "Requested",
        requested_at: new Date(),
        block_height: 140,
      });

      // Controller (alice) has access
      const { agent: aliceAgent } = await createAuthAgent("alice");
      const aliceRes = await aliceAgent.get(`/api/v1/licenses/requests/${requestId}`);
      assert.equal(aliceRes.status, 200);

      // Buyer (bob) has access
      const { agent: bobAgent } = await createAuthAgent("bob");
      const bobRes = await bobAgent.get(`/api/v1/licenses/requests/${requestId}`);
      assert.equal(bobRes.status, 200);

      // Unrelated party (carol) is forbidden (403)
      const { agent: carolAgent } = await createAuthAgent("carol");
      const carolRes = await carolAgent.get(`/api/v1/licenses/requests/${requestId}`);
      assert.equal(carolRes.status, 403);
    });

    it("8. GET /api/v1/licenses/discoveries/:discoveryId/requests is restricted strictly to Rights Controller", async () => {
      const discoveryId = "disc-detail-101";

      await DiscoveryProjection.create({
        discovery_id: discoveryId,
        token_id: discoveryId,
        custodian_id: "alice.testnet",
        rights_controller_id: "alice.testnet",
        public_metadata: { title: "Test Vector" },
        evidence_manifest_hash: "a".repeat(64),
        reference: "https://api.knovara.test/api/v1/metadata/test/1.0.0",
        reference_hash: "b".repeat(64),
        beneficiary_splits: [{ account_id: "alice.testnet", basis_points: 10000 }],
        registered_at: new Date(),
        block_height: 100,
        sync_status: "SYNCED",
      });

      // Alice (rights controller) succeeds
      const { agent: aliceAgent } = await createAuthAgent("alice");
      const aliceRes = await aliceAgent.get(`/api/v1/licenses/discoveries/${discoveryId}/requests`);
      assert.equal(aliceRes.status, 200);

      // Bob (not rights controller) gets 403
      const { agent: bobAgent } = await createAuthAgent("bob");
      const bobRes = await bobAgent.get(`/api/v1/licenses/discoveries/${discoveryId}/requests`);
      assert.equal(bobRes.status, 403);
    });
  });

  describe("Authenticated Account Portfolio & Balances", () => {
    it("9. GET /api/v1/account/discoveries returns user's owned and controlled discoveries", async () => {
      const { agent: aliceAgent, accountId } = await createAuthAgent("alice");

      await DiscoveryProjection.create({
        discovery_id: "disc-alice-1",
        token_id: "disc-alice-1",
        custodian_id: accountId,
        rights_controller_id: accountId,
        public_metadata: { title: "Alice Discovery" },
        evidence_manifest_hash: "a".repeat(64),
        reference: "https://api.knovara.test/api/v1/metadata/a/1.0.0",
        reference_hash: "b".repeat(64),
        beneficiary_splits: [{ account_id: accountId, basis_points: 10000 }],
        registered_at: new Date(),
        block_height: 100,
        sync_status: "SYNCED",
      });

      const res = await aliceAgent.get("/api/v1/account/discoveries");
      assert.equal(res.status, 200);
      assert.equal(res.body.discoveries.length, 1);
      assert.equal(res.body.discoveries[0].discovery_id, "disc-alice-1");
    });

    it("10. GET /api/v1/account/royalties queries live contract claimable balance and pending withdrawals", async () => {
      const { agent: aliceAgent, accountId } = await createAuthAgent("alice");

      nearContract.setMockRpcClient(async (method, params) => {
        if (method === "query") {
          if (params.method_name === "get_claimable_balance") {
            return encodeViewResult("15000000000000000000000000"); // 15 NEAR in yocto
          }
          if (
            params.method_name === "get_pending_royalty_withdrawals" ||
            params.method_name === "get_pending_withdrawals"
          ) {
            return encodeViewResult("2000000000000000000000000"); // 2 NEAR in yocto
          }
        }
        throw new Error(`Unexpected RPC call: ${method}`);
      });

      const res = await aliceAgent.get("/api/v1/account/royalties");
      assert.equal(res.status, 200);
      assert.equal(res.body.accountId, accountId);
      // Pure yoctoNEAR string verification (no floating point)
      assert.equal(res.body.claimableBalanceYocto, "15000000000000000000000000");
      assert.equal(res.body.pendingWithdrawalsYocto, "2000000000000000000000000");
    });

    it("11. GET /api/v1/account/storage queries live contract storage balance", async () => {
      const { agent: aliceAgent, accountId } = await createAuthAgent("alice");

      nearContract.setMockRpcClient(async (method, params) => {
        if (method === "query") {
          if (params.method_name === "storage_balance_of") {
            return encodeViewResult({
              total: "30000000000000000000000",
              available: "10000000000000000000000",
            });
          }
          if (params.method_name === "storage_balance_bounds") {
            return encodeViewResult({
              min: "2700000000000000000000",
              max: null,
            });
          }
        }
        throw new Error(`Unexpected RPC call: ${method}`);
      });

      const res = await aliceAgent.get("/api/v1/account/storage");
      assert.equal(res.status, 200);
      assert.equal(res.body.accountId, accountId);
      assert.equal(res.body.storageBalance.total, "30000000000000000000000");
      assert.equal(res.body.bounds.min, "2700000000000000000000");
    });
  });

  describe("Transaction Intent Generation", () => {
    it("12. POST /api/v1/transactions/intents/create-offer prepares unsigned intent with exact gas & 0 deposit", async () => {
      const { agent: aliceAgent } = await createAuthAgent("alice");

      const payload = {
        offerId: "offer-intent-1",
        discoveryId: "disc-detail-101",
        scope: "commercial_exclusive",
        priceYocto: "5000000000000000000000000",
        termsHash: "4".repeat(64),
        durationDays: 365,
      };

      const res = await aliceAgent.post("/api/v1/transactions/intents/create-offer").send(payload);
      assert.equal(res.status, 200);
      assert.equal(res.body.contractId, config.NEAR_CONTRACT_ID);
      assert.equal(res.body.methodName, "create_license_offer");
      assert.equal(res.body.attachedDeposit, "0");
      assert.equal(res.body.args.offer_id, "offer-intent-1");
      assert.equal(res.body.args.price_yocto, "5000000000000000000000000");
      assert.equal(res.body.args.scope, "CommercialUse");

      const aiPayload = {
        offerId: "offer-intent-ai",
        discoveryId: "disc-detail-101",
        scope: "AI_TRAINING",
        priceYocto: "1000000000000000000000000",
        termsHash: "4".repeat(64),
        durationDays: 180,
      };
      const aiRes = await aliceAgent.post("/api/v1/transactions/intents/create-offer").send(aiPayload);
      assert.equal(aiRes.status, 200);
      assert.equal(aiRes.body.args.scope, "AiModelTraining");
    });

    it("13. POST /api/v1/transactions/intents/pay-license authoritatively matches on-chain price as attached deposit", async () => {
      const { agent: bobAgent } = await createAuthAgent("bob");
      const requestId = "req-approved-1";
      const exactPriceYocto = "7500000000000000000000000";

      nearContract.setMockRpcClient(async (method, params) => {
        if (method === "query" && params.method_name === "get_license_request") {
          return encodeViewResult({
            request_id: requestId,
            price_yocto: exactPriceYocto,
            accepted_terms_hash: "5".repeat(64),
            discovery_id: "disc-detail-101",
          });
        }
        throw new Error(`Unexpected RPC call: ${method}`);
      });

      const res = await bobAgent.post("/api/v1/transactions/intents/pay-license").send({ requestId });
      assert.equal(res.status, 200);
      assert.equal(res.body.methodName, "pay_for_license");
      // Attached deposit MUST be exact decimal string matching on-chain request price
      assert.equal(res.body.attachedDeposit, exactPriceYocto);
      assert.equal(res.body.args.request_id, requestId);
    });

    it("14. POST /api/v1/transactions/intents/:action rejects unknown actions with 400", async () => {
      const { agent: aliceAgent } = await createAuthAgent("alice");

      const res = await aliceAgent.post("/api/v1/transactions/intents/unsupported-action").send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.code, "ERR_INVALID_INTENT_ACTION");
    });
  });
});
