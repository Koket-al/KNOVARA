import express, { Router } from "express";
import crypto from "crypto";
import { config } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { EvidenceUpload } from "../models/EvidenceUpload.js";
import { EvidenceManifest } from "../models/EvidenceManifest.js";
import { PublicMetadataDescriptor } from "../models/PublicMetadataDescriptor.js";
import {
  generatePresignedUploadUrl,
  headObject,
  getObjectStream,
  copyObject,
  putObject,
  deleteObject,
  calculateStreamSha256,
} from "../services/r2Storage.js";
import {
  sanitizeFilename,
  isValidNearAccountId,
  buildCanonicalEvidenceManifest,
  buildPublicMetadataDescriptor,
  detectVerifiedContentType,
} from "../services/manifestBuilder.js";

const router = Router();

/**
 * POST /discoveries/evidence/uploads
 * Requests a short-lived presigned PUT URL for direct browser-to-R2 upload.
 */
router.post("/evidence/uploads", requireAuth, async (req, res, next) => {
  try {
    const { filename, contentType, fileSize, classification } = req.body || {};
    const ownerAccountId = req.user.accountId;

    if (!filename || typeof filename !== "string" || !filename.trim()) {
      return res.status(400).json({
        error: "A valid original filename is required",
        code: "ERR_INVALID_FILENAME",
      });
    }

    if (!contentType || typeof contentType !== "string" || !contentType.trim()) {
      return res.status(400).json({
        error: "A declared content-type is required",
        code: "ERR_INVALID_CONTENT_TYPE",
      });
    }

    const cleanContentType = contentType.trim().toLowerCase();
    // Validate supported content types (prevent executable scripts / malicious uploads)
    if (
      cleanContentType.includes("javascript") ||
      cleanContentType.includes("php") ||
      cleanContentType.includes("sh") ||
      cleanContentType.includes("exe")
    ) {
      return res.status(400).json({
        error: `Content-type '${cleanContentType}' is not permitted for evidence storage`,
        code: "ERR_DISALLOWED_CONTENT_TYPE",
      });
    }

    const expectedSize = Number(fileSize);
    if (isNaN(expectedSize) || expectedSize <= 0) {
      return res.status(400).json({
        error: "Expected file size must be a positive integer in bytes",
        code: "ERR_INVALID_FILE_SIZE",
      });
    }

    if (expectedSize > config.MAX_EVIDENCE_FILE_BYTES) {
      return res.status(400).json({
        error: `File size ${expectedSize} bytes exceeds maximum allowed limit of ${config.MAX_EVIDENCE_FILE_BYTES} bytes`,
        code: "ERR_FILE_TOO_LARGE",
      });
    }

    const validClassifications = [
      "TECHNICAL_DOCUMENTATION",
      "EVALUATION_SAMPLE",
      "FULL_DATASET",
      "CAD_SCHEMATICS",
      "OTHER",
    ];
    const cleanClassification = classification
      ? String(classification).trim().toUpperCase()
      : "TECHNICAL_DOCUMENTATION";

    if (!validClassifications.includes(cleanClassification)) {
      return res.status(400).json({
        error: `Classification '${classification}' is invalid. Allowed: ${validClassifications.join(", ")}`,
        code: "ERR_INVALID_CLASSIFICATION",
      });
    }

    const sanitized = sanitizeFilename(filename);
    const uploadId = crypto.randomUUID();
    const r2Key = `uploads/pending/${ownerAccountId}/${uploadId}/${sanitized}`;
    const expiresAt = new Date(Date.now() + config.R2_UPLOAD_URL_TTL_SECONDS * 1000);

    // Create pending upload record in MongoDB
    const upload = new EvidenceUpload({
      upload_id: uploadId,
      owner_account_id: ownerAccountId,
      original_filename: sanitized,
      declared_content_type: cleanContentType,
      expected_size: expectedSize,
      r2_object_key: r2Key,
      classification: cleanClassification,
      status: "PENDING_UPLOAD",
      expires_at: expiresAt,
    });

    await upload.save();

    // Generate short-lived presigned PUT URL
    const presignedUrl = await generatePresignedUploadUrl({
      bucket: config.R2_EVIDENCE_BUCKET,
      key: r2Key,
      contentType: cleanContentType,
      expiresIn: config.R2_UPLOAD_URL_TTL_SECONDS,
    });

    return res.status(201).json({
      uploadId,
      presignedUrl,
      r2Key,
      expiresIn: config.R2_UPLOAD_URL_TTL_SECONDS,
      requiredHeaders: {
        "Content-Type": cleanContentType,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /discoveries/evidence/uploads/:uploadId/content
 * Authenticated direct upload relay for evidence files.
 * Streams file bytes directly to Cloudflare R2 using backend credentials.
 * Provides resilient fallback when browser direct-to-R2 presigned upload is blocked by CORS.
 */
router.put(
  "/evidence/uploads/:uploadId/content",
  requireAuth,
  express.raw({ type: () => true, limit: `${config.MAX_EVIDENCE_FILE_BYTES}b` }),
  async (req, res, next) => {
    try {
      const { uploadId } = req.params;
      const ownerAccountId = req.user.accountId;

      const upload = await EvidenceUpload.findOne({
        upload_id: uploadId,
        owner_account_id: ownerAccountId,
        status: "PENDING_UPLOAD",
      });

      if (!upload) {
        return res.status(404).json({
          error: "Pending evidence upload record not found or already finalized",
          code: "ERR_UPLOAD_NOT_FOUND",
        });
      }

      if (!req.body || (Buffer.isBuffer(req.body) && req.body.length === 0)) {
        return res.status(400).json({
          error: "Uploaded content body is empty",
          code: "ERR_EMPTY_FILE",
        });
      }

      const fileBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);

      if (fileBuffer.length > config.MAX_EVIDENCE_FILE_BYTES) {
        return res.status(400).json({
          error: `File size exceeds maximum limit of ${config.MAX_EVIDENCE_FILE_BYTES} bytes`,
          code: "ERR_FILE_TOO_LARGE",
        });
      }

      // Store directly into Cloudflare R2 at upload.r2_object_key
      await putObject(
        config.R2_EVIDENCE_BUCKET,
        upload.r2_object_key,
        fileBuffer,
        upload.declared_content_type
      );

      return res.status(200).json({
        success: true,
        uploadId: upload.upload_id,
        r2Key: upload.r2_object_key,
        bytesReceived: fileBuffer.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /discoveries/evidence/uploads/:uploadId/complete
 * Verifies the uploaded object in R2, calculates streaming SHA-256 over raw bytes,
 * and finalizes the object into an immutable evidence location.
 */
router.post("/evidence/uploads/:uploadId/complete", requireAuth, async (req, res, next) => {
  try {
    const { uploadId } = req.params;
    const ownerAccountId = req.user.accountId;

    const upload = await EvidenceUpload.findOne({ upload_id: uploadId });
    if (!upload) {
      return res.status(404).json({
        error: `Evidence upload record '${uploadId}' not found`,
        code: "ERR_UPLOAD_NOT_FOUND",
      });
    }

    // Ownership verification
    if (upload.owner_account_id !== ownerAccountId) {
      return res.status(403).json({
        error: "You are not authorized to complete an upload owned by another account",
        code: "ERR_FORBIDDEN_NOT_UPLOAD_OWNER",
      });
    }

    // Idempotency: If already verified or attached, return existing verified details
    if (upload.status === "VERIFIED" || upload.status === "ATTACHED") {
      return res.status(200).json({
        success: true,
        upload: {
          uploadId: upload.upload_id,
          sha256Digest: upload.sha256_digest,
          actualSize: upload.actual_size,
          verifiedContentType: upload.verified_content_type,
          status: upload.status,
          verifiedAt: upload.verified_at,
        },
      });
    }

    if (upload.status !== "PENDING_UPLOAD") {
      return res.status(400).json({
        error: `Upload cannot be finalized from current status '${upload.status}'`,
        code: "ERR_INVALID_UPLOAD_STATUS",
      });
    }

    // 1. Check object metadata in R2
    let headMeta;
    try {
      headMeta = await headObject(config.R2_EVIDENCE_BUCKET, upload.r2_object_key);
    } catch (headErr) {
      return res.status(400).json({
        error: "Evidence file was not found in storage. Ensure browser direct upload succeeded before completing.",
        code: "ERR_EVIDENCE_NOT_FOUND_IN_STORAGE",
      });
    }

    if (headMeta.contentLength <= 0) {
      return res.status(400).json({
        error: "Evidence file in storage is empty (0 bytes)",
        code: "ERR_EMPTY_EVIDENCE_FILE",
      });
    }

    if (headMeta.contentLength > config.MAX_EVIDENCE_FILE_BYTES) {
      return res.status(400).json({
        error: `Uploaded file size (${headMeta.contentLength} bytes) exceeds maximum permitted limit`,
        code: "ERR_FILE_TOO_LARGE",
      });
    }

    // Verify actual size matches declared expected size
    if (headMeta.contentLength !== upload.expected_size) {
      return res.status(400).json({
        error: `Uploaded file size (${headMeta.contentLength} bytes) does not match expected size (${upload.expected_size} bytes)`,
        code: "ERR_EVIDENCE_SIZE_MISMATCH",
      });
    }

    // Step 1: Retrieve and hash the uploaded temporary object, capturing header bytes for signature verification
    const tempStream = await getObjectStream(config.R2_EVIDENCE_BUCKET, upload.r2_object_key);
    const { sha256Hex: tempSha256Hex, totalBytes: tempTotalBytes, headerBuffer } = await calculateStreamSha256(tempStream);

    if (tempTotalBytes !== headMeta.contentLength) {
      return res.status(400).json({
        error: "Streamed byte count did not match object length. File transfer was incomplete.",
        code: "ERR_TRUNCATED_UPLOAD",
      });
    }

    // Audit 2: Validate magic bytes and prevent content-type spoofing
    let verifiedContentType;
    try {
      verifiedContentType = detectVerifiedContentType(headerBuffer, upload.declared_content_type);
    } catch (typeErr) {
      return res.status(400).json({
        error: typeErr.message,
        code: typeErr.code || "ERR_CONTENT_TYPE_SPOOFED",
      });
    }

    // Step 2: Copy temporary object to unique final immutable evidence object key
    // The final key is immutable and cannot be overwritten via the client's temporary presigned PUT URL
    const finalKey = `evidence/${ownerAccountId}/${tempSha256Hex}/${upload.original_filename}`;
    const pendingKey = upload.r2_object_key;

    await copyObject(
      config.R2_EVIDENCE_BUCKET,
      pendingKey,
      config.R2_EVIDENCE_BUCKET,
      finalKey
    );

    // Step 3: Retrieve finalized destination object
    let destMeta;
    try {
      destMeta = await headObject(config.R2_EVIDENCE_BUCKET, finalKey);
    } catch (destHeadErr) {
      return res.status(500).json({
        error: "Failed to locate finalized evidence object after copy",
        code: "ERR_FINALIZATION_COPY_FAILED",
      });
    }

    // Step 4: Stream destination object's actual contents through SHA-256
    const destStream = await getObjectStream(config.R2_EVIDENCE_BUCKET, finalKey);
    const { sha256Hex: destSha256Hex, totalBytes: destTotalBytes } = await calculateStreamSha256(destStream);

    // Step 5 & 6: Compare destination digest with original verified digest and confirm size
    if (
      destSha256Hex !== tempSha256Hex ||
      destTotalBytes !== tempTotalBytes ||
      destTotalBytes !== upload.expected_size ||
      destMeta.contentLength !== destTotalBytes
    ) {
      // TOCTOU defense: Clean up the compromised destination object immediately
      await deleteObject(config.R2_EVIDENCE_BUCKET, finalKey).catch(() => {});
      return res.status(400).json({
        error: "Finalized evidence digest or size does not match verified digest. Mid-flight file mutation detected.",
        code: "ERR_EVIDENCE_INTEGRITY_MISMATCH",
        details: {
          expectedSha256: tempSha256Hex,
          actualSha256: destSha256Hex,
          expectedBytes: tempTotalBytes,
          actualBytes: destTotalBytes,
        },
      });
    }

    // Step 7: Only then mark EvidenceUpload as VERIFIED atomically
    const updatedUpload = await EvidenceUpload.findOneAndUpdate(
      { upload_id: uploadId, status: "PENDING_UPLOAD" },
      {
        $set: {
          status: "VERIFIED",
          sha256_digest: destSha256Hex,
          actual_size: destTotalBytes,
          verified_content_type: verifiedContentType,
          r2_object_key: finalKey,
          verified_at: new Date(),
        },
      },
      { new: true }
    );

    if (!updatedUpload) {
      // Check if concurrent request completed it
      const current = await EvidenceUpload.findOne({ upload_id: uploadId });
      if (current && (current.status === "VERIFIED" || current.status === "ATTACHED")) {
        return res.status(200).json({
          success: true,
          upload: {
            uploadId: current.upload_id,
            sha256Digest: current.sha256_digest,
            actualSize: current.actual_size,
            verifiedContentType: current.verified_content_type,
            status: current.status,
            verifiedAt: current.verified_at,
          },
        });
      }
      return res.status(409).json({
        error: "Upload record was concurrently modified",
        code: "ERR_CONCURRENT_MODIFICATION",
      });
    }

    // Step 8: Delete the temporary pending object after successful finalization
    await deleteObject(config.R2_EVIDENCE_BUCKET, pendingKey).catch((delErr) => {
      console.warn(`[WARN] Non-fatal: temporary object cleanup failed for '${pendingKey}':`, delErr.message);
    });

    return res.status(200).json({
      success: true,
      upload: {
        uploadId: updatedUpload.upload_id,
        sha256Digest: updatedUpload.sha256_digest,
        actualSize: updatedUpload.actual_size,
        verifiedContentType: updatedUpload.verified_content_type,
        status: updatedUpload.status,
        verifiedAt: updatedUpload.verified_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /discoveries/prepare-registration
 * Validates verified evidence, generates canonical RFC 8785 evidence manifest,
 * public NEP-177 metadata descriptor, computes both hashes, and formats payload
 * for smart contract `register_discovery_and_mint`.
 */
router.post("/prepare-registration", requireAuth, async (req, res, next) => {
  try {
    const {
      discoveryId,
      tokenId,
      custodianId,
      rightsControllerId,
      evidenceUploadIds,
      publicMetadata,
      beneficiarySplits,
    } = req.body || {};

    const ownerAccountId = req.user.accountId;

    if (!discoveryId || typeof discoveryId !== "string" || !discoveryId.trim()) {
      return res.status(400).json({
        error: "A valid discoveryId is required",
        code: "ERR_INVALID_DISCOVERY_ID",
      });
    }
    const cleanDiscoveryId = discoveryId.trim();

    if (!tokenId || typeof tokenId !== "string" || !tokenId.trim()) {
      return res.status(400).json({
        error: "A valid tokenId is required",
        code: "ERR_INVALID_TOKEN_ID",
      });
    }
    const cleanTokenId = tokenId.trim();

    if (!custodianId || !isValidNearAccountId(custodianId)) {
      return res.status(400).json({
        error: `Invalid custodian NEAR account ID: '${custodianId}'`,
        code: "ERR_INVALID_CUSTODIAN_ID",
      });
    }

    if (!rightsControllerId || !isValidNearAccountId(rightsControllerId)) {
      return res.status(400).json({
        error: `Invalid rights controller NEAR account ID: '${rightsControllerId}'`,
        code: "ERR_INVALID_RIGHTS_CONTROLLER_ID",
      });
    }

    if (!Array.isArray(evidenceUploadIds) || evidenceUploadIds.length === 0) {
      return res.status(400).json({
        error: "At least one verified evidence upload ID is required",
        code: "ERR_EMPTY_EVIDENCE_LIST",
      });
    }

    if (!Array.isArray(beneficiarySplits) || beneficiarySplits.length === 0) {
      return res.status(400).json({
        error: "At least one royalty beneficiary split is required",
        code: "ERR_EMPTY_BENEFICIARY_SPLITS",
      });
    }

    // Validate beneficiary splits sum strictly to 10,000 basis points
    let totalBps = 0;
    const seenBeneficiaries = new Set();
    const cleanSplits = [];

    for (const split of beneficiarySplits) {
      const bAccount = String(split.account_id || "").trim().toLowerCase();
      if (!isValidNearAccountId(bAccount)) {
        return res.status(400).json({
          error: `Invalid beneficiary account ID: '${bAccount}'`,
          code: "ERR_INVALID_BENEFICIARY_ACCOUNT",
        });
      }

      if (seenBeneficiaries.has(bAccount)) {
        return res.status(400).json({
          error: `Duplicate beneficiary account in splits: '${bAccount}'`,
          code: "ERR_DUPLICATE_BENEFICIARY",
        });
      }
      seenBeneficiaries.add(bAccount);

      const bps = Number(split.basis_points);
      if (!Number.isInteger(bps) || bps <= 0 || bps > 10000) {
        return res.status(400).json({
          error: `Beneficiary '${bAccount}' basis points must be an integer between 1 and 10000`,
          code: "ERR_INVALID_BASIS_POINTS",
        });
      }

      totalBps += bps;
      cleanSplits.push({ account_id: bAccount, basis_points: bps });
    }

    if (totalBps !== 10000) {
      return res.status(400).json({
        error: `Total beneficiary splits must sum to exactly 10,000 basis points (current sum: ${totalBps})`,
        code: "ERR_BENEFICIARY_SPLITS_SUM_MISMATCH",
      });
    }

    // 1. Fetch and validate all evidence upload records
    const uploads = await EvidenceUpload.find({
      upload_id: { $in: evidenceUploadIds },
    });

    if (uploads.length !== evidenceUploadIds.length) {
      return res.status(400).json({
        error: "One or more requested evidence upload records could not be found",
        code: "ERR_EVIDENCE_NOT_FOUND",
      });
    }

    for (const upload of uploads) {
      // Must be owned by the authenticated researcher
      if (upload.owner_account_id !== ownerAccountId) {
        return res.status(403).json({
          error: `Evidence upload '${upload.upload_id}' is owned by another account`,
          code: "ERR_FORBIDDEN_EVIDENCE_OWNERSHIP",
        });
      }

      // Must be verified
      if (upload.status !== "VERIFIED") {
        return res.status(400).json({
          error: `Evidence upload '${upload.upload_id}' has status '${upload.status}'. Only VERIFIED evidence may be attached.`,
          code: "ERR_UNVERIFIED_EVIDENCE_ATTACHMENT",
        });
      }
    }

    // 2. Build Canonical Evidence Manifest (RFC 8785)
    const { canonicalJson: manifestJson, evidenceManifestHash } = buildCanonicalEvidenceManifest({
      discoveryId: cleanDiscoveryId,
      ownerAccountId,
      evidenceItems: uploads,
    });

    // Store private canonical manifest in R2
    const manifestKey = `manifests/${ownerAccountId}/${cleanDiscoveryId}/manifest.json`;
    await putObject(config.R2_EVIDENCE_BUCKET, manifestKey, manifestJson, "application/json");

    // Persist EvidenceManifest projection in MongoDB
    const manifestId = `manifest-${cleanDiscoveryId}`;
    await EvidenceManifest.findOneAndUpdate(
      { discovery_id: cleanDiscoveryId },
      {
        $setOnInsert: {
          manifest_id: manifestId,
          owner_account_id: ownerAccountId,
          discovery_id: cleanDiscoveryId,
          manifest_schema_version: "1.0.0",
          evidence_item_ids: uploads.map((u) => u.upload_id),
          canonical_manifest_json: manifestJson,
          evidence_manifest_hash: evidenceManifestHash,
          r2_manifest_object_key: manifestKey,
          is_immutable: true,
          created_at: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // 3. Build Public-Safe NEP-177 Metadata Descriptor (RFC 8785)
    const {
      descriptor,
      canonicalJson: descriptorJson,
      referenceHash,
      reference,
    } = buildPublicMetadataDescriptor({
      discoveryId: cleanDiscoveryId,
      publicMetadata: publicMetadata || {},
      version: "1.0.0",
      publicApiBaseUrl: config.PUBLIC_API_BASE_URL,
    });

    // Store canonical public descriptor in R2
    const descriptorKey = `public-metadata/${cleanDiscoveryId}/1.0.0/descriptor.json`;
    await putObject(config.R2_EVIDENCE_BUCKET, descriptorKey, descriptorJson, "application/json");

    // Persist PublicMetadataDescriptor in MongoDB
    await PublicMetadataDescriptor.findOneAndUpdate(
      { discovery_id: cleanDiscoveryId, version: "1.0.0" },
      {
        $setOnInsert: {
          discovery_id: cleanDiscoveryId,
          version: "1.0.0",
          canonical_descriptor_json: descriptorJson,
          sha256_digest: crypto.createHash("sha256").update(Buffer.from(descriptorJson, "utf8")).digest("hex"),
          reference_hash: referenceHash,
          reference,
          r2_descriptor_object_key: descriptorKey,
          is_immutable: true,
          created_at: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // 4. Return complete transaction payload for frontend NEAR wallet
    // Invariant: EvidenceUpload records remain in VERIFIED status until finalized
    // on-chain registration is confirmed and reconciled via /api/v1/transactions/reconcile.
    return res.status(200).json({
      discovery_id: cleanDiscoveryId,
      token_id: cleanTokenId,
      custodian_id: custodianId.trim(),
      rights_controller_id: rightsControllerId.trim(),
      evidence_manifest_hash: evidenceManifestHash,
      metadata: {
        title: descriptor.title,
        description: descriptor.description,
        media: descriptor.media,
        reference,
        reference_hash: referenceHash,
      },
      beneficiary_splits: cleanSplits,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

