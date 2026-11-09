import { Router } from "express";
import crypto from "crypto";
import { config } from "../config/env.js";
import { PublicMetadataDescriptor } from "../models/PublicMetadataDescriptor.js";
import { getObjectStream } from "../services/r2Storage.js";

const router = Router();

/**
 * Helper to fetch descriptor from Cloudflare R2 if not in MongoDB cache.
 */
async function fetchDescriptorFromR2(discoveryId, version) {
  try {
    const key = `public-metadata/${discoveryId}/${version}/descriptor.json`;
    const stream = await getObjectStream(config.R2_EVIDENCE_BUCKET, key);
    if (!stream) return null;

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const rawBuffer = Buffer.concat(chunks);
    const jsonStr = rawBuffer.toString("utf8");
    const sha256Hex = crypto.createHash("sha256").update(rawBuffer).digest("hex");
    const referenceHash = crypto.createHash("sha256").update(rawBuffer).digest("base64");

    // Asynchronously cache in MongoDB
    PublicMetadataDescriptor.findOneAndUpdate(
      { discovery_id: discoveryId, version },
      {
        $setOnInsert: {
          discovery_id: discoveryId,
          version,
          canonical_descriptor_json: jsonStr,
          sha256_digest: sha256Hex,
          reference_hash: referenceHash,
          reference: `${(config.PUBLIC_API_BASE_URL || "").replace(/\/$/, "")}/api/v1/metadata/${encodeURIComponent(discoveryId)}/${encodeURIComponent(version)}`,
          r2_descriptor_object_key: key,
          is_immutable: true,
          created_at: new Date(),
        },
      },
      { upsert: true, new: true }
    ).catch(() => {});

    return {
      canonical_descriptor_json: jsonStr,
      sha256_digest: sha256Hex,
    };
  } catch (_e) {
    return null;
  }
}

/**
 * Controller handling public metadata retrieval.
 */
async function handleGetMetadata(req, res, next) {
  try {
    const { discoveryId, version = "1.0.0" } = req.params;

    if (!discoveryId || typeof discoveryId !== "string" || !discoveryId.trim()) {
      return res.status(400).json({
        error: "A valid discoveryId parameter is required",
        code: "ERR_MISSING_METADATA_PARAMS",
      });
    }

    const cleanDiscoveryId = discoveryId.trim();
    const cleanVersion = (version || "1.0.0").trim();

    // 1. Check MongoDB cache first
    let descriptorDoc = await PublicMetadataDescriptor.findOne({
      discovery_id: cleanDiscoveryId,
      version: cleanVersion,
    });

    let canonicalJson = descriptorDoc?.canonical_descriptor_json;
    let sha256Digest = descriptorDoc?.sha256_digest;

    // 2. Fall back to R2 immutable storage if not in MongoDB
    if (!canonicalJson) {
      const fromR2 = await fetchDescriptorFromR2(cleanDiscoveryId, cleanVersion);
      if (fromR2) {
        canonicalJson = fromR2.canonical_descriptor_json;
        sha256Digest = fromR2.sha256_digest;
      }
    }

    if (!canonicalJson) {
      return res.status(404).json({
        error: `Public metadata descriptor for discovery '${cleanDiscoveryId}' version '${cleanVersion}' was not found`,
        code: "ERR_METADATA_NOT_FOUND",
      });
    }

    const bodyBuffer = Buffer.from(canonicalJson, "utf8");

    // 3. Set immutable caching and security headers
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Length", bodyBuffer.length);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("ETag", `"${sha256Digest}"`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");

    // 4. Return exact stored canonical UTF-8 bytes without mutation
    return res.status(200).send(bodyBuffer);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /metadata/:discoveryId/:version
 * GET /metadata/:discoveryId
 *
 * Public unauthenticated read-only endpoint returning the exact immutable
 * public metadata descriptor bytes used to compute the NEP-177 reference_hash.
 */
router.get("/metadata/:discoveryId/:version", handleGetMetadata);
router.get("/metadata/:discoveryId", handleGetMetadata);

export default router;

