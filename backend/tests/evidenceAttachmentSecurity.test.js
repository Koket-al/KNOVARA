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
import { PublicMetadataDescriptor } from "../src/models/PublicMetadataDescriptor.js";
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

  it("A4. Successful FINAL registration with matching hashes and descriptor attaches only the correct uploads", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg43";
    const discoveryId = "disc-success-001";
    const tokenId = "pass-token-001"; // Distinct token_id
    const manifestHash = "e".repeat(64);
    const referenceHash = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
    const referenceUrl = `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`;

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

    await PublicMetadataDescriptor.create({
      discovery_id: discoveryId,
      reference: referenceUrl,
      reference_hash: referenceHash,
      canonical_descriptor_json: JSON.stringify({ title: "Success Discovery" }),
      sha256_digest: "a".repeat(64),
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "register_discovery_and_mint",
      logs: [
        `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"${accountId}","token_ids":["${tokenId}"]}]}`,
      ],
      blockHeight: 300000,
    });

    const onChainDiscovery = {
      discovery_id: discoveryId,
      token_id: tokenId,
      custodian_id: accountId,
      rights_controller_id: accountId,
      evidence_manifest_hash: manifestHash,
      beneficiary_splits: [{ account_id: accountId, basis_points: 10000 }],
      registered_at: "1700000000000000000",
    };

    const onChainNft = {
      token_id: tokenId,
      owner_id: accountId,
      metadata: {
        title: "Success Discovery",
        reference: referenceUrl,
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

    // Assert DiscoveryProjection is created and SYNCED
    const proj = await DiscoveryProjection.findOne({ discovery_id: discoveryId });
    assert.ok(proj);
    assert.equal(proj.sync_status, "SYNCED");
    assert.equal(proj.token_id, tokenId);
  });

  it("A5. Missing EvidenceManifest fails closed with RECONCILIATION_REQUIRED and leaves evidence VERIFIED", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg44";
    const discoveryId = "disc-no-manifest-001";
    const tokenId = "pass-no-manifest-001";

    const upload = await EvidenceUpload.create({
      upload_id: "upload-no-manifest-001",
      owner_account_id: accountId,
      original_filename: "doc.pdf",
      sha256_hash: "3".repeat(64),
      file_size_bytes: 512,
      status: "VERIFIED",
    });

    // Seed ONLY descriptor, omit EvidenceManifest
    await PublicMetadataDescriptor.create({
      discovery_id: discoveryId,
      reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
      reference_hash: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
      canonical_descriptor_json: "{}",
      sha256_digest: "b".repeat(64),
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "register_discovery_and_mint",
      logs: [
        `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"${accountId}","token_ids":["${tokenId}"]}]}`,
      ],
      blockHeight: 300001,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query") {
        if (params.method_name === "get_discovery") {
          return encodeViewResult({
            discovery_id: discoveryId,
            token_id: tokenId,
            custodian_id: accountId,
            rights_controller_id: accountId,
            evidence_manifest_hash: "f".repeat(64),
            beneficiary_splits: [{ account_id: accountId, basis_points: 10000 }],
            registered_at: "1700000000000000000",
          });
        }
        if (params.method_name === "nft_token") {
          return encodeViewResult({
            token_id: tokenId,
            metadata: {
              reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
              reference_hash: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
            },
          });
        }
      }
      throw new Error(`Unexpected RPC call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const proj = await DiscoveryProjection.findOne({ discovery_id: discoveryId });
    assert.ok(proj);
    assert.equal(proj.sync_status, "RECONCILIATION_REQUIRED");

    const checkedUpload = await EvidenceUpload.findOne({ upload_id: upload.upload_id });
    assert.equal(checkedUpload.status, "VERIFIED");
    assert.equal(checkedUpload.attached_discovery_id, undefined);
  });

  it("A6. Missing PublicMetadataDescriptor fails closed with RECONCILIATION_REQUIRED and leaves evidence VERIFIED", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg45";
    const discoveryId = "disc-no-desc-001";
    const tokenId = "pass-no-desc-001";

    const upload = await EvidenceUpload.create({
      upload_id: "upload-no-desc-001",
      owner_account_id: accountId,
      original_filename: "doc2.pdf",
      sha256_hash: "4".repeat(64),
      file_size_bytes: 512,
      status: "VERIFIED",
    });

    // Seed ONLY manifest, omit PublicMetadataDescriptor
    await EvidenceManifest.create({
      manifest_id: `manifest-${discoveryId}`,
      discovery_id: discoveryId,
      evidence_manifest_hash: "a".repeat(64),
      evidence_item_ids: [upload.upload_id],
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "register_discovery_and_mint",
      logs: [
        `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"${accountId}","token_ids":["${tokenId}"]}]}`,
      ],
      blockHeight: 300002,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query") {
        if (params.method_name === "get_discovery") {
          return encodeViewResult({
            discovery_id: discoveryId,
            token_id: tokenId,
            custodian_id: accountId,
            rights_controller_id: accountId,
            evidence_manifest_hash: "a".repeat(64),
            beneficiary_splits: [{ account_id: accountId, basis_points: 10000 }],
            registered_at: "1700000000000000000",
          });
        }
        if (params.method_name === "nft_token") {
          return encodeViewResult({
            token_id: tokenId,
            metadata: {
              reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
              reference_hash: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
            },
          });
        }
      }
      throw new Error(`Unexpected RPC call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const proj = await DiscoveryProjection.findOne({ discovery_id: discoveryId });
    assert.ok(proj);
    assert.equal(proj.sync_status, "RECONCILIATION_REQUIRED");

    const checkedUpload = await EvidenceUpload.findOne({ upload_id: upload.upload_id });
    assert.equal(checkedUpload.status, "VERIFIED");
    assert.equal(checkedUpload.attached_discovery_id, undefined);
  });

  it("A7. Manifest hash mismatch fails closed with RECONCILIATION_REQUIRED and leaves evidence VERIFIED", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg46";
    const discoveryId = "disc-bad-man-hash-001";
    const tokenId = "pass-bad-man-hash-001";

    const upload = await EvidenceUpload.create({
      upload_id: "upload-bad-man-001",
      owner_account_id: accountId,
      original_filename: "doc3.pdf",
      sha256_hash: "5".repeat(64),
      file_size_bytes: 512,
      status: "VERIFIED",
    });

    await EvidenceManifest.create({
      manifest_id: `manifest-${discoveryId}`,
      discovery_id: discoveryId,
      evidence_manifest_hash: "1".repeat(64), // Mismatch
      evidence_item_ids: [upload.upload_id],
    });

    await PublicMetadataDescriptor.create({
      discovery_id: discoveryId,
      reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
      reference_hash: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
      canonical_descriptor_json: "{}",
      sha256_digest: "c".repeat(64),
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "register_discovery_and_mint",
      logs: [
        `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"${accountId}","token_ids":["${tokenId}"]}]}`,
      ],
      blockHeight: 300003,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query") {
        if (params.method_name === "get_discovery") {
          return encodeViewResult({
            discovery_id: discoveryId,
            token_id: tokenId,
            custodian_id: accountId,
            rights_controller_id: accountId,
            evidence_manifest_hash: "2".repeat(64), // Does NOT match "1".repeat(64)
            beneficiary_splits: [{ account_id: accountId, basis_points: 10000 }],
            registered_at: "1700000000000000000",
          });
        }
        if (params.method_name === "nft_token") {
          return encodeViewResult({
            token_id: tokenId,
            metadata: {
              reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
              reference_hash: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
            },
          });
        }
      }
      throw new Error(`Unexpected RPC call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const proj = await DiscoveryProjection.findOne({ discovery_id: discoveryId });
    assert.equal(proj.sync_status, "RECONCILIATION_REQUIRED");

    const checkedUpload = await EvidenceUpload.findOne({ upload_id: upload.upload_id });
    assert.equal(checkedUpload.status, "VERIFIED");
    assert.equal(checkedUpload.attached_discovery_id, undefined);
  });

  it("A8. Reference hash mismatch fails closed with RECONCILIATION_REQUIRED and leaves evidence VERIFIED", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg47";
    const discoveryId = "disc-bad-ref-hash-001";
    const tokenId = "pass-bad-ref-hash-001";

    const upload = await EvidenceUpload.create({
      upload_id: "upload-bad-ref-001",
      owner_account_id: accountId,
      original_filename: "doc4.pdf",
      sha256_hash: "6".repeat(64),
      file_size_bytes: 512,
      status: "VERIFIED",
    });

    await EvidenceManifest.create({
      manifest_id: `manifest-${discoveryId}`,
      discovery_id: discoveryId,
      evidence_manifest_hash: "a".repeat(64),
      evidence_item_ids: [upload.upload_id],
    });

    await PublicMetadataDescriptor.create({
      discovery_id: discoveryId,
      reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
      reference_hash: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=", // Expected
      canonical_descriptor_json: "{}",
      sha256_digest: "d".repeat(64),
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "register_discovery_and_mint",
      logs: [
        `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"${accountId}","token_ids":["${tokenId}"]}]}`,
      ],
      blockHeight: 300004,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query") {
        if (params.method_name === "get_discovery") {
          return encodeViewResult({
            discovery_id: discoveryId,
            token_id: tokenId,
            custodian_id: accountId,
            rights_controller_id: accountId,
            evidence_manifest_hash: "a".repeat(64),
            beneficiary_splits: [{ account_id: accountId, basis_points: 10000 }],
            registered_at: "1700000000000000000",
          });
        }
        if (params.method_name === "nft_token") {
          return encodeViewResult({
            token_id: tokenId,
            metadata: {
              reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
              reference_hash: "WRONG_REF_HASH_WRONG_REF_HASH_WRONG_REF_12=", // Mismatch
            },
          });
        }
      }
      throw new Error(`Unexpected RPC call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const proj = await DiscoveryProjection.findOne({ discovery_id: discoveryId });
    assert.equal(proj.sync_status, "RECONCILIATION_REQUIRED");

    const checkedUpload = await EvidenceUpload.findOne({ upload_id: upload.upload_id });
    assert.equal(checkedUpload.status, "VERIFIED");
    assert.equal(checkedUpload.attached_discovery_id, undefined);
  });

  it("A9. Metadata URL mismatch fails closed with RECONCILIATION_REQUIRED and leaves evidence VERIFIED", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg48";
    const discoveryId = "disc-bad-url-001";
    const tokenId = "pass-bad-url-001";

    const upload = await EvidenceUpload.create({
      upload_id: "upload-bad-url-001",
      owner_account_id: accountId,
      original_filename: "doc5.pdf",
      sha256_hash: "7".repeat(64),
      file_size_bytes: 512,
      status: "VERIFIED",
    });

    await EvidenceManifest.create({
      manifest_id: `manifest-${discoveryId}`,
      discovery_id: discoveryId,
      evidence_manifest_hash: "a".repeat(64),
      evidence_item_ids: [upload.upload_id],
    });

    await PublicMetadataDescriptor.create({
      discovery_id: discoveryId,
      reference: `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`,
      reference_hash: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
      canonical_descriptor_json: "{}",
      sha256_digest: "e".repeat(64),
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "register_discovery_and_mint",
      logs: [
        `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"${accountId}","token_ids":["${tokenId}"]}]}`,
      ],
      blockHeight: 300005,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query") {
        if (params.method_name === "get_discovery") {
          return encodeViewResult({
            discovery_id: discoveryId,
            token_id: tokenId,
            custodian_id: accountId,
            rights_controller_id: accountId,
            evidence_manifest_hash: "a".repeat(64),
            beneficiary_splits: [{ account_id: accountId, basis_points: 10000 }],
            registered_at: "1700000000000000000",
          });
        }
        if (params.method_name === "nft_token") {
          return encodeViewResult({
            token_id: tokenId,
            metadata: {
              reference: `https://attacker-domain.com/fake/meta`, // URL mismatch
              reference_hash: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
            },
          });
        }
      }
      throw new Error(`Unexpected RPC call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);

    const proj = await DiscoveryProjection.findOne({ discovery_id: discoveryId });
    assert.equal(proj.sync_status, "RECONCILIATION_REQUIRED");

    const checkedUpload = await EvidenceUpload.findOne({ upload_id: upload.upload_id });
    assert.equal(checkedUpload.status, "VERIFIED");
    assert.equal(checkedUpload.attached_discovery_id, undefined);
  });

  it("A10. Discovery registration with distinct discovery_id and token_id queries contract using actual token_id from nft_mint", async () => {
    const { agent, accountId } = await createAuthAgent("alice");
    const txHash = "6zQd824d54uB6D4yfEPgq5WvMBh5B2R6oA9vYhR5Gg49";
    const discoveryId = "knovara-disc-live-001";
    const tokenId = "knovara-pass-live-001"; // Explicitly distinct
    const manifestHash = "f".repeat(64);
    const referenceHash = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
    const referenceUrl = `https://api.knovara.test/api/v1/metadata/${discoveryId}/1.0.0`;

    const upload = await EvidenceUpload.create({
      upload_id: "upload-distinct-001",
      owner_account_id: accountId,
      original_filename: "dataset.parquet",
      sha256_hash: "8".repeat(64),
      file_size_bytes: 4096,
      status: "VERIFIED",
    });

    await EvidenceManifest.create({
      manifest_id: `manifest-${discoveryId}`,
      discovery_id: discoveryId,
      evidence_manifest_hash: manifestHash,
      evidence_item_ids: [upload.upload_id],
    });

    await PublicMetadataDescriptor.create({
      discovery_id: discoveryId,
      reference: referenceUrl,
      reference_hash: referenceHash,
      canonical_descriptor_json: "{}",
      sha256_digest: "9".repeat(64),
    });

    const mockTx = buildMockTxStatus({
      hash: txHash,
      signerId: accountId,
      methodName: "register_discovery_and_mint",
      logs: [
        `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"${accountId}","token_ids":["${tokenId}"]}]}`,
      ],
      blockHeight: 300006,
    });

    let queriedTokenIdDiscovery = null;
    let queriedTokenIdNft = null;

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "tx" || method === "EXPERIMENTAL_tx_status") return mockTx;
      if (method === "query") {
        if (params.method_name === "get_discovery") {
          const args = JSON.parse(Buffer.from(params.args_base64, "base64").toString("utf8"));
          queriedTokenIdDiscovery = args.token_id;
          return encodeViewResult({
            discovery_id: discoveryId,
            token_id: tokenId,
            custodian_id: accountId,
            rights_controller_id: accountId,
            evidence_manifest_hash: manifestHash,
            beneficiary_splits: [{ account_id: accountId, basis_points: 10000 }],
            registered_at: "1700000000000000000",
          });
        }
        if (params.method_name === "nft_token") {
          const args = JSON.parse(Buffer.from(params.args_base64, "base64").toString("utf8"));
          queriedTokenIdNft = args.token_id;
          return encodeViewResult({
            token_id: tokenId,
            metadata: {
              reference: referenceUrl,
              reference_hash: referenceHash,
            },
          });
        }
      }
      throw new Error(`Unexpected RPC call: ${method}`);
    });

    const res = await agent.post("/api/v1/transactions/reconcile").send({ txHash });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "CONFIRMED");

    // Assert that the contract was queried with the actual NFT token_id, not discovery_id
    assert.equal(queriedTokenIdDiscovery, tokenId);
    assert.equal(queriedTokenIdNft, tokenId);

    // Verify DiscoveryProjection records both IDs accurately
    const proj = await DiscoveryProjection.findOne({ discovery_id: discoveryId });
    assert.ok(proj);
    assert.equal(proj.discovery_id, discoveryId);
    assert.equal(proj.token_id, tokenId);
    assert.equal(proj.sync_status, "SYNCED");

    // Evidence must be ATTACHED
    const checkedUpload = await EvidenceUpload.findOne({ upload_id: upload.upload_id });
    assert.equal(checkedUpload.status, "ATTACHED");
    assert.equal(checkedUpload.attached_discovery_id, discoveryId);
  });

  // =========================================================================
  // PART B — AUTHORITATIVE EVIDENCE DOWNLOAD AUTHORIZATION (MOCKED UNIT TESTS)
  // =========================================================================

  it("B1. Actual on-chain Active response + valid attached evidence for exact licensed discovery succeeds", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");
    const discoveryId = "disc-valid-01";
    const licenseId = "req-active-01";

    const evidence = await EvidenceUpload.create({
      upload_id: "ev-valid-01",
      owner_account_id: "alice.testnet",
      original_filename: "valid_evidence.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash01/valid_evidence.json",
      sha256_digest: "1".repeat(64),
      status: "ATTACHED",
      attached_discovery_id: discoveryId,
    });

    await LicenseRequestProjection.create({
      request_id: licenseId,
      offer_id: "off-01",
      discovery_id: discoveryId,
      buyer_id: buyerId,
      rights_controller_id: "alice.testnet",
      status: "Active",
      expires_at: new Date(Date.now() + 86400000),
      requested_at: new Date(),
      activated_at: new Date(),
    });

    // Mock on-chain get_license returning Active status enum
    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "query" && params?.request_type === "call_function") {
        if (params.method_name === "get_license") {
          return encodeViewResult({
            request_id: licenseId,
            license_id: licenseId,
            offer_id: "off-01",
            discovery_id: discoveryId,
            token_id: "token-01",
            buyer_id: buyerId,
            status: {
              Active: {
                activated_at: "1700000000000000000",
                expires_at: String((Date.now() + 86400000) * 1000000),
              },
            },
          });
        }
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${licenseId}/files/${evidence.upload_id}/download-url`);
    assert.equal(res.status, 200);
    assert.ok(res.body.presignedUrl);
    assert.equal(res.body.filename, "valid_evidence.json");
    assert.equal(res.body.sha256, "1".repeat(64));
  });

  it("B2. Actual on-chain Expired response is rejected (403 ERR_LICENSE_EXPIRED)", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");
    const discoveryId = "disc-valid-02";
    const licenseId = "req-expired-02";

    const evidence = await EvidenceUpload.create({
      upload_id: "ev-expired-02",
      owner_account_id: "alice.testnet",
      original_filename: "expired_evidence.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash02/expired_evidence.json",
      sha256_digest: "2".repeat(64),
      status: "ATTACHED",
      attached_discovery_id: discoveryId,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "query" && params?.request_type === "call_function") {
        if (params.method_name === "get_license") {
          return encodeViewResult({
            request_id: licenseId,
            discovery_id: discoveryId,
            buyer_id: buyerId,
            status: "Expired",
          });
        }
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${licenseId}/files/${evidence.upload_id}/download-url`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ERR_LICENSE_EXPIRED");
  });

  it("B3. Actual on-chain non-Active response (Requested) is rejected (403 ERR_LICENSE_NOT_ACTIVE)", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");
    const discoveryId = "disc-valid-03";
    const licenseId = "req-requested-03";

    const evidence = await EvidenceUpload.create({
      upload_id: "ev-requested-03",
      owner_account_id: "alice.testnet",
      original_filename: "requested.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash03/requested.json",
      sha256_digest: "3".repeat(64),
      status: "ATTACHED",
      attached_discovery_id: discoveryId,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "query" && params?.request_type === "call_function") {
        if (params.method_name === "get_license") {
          return encodeViewResult({
            request_id: licenseId,
            discovery_id: discoveryId,
            buyer_id: buyerId,
            status: "Requested",
          });
        }
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${licenseId}/files/${evidence.upload_id}/download-url`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ERR_LICENSE_NOT_ACTIVE");
  });

  it("B4. NEAR RPC failure fails closed (503 ERR_CHAIN_VERIFICATION_UNAVAILABLE)", async () => {
    const { agent: buyerAgent } = await createAuthAgent("bob");
    const licenseId = "req-rpc-fail-04";

    nearContract.setMockRpcClient(async () => {
      throw new Error("NEAR Testnet RPC Connection Timeout (504 Gateway)");
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${licenseId}/files/any-file-id/download-url`);
    assert.equal(res.status, 503);
    assert.equal(res.body.code, "ERR_CHAIN_VERIFICATION_UNAVAILABLE");
  });

  it("B5. Missing MongoDB projection with valid on-chain Active record succeeds", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");
    const discoveryId = "disc-missing-proj-05";
    const licenseId = "req-missing-proj-05";
    const tokenId = "token-pass-05";

    const evidence = await EvidenceUpload.create({
      upload_id: "ev-missing-proj-05",
      owner_account_id: "alice.testnet",
      original_filename: "unprojected.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash05/unprojected.json",
      sha256_digest: "5".repeat(64),
      status: "ATTACHED",
      attached_discovery_id: discoveryId,
    });

    // NO LicenseRequestProjection seeded in MongoDB!
    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "query" && params?.request_type === "call_function") {
        if (params.method_name === "get_license") {
          return encodeViewResult({
            request_id: licenseId,
            discovery_id: discoveryId,
            token_id: tokenId,
            buyer_id: buyerId,
            status: {
              Active: {
                activated_at: "1700000000000000000",
                expires_at: String((Date.now() + 86400000) * 1000000),
              },
            },
          });
        }
        if (params.method_name === "get_discovery") {
          return encodeViewResult({
            discovery_id: discoveryId,
            token_id: tokenId,
            rights_controller_id: "alice.testnet",
          });
        }
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${licenseId}/files/${evidence.upload_id}/download-url`);
    assert.equal(res.status, 200);
    assert.ok(res.body.presignedUrl);
  });

  it("B6. Stale Active projection in MongoDB but on-chain Expired is rejected (403 ERR_LICENSE_EXPIRED)", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");
    const discoveryId = "disc-stale-06";
    const licenseId = "req-stale-06";

    const evidence = await EvidenceUpload.create({
      upload_id: "ev-stale-06",
      owner_account_id: "alice.testnet",
      original_filename: "stale.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash06/stale.json",
      sha256_digest: "6".repeat(64),
      status: "ATTACHED",
      attached_discovery_id: discoveryId,
    });

    // MongoDB has STALE "Active" projection
    await LicenseRequestProjection.create({
      request_id: licenseId,
      offer_id: "off-06",
      discovery_id: discoveryId,
      buyer_id: buyerId,
      rights_controller_id: "alice.testnet",
      status: "Active",
      expires_at: new Date(Date.now() + 86400000),
      requested_at: new Date(),
    });

    // BUT Authoritative NEAR state reports Expired!
    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "query" && params?.request_type === "call_function") {
        if (params.method_name === "get_license") {
          return encodeViewResult({
            request_id: licenseId,
            discovery_id: discoveryId,
            buyer_id: buyerId,
            status: "Expired",
          });
        }
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${licenseId}/files/${evidence.upload_id}/download-url`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ERR_LICENSE_EXPIRED");
  });

  it("B7. Valid active license + unattached VERIFIED evidence is rejected (403 ERR_EVIDENCE_NOT_ATTACHED_OR_OUT_OF_SCOPE)", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");
    const discoveryId = "disc-target-07";
    const licenseId = "req-active-07";

    const unattachedEvidence = await EvidenceUpload.create({
      upload_id: "ev-unattached-07",
      owner_account_id: "alice.testnet",
      original_filename: "unattached.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash07/unattached.json",
      sha256_digest: "7".repeat(64),
      status: "VERIFIED", // Not ATTACHED
      attached_discovery_id: null,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "query" && params?.request_type === "call_function") {
        if (params.method_name === "get_license") {
          return encodeViewResult({
            request_id: licenseId,
            discovery_id: discoveryId,
            buyer_id: buyerId,
            status: {
              Active: {
                activated_at: "1700000000000000000",
                expires_at: String((Date.now() + 86400000) * 1000000),
              },
            },
          });
        }
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${licenseId}/files/${unattachedEvidence.upload_id}/download-url`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ERR_EVIDENCE_NOT_ATTACHED_OR_OUT_OF_SCOPE");
  });

  it("B8. Valid active license + evidence attached to another discovery is rejected (403 ERR_EVIDENCE_NOT_ATTACHED_OR_OUT_OF_SCOPE)", async () => {
    const { agent: buyerAgent, accountId: buyerId } = await createAuthAgent("bob");
    const discoveryId = "disc-target-08";
    const licenseId = "req-active-08";

    const otherDiscoveryEvidence = await EvidenceUpload.create({
      upload_id: "ev-other-disc-08",
      owner_account_id: "alice.testnet",
      original_filename: "other_disc.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash08/other_disc.json",
      sha256_digest: "8".repeat(64),
      status: "ATTACHED",
      attached_discovery_id: "disc-completely-different-999", // Cross-discovery
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "query" && params?.request_type === "call_function") {
        if (params.method_name === "get_license") {
          return encodeViewResult({
            request_id: licenseId,
            discovery_id: discoveryId,
            buyer_id: buyerId,
            status: {
              Active: {
                activated_at: "1700000000000000000",
                expires_at: String((Date.now() + 86400000) * 1000000),
              },
            },
          });
        }
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await buyerAgent.post(`/api/v1/licenses/${licenseId}/files/${otherDiscoveryEvidence.upload_id}/download-url`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ERR_EVIDENCE_NOT_ATTACHED_OR_OUT_OF_SCOPE");
  });

  it("B9. Non-licensee caller (intruder) is rejected (403 ERR_FORBIDDEN_NOT_LICENSEE)", async () => {
    const { agent: intruderAgent } = await createAuthAgent("carol");
    const discoveryId = "disc-target-09";
    const licenseId = "req-active-09";

    const evidence = await EvidenceUpload.create({
      upload_id: "ev-target-09",
      owner_account_id: "alice.testnet",
      original_filename: "target.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash09/target.json",
      sha256_digest: "9".repeat(64),
      status: "ATTACHED",
      attached_discovery_id: discoveryId,
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "query" && params?.request_type === "call_function") {
        if (params.method_name === "get_license") {
          return encodeViewResult({
            request_id: licenseId,
            discovery_id: discoveryId,
            token_id: "token-09",
            buyer_id: "bob.testnet", // Bob is buyer, not Carol
            status: {
              Active: {
                activated_at: "1700000000000000000",
                expires_at: String((Date.now() + 86400000) * 1000000),
              },
            },
          });
        }
        if (params.method_name === "get_discovery") {
          return encodeViewResult({
            discovery_id: discoveryId,
            rights_controller_id: "alice.testnet", // Alice is rights controller
          });
        }
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await intruderAgent.post(`/api/v1/licenses/${licenseId}/files/${evidence.upload_id}/download-url`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ERR_FORBIDDEN_NOT_LICENSEE");
  });

  it("B10. Rights controller caller on active license is permitted (200)", async () => {
    const { agent: rcAgent, accountId: rcId } = await createAuthAgent("alice");
    const discoveryId = "disc-target-10";
    const licenseId = "req-active-10";

    const evidence = await EvidenceUpload.create({
      upload_id: "ev-target-10",
      owner_account_id: rcId,
      original_filename: "rc_data.json",
      actual_size: 512,
      r2_object_key: "evidence/alice.testnet/hash10/rc_data.json",
      sha256_digest: "a".repeat(64),
      status: "ATTACHED",
      attached_discovery_id: discoveryId,
    });

    await LicenseRequestProjection.create({
      request_id: licenseId,
      offer_id: "off-10",
      discovery_id: discoveryId,
      buyer_id: "bob.testnet",
      rights_controller_id: rcId,
      status: "Active",
      expires_at: new Date(Date.now() + 86400000),
      requested_at: new Date(),
    });

    nearContract.setMockRpcClient(async (method, params) => {
      if (method === "query" && params?.request_type === "call_function") {
        if (params.method_name === "get_license") {
          return encodeViewResult({
            request_id: licenseId,
            discovery_id: discoveryId,
            token_id: "token-10",
            buyer_id: "bob.testnet",
            status: {
              Active: {
                activated_at: "1700000000000000000",
                expires_at: String((Date.now() + 86400000) * 1000000),
              },
            },
          });
        }
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const res = await rcAgent.post(`/api/v1/licenses/${licenseId}/files/${evidence.upload_id}/download-url`);
    assert.equal(res.status, 200);
    assert.ok(res.body.presignedUrl);
  });
});
