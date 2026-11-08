import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { setupMockDatabase, clearMockDatabase } from "./helpers/mockDb.js";
import { setupMockR2, clearMockR2 } from "./helpers/mockR2.js";
import { getTestKeyPair, signNep413Payload } from "./helpers/testKeys.js";
import { createMockNearRpc } from "./helpers/mockRpc.js";
import * as nearContract from "../src/services/nearContract.js";
import { ChainTransaction } from "../src/models/ChainTransaction.js";
import { DiscoveryProjection } from "../src/models/DiscoveryProjection.js";
import { LicenseOfferProjection } from "../src/models/LicenseOfferProjection.js";
import { LicenseRequestProjection } from "../src/models/LicenseRequestProjection.js";
import { AccountRoyaltyProjection } from "../src/models/AccountRoyaltyProjection.js";
import { EvidenceUpload } from "../src/models/EvidenceUpload.js";
import { EvidenceManifest } from "../src/models/EvidenceManifest.js";
import { config } from "../src/config/env.js";

const CONTRACT_ID = config.NEAR_CONTRACT_ID; // "koket-knovara-dev.testnet"

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

function buildMockTxStatus({
  hash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg41",
  signerId = "alice.testnet",
  receiverId = CONTRACT_ID,
  methodName = "register_discovery_and_mint",
  status = { SuccessValue: "" },
  receiptFailures = [],
  logs = [],
  blockHeight = 100000,
  blockHash = "mock-block-hash-1",
  deposit = null,
  gas = 30000000000000,
  actions = null,
  finalExecutionStatus = "FINAL",
}) {
  const receipts = [];

  // Main execution receipt
  receipts.push({
    id: "receipt-main-1",
    block_height: blockHeight,
    block_hash: blockHash,
    outcome: {
      executor_id: receiverId,
      status: receiptFailures.includes("receipt-main-1")
        ? { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: "Panic" } } } } }
        : { SuccessValue: "" },
      logs: logs,
    },
  });

  let effectiveDeposit = deposit;
  if (effectiveDeposit === null) {
    if (methodName === "pay_for_license" || methodName === "pay_license") {
      effectiveDeposit = "5000000000000000000000000";
    } else if (methodName === "storage_deposit") {
      effectiveDeposit = "1000000000000000000000000";
    } else if (methodName === "storage_withdraw" || methodName === "storage_unregister") {
      effectiveDeposit = "1";
    } else {
      effectiveDeposit = "0";
    }
  }

  const effectiveActions = actions || [
    {
      FunctionCall: {
        method_name: methodName,
        args: Buffer.from(JSON.stringify({})).toString("base64"),
        deposit: effectiveDeposit,
        gas,
      },
    },
  ];

  return {
    transaction: {
      hash,
      signer_id: signerId,
      receiver_id: receiverId,
      actions: effectiveActions,
    },
    transaction_outcome: {
      block_height: blockHeight,
      block_hash: blockHash,
      id: "tx-outcome-1",
      outcome: {
        executor_id: signerId,
        status: { SuccessReceiptId: "receipt-main-1" },
        logs: [],
      },
    },
    receipts_outcome: receipts,
    final_execution_status: finalExecutionStatus,
    status,
    block_height: blockHeight,
  };
}

describe("Transaction Verification & State Synchronization", () => {
  it("1. Rejects unauthenticated reconciliation request with 401", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/transactions/reconcile")
      .send({ txHash: "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg41" });

    assert.equal(res.status, 401);
  });

  it("2. Rejects missing or empty txHash with 400", async () => {
    const { agent } = await createAuthAgent("alice");
    const res = await agent.post("/api/v1/transactions/reconcile").send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Transaction hash is required");
  });

  it("3. Rejects malformed base58 transaction hash with 400", async () => {
    const { agent } = await createAuthAgent("alice");
    // Invalid characters (0, O, I, l are not in Base58)
    const res = await agent
      .post("/api/v1/transactions/reconcile")
      .send({ txHash: "Invalid-Base58-Hash-0OIl" });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, "ERR_INVALID_TX_HASH");
  });

  it("4. Rejects transaction when signer does not match authenticated user (403)", async () => {
    const { agent } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg41";

    // Mock RPC returning transaction signed by bob.testnet
    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: "bob.testnet",
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") {
        return mockTx;
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ERR_FORBIDDEN_TX_SIGNER_MISMATCH");
  });

  it("5. Rejects transaction when receiver is not KNOVARA contract (400)", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg41";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      receiverId: "other-contract.testnet",
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") {
        return mockTx;
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "ERR_INVALID_CONTRACT_RECEIVER");
  });

  it("6. Rejects transaction with unsupported method name (400)", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg41";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      receiverId: CONTRACT_ID,
      methodName: "unsupported_foreign_method",
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") {
        return mockTx;
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "ERR_UNSUPPORTED_CONTRACT_METHOD");
  });

  it("7. Handles pending transaction (mempool lag) with 202 and status PENDING", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg41";

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") {
        const err = new Error("[-32000] Server error: transaction doesn't exist");
        err.name = "NearRpcError";
        throw err;
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 202);
    assert.equal(res.body.status, "PENDING");
  });

  it("8. Handles failed transaction execution outcome safely (status FAILED)", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg41";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      status: {
        Failure: {
          ActionError: {
            kind: {
              FunctionCallError: {
                ExecutionError: "Smart contract panicked: Insufficient deposit",
              },
            },
          },
        },
      },
    });

    nearContract.setMockRpcClient(async (method) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "FAILED");
    assert.ok((res.body.error || "").includes("Insufficient deposit"));

    const storedTx = await ChainTransaction.findOne({ transaction_hash: txHash });
    assert.equal(storedTx.status, "FAILED");
  });

  it("9. Detects asynchronous receipt failure even if top-level transaction succeeded", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg41";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      status: { SuccessValue: "" }, // Top-level appears successful
      receiptFailures: ["receipt-main-1"], // But inner receipt execution failed!
    });

    nearContract.setMockRpcClient(async (method) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "FAILED");
    assert.ok((res.body.error || "").includes("Panic"));
  });

  it("10. Discovery registration reconciliation updates projection to SYNCED and attaches evidence", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg41";
    const discoveryId = "knovara-disc-test-101";
    const manifestHash = "a".repeat(64);
    const referenceHash = "b".repeat(64);

    // Create an existing verified evidence upload in DB
    await EvidenceUpload.create({
      upload_id: "upload-abc-123",
      owner_account_id: accountId,
      original_filename: "dataset.csv",
      sha256_hash: "c".repeat(64),
      file_size_bytes: 1024,
      status: "VERIFIED",
    });

    await EvidenceManifest.create({
      manifest_id: "manifest-test-1",
      discovery_id: discoveryId,
      evidence_manifest_hash: manifestHash,
      evidence_item_ids: ["upload-abc-123"],
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "register_discovery_and_mint",
      logs: [
        `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"${accountId}","token_ids":["${discoveryId}"]}]}`,
      ],
      blockHeight: 200000,
    });

    const onChainDiscovery = {
      discovery_id: discoveryId,
      custodian_id: accountId,
      rights_controller_id: accountId,
      public_metadata: {
        title: "Novel CRISPR Vector",
        description: "High specificity genomic modification vector",
        category: "BIOTECHNOLOGY",
        tags: ["crispr", "genetics"],
      },
      evidence_manifest_hash: manifestHash,
      reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
      reference_hash: referenceHash,
      beneficiary_splits: [{ account_id: accountId, basis_points: 10000 }],
      lineage_parents: [],
      registered_at: "1700000000000000000",
    };

    const onChainNft = {
      token_id: discoveryId,
      owner_id: accountId,
      metadata: {
        title: "Novel CRISPR Vector",
        reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
        reference_hash: referenceHash,
      },
    };

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query") {
        if (params.method_name === "get_discovery") {
          return encodeViewResult(onChainDiscovery);
        }
        if (params.method_name === "nft_token") {
          return encodeViewResult(onChainNft);
        }
      }
      throw new Error(`Unexpected RPC call: ${method} ${JSON.stringify(params)}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "CONFIRMED");

    // Verify DiscoveryProjection was created
    const proj = await DiscoveryProjection.findOne({ discovery_id: discoveryId });
    assert.ok(proj);
    assert.equal(proj.sync_status, "SYNCED");
    assert.equal(proj.custodian_id, accountId);
    assert.equal(proj.public_metadata.title, "Novel CRISPR Vector");

    // Verify EvidenceUpload was transitioned to ATTACHED
    const upload = await EvidenceUpload.findOne({ upload_id: "upload-abc-123" });
    assert.equal(upload.status, "ATTACHED");
  });

  it("11. License offer creation reconciliation creates active offer projection", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg42";
    const offerId = "offer-test-1";
    const discoveryId = "knovara-disc-test-101";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "create_license_offer",
      logs: [
        `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_offer_created","data":[{"offer_id":"${offerId}","discovery_id":"${discoveryId}","rights_controller_id":"${accountId}","scope":"commercial_exclusive","price_yocto":"5000000000000000000000000","terms_hash":"${"d".repeat(64)}","duration_days":365}]}`,
      ],
      blockHeight: 200100,
    });

    const onChainOffer = {
      offer_id: offerId,
      discovery_id: discoveryId,
      rights_controller_id: accountId,
      scope: "commercial_exclusive",
      price_yocto: "5000000000000000000000000",
      terms_hash: "d".repeat(64),
      duration_days: 365,
      is_active: true,
      created_at: "1700000100000000000",
    };

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query" && params.method_name === "get_license_offer") {
        return encodeViewResult(onChainOffer);
      }
      throw new Error(`Unexpected RPC call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const offerProj = await LicenseOfferProjection.findOne({ offer_id: offerId });
    assert.ok(offerProj);
    assert.equal(offerProj.is_active, true);
    assert.equal(offerProj.price_yocto, "5000000000000000000000000");
  });

  it("12. License request approval reconciliation updates request to Approved", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg43";
    const requestId = "req-test-1";
    const offerId = "offer-test-1";
    const discoveryId = "knovara-disc-test-101";
    const buyerId = "bob.testnet";

    // Seed existing requested projection
    await LicenseRequestProjection.create({
      request_id: requestId,
      offer_id: offerId,
      discovery_id: discoveryId,
      buyer_id: buyerId,
      rights_controller_id: accountId,
      scope: "commercial_exclusive",
      price_yocto: "5000000000000000000000000",
      accepted_terms_hash: "d".repeat(64),
      status: "Requested",
      block_height: 200050,
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "approve_license_request",
      logs: [
        `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_approved","data":[{"request_id":"${requestId}","offer_id":"${offerId}","discovery_id":"${discoveryId}","buyer_id":"${buyerId}","rights_controller_id":"${accountId}","payment_deadline":"1700100000000000000"}]}`,
      ],
      blockHeight: 200200,
    });

    const onChainRequest = {
      request_id: requestId,
      offer_id: offerId,
      discovery_id: discoveryId,
      buyer_id: buyerId,
      rights_controller_id: accountId,
      scope: "commercial_exclusive",
      price_yocto: "5000000000000000000000000",
      accepted_terms_hash: "d".repeat(64),
      status: "Approved",
      requested_at: "1700000050000000000",
      payment_deadline: "1700100000000000000",
      rejection_reason: null,
      activated_at: null,
      expires_at: null,
    };

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query" && params.method_name === "get_license_request") {
        return encodeViewResult(onChainRequest);
      }
      throw new Error(`Unexpected RPC call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const reqProj = await LicenseRequestProjection.findOne({ request_id: requestId });
    assert.ok(reqProj);
    assert.equal(reqProj.status, "Approved");
    assert.ok(reqProj.payment_deadline);
    assert.equal(
      reqProj.payment_deadline.toISOString(),
      new Date(Number("1700100000000000000") / 1_000_000).toISOString()
    );
  });

  it("13. License payment and activation reconciliation activates license and updates royalties", async () => {
    const { agent, accountId: buyerId } = await createAuthAgent("bob");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg44";
    const requestId = "req-test-1";
    const offerId = "offer-test-1";
    const discoveryId = "knovara-disc-test-101";
    const controllerId = "alice.testnet";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: buyerId,
      methodName: "pay_for_license",
      logs: [
        `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_paid","data":[{"request_id":"${requestId}","discovery_id":"${discoveryId}","buyer_id":"${buyerId}","price_yocto":"5000000000000000000000000"}]}`,
        `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_activated","data":[{"request_id":"${requestId}","discovery_id":"${discoveryId}","buyer_id":"${buyerId}","activated_at":"1700050000000000000","expires_at":"1731586000000000000"}]}`,
        `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"royalties_allocated","data":[{"request_id":"${requestId}","discovery_id":"${discoveryId}","total_amount":"5000000000000000000000000","allocations_count":1}]}`,
      ],
      blockHeight: 200300,
    });

    const onChainActiveRequest = {
      request_id: requestId,
      offer_id: offerId,
      discovery_id: discoveryId,
      buyer_id: buyerId,
      rights_controller_id: controllerId,
      scope: "commercial_exclusive",
      price_yocto: "5000000000000000000000000",
      accepted_terms_hash: "d".repeat(64),
      status: "Active",
      requested_at: "1700000050000000000",
      payment_deadline: "1700100000000000000",
      rejection_reason: null,
      activated_at: "1700050000000000000",
      expires_at: "1731586000000000000",
    };

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query") {
        if (params.method_name === "get_license_request") {
          return encodeViewResult(onChainActiveRequest);
        }
        if (params.method_name === "get_discovery") {
          return encodeViewResult({
            discovery_id: discoveryId,
            rights_controller_id: controllerId,
            beneficiary_splits: [{ account_id: controllerId, basis_points: 10000 }],
          });
        }
        if (params.method_name === "get_claimable_balance") {
          return encodeViewResult("5000000000000000000000000");
        }
        if (params.method_name === "get_pending_withdrawals") {
          return encodeViewResult("0");
        }
      }
      throw new Error(`Unexpected RPC call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const reqProj = await LicenseRequestProjection.findOne({ request_id: requestId });
    assert.ok(reqProj);
    assert.equal(reqProj.status, "Active");
    assert.ok(reqProj.activated_at);
    assert.equal(
      reqProj.activated_at.toISOString(),
      new Date(Number("1700050000000000000") / 1_000_000).toISOString()
    );

    const royaltyProj = await AccountRoyaltyProjection.findOne({ account_id: controllerId });
    assert.ok(royaltyProj);
    assert.equal(royaltyProj.claimable_balance_yocto, "5000000000000000000000000");
  });

  it("14. Stale update prevention: earlier block_height cannot overwrite newer projection", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const offerId = "offer-stale-test";
    const discoveryId = "knovara-disc-test-101";

    // Existing projection has block_height 300,000 (deactivated)
    await LicenseOfferProjection.create({
      offer_id: offerId,
      discovery_id: discoveryId,
      rights_controller_id: accountId,
      scope: "academic",
      price_yocto: "1000000000000000000000000",
      terms_hash: "e".repeat(64),
      duration_days: 90,
      is_active: false,
      block_height: 300000,
    });

    // Incoming tx has earlier block_height 250,000 trying to mark it active
    const staleTxHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg45";
    const mockTx = buildMockTxStatus({
      hash: staleTxHash,
      signerId: accountId,
      methodName: "create_license_offer",
      logs: [
        `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_offer_created","data":[{"offer_id":"${offerId}","discovery_id":"${discoveryId}","rights_controller_id":"${accountId}","scope":"academic","price_yocto":"1000000000000000000000000","terms_hash":"${"e".repeat(64)}","duration_days":90}]}`,
      ],
      blockHeight: 250000,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query" && params.method_name === "get_license_offer") {
        return encodeViewResult({
          offer_id: offerId,
          discovery_id: discoveryId,
          rights_controller_id: accountId,
          scope: "academic",
          price_yocto: "1000000000000000000000000",
          terms_hash: "e".repeat(64),
          duration_days: 90,
          is_active: true,
        });
      }
      throw new Error(`Unexpected RPC call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash: staleTxHash });
    assert.equal(res.status, 200);

    // Verify projection was NOT overwritten
    const offer = await LicenseOfferProjection.findOne({ offer_id: offerId });
    assert.equal(offer.is_active, false);
    assert.equal(offer.block_height, 300000);
  });

  it("15. Idempotent reconciliation returns existing recorded result on repeated calls", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg46";

    await ChainTransaction.create({
      transaction_hash: txHash,
      signer_account_id: accountId,
      receiver_contract_id: CONTRACT_ID,
      function_method: "create_license_offer",
      status: "CONFIRMED",
      block_height: 150000,
    });

    // Reconcile should return cached confirmation without querying RPC
    let rpcCalled = false;
    nearContract.setMockRpcClient(async () => {
      rpcCalled = true;
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "CONFIRMED");
    assert.equal(rpcCalled, false);
  });

  it("16. GET /api/v1/transactions/:txHash returns transaction status", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg47";

    await ChainTransaction.create({
      transaction_hash: txHash,
      signer_account_id: accountId,
      receiver_contract_id: CONTRACT_ID,
      function_method: "withdraw_earnings",
      status: "CONFIRMED",
      block_height: 180000,
    });

    const res = await agent.get(`/api/v1/transactions/${txHash}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "CONFIRMED");
    assert.equal(res.body.functionMethod, "withdraw_earnings");
  });

  // =========================================================================
  // STAGE 4.4 REMEDIATION REGRESSION TESTS
  // =========================================================================

  it("17. Approval reconciliation after payment has already projected Active cannot revert status", async () => {
    const { agent, accountId: controllerId } = await createAuthAgent("alice");
    const requestId = "req-race-1";
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg51";

    // Seed projection already Active from earlier payment
    await LicenseRequestProjection.create({
      request_id: requestId,
      offer_id: "off-race-1",
      discovery_id: "disc-race-1",
      buyer_id: "bob.testnet",
      status: "Active",
      activated_at: new Date(1700050000000),
      expires_at: new Date(1731586000000),
      block_height: 250000,
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: controllerId,
      methodName: "approve_license_request",
      blockHeight: 250000,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query" && params.method_name === "get_license_request") {
        return encodeViewResult({
          request_id: requestId,
          offer_id: "off-race-1",
          discovery_id: "disc-race-1",
          buyer_id: "bob.testnet",
          status: { Active: { activated_at: "1700050000000000000", expires_at: "1731586000000000000" } },
        });
      }
      throw new Error(`Unexpected call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const proj = await LicenseRequestProjection.findOne({ request_id: requestId });
    assert.equal(proj.status, "Active");
  });

  it("18. An older Requested state arriving after Active cannot revert status", async () => {
    const { agent, accountId: buyerId } = await createAuthAgent("bob");
    const requestId = "req-race-2";
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg52";

    await LicenseRequestProjection.create({
      request_id: requestId,
      offer_id: "off-race-2",
      discovery_id: "disc-race-2",
      buyer_id: buyerId,
      status: "Active",
      block_height: 250100,
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: buyerId,
      methodName: "request_license",
      blockHeight: 250050,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query" && params.method_name === "get_license_request") {
        return encodeViewResult({
          request_id: requestId,
          offer_id: "off-race-2",
          discovery_id: "disc-race-2",
          buyer_id: buyerId,
          status: "Requested",
        });
      }
      throw new Error(`Unexpected call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const proj = await LicenseRequestProjection.findOne({ request_id: requestId });
    assert.equal(proj.status, "Active");
  });

  it("19. An old Active update arriving after Expired cannot revert Expired", async () => {
    const { agent, accountId: buyerId } = await createAuthAgent("bob");
    const requestId = "req-race-3";
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg53";

    await LicenseRequestProjection.create({
      request_id: requestId,
      offer_id: "off-race-3",
      discovery_id: "disc-race-3",
      buyer_id: buyerId,
      status: "Expired",
      block_height: 260000,
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: buyerId,
      methodName: "pay_for_license",
      blockHeight: 259000,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query" && params.method_name === "get_license_request") {
        return encodeViewResult({
          request_id: requestId,
          offer_id: "off-race-3",
          discovery_id: "disc-race-3",
          buyer_id: buyerId,
          status: { Active: { activated_at: "1700050000000000000", expires_at: "1731586000000000000" } },
        });
      }
      throw new Error(`Unexpected call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const proj = await LicenseRequestProjection.findOne({ request_id: requestId });
    assert.equal(proj.status, "Expired");
  });

  it("20. A Rejected request receiving a later invalid transition cannot become Active", async () => {
    const { agent, accountId: buyerId } = await createAuthAgent("bob");
    const requestId = "req-race-4";
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg54";

    await LicenseRequestProjection.create({
      request_id: requestId,
      offer_id: "off-race-4",
      discovery_id: "disc-race-4",
      buyer_id: buyerId,
      status: "Rejected",
      block_height: 240000,
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: buyerId,
      methodName: "pay_for_license",
      blockHeight: 240100,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query" && params.method_name === "get_license_request") {
        return encodeViewResult({
          request_id: requestId,
          status: { Rejected: { reason: "Terms rejected by controller" } },
        });
      }
      throw new Error(`Unexpected call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.body.status, "RECONCILIATION_REQUIRED");

    const proj = await LicenseRequestProjection.findOne({ request_id: requestId });
    assert.equal(proj.status, "Rejected");
  });

  it("21. Unknown on-chain status values fail closed with RECONCILIATION_REQUIRED", async () => {
    const { agent, accountId: controllerId } = await createAuthAgent("alice");
    const requestId = "req-unknown-1";
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg55";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: controllerId,
      methodName: "approve_license_request",
      logs: [
        `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_approved","data":[{"request_id":"${requestId}","offer_id":"off-u-1","discovery_id":"disc-u-1","buyer_id":"bob.testnet","rights_controller_id":"${controllerId}","payment_deadline":"1700100000000000000"}]}`,
      ],
      blockHeight: 200000,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query" && params.method_name === "get_license_request") {
        return encodeViewResult({
          request_id: requestId,
          status: "CORRUPTED_NON_EXISTENT_STATUS",
        });
      }
      throw new Error(`Unexpected call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.body.status, "RECONCILIATION_REQUIRED");
    assert.ok(res.body.details?.error?.includes("ERR_UNRECOGNIZED_LICENSE_STATUS"));

    const proj = await LicenseRequestProjection.findOne({ request_id: requestId });
    assert.equal(proj, null);
  });

  it("22. Concurrent updates to the same license request preserve monotonic progress", async () => {
    const { agent: agentAlice, accountId: aliceId } = await createAuthAgent("alice");
    const { agent: agentBob, accountId: bobId } = await createAuthAgent("bob");
    const requestId = "req-concurrent-1";
    const txHashApprove = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg56";
    const txHashPay = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg57";

    await LicenseRequestProjection.create({
      request_id: requestId,
      offer_id: "off-c-1",
      discovery_id: "disc-c-1",
      buyer_id: bobId,
      status: "Requested",
      block_height: 200000,
    });

    const mockTxApprove = buildMockTxStatus({
      hash: txHashApprove,
      signerId: aliceId,
      methodName: "approve_license_request",
      logs: [
        `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_approved","data":[{"request_id":"${requestId}","offer_id":"off-c-1","discovery_id":"disc-c-1","buyer_id":"${bobId}","rights_controller_id":"${aliceId}","payment_deadline":"1700100000000000000"}]}`,
      ],
      blockHeight: 200010,
    });

    const mockTxPay = buildMockTxStatus({
      hash: txHashPay,
      signerId: bobId,
      methodName: "pay_for_license",
      logs: [
        `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_paid","data":[{"request_id":"${requestId}","discovery_id":"disc-c-1","buyer_id":"${bobId}","price_yocto":"5000000000000000000000000"}]}`,
        `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_activated","data":[{"request_id":"${requestId}","discovery_id":"disc-c-1","buyer_id":"${bobId}","activated_at":"1700050000000000000","expires_at":"1731586000000000000"}]}`,
      ],
      blockHeight: 200010,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") {
        const queryHash = Array.isArray(params) ? params[0] : params.tx_hash;
        return queryHash === txHashApprove ? mockTxApprove : mockTxPay;
      }
      if (method === "query") {
        if (params.method_name === "get_license_request") {
          return encodeViewResult({
            request_id: requestId,
            offer_id: "off-c-1",
            discovery_id: "disc-c-1",
            buyer_id: bobId,
            status: { Active: { activated_at: "1700050000000000000", expires_at: "1731586000000000000" } },
          });
        }
        if (params.method_name === "get_discovery") {
          return encodeViewResult({
            discovery_id: "disc-c-1",
            rights_controller_id: aliceId,
            beneficiary_splits: [{ account_id: aliceId, basis_points: 10000 }],
          });
        }
        if (params.method_name === "get_claimable_balance") {
          return encodeViewResult("1000000000000000000000000");
        }
      }
      throw new Error(`Unexpected call: ${method}`);
    });

    // Execute concurrently
    const [resPay, resApprove] = await Promise.all([
      agentBob.post("/api/v1/transactions/reconcile").send({ txHash: txHashPay }),
      agentAlice.post("/api/v1/transactions/reconcile").send({ txHash: txHashApprove }),
    ]);

    assert.equal(resPay.status, 200);
    assert.equal(resApprove.status, 200);

    const proj = await LicenseRequestProjection.findOne({ request_id: requestId });
    assert.equal(proj.status, "Active");
  });

  it("23. Same-block transactions with equal block_height preserve forward progress", async () => {
    const { agent, accountId: controllerId } = await createAuthAgent("alice");
    const requestId = "req-same-block-1";
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg58";

    // Request is already Active in the same block (220000)
    await LicenseRequestProjection.create({
      request_id: requestId,
      offer_id: "off-sb-1",
      discovery_id: "disc-sb-1",
      buyer_id: "bob.testnet",
      status: "Active",
      block_height: 220000,
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: controllerId,
      methodName: "approve_license_request",
      blockHeight: 220000,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query" && params.method_name === "get_license_request") {
        return encodeViewResult({
          request_id: requestId,
          offer_id: "off-sb-1",
          discovery_id: "disc-sb-1",
          buyer_id: "bob.testnet",
          status: { Active: { activated_at: "1700050000000000000", expires_at: "1731586000000000000" } },
        });
      }
      throw new Error(`Unexpected call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const proj = await LicenseRequestProjection.findOne({ request_id: requestId });
    assert.equal(proj.status, "Active");
  });

  it("24. Missing final_execution_status is treated as PENDING", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg59";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "create_license_offer",
      finalExecutionStatus: null,
    });

    nearContract.setMockRpcClient(async () => mockTx);

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 202);
    assert.equal(res.body.status, "PENDING");

    const record = await ChainTransaction.findOne({ transaction_hash: txHash });
    assert.equal(record.status, "PENDING");
  });

  it("25. EXECUTED_OPTIMISTIC and other non-FINAL milestones are treated as PENDING", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg6a";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "create_license_offer",
      finalExecutionStatus: "EXECUTED_OPTIMISTIC",
    });

    nearContract.setMockRpcClient(async () => mockTx);

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 202);
    assert.equal(res.body.status, "PENDING");
    assert.equal(res.body.milestone, "EXECUTED_OPTIMISTIC");

    const record = await ChainTransaction.findOne({ transaction_hash: txHash });
    assert.equal(record.status, "PENDING");
  });

  it("26. FINAL successful execution is recorded as CONFIRMED", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg61";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "create_license_offer",
      finalExecutionStatus: "FINAL",
      logs: [
        `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_offer_created","data":[{"offer_id":"off-final-1","discovery_id":"disc-1","rights_controller_id":"${accountId}","scope":"commercial_exclusive","price_yocto":"5000000000000000000000000","terms_hash":"${"a".repeat(64)}","duration_days":365}]}`,
      ],
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query" && params.method_name === "get_license_offer") {
        return encodeViewResult({
          offer_id: "off-final-1",
          discovery_id: "disc-1",
          rights_controller_id: accountId,
          scope: "commercial_exclusive",
          price_yocto: "5000000000000000000000000",
          terms_hash: "a".repeat(64),
          duration_days: 365,
          is_active: true,
          created_at: "1700000000000000000",
        });
      }
      throw new Error(`Unexpected call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "CONFIRMED");

    const record = await ChainTransaction.findOne({ transaction_hash: txHash });
    assert.equal(record.status, "CONFIRMED");
  });

  it("27. Top-level transaction failure records FAILED and NEVER calls synchronizeState", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg62";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "create_license_offer",
      status: { Failure: { ActionError: { kind: "BadSignature" } } },
    });

    nearContract.setMockRpcClient(async () => mockTx);

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "FAILED");

    const record = await ChainTransaction.findOne({ transaction_hash: txHash });
    assert.equal(record.status, "FAILED");

    // Projections must remain untouched
    const offers = await LicenseOfferProjection.find({});
    assert.equal(offers.length, 0);
  });

  it("28. Receipt execution failure records FAILED and NEVER calls synchronizeState", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg63";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "create_license_offer",
      status: { SuccessReceiptId: "receipt-main-1" },
      receiptFailures: ["receipt-main-1"],
    });

    nearContract.setMockRpcClient(async () => mockTx);

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "FAILED");

    const record = await ChainTransaction.findOne({ transaction_hash: txHash });
    assert.equal(record.status, "FAILED");

    const offers = await LicenseOfferProjection.find({});
    assert.equal(offers.length, 0);
  });

  it("29. Missing or incomplete execution data (empty actions) is rejected safely", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg64";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      actions: [],
    });

    nearContract.setMockRpcClient(async () => mockTx);

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "ERR_INVALID_TRANSACTION_ACTIONS");
  });

  it("30. Transaction containing multiple actions is rejected with ERR_INVALID_TRANSACTION_ACTIONS", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg65";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      actions: [
        { FunctionCall: { method_name: "create_license_offer", args: "e30=", deposit: "0", gas: 30000000000000 } },
        { Transfer: { deposit: "1000000000000000000000000" } },
      ],
    });

    nearContract.setMockRpcClient(async () => mockTx);

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "ERR_INVALID_TRANSACTION_ACTIONS");
  });

  it("31. Single unauthorized action type (Transfer) is rejected with ERR_NO_FUNCTION_CALL_ACTION", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg66";

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      actions: [{ Transfer: { deposit: "1000000000000000000000000" } }],
    });

    nearContract.setMockRpcClient(async () => mockTx);

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "ERR_NO_FUNCTION_CALL_ACTION");
  });

  it("32. Invalid method-specific deposits are strictly rejected", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHashA = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg67";
    const txHashB = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg68";
    const txHashC = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg69";

    // Subtest A: pay_for_license with 0 deposit
    const mockTxA = buildMockTxStatus({
      hash: txHashA,
      signerId: accountId,
      methodName: "pay_for_license",
      deposit: "0",
    });
    nearContract.setMockRpcClient(async () => mockTxA);
    const resA = await agent.post("/api/v1/transactions/reconcile").send({ txHash: txHashA });
    assert.equal(resA.status, 400);
    assert.equal(resA.body.code, "ERR_PAYMENT_DEPOSIT_REQUIRED");

    // Subtest B: approve_license_request with attached deposit
    const mockTxB = buildMockTxStatus({
      hash: txHashB,
      signerId: accountId,
      methodName: "approve_license_request",
      deposit: "1000000000000000000000000",
    });
    nearContract.setMockRpcClient(async () => mockTxB);
    const resB = await agent.post("/api/v1/transactions/reconcile").send({ txHash: txHashB });
    assert.equal(resB.status, 400);
    assert.equal(resB.body.code, "ERR_NON_PAYABLE_METHOD");

    // Subtest C: storage_withdraw with 0 deposit (must be 1 yocto)
    const mockTxC = buildMockTxStatus({
      hash: txHashC,
      signerId: accountId,
      methodName: "storage_withdraw",
      deposit: "0",
    });
    nearContract.setMockRpcClient(async () => mockTxC);
    const resC = await agent.post("/api/v1/transactions/reconcile").send({ txHash: txHashC });
    assert.equal(resC.status, 400);
    assert.equal(resC.body.code, "ERR_ONE_YOCTO_REQUIRED");
  });
});
