import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import crypto from "crypto";
import { createApp } from "../src/app.js";
import { setupMockDatabase, clearMockDatabase } from "./helpers/mockDb.js";
import { setupMockR2, clearMockR2, r2Store } from "./helpers/mockR2.js";
import { getTestKeyPair, signNep413Payload } from "./helpers/testKeys.js";
import { createMockNearRpc } from "./helpers/mockRpc.js";
import { EvidenceUpload } from "../src/models/EvidenceUpload.js";
import { EvidenceManifest } from "../src/models/EvidenceManifest.js";
import { PublicMetadataDescriptor } from "../src/models/PublicMetadataDescriptor.js";
import { config } from "../src/config/env.js";

before(() => {
  setupMockDatabase();
  setupMockR2();
});

beforeEach(() => {
  clearMockDatabase();
  clearMockR2();
});

after(() => {
  clearMockDatabase();
  clearMockR2();
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

// =========================================================================
// EVIDENCE UPLOAD REQUEST & SECURITY TESTS
// =========================================================================

test("1. Unauthenticated evidence upload request is rejected with 401", async () => {
  const app = createApp();
  const res = await request(app).post("/api/v1/discoveries/evidence/uploads").send({
    filename: "dataset.csv",
    contentType: "text/csv",
    fileSize: 1024,
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.code, "ERR_UNAUTHENTICATED");
});

test("2. Authenticated evidence upload request succeeds and returns presigned PUT URL", async () => {
  const { agent, accountId } = await createAuthenticatedAgent("alice");

  const res = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "lab_notebook.pdf",
    contentType: "application/pdf",
    fileSize: 2048,
    classification: "TECHNICAL_DOCUMENTATION",
  });

  assert.equal(res.status, 201);
  assert.ok(res.body.uploadId);
  assert.ok(res.body.presignedUrl);
  assert.ok(res.body.r2Key);
  assert.equal(res.body.expiresIn, config.R2_UPLOAD_URL_TTL_SECONDS);
  assert.equal(res.body.requiredHeaders["Content-Type"], "application/pdf");

  // Verify stored record in database
  const uploadDoc = await EvidenceUpload.findOne({ upload_id: res.body.uploadId });
  assert.ok(uploadDoc);
  assert.equal(uploadDoc.owner_account_id, accountId);
  assert.equal(uploadDoc.original_filename, "lab_notebook.pdf");
  assert.equal(uploadDoc.status, "PENDING_UPLOAD");
  assert.equal(uploadDoc.expected_size, 2048);
});

test("3. Upload owner identity is derived strictly from session, ignoring spoofed body account", async () => {
  const { agent, accountId } = await createAuthenticatedAgent("alice");

  // Attempt to claim to be eve.testnet in request body
  const res = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "data.csv",
    contentType: "text/csv",
    fileSize: 500,
    owner_account_id: "eve.testnet",
    accountId: "eve.testnet",
  });

  assert.equal(res.status, 201);
  const uploadDoc = await EvidenceUpload.findOne({ upload_id: res.body.uploadId });
  // Must be strictly alice.testnet from the authenticated session
  assert.equal(uploadDoc.owner_account_id, accountId);
  assert.notEqual(uploadDoc.owner_account_id, "eve.testnet");
});

test("4. Oversized evidence file is rejected with 400 ERR_FILE_TOO_LARGE", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  const res = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "huge_dataset.tar",
    contentType: "application/x-tar",
    fileSize: config.MAX_EVIDENCE_FILE_BYTES + 1000,
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, "ERR_FILE_TOO_LARGE");
});

test("5. Filenames with directory traversal or control characters are safely sanitized", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  const res = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "../../../etc/passwd\0malicious.pdf",
    contentType: "application/pdf",
    fileSize: 1024,
  });

  assert.equal(res.status, 201);
  const uploadDoc = await EvidenceUpload.findOne({ upload_id: res.body.uploadId });
  assert.ok(!uploadDoc.original_filename.includes(".."));
  assert.ok(!uploadDoc.original_filename.includes("/"));
  assert.ok(!uploadDoc.original_filename.includes("\0"));
  assert.ok(uploadDoc.original_filename.endsWith("malicious.pdf"));
});

test("6. Disallowed content types (executable scripts) are rejected with 400", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  const res = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "script.js",
    contentType: "application/javascript",
    fileSize: 1024,
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, "ERR_DISALLOWED_CONTENT_TYPE");
});

// =========================================================================
// UPLOAD COMPLETION & VERIFICATION TESTS
// =========================================================================

test("7. Unauthenticated upload completion request is rejected with 401", async () => {
  const app = createApp();
  const res = await request(app).post("/api/v1/discoveries/evidence/uploads/any-id/complete").send({});
  assert.equal(res.status, 401);
});

test("8. Non-owner cannot complete another account's upload (403 Forbidden)", async () => {
  const { agent: aliceAgent } = await createAuthenticatedAgent("alice");
  const { agent: bobAgent } = await createAuthenticatedAgent("bob");

  // Alice creates upload
  const createRes = await aliceAgent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "alice_notes.pdf",
    contentType: "application/pdf",
    fileSize: 100,
  });
  const { uploadId } = createRes.body;

  // Bob attempts to complete Alice's upload
  const completeRes = await bobAgent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});
  assert.equal(completeRes.status, 403);
  assert.equal(completeRes.body.code, "ERR_FORBIDDEN_NOT_UPLOAD_OWNER");
});

test("9. Completion fails if object was never uploaded to R2 (400 ERR_EVIDENCE_NOT_FOUND_IN_STORAGE)", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  const createRes = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "missing.pdf",
    contentType: "application/pdf",
    fileSize: 100,
  });
  const { uploadId } = createRes.body;

  // Attempt to complete without putting any object in R2
  const completeRes = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});
  assert.equal(completeRes.status, 400);
  assert.equal(completeRes.body.code, "ERR_EVIDENCE_NOT_FOUND_IN_STORAGE");
});

test("10. Completion fails if uploaded file size does not match declared expected size", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  const createRes = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "mismatch.txt",
    contentType: "text/plain",
    fileSize: 500, // Expected 500 bytes
  });
  const { uploadId, r2Key } = createRes.body;

  // Seed mock R2 with only 50 bytes
  r2Store.put(config.R2_EVIDENCE_BUCKET, r2Key, Buffer.alloc(50, "a"), "text/plain");

  const completeRes = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});
  assert.equal(completeRes.status, 400);
  assert.equal(completeRes.body.code, "ERR_EVIDENCE_SIZE_MISMATCH");
});

test("11. Successful verification streams raw bytes, computes accurate SHA-256, and finalizes to immutable key", async () => {
  const { agent, accountId } = await createAuthenticatedAgent("alice");

  const fileContent = "KNOVARA: Decoupled Evidence Fingerprint & Machine-Readable Licensing Protocol";
  const fileBytes = Buffer.from(fileContent, "utf8");
  const expectedSha256 = crypto.createHash("sha256").update(fileBytes).digest("hex").toLowerCase();

  // 1. Request upload
  const createRes = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "evidence_spec.txt",
    contentType: "text/plain",
    fileSize: fileBytes.length,
    classification: "TECHNICAL_DOCUMENTATION",
  });
  const { uploadId, r2Key } = createRes.body;

  // 2. Direct browser upload simulation to R2
  r2Store.put(config.R2_EVIDENCE_BUCKET, r2Key, fileBytes, "text/plain");

  // 3. Complete and verify
  const completeRes = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});
  assert.equal(completeRes.status, 200);
  assert.equal(completeRes.body.success, true);
  assert.equal(completeRes.body.upload.sha256Digest, expectedSha256);
  assert.equal(completeRes.body.upload.actualSize, fileBytes.length);
  assert.equal(completeRes.body.upload.status, "VERIFIED");

  // Verify that the temporary pending key was deleted from R2
  assert.throws(() => {
    r2Store.head(config.R2_EVIDENCE_BUCKET, r2Key);
  }, /NotFound/);

  // Verify that the file now exists at the immutable location
  const immutableKey = `evidence/${accountId}/${expectedSha256}/evidence_spec.txt`;
  const immutableObject = r2Store.head(config.R2_EVIDENCE_BUCKET, immutableKey);
  assert.equal(immutableObject.ContentLength, fileBytes.length);
});

test("12. Idempotent upload completion: Repeated completion calls return existing verified record", async () => {
  const { agent } = await createAuthenticatedAgent("alice");
  const fileBytes = Buffer.from("Deterministic Evidence Sample", "utf8");

  const createRes = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "sample.txt",
    contentType: "text/plain",
    fileSize: fileBytes.length,
  });
  const { uploadId, r2Key } = createRes.body;

  r2Store.put(config.R2_EVIDENCE_BUCKET, r2Key, fileBytes, "text/plain");

  // First completion
  const res1 = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});
  assert.equal(res1.status, 200);

  // Second completion (idempotent, does not fail even though pending object was deleted)
  const res2 = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});
  assert.equal(res2.status, 200);
  assert.equal(res1.body.upload.sha256Digest, res2.body.upload.sha256Digest);
  assert.equal(res2.body.upload.status, "VERIFIED");
});

// =========================================================================
// PUBLIC METADATA DESCRIPTOR & NEP-177 REFERENCE TESTS
// =========================================================================

test("13. GET /api/v1/metadata/:discoveryId/:version returns exact stored canonical bytes", async () => {
  const app = createApp();

  const discoveryId = "disc-sample-covid-01";
  const descriptorJson = '{"category":"BIOTECHNOLOGY","created_at":"2026-11-07T23:00:00.000Z","description":"Test","discovery_id":"disc-sample-covid-01","schema_version":"1.0.0","title":"COVID Study"}';
  const sha256Hex = crypto.createHash("sha256").update(Buffer.from(descriptorJson, "utf8")).digest("hex");
  const referenceHash = crypto.createHash("sha256").update(Buffer.from(descriptorJson, "utf8")).digest("base64");

  const descriptorDoc = new PublicMetadataDescriptor({
    discovery_id: discoveryId,
    version: "1.0.0",
    canonical_descriptor_json: descriptorJson,
    sha256_digest: sha256Hex,
    reference_hash: referenceHash,
    reference: `http://localhost:5000/api/v1/metadata/${discoveryId}/1.0.0`,
  });
  await descriptorDoc.save();

  const res = await request(app).get(`/api/v1/metadata/${discoveryId}/1.0.0`);
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
  assert.ok(res.headers["cache-control"].includes("immutable"));
  assert.equal(res.text, descriptorJson);

  // Exact bytes match calculated reference hash
  const retrievedHash = crypto.createHash("sha256").update(Buffer.from(res.text, "utf8")).digest("base64");
  assert.equal(retrievedHash, referenceHash);
});

test("14. Nonexistent metadata descriptor returns structured 404", async () => {
  const app = createApp();
  const res = await request(app).get("/api/v1/metadata/nonexistent-id/1.0.0");
  assert.equal(res.status, 404);
  assert.equal(res.body.code, "ERR_METADATA_NOT_FOUND");
});

// =========================================================================
// DISCOVERY REGISTRATION PREPARATION TESTS
// =========================================================================

test("15. Prepare registration rejects unauthenticated request (401)", async () => {
  const app = createApp();
  const res = await request(app).post("/api/v1/discoveries/prepare-registration").send({
    discoveryId: "disc-01",
  });
  assert.equal(res.status, 401);
});

test("16. Prepare registration rejects unverified or missing evidence uploads", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  // Create upload but do not complete/verify it (status: PENDING_UPLOAD)
  const createRes = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "unverified.pdf",
    contentType: "application/pdf",
    fileSize: 100,
  });
  const { uploadId } = createRes.body;

  const res = await agent.post("/api/v1/discoveries/prepare-registration").send({
    discoveryId: "disc-prep-01",
    tokenId: "tok-prep-01",
    custodianId: "alice.testnet",
    rightsControllerId: "alice.testnet",
    evidenceUploadIds: [uploadId],
    beneficiarySplits: [{ account_id: "alice.testnet", basis_points: 10000 }],
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, "ERR_UNVERIFIED_EVIDENCE_ATTACHMENT");
});

test("17. Prepare registration rejects beneficiary splits that do not sum to 10,000 bps", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  const res = await agent.post("/api/v1/discoveries/prepare-registration").send({
    discoveryId: "disc-prep-02",
    tokenId: "tok-prep-02",
    custodianId: "alice.testnet",
    rightsControllerId: "alice.testnet",
    evidenceUploadIds: ["upload-1"],
    beneficiarySplits: [
      { account_id: "alice.testnet", basis_points: 8000 },
      { account_id: "bob.testnet", basis_points: 1000 }, // Sum: 9000 != 10000
    ],
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, "ERR_BENEFICIARY_SPLITS_SUM_MISMATCH");
});

test("18. Successful registration preparation produces complete payload for smart contract register_discovery_and_mint", async () => {
  const { agent, accountId } = await createAuthenticatedAgent("alice");

  // 1. Create and verify two evidence uploads
  const file1Bytes = Buffer.from("%PDF-1.4: Primary Clinical Trial Report", "utf8");
  const file1Hash = crypto.createHash("sha256").update(file1Bytes).digest("hex").toLowerCase();
  const up1 = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "clinical_trial.pdf",
    contentType: "application/pdf",
    fileSize: file1Bytes.length,
    classification: "TECHNICAL_DOCUMENTATION",
  });
  r2Store.put(config.R2_EVIDENCE_BUCKET, up1.body.r2Key, file1Bytes, "application/pdf");
  await agent.post(`/api/v1/discoveries/evidence/uploads/${up1.body.uploadId}/complete`).send({});

  const file2Bytes = Buffer.from("Raw Genomic Dataset CSV", "utf8");
  const file2Hash = crypto.createHash("sha256").update(file2Bytes).digest("hex").toLowerCase();
  const up2 = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "genomics.csv",
    contentType: "text/csv",
    fileSize: file2Bytes.length,
    classification: "FULL_DATASET",
  });
  r2Store.put(config.R2_EVIDENCE_BUCKET, up2.body.r2Key, file2Bytes, "text/csv");
  await agent.post(`/api/v1/discoveries/evidence/uploads/${up2.body.uploadId}/complete`).send({});

  // 2. Prepare registration
  const prepRes = await agent.post("/api/v1/discoveries/prepare-registration").send({
    discoveryId: "disc-mrna-99",
    tokenId: "tok-mrna-99",
    custodianId: "alice.testnet",
    rightsControllerId: "alice.testnet",
    evidenceUploadIds: [up1.body.uploadId, up2.body.uploadId],
    publicMetadata: {
      title: "Novel mRNA Delivery Nanoparticle",
      description: "Non-immunogenic lipid formulation for targeted mRNA delivery",
      media: "https://example.com/cover.png",
      category: "BIOTECHNOLOGY",
      attributes: [{ trait_type: "Research Phase", value: "Phase I" }],
    },
    beneficiarySplits: [
      { account_id: "alice.testnet", basis_points: 8000 },
      { account_id: "bob.testnet", basis_points: 2000 },
    ],
  });

  assert.equal(prepRes.status, 200);
  const payload = prepRes.body;

  // Contract parameter schema validation
  assert.equal(payload.discovery_id, "disc-mrna-99");
  assert.equal(payload.token_id, "tok-mrna-99");
  assert.equal(payload.custodian_id, "alice.testnet");
  assert.equal(payload.rights_controller_id, "alice.testnet");
  assert.ok(payload.evidence_manifest_hash);
  assert.equal(payload.evidence_manifest_hash.length, 64);
  assert.match(payload.evidence_manifest_hash, /^[a-f0-9]{64}$/);

  // Metadata structure
  assert.equal(payload.metadata.title, "Novel mRNA Delivery Nanoparticle");
  assert.ok(payload.metadata.reference.includes("/api/v1/metadata/disc-mrna-99/1.0.0"));
  assert.ok(payload.metadata.reference_hash);
  assert.equal(payload.metadata.reference_hash.length, 44); // Standard 32-byte Base64

  // Splits
  assert.equal(payload.beneficiary_splits.length, 2);
  assert.equal(payload.beneficiary_splits[0].basis_points, 8000);
  assert.equal(payload.beneficiary_splits[1].basis_points, 2000);

  // Verify that evidence uploads were marked as ATTACHED in MongoDB
  const updatedUp1 = await EvidenceUpload.findOne({ upload_id: up1.body.uploadId });
  assert.equal(updatedUp1.status, "ATTACHED");
  assert.equal(updatedUp1.attached_discovery_id, "disc-mrna-99");

  // Verify that EvidenceManifest was persisted in MongoDB and stored in R2
  const manifestDoc = await EvidenceManifest.findOne({ discovery_id: "disc-mrna-99" });
  assert.ok(manifestDoc);
  assert.equal(manifestDoc.evidence_manifest_hash, payload.evidence_manifest_hash);

  // Verify that PublicMetadataDescriptor is immediately retrievable via GET endpoint
  const getMetaRes = await agent.get("/api/v1/metadata/disc-mrna-99/1.0.0");
  assert.equal(getMetaRes.status, 200);
  assert.equal(getMetaRes.body.title, "Novel mRNA Delivery Nanoparticle");

  // Verify strict privacy boundary: Public descriptor NEVER contains private R2 keys or evidence hashes
  assert.equal(getMetaRes.body.items, undefined);
  assert.equal(getMetaRes.body.r2_object_key, undefined);
  assert.equal(getMetaRes.body.r2_manifest_object_key, undefined);
  assert.equal(getMetaRes.body.presignedUrl, undefined);
});

