import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import crypto from "crypto";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { setupMockDatabase, clearMockDatabase } from "./helpers/mockDb.js";
import { setupMockR2, clearMockR2, r2Store } from "./helpers/mockR2.js";
import { getTestKeyPair, signNep413Payload } from "./helpers/testKeys.js";
import { createMockNearRpc } from "./helpers/mockRpc.js";
import { EvidenceUpload } from "../src/models/EvidenceUpload.js";
import { DiscoveryProjection } from "../src/models/DiscoveryProjection.js";
import { LicenseOfferProjection } from "../src/models/LicenseOfferProjection.js";
import { LicenseRequestProjection } from "../src/models/LicenseRequestProjection.js";
import { ChainTransaction } from "../src/models/ChainTransaction.js";
import {
  executeJsonRpc,
  NearRpcTimeoutError,
  setMockRpcClient,
  resetMockRpcClient,
} from "../src/services/nearContract.js";

before(() => {
  setupMockDatabase();
  setupMockR2();
});

beforeEach(() => {
  clearMockDatabase();
  clearMockR2();
  resetMockRpcClient();
});

after(() => {
  clearMockDatabase();
  clearMockR2();
  resetMockRpcClient();
});

/**
 * Helper to log in a test user and return an authenticated supertest agent.
 */
async function createAuthenticatedAgent(accountName = "alice") {
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

// ============================================================================
// PHASE 6: AUTOMATED FAILURE MATRIX SUITE (MOCK / SANDBOX PASS ONLY)
// ============================================================================

test("Failure Mode 1: MongoDB disconnection / database error fails closed with 500 without crashing", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  // Temporarily stub DiscoveryProjection.find to simulate a MongoDB disconnection error
  const origFind = DiscoveryProjection.find;
  DiscoveryProjection.find = () => {
    throw new Error("MongoNetworkError: connection 1 to 127.0.0.1:27017 closed");
  };

  try {
    const res = await agent.get("/api/v1/discoveries");
    assert.equal(res.status, 500);
    assert.ok(res.body.error);
    assert.equal(res.body.code, "ERR_INTERNAL_SERVER_ERROR");
  } finally {
    DiscoveryProjection.find = origFind;
  }
});

test("Failure Mode 2: R2 unavailable / storage service error returns 500/503 cleanly", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  // Temporarily install a failing mock S3 client simulating R2 outage
  const { setMockS3Client } = await import("../src/services/r2Storage.js");
  setMockS3Client({
    getPresignedUrl: async () => {
      throw new Error("R2StorageServiceUnavailable: Cloudflare R2 endpoint timed out");
    },
  });

  try {
    const res = await agent.post("/api/v1/discoveries/evidence/uploads").send({
      filename: "whitepaper.pdf",
      contentType: "application/pdf",
      fileSize: 1024,
      classification: "TECHNICAL_DOCUMENTATION",
    });

    assert.equal(res.status, 500);
    assert.ok(res.body.error);
  } finally {
    setupMockR2();
  }
});

test("Failure Mode 3: Failed upload / integrity mismatch aborts finalization with 400", async () => {
  const { agent, accountId } = await createAuthenticatedAgent("alice");

  const origBytes = Buffer.from("%PDF-1.4 original valid content");
  const uploadDoc = await EvidenceUpload.create({
    upload_id: "upl-mismatch-001",
    owner_account_id: accountId,
    original_filename: "dataset.pdf",
    declared_content_type: "application/pdf",
    expected_size: origBytes.length,
    r2_object_key: `temp/${accountId}/upl-mismatch-001/dataset.pdf`,
    status: "PENDING_UPLOAD",
    expires_at: new Date(Date.now() + 900000),
  });

  r2Store.put("knovara-evidence", uploadDoc.r2_object_key, origBytes, "application/pdf");

  // Simulate TOCTOU mid-flight mutation before destination copy
  r2Store.onBeforeCopy = () => {
    const corruptedBytes = Buffer.from("%PDF-1.4 CORRUPTED TAMPERED CONTENT!");
    r2Store.put("knovara-evidence", uploadDoc.r2_object_key, corruptedBytes, "application/pdf");
  };

  const res = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadDoc.upload_id}/complete`);
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "ERR_EVIDENCE_INTEGRITY_MISMATCH");

  // Verify status remains PENDING_UPLOAD and did NOT become VERIFIED
  const refreshed = await EvidenceUpload.findOne({ upload_id: uploadDoc.upload_id });
  assert.equal(refreshed.status, "PENDING_UPLOAD");
  assert.equal(refreshed.sha256_digest, undefined);
});

test("Failure Mode 4: Invalid or expired session is rejected with 401 Unauthorized", async () => {
  const app = createApp();
  const unauthenticatedAgent = request.agent(app);

  // 1. Session check returns unauthenticated
  const sessionRes = await unauthenticatedAgent.get("/api/v1/auth/session");
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.body.authenticated, false);

  // 2. Protected account discoveries route requires auth
  const accountRes = await unauthenticatedAgent.get("/api/v1/account/discoveries");
  assert.equal(accountRes.status, 401);
  assert.equal(accountRes.body.code, "ERR_UNAUTHENTICATED");

  // 3. Protected upload route requires auth
  const uploadRes = await unauthenticatedAgent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "spec.pdf",
    contentType: "application/pdf",
    fileSize: 1024,
  });
  assert.equal(uploadRes.status, 401);
  assert.equal(uploadRes.body.code, "ERR_UNAUTHENTICATED");
});

test("Failure Mode 5: Unauthorized discovery access is rejected with 403 Forbidden", async () => {
  const { agent: aliceAgent } = await createAuthenticatedAgent("alice");
  const { agent: bobAgent } = await createAuthenticatedAgent("bob");

  // Create discovery owned by alice
  await DiscoveryProjection.create({
    discovery_id: "disc-confidential-001",
    token_id: "tok-001",
    custodian_id: "alice.testnet",
    rights_controller_id: "alice.testnet",
    title: "Proprietary Fusion Model",
    registered_at: new Date(),
    sync_status: "SYNCED",
  });

  // Bob attempts to view all license requests for Alice's discovery
  const res = await bobAgent.get("/api/v1/licenses/discoveries/disc-confidential-001/requests");
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "ERR_FORBIDDEN_NOT_RIGHTS_CONTROLLER");
});

test("Failure Mode 6: Pending/non-final transaction returns 202 PENDING and does not synchronize state", async () => {
  const { agent, accountId } = await createAuthenticatedAgent("alice");

  setMockRpcClient({
    execute: async (method) => {
      if (method === "EXPERIMENTAL_tx_status" || method === "tx") {
        return {
          final_execution_status: "EXECUTED_OPTIMISTIC",
          status: { SuccessValue: "" },
          transaction: {
            hash: "5sFnwXhK15bB5K62vH7d6K86dY4C1g2h3j4k5m6n7p8q",
            signer_id: accountId,
            receiver_id: "koket-knovara-dev.testnet",
            actions: [{ FunctionCall: { method_name: "create_license_offer", args: "e30=", deposit: "0" } }],
          },
          receipts_outcome: [],
        };
      }
      return { result: [] };
    },
  });

  const res = await agent.post("/api/v1/transactions/reconcile").send({
    txHash: "5sFnwXhK15bB5K62vH7d6K86dY4C1g2h3j4k5m6n7p8q",
  });

  assert.equal(res.status, 202);
  assert.equal(res.body.status, "PENDING");

  // Confirm no offers created
  const offersCount = await LicenseOfferProjection.countDocuments();
  assert.equal(offersCount, 0);
});

test("Failure Mode 7: Failed NEAR receipt execution marks tx FAILED and never modifies projections", async () => {
  const { agent, accountId } = await createAuthenticatedAgent("alice");

  setMockRpcClient({
    execute: async (method) => {
      if (method === "EXPERIMENTAL_tx_status" || method === "tx") {
        return {
          final_execution_status: "FINAL",
          status: { SuccessValue: "" }, // Top-level appeared ok
          transaction: {
            hash: "8rKnwXhK15bB5K62vH7d6K86dY4C1g2h3j4k5m6n7p8q",
            signer_id: accountId,
            receiver_id: "koket-knovara-dev.testnet",
            actions: [{ FunctionCall: { method_name: "create_license_offer", args: "e30=", deposit: "0" } }],
          },
          receipts_outcome: [
            {
              outcome: {
                status: {
                  Failure: {
                    ActionError: {
                      kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: ERR_OFFER_EXISTS" } },
                    },
                  },
                },
                logs: [],
              },
            },
          ],
        };
      }
      return { result: [] };
    },
  });

  const res = await agent.post("/api/v1/transactions/reconcile").send({
    txHash: "8rKnwXhK15bB5K62vH7d6K86dY4C1g2h3j4k5m6n7p8q",
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILED");

  // Confirm transaction record shows FAILED
  const txRecord = await ChainTransaction.findOne({ transaction_hash: "8rKnwXhK15bB5K62vH7d6K86dY4C1g2h3j4k5m6n7p8q" });
  assert.ok(txRecord);
  assert.equal(txRecord.status, "FAILED");
});

test("Failure Mode 8: Duplicate reconciliation returns idempotent cached result without side-effects", async () => {
  const { agent, accountId } = await createAuthenticatedAgent("alice");

  const txHash = "9tKnwXhK15bB5K62vH7d6K86dY4C1g2h3j4k5m6n7p8q";

  // Pre-seed confirmed transaction with exact model fields
  await ChainTransaction.create({
    transaction_hash: txHash,
    signer_account_id: accountId,
    receiver_contract_id: "koket-knovara-dev.testnet",
    function_method: "create_license_offer",
    status: "CONFIRMED",
    final_execution_status: "FINAL",
    receipt_count: 1,
    created_at: new Date(),
  });

  // Call reconcile again
  const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "CONFIRMED");
  assert.equal(res.body.transactionHash, txHash);
  assert.equal(res.body.cached, true);

  // Assert exactly 1 record in collection
  const count = await ChainTransaction.countDocuments({ transaction_hash: txHash });
  assert.equal(count, 1);
});

test("Failure Mode 9: Inactive, unapproved, or expired license cannot download evidence files", async () => {
  const { agent: buyerAgent, accountId: buyerAccountId } = await createAuthenticatedAgent("bob");

  setMockRpcClient(async (method, params) => {
    if (method === "query" && params?.request_type === "call_function") {
      const licenseMap = {
        "req-unpaid-901": {
          request_id: "req-unpaid-901",
          discovery_id: "disc-901",
          token_id: "token-901",
          buyer_id: buyerAccountId,
          status: "Requested",
        },
        "req-expired-901": {
          request_id: "req-expired-901",
          discovery_id: "disc-901",
          token_id: "token-901",
          buyer_id: buyerAccountId,
          status: "Expired",
        },
        "req-active-901": {
          request_id: "req-active-901",
          discovery_id: "disc-901",
          token_id: "token-901",
          buyer_id: buyerAccountId,
          status: {
            Active: {
              activated_at: "1700000000000000000",
              expires_at: String((Date.now() + 86400000) * 1000000),
            },
          },
        },
      };

      if (params.method_name === "get_license") {
        const parsedArgs = JSON.parse(Buffer.from(params.args_base64, "base64").toString("utf8"));
        const record = licenseMap[parsedArgs.license_id];
        return {
          result: record ? Array.from(Buffer.from(JSON.stringify(record), "utf8")) : [],
        };
      }
    }
    return { result: [] };
  });

  // Create evidence file
  const evidence = await EvidenceUpload.create({
    upload_id: "upl-evidence-901",
    owner_account_id: "alice.testnet",
    original_filename: "secret_algorithm.py",
    declared_content_type: "text/x-python",
    expected_size: 500,
    actual_size: 500,
    r2_object_key: "evidence/alice.testnet/hash901/secret_algorithm.py",
    sha256_digest: "b".repeat(64),
    status: "ATTACHED",
    attached_discovery_id: "disc-901",
    expires_at: new Date(Date.now() + 86400000),
  });

  // 1. Test with Requested (unpaid, unapproved) license
  const reqUnpaid = await LicenseRequestProjection.create({
    request_id: "req-unpaid-901",
    offer_id: "off-901",
    discovery_id: "disc-901",
    buyer_id: buyerAccountId,
    rights_controller_id: "alice.testnet",
    status: "Requested",
    requested_at: new Date(),
  });

  const unpaidRes = await buyerAgent.post(`/api/v1/licenses/${reqUnpaid.request_id}/files/${evidence.upload_id}/download-url`);
  assert.equal(unpaidRes.status, 403);
  assert.equal(unpaidRes.body.code, "ERR_LICENSE_NOT_ACTIVE");

  // 2. Test with Expired license
  const reqExpired = await LicenseRequestProjection.create({
    request_id: "req-expired-901",
    offer_id: "off-901",
    discovery_id: "disc-901",
    buyer_id: buyerAccountId,
    rights_controller_id: "alice.testnet",
    status: "Expired",
    expires_at: new Date(Date.now() - 3600000), // Expired 1 hour ago
    requested_at: new Date(),
  });

  const expiredRes = await buyerAgent.post(`/api/v1/licenses/${reqExpired.request_id}/files/${evidence.upload_id}/download-url`);
  assert.equal(expiredRes.status, 403);
  assert.equal(expiredRes.body.code, "ERR_LICENSE_EXPIRED");

  // 3. Test with Active license - SUCCESS!
  const reqActive = await LicenseRequestProjection.create({
    request_id: "req-active-901",
    offer_id: "off-901",
    discovery_id: "disc-901",
    buyer_id: buyerAccountId,
    rights_controller_id: "alice.testnet",
    status: "Active",
    expires_at: new Date(Date.now() + 86400000), // Valid for 24 hours
    requested_at: new Date(),
    activated_at: new Date(),
  });

  const activeRes = await buyerAgent.post(`/api/v1/licenses/${reqActive.request_id}/files/${evidence.upload_id}/download-url`);
  assert.equal(activeRes.status, 200);
  assert.ok(activeRes.body.presignedUrl);
  assert.equal(activeRes.body.filename, "secret_algorithm.py");
  assert.equal(activeRes.body.sha256, "b".repeat(64));

  // 4. Test unauthorized buyer attempting download on Active license
  const { agent: intruderAgent } = await createAuthenticatedAgent("carol");
  const intruderRes = await intruderAgent.post(`/api/v1/licenses/${reqActive.request_id}/files/${evidence.upload_id}/download-url`);
  assert.equal(intruderRes.status, 403);
  assert.equal(intruderRes.body.code, "ERR_FORBIDDEN_NOT_LICENSEE");

  resetMockRpcClient();
});

test("Failure Mode 10: RPC timeout aborts and throws NearRpcTimeoutError with clean retry handling", async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount++;
    const err = new Error("Request timed out");
    err.name = "AbortError";
    throw err;
  };

  await assert.rejects(
    async () => {
      await executeJsonRpc(
        "query",
        { request_type: "call_function" },
        { fetchFn: mockFetch, timeoutMs: 50, maxRetries: 2 }
      );
    },
    (err) => {
      assert.ok(err instanceof NearRpcTimeoutError);
      assert.equal(err.status, 504);
      return true;
    }
  );

  // Assert retried up to maxRetries (1 initial + 2 retries = 3 attempts)
  assert.equal(callCount, 3);
});
