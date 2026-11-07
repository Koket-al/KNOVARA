import crypto from "crypto";
import { canonicalize } from "json-canonicalize";
import { config } from "../config/env.js";

/**
 * Sanitizes a client-provided filename to prevent path traversal, control character injection,
 * and dangerous file naming.
 *
 * @param {string} rawFilename
 * @returns {string} - Clean, safe filename
 */
export function sanitizeFilename(rawFilename) {
  if (!rawFilename || typeof rawFilename !== "string") {
    return "evidence_file.bin";
  }

  // Strip null bytes and control characters (0x00 - 0x1F and 0x7F)
  let clean = rawFilename
    .replace(/\0/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();

  // Strip directory traversal sequences (../ or ..\ or ..)
  clean = clean.replace(/\.\.+/g, "");

  // Replace remaining path separators with underscore
  clean = clean.replace(/[/\\]+/g, "_");

  // Prevent hidden file prefixes or leading/trailing underscores
  clean = clean.replace(/^\.+/, "").replace(/^_+|_+$/g, "").trim();

  if (!clean || clean.length === 0) {
    return "evidence_file.bin";
  }

  // Limit filename length to 128 characters preserving extension
  if (clean.length > 128) {
    const extIdx = clean.lastIndexOf(".");
    if (extIdx > 0 && extIdx > clean.length - 15) {
      const ext = clean.substring(extIdx);
      clean = clean.substring(0, 128 - ext.length) + ext;
    } else {
      clean = clean.substring(0, 128);
    }
  }

  return clean;
}

/**
 * Validates NEAR account ID syntax.
 *
 * @param {string} accountId
 * @returns {boolean}
 */
export function isValidNearAccountId(accountId) {
  if (!accountId || typeof accountId !== "string") return false;
  const clean = accountId.trim().toLowerCase();
  // NEAR accounts: 2 to 64 chars, lowercase alphanumeric + '-' + '_' + '.'
  const nearRegex = /^(([a-z0-9]+[_-])*[a-z0-9]+\.)*([a-z0-9]+[_-])*[a-z0-9]+$/;
  return clean.length >= 2 && clean.length <= 64 && nearRegex.test(clean);
}

/**
 * Normalizes and canonicalizes a JavaScript object into a deterministic UTF-8 byte
 * buffer using the RFC 8785 JSON Canonicalization Scheme (JCS).
 *
 * @param {object} obj - JSON-serializable object
 * @returns {{ canonicalJson: string, canonicalBytes: Buffer, sha256Hex: string }}
 */
export function canonicalizeJsonRfc8785(obj) {
  if (obj === undefined || obj === null || typeof obj !== "object") {
    throw new Error("ERR_INVALID_JCS_INPUT: Input must be a valid JSON object or array");
  }

  let canonicalJson;
  try {
    canonicalJson = canonicalize(obj);
  } catch (err) {
    throw new Error(`ERR_RFC8785_CANONICALIZATION_FAILED: ${err.message}`);
  }

  const canonicalBytes = Buffer.from(canonicalJson, "utf8");
  const sha256Hex = crypto.createHash("sha256").update(canonicalBytes).digest("hex").toLowerCase();

  return {
    canonicalJson,
    canonicalBytes,
    sha256Hex,
  };
}

/**
 * Generates an RFC 8785-compliant canonical evidence manifest.
 *
 * Sorts evidence items deterministically by `evidence_id` using code-point ordering
 * before canonicalization, guaranteeing identical byte sequences regardless of array input order.
 *
 * @param {object} params
 * @param {string} params.discoveryId - Unique discovery identifier
 * @param {string} params.ownerAccountId - NEAR account ID of discovery creator
 * @param {Array<object>} params.evidenceItems - List of verified evidence records
 * @param {string} [params.createdAt] - Creation timestamp (defaults to current ISO string)
 * @param {string} [params.schemaVersion] - Schema version (defaults to "1.0.0")
 * @returns {{ manifest: object, canonicalJson: string, canonicalBytes: Buffer, evidenceManifestHash: string }}
 */
export function buildCanonicalEvidenceManifest({
  discoveryId,
  ownerAccountId,
  evidenceItems,
  createdAt = new Date().toISOString(),
  schemaVersion = "1.0.0",
}) {
  if (!discoveryId || typeof discoveryId !== "string" || !discoveryId.trim()) {
    throw new Error("ERR_INVALID_DISCOVERY_ID: A valid discovery ID is required");
  }
  if (!ownerAccountId || !isValidNearAccountId(ownerAccountId)) {
    throw new Error("ERR_INVALID_OWNER_ACCOUNT_ID: A valid NEAR account ID is required");
  }
  if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) {
    throw new Error("ERR_EMPTY_EVIDENCE_LIST: At least one verified evidence item is required");
  }

  // Validate and collect unique evidence items
  const seenEvidenceIds = new Set();
  const validatedItems = [];

  for (const item of evidenceItems) {
    const evidenceId = String(item.evidence_id || item.upload_id || "").trim();
    if (!evidenceId) {
      throw new Error("ERR_INVALID_EVIDENCE_ITEM: Evidence item must have a valid evidence_id");
    }

    if (seenEvidenceIds.has(evidenceId)) {
      throw new Error(`ERR_DUPLICATE_EVIDENCE_ID: Duplicate evidence identifier detected: '${evidenceId}'`);
    }
    seenEvidenceIds.add(evidenceId);

    const fileHash = String(item.file_hash || item.sha256_digest || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(fileHash)) {
      throw new Error(`ERR_INVALID_EVIDENCE_HASH: File hash must be 64 lowercase hexadecimal characters for evidence '${evidenceId}'`);
    }

    const fileSize = Number(item.file_size !== undefined ? item.file_size : item.actual_size);
    if (isNaN(fileSize) || fileSize < 0) {
      throw new Error(`ERR_INVALID_FILE_SIZE: Valid non-negative file size required for evidence '${evidenceId}'`);
    }

    validatedItems.push({
      evidence_id: evidenceId,
      file_hash: fileHash,
      file_size: fileSize,
      media_type: String(item.media_type || item.verified_content_type || "application/octet-stream").trim(),
      classification: String(item.classification || "TECHNICAL_DOCUMENTATION").trim(),
      original_filename: sanitizeFilename(item.original_filename || item.filename || "evidence.bin"),
    });
  }

  // Deterministic locale-independent sorting by evidence_id (ASCII / Unicode code point order)
  validatedItems.sort((a, b) => (a.evidence_id < b.evidence_id ? -1 : a.evidence_id > b.evidence_id ? 1 : 0));

  const manifest = {
    schema_version: schemaVersion,
    discovery_id: discoveryId.trim(),
    owner_account_id: ownerAccountId.trim().toLowerCase(),
    created_at: createdAt,
    items: validatedItems,
  };

  const { canonicalJson, canonicalBytes, sha256Hex } = canonicalizeJsonRfc8785(manifest);

  return {
    manifest,
    canonicalJson,
    canonicalBytes,
    evidenceManifestHash: sha256Hex, // 64 lowercase hex characters
  };
}

/**
 * Builds a public-safe NEP-177 metadata descriptor and computes the exact reference hash.
 *
 * STRICT PRIVACY INVARIANT:
 * Contains ONLY public metadata approved for on-chain indexing. Never includes private evidence files,
 * R2 keys, presigned URLs, confidential research data, or session credentials.
 *
 * @param {object} params
 * @param {string} params.discoveryId - Unique discovery identifier
 * @param {object} params.publicMetadata - Public metadata object
 * @param {string} [params.version] - Descriptor version (default "1.0.0")
 * @param {string} [params.createdAt] - Creation timestamp
 * @param {string} [params.publicApiBaseUrl] - Base URL for stable reference endpoint
 * @returns {{ descriptor: object, canonicalJson: string, canonicalBytes: Buffer, sha256Hex: string, referenceHash: string, reference: string }}
 */
export function buildPublicMetadataDescriptor({
  discoveryId,
  publicMetadata = {},
  version = "1.0.0",
  createdAt = new Date().toISOString(),
  publicApiBaseUrl = config.PUBLIC_API_BASE_URL,
}) {
  if (!discoveryId || typeof discoveryId !== "string" || !discoveryId.trim()) {
    throw new Error("ERR_INVALID_DISCOVERY_ID: A valid discovery ID is required");
  }

  const cleanDiscoveryId = discoveryId.trim();

  // Extract only approved public fields
  const descriptor = {
    schema_version: version,
    discovery_id: cleanDiscoveryId,
    title: String(publicMetadata.title || cleanDiscoveryId).trim(),
    description: String(publicMetadata.description || "").trim(),
    category: String(publicMetadata.category || "GENERAL").trim().toUpperCase(),
    media: publicMetadata.media ? String(publicMetadata.media).trim() : null,
    attributes: Array.isArray(publicMetadata.attributes)
      ? publicMetadata.attributes.map((attr) => ({
          trait_type: String(attr.trait_type || "").trim(),
          value: String(attr.value || "").trim(),
        }))
      : [],
    created_at: createdAt,
  };

  const { canonicalJson, canonicalBytes, sha256Hex } = canonicalizeJsonRfc8785(descriptor);

  // NEP-177 reference_hash: Base64 encoding of 32 SHA-256 raw bytes
  const rawDigest = crypto.createHash("sha256").update(canonicalBytes).digest();
  const referenceHash = rawDigest.toString("base64"); // 44-character Base64 string

  // Stable absolute public reference URL
  const base = (publicApiBaseUrl || "").replace(/\/$/, "");
  const reference = `${base}/api/v1/metadata/${encodeURIComponent(cleanDiscoveryId)}/${encodeURIComponent(version)}`;

  return {
    descriptor,
    canonicalJson,
    canonicalBytes,
    sha256Hex,
    referenceHash,
    reference,
  };
}

/**
 * Inspects raw file header bytes (magic bytes / file signatures) to determine
 * the actual content type and verify it against the client-declared content type.
 *
 * Supported verified signatures:
 * - PDF: Starts with `%PDF-` (0x25, 0x50, 0x44, 0x46, 0x2D)
 * - PNG: Starts with `\x89PNG\r\n\x1a\n` (0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
 * - JPEG: Starts with `\xFF\xD8\xFF` (0xFF, 0xD8, 0xFF)
 * - ZIP: Starts with `PK\x03\x04` (0x50, 0x4B, 0x03, 0x04)
 * - JSON: Starts with `{` or `[` (ignoring leading whitespace and BOM), valid UTF-8, no binary null bytes
 * - Text/CSV: Valid UTF-8 / printable ASCII without binary null bytes (0x00)
 *
 * Security & Integrity Invariants:
 * - Rejects spoofed content types with code `ERR_CONTENT_TYPE_SPOOFED` when declared type
 *   contradicts the file signature.
 * - Preserves distinction between declared type, verified type, and "application/octet-stream"
 *   for unrecognized binary formats.
 * - Performs structural file signature verification only; makes ZERO claims of antivirus,
 *   malware scanning, or executable sandboxing.
 *
 * @param {Buffer} headerBuffer - Leading raw bytes from object stream (e.g. up to 512 bytes)
 * @param {string} declaredContentType - Client-declared MIME type
 * @returns {string} - Verified canonical MIME type
 */
export function detectVerifiedContentType(headerBuffer, declaredContentType) {
  const declared = (declaredContentType || "").trim().toLowerCase();
  const buf = Buffer.isBuffer(headerBuffer) ? headerBuffer : Buffer.from(headerBuffer || []);

  if (buf.length === 0) {
    const err = new Error("ERR_EMPTY_EVIDENCE_FILE: Evidence file has 0 bytes");
    err.code = "ERR_EMPTY_EVIDENCE_FILE";
    throw err;
  }

  // 1. Signature checks
  const isPdf = buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-";
  const isPng =
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isZip = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;

  let hasNullByte = false;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x00) {
      hasNullByte = true;
      break;
    }
  }

  // Check JSON
  let isJson = false;
  if (!hasNullByte && !isPdf && !isPng && !isJpeg && !isZip) {
    let startIdx = 0;
    // Strip UTF-8 BOM if present
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      startIdx = 3;
    }
    while (startIdx < buf.length && (buf[startIdx] === 0x20 || buf[startIdx] === 0x09 || buf[startIdx] === 0x0a || buf[startIdx] === 0x0d)) {
      startIdx++;
    }
    if (startIdx < buf.length && (buf[startIdx] === 0x7b || buf[startIdx] === 0x5b)) { // '{' or '['
      try {
        const textSlice = buf.subarray(startIdx).toString("utf8");
        if (!textSlice.includes("\ufffd")) {
          isJson = true;
        }
      } catch (_e) {
        isJson = false;
      }
    }
  }

  // Check Text/CSV
  let isText = false;
  if (!hasNullByte && !isPdf && !isPng && !isJpeg && !isZip) {
    try {
      const text = buf.toString("utf8");
      if (!text.includes("\ufffd")) {
        isText = true;
      }
    } catch (_e) {
      isText = false;
    }
  }

  // Determine detected type
  let detectedType;
  if (isPdf) detectedType = "application/pdf";
  else if (isPng) detectedType = "image/png";
  else if (isJpeg) detectedType = "image/jpeg";
  else if (isZip) detectedType = "application/zip";
  else if (isJson) detectedType = "application/json";
  else if (isText) detectedType = (declared === "text/csv" ? "text/csv" : "text/plain");
  else detectedType = "application/octet-stream";

  // 2. Strict spoofing prevention: if declared is specific, it MUST match the file signature
  if (declared === "application/pdf" && !isPdf) {
    const err = new Error(`Declared content-type 'application/pdf' contradicts verified file signature (detected '${detectedType}')`);
    err.code = "ERR_CONTENT_TYPE_SPOOFED";
    throw err;
  }

  if (declared === "image/png" && !isPng) {
    const err = new Error(`Declared content-type 'image/png' contradicts verified file signature (detected '${detectedType}')`);
    err.code = "ERR_CONTENT_TYPE_SPOOFED";
    throw err;
  }

  if ((declared === "image/jpeg" || declared === "image/jpg") && !isJpeg) {
    const err = new Error(`Declared content-type '${declared}' contradicts verified file signature (detected '${detectedType}')`);
    err.code = "ERR_CONTENT_TYPE_SPOOFED";
    throw err;
  }

  if ((declared === "application/zip" || declared === "application/x-zip-compressed") && !isZip) {
    const err = new Error(`Declared content-type '${declared}' contradicts verified file signature (detected '${detectedType}')`);
    err.code = "ERR_CONTENT_TYPE_SPOOFED";
    throw err;
  }

  if (declared === "application/json" && !isJson) {
    const err = new Error(`Declared content-type 'application/json' contradicts verified file signature (detected '${detectedType}')`);
    err.code = "ERR_CONTENT_TYPE_SPOOFED";
    throw err;
  }

  if ((declared === "text/plain" || declared === "text/csv") && (hasNullByte || !isText)) {
    const err = new Error(`Declared content-type '${declared}' contradicts verified file signature (detected binary data or null bytes)`);
    err.code = "ERR_CONTENT_TYPE_SPOOFED";
    throw err;
  }

  // If a known signature was detected, return the detected type
  if (detectedType !== "application/octet-stream") {
    return detectedType;
  }

  // Unrecognized binary: preserve distinction
  return "application/octet-stream";
}
