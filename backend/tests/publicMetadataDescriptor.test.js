import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import crypto from "crypto";
import { createApp } from "../src/app.js";
import { setupMockDatabase, clearMockDatabase } from "./helpers/mockDb.js";
import { setupMockR2, clearMockR2, r2Store } from "./helpers/mockR2.js";
import { getTestKeyPair, signNep413Payload } from "./helpers/testKeys.js";
import { createMockNearRpc } from "./helpers/mockRpc.js";
import { PublicMetadataDescriptor } from "../src/models/PublicMetadataDescriptor.js";
import { EvidenceUpload } from "../src/models/EvidenceUpload.js";
import { EvidenceManifest } from "../src/models/EvidenceManifest.js";
import { buildPublicMetadataDescriptor, buildCanonicalEvidenceManifest } from "../src/services/manifestBuilder.js";
import { config, validatePublicApiBaseUrl } from "../src/config/env.js";

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
  return { agent, accountId, app };
}

describe("Public NEP-177 Metadata Descriptor Endpoint", () => {
  it("1. Public GET /api/v1/metadata/:discoveryId/:version succeeds without wallet authentication", async () => {
    const app = createApp();
    const discoveryId = "disc-sample-covid-01";
    const version = "1.0.0";

    const {
      descriptor,
      canonicalJson,
      referenceHash,
      sha256Hex,
      reference,
    } = buildPublicMetadataDescriptor({
      discoveryId,
      version,
      publicMetadata: {
        title: "COVID-19 Genomic Analysis",
        description: "Open research dataset on viral genome structure",
        category: "BIOTECHNOLOGY",
        attributes: [{ trait_type: "Phase", value: "Publication" }],
      },
    });

    await PublicMetadataDescriptor.create({
      discovery_id: discoveryId,
      version,
      canonical_descriptor_json: canonicalJson,
      sha256_digest: sha256Hex,
      reference_hash: referenceHash,
      reference,
      is_immutable: true,
    });

    // Completely unauthenticated request (no cookies, no headers)
    const res = await request(app).get(`/api/v1/metadata/${discoveryId}/${version}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(res.headers["access-control-allow-origin"], "*");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.ok(res.headers["cache-control"].includes("immutable"));
    assert.equal(res.headers["etag"], `"${sha256Hex}"`);

    // Byte-for-byte exactness
    assert.equal(res.text, canonicalJson);
    const parsed = JSON.parse(res.text);
    assert.equal(parsed.title, "COVID-19 Genomic Analysis");
    assert.equal(parsed.discovery_id, discoveryId);
    assert.equal(parsed.schema_version, version);
  });

  it("2. Public GET /api/v1/metadata/:discoveryId without version defaults to '1.0.0'", async () => {
    const app = createApp();
    const discoveryId = "disc-default-version-02";

    const {
      canonicalJson,
      referenceHash,
      sha256Hex,
      reference,
    } = buildPublicMetadataDescriptor({
      discoveryId,
      version: "1.0.0",
      publicMetadata: {
        title: "Quantum Key Distribution Schema",
        description: "Post-quantum lattice cryptography verification dataset",
        category: "CRYPTOGRAPHY",
      },
    });

    await PublicMetadataDescriptor.create({
      discovery_id: discoveryId,
      version: "1.0.0",
      canonical_descriptor_json: canonicalJson,
      sha256_digest: sha256Hex,
      reference_hash: referenceHash,
      reference,
      is_immutable: true,
    });

    // Request without version in URL
    const res = await request(app).get(`/api/v1/metadata/${discoveryId}`);
    assert.equal(res.status, 200);
    assert.equal(res.text, canonicalJson);

    const calculatedHash = crypto.createHash("sha256").update(Buffer.from(res.text, "utf8")).digest("base64");
    assert.equal(calculatedHash, referenceHash);
  });

  it("3. Reference hash calculated as Base64(SHA-256(exact bytes)) matches the response body byte-for-byte", async () => {
    const app = createApp();
    const discoveryId = "disc-hash-integrity-03";
    const version = "1.0.0";

    const {
      canonicalJson,
      referenceHash,
      sha256Hex,
      reference,
    } = buildPublicMetadataDescriptor({
      discoveryId,
      version,
      publicMetadata: {
        title: "CRISPR-Cas9 Specificity Benchmark",
        description: "Exome-wide off-target cleavage rate measurements",
        category: "GENETICS",
        attributes: [
          { trait_type: "Guide RNA", value: "gRNA-5421" },
          { trait_type: "Enzyme", value: "SpCas9" },
        ],
      },
    });

    await PublicMetadataDescriptor.create({
      discovery_id: discoveryId,
      version,
      canonical_descriptor_json: canonicalJson,
      sha256_digest: sha256Hex,
      reference_hash: referenceHash,
      reference,
    });

    const res = await request(app).get(`/api/v1/metadata/${discoveryId}/${version}`);
    assert.equal(res.status, 200);

    // 1. Calculate Base64 SHA-256 directly on received HTTP response text
    const responseBytes = Buffer.from(res.text, "utf8");
    const receivedBase64Hash = crypto.createHash("sha256").update(responseBytes).digest("base64");
    assert.equal(receivedBase64Hash, referenceHash);

    // 2. Calculate Hex SHA-256 and assert match with ETag
    const receivedHexHash = crypto.createHash("sha256").update(responseBytes).digest("hex");
    assert.equal(receivedHexHash, sha256Hex);
    assert.equal(res.headers["etag"], `"${receivedHexHash}"`);
    assert.equal(Number(res.headers["content-length"]), responseBytes.length);
  });

  it("4. Reference hash is strictly distinct from evidence_manifest_hash", async () => {
    const discoveryId = "disc-dual-hash-04";

    // Build evidence manifest
    const manifestResult = buildCanonicalEvidenceManifest({
      discoveryId,
      ownerAccountId: "alice.testnet",
      evidenceItems: [
        {
          evidence_id: "upl-101",
          originalFilename: "raw_data.csv",
          file_hash: "a".repeat(64),
          file_size: 2048,
          classification: "FULL_DATASET",
        },
      ],
    });

    // Build public metadata descriptor
    const descriptorResult = buildPublicMetadataDescriptor({
      discoveryId,
      version: "1.0.0",
      publicMetadata: {
        title: "Dual Hash Test Discovery",
        description: "Checking isolation of hashes",
        category: "COMPUTER_SCIENCE",
      },
    });

    // 1. Enforce evidence_manifest_hash format: 64 lowercase hex characters
    assert.equal(manifestResult.evidenceManifestHash.length, 64);
    assert.match(manifestResult.evidenceManifestHash, /^[a-f0-9]{64}$/);

    // 2. Enforce reference_hash format: 44-character Base64 string
    assert.equal(descriptorResult.referenceHash.length, 44);
    assert.match(descriptorResult.referenceHash, /^[A-Za-z0-9+/]{43}=$/);

    // 3. Hashes must be strictly non-equal
    assert.notEqual(manifestResult.evidenceManifestHash, descriptorResult.referenceHash);
  });

  it("5. Strict privacy preservation: Public descriptor never exposes private files, R2 keys, or credentials", async () => {
    const app = createApp();
    const discoveryId = "disc-privacy-test-05";
    const version = "1.0.0";

    const {
      canonicalJson,
      referenceHash,
      sha256Hex,
      reference,
    } = buildPublicMetadataDescriptor({
      discoveryId,
      version,
      publicMetadata: {
        title: "Proprietary Compound Bioassay",
        description: "Public abstract describing therapeutic efficacy without revealing structure",
        category: "PHARMACEUTICALS",
      },
    });

    await PublicMetadataDescriptor.create({
      discovery_id: discoveryId,
      version,
      canonical_descriptor_json: canonicalJson,
      sha256_digest: sha256Hex,
      reference_hash: referenceHash,
      reference,
      r2_descriptor_object_key: `public-metadata/${discoveryId}/${version}/descriptor.json`,
    });

    const res = await request(app).get(`/api/v1/metadata/${discoveryId}/${version}`);
    assert.equal(res.status, 200);

    const doc = JSON.parse(res.text);

    // Public fields permitted
    assert.equal(doc.discovery_id, discoveryId);
    assert.equal(doc.title, "Proprietary Compound Bioassay");
    assert.equal(doc.category, "PHARMACEUTICALS");

    // Private fields forbidden
    assert.equal(doc.items, undefined);
    assert.equal(doc.evidence, undefined);
    assert.equal(doc.evidence_items, undefined);
    assert.equal(doc.r2_object_key, undefined);
    assert.equal(doc.r2_descriptor_object_key, undefined);
    assert.equal(doc.r2_manifest_object_key, undefined);
    assert.equal(doc.presignedUrl, undefined);
    assert.equal(doc.storage_credentials, undefined);
    assert.equal(doc.private_key, undefined);
    assert.equal(doc.owner_account_id, undefined);
    assert.equal(doc._id, undefined);
  });

  it("6. R2 storage fallback: Serves exact descriptor from R2 when MongoDB record is missing", async () => {
    const app = createApp();
    const discoveryId = "disc-r2-fallback-06";
    const version = "1.0.0";

    const {
      canonicalJson,
      referenceHash,
      sha256Hex,
    } = buildPublicMetadataDescriptor({
      discoveryId,
      version,
      publicMetadata: {
        title: "Resilient R2 Storage Discovery",
        description: "Demonstrating immutable persistence fallback to R2",
        category: "DISTRIBUTED_SYSTEMS",
      },
    });

    // Store ONLY in R2; DO NOT save in MongoDB!
    const r2Key = `public-metadata/${discoveryId}/${version}/descriptor.json`;
    r2Store.put(config.R2_EVIDENCE_BUCKET, r2Key, Buffer.from(canonicalJson, "utf8"), "application/json");

    // Verify MongoDB is empty
    const mongoDocBefore = await PublicMetadataDescriptor.findOne({ discovery_id: discoveryId });
    assert.equal(mongoDocBefore, null);

    // Request from public endpoint
    const res = await request(app).get(`/api/v1/metadata/${discoveryId}/${version}`);
    assert.equal(res.status, 200);
    assert.equal(res.text, canonicalJson);
    assert.equal(res.headers["etag"], `"${sha256Hex}"`);

    // Verify hash integrity of R2-served bytes
    const computedHash = crypto.createHash("sha256").update(Buffer.from(res.text, "utf8")).digest("base64");
    assert.equal(computedHash, referenceHash);
  });

  it("7. Nonexistent discovery or version returns structured 404 JSON", async () => {
    const app = createApp();

    // 1. Nonexistent discovery
    const res1 = await request(app).get("/api/v1/metadata/nonexistent-disc-999/1.0.0");
    assert.equal(res1.status, 404);
    assert.equal(res1.body.code, "ERR_METADATA_NOT_FOUND");
    assert.ok(res1.body.error.includes("nonexistent-disc-999"));

    // 2. Nonexistent version for existing discovery
    await PublicMetadataDescriptor.create({
      discovery_id: "disc-version-check-07",
      version: "1.0.0",
      canonical_descriptor_json: "{}",
      sha256_digest: "a".repeat(64),
      reference_hash: "b".repeat(44),
      reference: "http://localhost:5000/api/v1/metadata/disc-version-check-07/1.0.0",
    });

    const res2 = await request(app).get("/api/v1/metadata/disc-version-check-07/2.0.0");
    assert.equal(res2.status, 404);
    assert.equal(res2.body.code, "ERR_METADATA_NOT_FOUND");
    assert.ok(res2.body.error.includes("2.0.0"));
  });

  it("8. Invalid or whitespace-only discoveryId returns 400 Bad Request", async () => {
    const app = createApp();

    const res = await request(app).get("/api/v1/metadata/%20%20%20/1.0.0");
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "ERR_MISSING_METADATA_PARAMS");
  });

  it("9. Integration with prepare-registration: prepares descriptor and endpoint immediately serves matching bytes", async () => {
    const { agent, accountId } = await createAuthenticatedAgent("alice");

    // Upload & complete evidence
    const fileBytes = Buffer.from("%PDF-1.4: End-to-end integration test PDF", "utf8");
    const up = await agent.post("/api/v1/discoveries/evidence/uploads").send({
      filename: "study.pdf",
      contentType: "application/pdf",
      fileSize: fileBytes.length,
      classification: "TECHNICAL_DOCUMENTATION",
    });
    r2Store.put(config.R2_EVIDENCE_BUCKET, up.body.r2Key, fileBytes, "application/pdf");
    await agent.post(`/api/v1/discoveries/evidence/uploads/${up.body.uploadId}/complete`).send({});

    // Prepare registration
    const discoveryId = "disc-e2e-integ-09";
    const prepRes = await agent.post("/api/v1/discoveries/prepare-registration").send({
      discoveryId,
      tokenId: "pass-e2e-integ-09",
      custodianId: accountId,
      rightsControllerId: accountId,
      evidenceUploadIds: [up.body.uploadId],
      publicMetadata: {
        title: "Integrated Vaccine Candidate Data",
        description: "Phase II neutralizing antibody titer distributions",
        category: "IMMUNOLOGY",
        attributes: [{ trait_type: "Target", value: "Spike Protein" }],
      },
      beneficiarySplits: [{ account_id: accountId, basis_points: 10000 }],
    });

    assert.equal(prepRes.status, 200);
    const { reference, reference_hash } = prepRes.body.metadata;

    // Verify reference URL points to our metadata endpoint
    assert.ok(reference.includes(`/api/v1/metadata/${discoveryId}/1.0.0`));
    assert.equal(reference_hash.length, 44);

    // Call the public metadata endpoint using supertest (unauthenticated agent)
    const publicApp = createApp();
    const metaRes = await request(publicApp).get(`/api/v1/metadata/${discoveryId}/1.0.0`);
    assert.equal(metaRes.status, 200);

    // Verify that Base64(SHA-256(endpoint_body)) matches reference_hash exactly
    const receivedBytes = Buffer.from(metaRes.text, "utf8");
    const calculatedRefHash = crypto.createHash("sha256").update(receivedBytes).digest("base64");
    assert.equal(calculatedRefHash, reference_hash);

    // Verify that the title and public metadata match
    const descriptorBody = JSON.parse(metaRes.text);
    assert.equal(descriptorBody.title, "Integrated Vaccine Candidate Data");
    assert.equal(descriptorBody.category, "IMMUNOLOGY");
  });

  it("10. Public base URL validation allows localhost in development and enforces HTTPS in production", () => {
    // Development / test environment
    const devUrl = validatePublicApiBaseUrl("http://localhost:5000", "development");
    assert.equal(devUrl, "http://localhost:5000");

    const devTestUrl = validatePublicApiBaseUrl("http://localhost:3000", "test");
    assert.equal(devTestUrl, "http://localhost:3000");

    // Production environment: valid HTTPS domain
    const prodUrl = validatePublicApiBaseUrl("https://api.knovara.com", "production");
    assert.equal(prodUrl, "https://api.knovara.com");

    // Production environment: rejects HTTP
    assert.throws(
      () => validatePublicApiBaseUrl("http://api.knovara.com", "production"),
      /must use HTTPS protocol in production/
    );

    // Production environment: rejects localhost
    assert.throws(
      () => validatePublicApiBaseUrl("https://localhost:5000", "production"),
      /points to localhost/
    );
  });
});
