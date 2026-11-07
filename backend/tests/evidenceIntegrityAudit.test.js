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
import { config, validatePublicApiBaseUrl } from "../src/config/env.js";
import { detectVerifiedContentType } from "../src/services/manifestBuilder.js";

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
// AUDIT 1: FINALIZED R2 OBJECT INTEGRITY & TOCTOU DEFENSE
// =========================================================================

test("Audit 1.1: TOCTOU Defense - Detects mid-flight object overwrite between hash and copy", async () => {
  const { agent, accountId } = await createAuthenticatedAgent("alice");

  const originalContent = "%PDF-1.5: Genuine initial evidence document for Knovara protocol.";
  const originalBytes = Buffer.from(originalContent, "utf8");

  // 1. Initiate upload
  const createRes = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "clinical_trial.pdf",
    contentType: "application/pdf",
    fileSize: originalBytes.length,
    classification: "TECHNICAL_DOCUMENTATION",
  });
  const { uploadId, r2Key } = createRes.body;

  // 2. Direct browser upload
  r2Store.put(config.R2_EVIDENCE_BUCKET, r2Key, originalBytes, "application/pdf");

  // 3. Simulate mid-flight race condition: attacker overwrites pending object via still-valid presigned URL
  // Hook into copy: overwrite sourceKey just before copy executes
  const tamperedContent = "%PDF-1.5: TAMPERED content substituted during finalization window.";
  const tamperedBytes = Buffer.from(tamperedContent, "utf8");

  r2Store.onBeforeCopy = (bucket, sourceKey) => {
    r2Store.put(bucket, sourceKey, tamperedBytes, "application/pdf");
  };

  // 4. Complete upload
  const completeRes = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});

  // 5. Assert: Server must reject with ERR_EVIDENCE_INTEGRITY_MISMATCH
  assert.equal(completeRes.status, 400);
  assert.equal(completeRes.body.code, "ERR_EVIDENCE_INTEGRITY_MISMATCH");

  // 6. Assert: Destination object at finalKey must be cleaned up / NOT exist in storage
  const originalSha256 = crypto.createHash("sha256").update(originalBytes).digest("hex").toLowerCase();
  const destKey = `evidence/${accountId}/${originalSha256}/clinical_trial.pdf`;
  assert.throws(() => {
    r2Store.head(config.R2_EVIDENCE_BUCKET, destKey);
  }, /NotFound/);

  // 7. Assert: Database status remains PENDING_UPLOAD (not marked VERIFIED)
  const uploadDoc = await EvidenceUpload.findOne({ upload_id: uploadId });
  assert.equal(uploadDoc.status, "PENDING_UPLOAD");
  assert.equal(uploadDoc.sha256_digest, undefined);
});

test("Audit 1.2: Immutable destination key path separation from temporary pending upload key", async () => {
  const { agent, accountId } = await createAuthenticatedAgent("alice");

  const pdfBytes = Buffer.from("%PDF-1.7: Immutable Evidence Document Validation Test", "utf8");
  const sha256Hex = crypto.createHash("sha256").update(pdfBytes).digest("hex").toLowerCase();

  const createRes = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "safety_evaluation.pdf",
    contentType: "application/pdf",
    fileSize: pdfBytes.length,
  });
  const { uploadId, r2Key } = createRes.body;

  // Verify pending key is scoped under uploads/pending/
  assert.ok(r2Key.startsWith(`uploads/pending/${accountId}/${uploadId}/`));

  // Perform upload and complete
  r2Store.put(config.R2_EVIDENCE_BUCKET, r2Key, pdfBytes, "application/pdf");
  const completeRes = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});
  assert.equal(completeRes.status, 200);

  // Final key must be scoped under evidence/{owner}/{sha256}/
  const uploadDoc = await EvidenceUpload.findOne({ upload_id: uploadId });
  assert.equal(uploadDoc.status, "VERIFIED");
  assert.equal(uploadDoc.r2_object_key, `evidence/${accountId}/${sha256Hex}/safety_evaluation.pdf`);

  // Original pending key must be deleted
  assert.throws(() => {
    r2Store.head(config.R2_EVIDENCE_BUCKET, r2Key);
  }, /NotFound/);
});

// =========================================================================
// AUDIT 2: ACTUAL CONTENT-TYPE (MAGIC BYTES) & SPOOFING REJECTION
// =========================================================================

test("Audit 2.1: Rejects declared application/pdf when file signature is not PDF (ERR_CONTENT_TYPE_SPOOFED)", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  // File is plain text, but declared as application/pdf
  const fakePdfBytes = Buffer.from("This is not a real PDF file at all, just plain text.", "utf8");

  const createRes = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "fake_report.pdf",
    contentType: "application/pdf",
    fileSize: fakePdfBytes.length,
  });
  const { uploadId, r2Key } = createRes.body;

  r2Store.put(config.R2_EVIDENCE_BUCKET, r2Key, fakePdfBytes, "application/pdf");

  const completeRes = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});
  assert.equal(completeRes.status, 400);
  assert.equal(completeRes.body.code, "ERR_CONTENT_TYPE_SPOOFED");
  assert.ok(completeRes.body.error.includes("application/pdf"));
});

test("Audit 2.2: Rejects declared image/png when file signature does not match PNG magic bytes", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  // File is random binary or text, not PNG
  const fakePngBytes = Buffer.from("NOT_A_PNG_FILE_HEADER", "utf8");

  const createRes = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "structure.png",
    contentType: "image/png",
    fileSize: fakePngBytes.length,
  });
  const { uploadId, r2Key } = createRes.body;

  r2Store.put(config.R2_EVIDENCE_BUCKET, r2Key, fakePngBytes, "image/png");

  const completeRes = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});
  assert.equal(completeRes.status, 400);
  assert.equal(completeRes.body.code, "ERR_CONTENT_TYPE_SPOOFED");
});

test("Audit 2.3: Rejects declared text/csv when file contains binary null bytes (binary disguised as text)", async () => {
  const { agent } = await createAuthenticatedAgent("alice");

  // Null byte embedded in declared CSV
  const binarySpoofBytes = Buffer.from("col1,col2\nval1,\x00\x01\x02binary", "binary");

  const createRes = await agent.post("/api/v1/discoveries/evidence/uploads").send({
    filename: "corrupt.csv",
    contentType: "text/csv",
    fileSize: binarySpoofBytes.length,
  });
  const { uploadId, r2Key } = createRes.body;

  r2Store.put(config.R2_EVIDENCE_BUCKET, r2Key, binarySpoofBytes, "text/csv");

  const completeRes = await agent.post(`/api/v1/discoveries/evidence/uploads/${uploadId}/complete`).send({});
  assert.equal(completeRes.status, 400);
  assert.equal(completeRes.body.code, "ERR_CONTENT_TYPE_SPOOFED");
});

test("Audit 2.4: Successfully verifies all supported file signatures and sets verified_content_type", async () => {
  // Test PDF magic bytes (%PDF-)
  const pdfHeader = Buffer.from("%PDF-1.7\nSample PDF body content");
  assert.equal(detectVerifiedContentType(pdfHeader, "application/pdf"), "application/pdf");

  // Test PNG magic bytes (\x89PNG\r\n\x1a\n)
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  assert.equal(detectVerifiedContentType(pngHeader, "image/png"), "image/png");

  // Test JPEG magic bytes (\xFF\xD8\xFF)
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  assert.equal(detectVerifiedContentType(jpegHeader, "image/jpeg"), "image/jpeg");

  // Test ZIP magic bytes (PK\x03\x04)
  const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  assert.equal(detectVerifiedContentType(zipHeader, "application/zip"), "application/zip");

  // Test JSON format ({ or [ with valid UTF-8)
  const jsonHeader = Buffer.from('  \n\t{"version":"1.0.0","study":"Genomics"}', "utf8");
  assert.equal(detectVerifiedContentType(jsonHeader, "application/json"), "application/json");

  // Test CSV / Text (valid UTF-8 without null bytes)
  const csvHeader = Buffer.from("id,gene,expression_level\n1,BRCA1,4.2\n2,TP53,8.7", "utf8");
  assert.equal(detectVerifiedContentType(csvHeader, "text/csv"), "text/csv");

  // Test Unrecognized binary fallback to application/octet-stream
  const arbitraryBinary = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x00, 0xff, 0xfe]);
  assert.equal(detectVerifiedContentType(arbitraryBinary, "application/octet-stream"), "application/octet-stream");
});

// =========================================================================
// AUDIT 3: PRODUCTION PUBLIC METADATA URL VALIDATION
// =========================================================================

test("Audit 3.1: validatePublicApiBaseUrl enforces strict HTTPS and forbids private networks in production", () => {
  // Production must be HTTPS
  assert.throws(() => {
    validatePublicApiBaseUrl("http://api.knovara.io", "production");
  }, /ERR_CONFIG: PUBLIC_API_BASE_URL must use HTTPS protocol in production/);

  // Production forbids localhost
  assert.throws(() => {
    validatePublicApiBaseUrl("https://localhost:5000", "production");
  }, /points to localhost or private network/);

  // Production forbids IPv4 loopback
  assert.throws(() => {
    validatePublicApiBaseUrl("https://127.0.0.1:443", "production");
  }, /points to localhost or private network/);

  // Production forbids IPv6 loopback
  assert.throws(() => {
    validatePublicApiBaseUrl("https://[::1]:443", "production");
  }, /points to localhost or private network/);

  // Production forbids 10.x.x.x private network
  assert.throws(() => {
    validatePublicApiBaseUrl("https://10.0.1.5", "production");
  }, /points to localhost or private network/);

  // Production forbids 192.168.x.x private network
  assert.throws(() => {
    validatePublicApiBaseUrl("https://192.168.1.50", "production");
  }, /points to localhost or private network/);

  // Production forbids 172.16-31.x.x private network
  assert.throws(() => {
    validatePublicApiBaseUrl("https://172.20.0.1", "production");
  }, /points to localhost or private network/);

  // Production requires URL to be present
  assert.throws(() => {
    validatePublicApiBaseUrl("", "production");
  }, /ERR_CONFIG: PUBLIC_API_BASE_URL is required in production/);

  // Production permits valid public HTTPS domain
  const validProd = validatePublicApiBaseUrl("https://api.knovara.io", "production");
  assert.equal(validProd, "https://api.knovara.io");

  // Trailing slash normalization
  const validWithSlash = validatePublicApiBaseUrl("https://metadata.knovara.network/", "production");
  assert.equal(validWithSlash, "https://metadata.knovara.network");

  // Development / Test allows localhost HTTP
  const devUrl = validatePublicApiBaseUrl("http://localhost:5000", "development");
  assert.equal(devUrl, "http://localhost:5000");

  const testUrl = validatePublicApiBaseUrl("http://127.0.0.1:8080", "test");
  assert.equal(testUrl, "http://127.0.0.1:8080");
});

