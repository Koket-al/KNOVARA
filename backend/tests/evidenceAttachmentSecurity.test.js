import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { setupMockDatabase, clearMockDatabase } from "./helpers/mockDb.js";
import { setupMockR2, clearMockR2, r2Store } from "./helpers/mockR2.js";
import { getTestKeyPair, signNep413Payload } from "./helpers/testKeys.js";
import { createMockNearRpc } from "./helpers/mockRpc.js";
import * as nearContract from "../src/services/nearContract.js";
import { EvidenceUpload } from "../src/models/EvidenceUpload.js";
import { EvidenceManifest } from "../src/models/EvidenceManifest.js";
import { DiscoveryProjection } from "../src/models/DiscoveryProjection.js";
import { LicenseRequestProjection } from "../src/models/LicenseRequestProjection.js";
import { config } from "../src/config/env.js";

const CONTRACT_ID = config.NEAR_CONTRACT_ID;

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
  return { agent, accountId, app };
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
  deposit = "0",
  gas = 50000000000000,
  actions = null,
  finalExecutionStatus = "FINAL",
}) {
  const receipts = [
    {
      id: "receipt-main-1",
      block_height: blockHeight,
      block_hash: blockHash,
      outcome: {
        executor_id: receiverId,
        status: receiptFailures.includes("receipt-main-1")
          ? { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: "Panic" } } } } }
          : { SuccessValue: "" },
        logs,
      },
    },
  ];

  const effectiveActions = actions || [
    {
      FunctionCall: {
        method_name: methodName,
        args: Buffer.from(JSON.stringify({ token_id: "knovara-pass-sec-01" })).toString("base64"),
        deposit,
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
      id: "tx-outcome-1",
      block_height: blockHeight,
      block_hash: blockHash,
      outcome: {
        status: typeof status === "object" ? status : { SuccessValue: "" },
        logs: [],
      },
    },
    receipts_outcome: receipts,
    final_execution_status: finalExecutionStatus,
  };
}

describe("Security Remediation: Evidence Attachment Lifecycle & Strict Download Authorization", () => {
  // =========================================================================
  // PART A — PREMATURE EVIDENCE ATTACHMENT REGRESSION TESTS
  // =========================================================================

  it("A1. prepare-registration leaves verified evidence strictly in status VERIFIED", async () => {
    const { agent, accountId } = await createAuthAgent("alice");

    // 1. Upload and complete evidence
    const fileBytes = Buffer.from("{\"data\":\"synthetic research evidence bytes\"}");
    const uploadRes = await agent.post("/api/v1/discoveries/evidence/uploads").send({
      filename: "test_research.json",
      contentType: "application/json",
      fileSize: fileBytes.length,
    });
    assert.equal(uploadRes.status, 201);
    const { uploadId, r2Key } = uploadRes.body;
    r2Store.put(config.R2_EVIDENCE_BUCKET, r2Key, fileBytes, "application/json");
    const completeRes = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});
    assert.equal(completeRes.status, 200);

    // Verify upload is VERIFIED before prepare-registration
    const beforePrep = await EvidenceUpload.findOne({ upload_id: uploadId });
    assert.equal(beforePrep.status, "VERIFIED");
    assert.equal(beforePrep.attached_discovery_id, undefined);

    // 2. Execute prepare-registration
    const prepRes = await agent.post("/api/v1/discoveries/prepare-registration").send({
      discoveryId: "disc-sec-001",
      tokenId: "tok-sec-001",
      custodianId: accountId,
      rightsControllerId: accountId,
      evidenceUploadIds: [uploadId],
      publicMetadata: {
        title: "Test Security Discovery",
        description: "Testing evidence attachment immutability",
      },
      beneficiarySplits: [{ account_id: accountId, basis_points: 10000 }],
    });
    assert.equal(prepRes.status, 200);

    // Verify evidence upload REMAINS VERIFIED and was NOT prematurely marked ATTACHED
    const afterPrep = await EvidenceUpload.findOne({ upload_id: uploadId });
    assert.equal(afterPrep.status, "VERIFIED");
    assert.equal(afterPrep.attached_discovery_id, undefined);
  });

  it("A2. Failed transaction outcome leaves evidence in status VERIFIED", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg41";

    const upload = await EvidenceUpload.create({
      upload_id: "upload-fail-test",
      owner_account_id: accountId,
      original_filename: "failed_tx.json",
      sha256_hash: "a".repeat(64),
      file_size_bytes: 512,
      status: "VERIFIED",
    });

    await EvidenceManifest.create({
      manifest_id: "manifest-fail-test",
      discovery_id: "disc-fail-001",
      evidence_manifest_hash: "b".repeat(64),
      evidence_item_ids: [upload.upload_id],
    });

    // Mock failed receipt
    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "register_discovery_and_mint",
      receiptFailures: ["receipt-main-1"],
    });

    nearContract.setMockRpcClient(async (method) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "FAILED");

    // Evidence must strictly remain VERIFIED
    const postReconcile = await EvidenceUpload.findOne({ upload_id: upload.upload_id });
    assert.equal(postReconcile.status, "VERIFIED");
    assert.equal(postReconcile.attached_discovery_id, undefined);
  });

  it("A3. Pending / non-final transaction leaves evidence in status VERIFIED", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg42";

    const upload = await EvidenceUpload.create({
      upload_id: "upload-pending-test",
      owner_account_id: accountId,
      original_filename: "pending.json",
      sha256_hash: "c".repeat(64),
      file_size_bytes: 256,
      status: "VERIFIED",
    });

    await EvidenceManifest.create({
      manifest_id: "manifest-pending-test",
      discovery_id: "disc-pending-001",
      evidence_manifest_hash: "d".repeat(64),
      evidence_item_ids: [upload.upload_id],
    });

    // Mock non-final execution status
    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "register_discovery_and_mint",
      finalExecutionStatus: "EXECUTED_OPTIMISTIC",
    });

    nearContract.setMockRpcClient(async (method) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 202);
    assert.equal(res.body.status, "PENDING");

    // Evidence must strictly remain VERIFIED
    const postReconcile = await EvidenceUpload.findOne({ upload_id: upload.upload_id });
    assert.equal(postReconcile.status, "VERIFIED");
    assert.equal(postReconcile.attached_discovery_id, undefined);
  });

  it("A4. Successful FINAL registration with matching hashes attaches only the correct uploads", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg43";
    const discoveryId = "disc-success-001";
    const manifestHash = "e".repeat(64);
    const referenceHash = "f".repeat(44);

    const uploadTarget = await EvidenceUpload.create({
      upload_id: "upload-target-001",
      owner_account_id: accountId,
      original_filename: "target.json",
      sha256_hash: "1".repeat(64),
      file_size_bytes: 1024,
      status: "VERIFIED",
    });

    const uploadUnrelated = await EvidenceUpload.create({
      upload_id: "upload-unrelated-002",
      owner_account_id: accountId,
      original_filename: "unrelated.json",
      sha256_hash: "2".repeat(64),
      file_size_bytes: 2048,
      status: "VERIFIED",
    });

    await EvidenceManifest.create({
      manifest_id: `manifest-${discoveryId}`,
      discovery_id: discoveryId,
      evidence_manifest_hash: manifestHash,
      evidence_item_ids: [uploadTarget.upload_id],
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "register_discovery_and_mint",
      logs: [
        `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"${accountId}","token_ids":["${discoveryId}"]}]}`,
      ],
      blockHeight: 300000,
    });

    const onChainDiscovery = {
      discovery_id: discoveryId,
      custodian_id: accountId,
      rights_controller_id: accountId,
      evidence_manifest_hash: manifestHash,
      beneficiary_splits: [{ account_id: accountId, basis_points: 10000 }],
      registered_at: "1700000000000000000",
    };

    const onChainNft = {
      token_id: discoveryId,
      owner_id: accountId,
      metadata: {
        title: "Success Discovery",
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

    // Assert target upload is ATTACHED to this discovery
    const checkedTarget = await EvidenceUpload.findOne({ upload_id: uploadTarget.upload_id });
    assert.equal(checkedTarget.status, "ATTACHED");
    assert.equal(checkedTarget.attached_discovery_id, discoveryId);

    // Assert unrelated upload remains VERIFIED and unattached
    const checkedUnrelated = await EvidenceUpload.findOne({ upload_id: uploadUnrelated.upload_id });
    assert.equal(checkedUnrelated.status, "VERIFIED");
    assert.equal(checkedUnrelated.attached_discovery_id, undefined);
  });

  // =========================================================================
  // PART B — STRICT EVIDENCE DOWNLOAD AUTHORIZATION TESTS
  // =========================================================================

  it("B1. Valid active license + valid attached evidence for the same discovery succeeds", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");

    const evidence = await EvidenceUpload.create({
      upload_id: "ev-valid-01",
      owner_account_id: "alice.testnet",
      original_filename: "valid_evidence.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash01/valid_evidence.json",
      sha256_digest: "1".repeat(64),
      status: "ATTACHED",
      attached_discovery_id: "disc-valid-01",
    });

    const license = await LicenseRequestProjection.create({
      request_id: "req-active-01",
      offer_id: "off-01",
      discovery_id: "disc-valid-01",
      buyer_id: buyerId,
      rights_controller_id: "alice.testnet",
      status: "Active",
      expires_at: new Date(Date.now() + 86400000),
      requested_at: new Date(),
      activated_at: new Date(),
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${license.request_id}/files/${evidence.upload_id}/download-url`);
    assert.equal(res.status, 200);
    assert.ok(res.body.presignedUrl);
    assert.equal(res.body.filename, "valid_evidence.json");
    assert.equal(res.body.sha256, "1".repeat(64));
  });

  it("B2. Valid active license + unattached VERIFIED evidence is rejected (403)", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");

    const unattachedEvidence = await EvidenceUpload.create({
      upload_id: "ev-unattached-02",
      owner_account_id: "alice.testnet",
      original_filename: "unattached.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash02/unattached.json",
      sha256_digest: "2".repeat(64),
      status: "VERIFIED",
      attached_discovery_id: null,
    });

    const license = await LicenseRequestProjection.create({
      request_id: "req-active-02",
      offer_id: "off-02",
      discovery_id: "disc-target-02",
      buyer_id: buyerId,
      rights_controller_id: "alice.testnet",
      status: "Active",
      expires_at: new Date(Date.now() + 86400000),
      requested_at: new Date(),
      activated_at: new Date(),
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${license.request_id}/files/${unattachedEvidence.upload_id}/download-url`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ERR_EVIDENCE_NOT_ATTACHED_OR_OUT_OF_SCOPE");
  });

  it("B3. Valid active license + evidence attached to another discovery is rejected (403)", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");

    const wrongDiscoveryEvidence = await EvidenceUpload.create({
      upload_id: "ev-other-disc-03",
      owner_account_id: "alice.testnet",
      original_filename: "other_disc.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash03/other_disc.json",
      sha256_digest: "3".repeat(64),
      status: "ATTACHED",
      attached_discovery_id: "disc-completely-different-999",
    });

    const license = await LicenseRequestProjection.create({
      request_id: "req-active-03",
      offer_id: "off-03",
      discovery_id: "disc-target-03",
      buyer_id: buyerId,
      rights_controller_id: "alice.testnet",
      status: "Active",
      expires_at: new Date(Date.now() + 86400000),
      requested_at: new Date(),
      activated_at: new Date(),
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${license.request_id}/files/${wrongDiscoveryEvidence.upload_id}/download-url`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ERR_EVIDENCE_NOT_ATTACHED_OR_OUT_OF_SCOPE");
  });

  it("B4. Evidence with status VERIFIED but matching attached_discovery_id is rejected (403)", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");

    // Edge case: status is VERIFIED, but attached_discovery_id matches
    const unfinalizedEvidence = await EvidenceUpload.create({
      upload_id: "ev-unfinalized-04",
      owner_account_id: "alice.testnet",
      original_filename: "unfinalized.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash04/unfinalized.json",
      sha256_digest: "4".repeat(64),
      status: "VERIFIED",
      attached_discovery_id: "disc-target-04",
    });

    const license = await LicenseRequestProjection.create({
      request_id: "req-active-04",
      offer_id: "off-04",
      discovery_id: "disc-target-04",
      buyer_id: buyerId,
      rights_controller_id: "alice.testnet",
      status: "Active",
      expires_at: new Date(Date.now() + 86400000),
      requested_at: new Date(),
      activated_at: new Date(),
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${license.request_id}/files/${unfinalizedEvidence.upload_id}/download-url`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ERR_EVIDENCE_NOT_ATTACHED_OR_OUT_OF_SCOPE");
  });

  it("B5. Inactive, expired and non-licensee access remains rejected", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");
    const { agent: intruderAgent } = await createAuthAgent("carol");

    const evidence = await EvidenceUpload.create({
      upload_id: "ev-lifecycle-05",
      owner_account_id: "alice.testnet",
      original_filename: "lifecycle.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash05/lifecycle.json",
      sha256_digest: "5".repeat(64),
      status: "ATTACHED",
      attached_discovery_id: "disc-target-05",
    });

    // 1. Requested (inactive)
    const reqInactive = await LicenseRequestProjection.create({
      request_id: "req-inactive-05",
      offer_id: "off-05",
      discovery_id: "disc-target-05",
      buyer_id: buyerId,
      rights_controller_id: "alice.testnet",
      status: "Requested",
      requested_at: new Date(),
    });
    const inactiveRes = await buyerAgent.post(`/api/v1/licenses/${reqInactive.request_id}/files/${evidence.upload_id}/download-url`);
    assert.equal(inactiveRes.status, 403);
    assert.equal(inactiveRes.body.code, "ERR_LICENSE_NOT_ACTIVE");

    // 2. Expired
    const reqExpired = await LicenseRequestProjection.create({
      request_id: "req-expired-05",
      offer_id: "off-05",
      discovery_id: "disc-target-05",
      buyer_id: buyerId,
      rights_controller_id: "alice.testnet",
      status: "Expired",
      expires_at: new Date(Date.now() - 3600000),
      requested_at: new Date(),
    });
    const expiredRes = await buyerAgent.post(`/api/v1/licenses/${reqExpired.request_id}/files/${evidence.upload_id}/download-url`);
    assert.equal(expiredRes.status, 403);
    assert.equal(expiredRes.body.code, "ERR_LICENSE_EXPIRED");

    // 3. Non-licensee (intruder carol accessing bob's active license)
    const reqActive = await LicenseRequestProjection.create({
      request_id: "req-active-05",
      offer_id: "off-05",
      discovery_id: "disc-target-05",
      buyer_id: buyerId,
      rights_controller_id: "alice.testnet",
      status: "Active",
      expires_at: new Date(Date.now() + 86400000),
      requested_at: new Date(),
      activated_at: new Date(),
    });
    const intruderRes = await intruderAgent.post(`/api/v1/licenses/${reqActive.request_id}/files/${evidence.upload_id}/download-url`);
    assert.equal(intruderRes.status, 403);
    assert.equal(intruderRes.body.code, "ERR_FORBIDDEN_NOT_LICENSEE");
  });
});
