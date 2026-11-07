import { Router } from "express";
import { PublicMetadataDescriptor } from "../models/PublicMetadataDescriptor.js";

const router = Router();

/**
 * GET /metadata/:discoveryId/:version
 *
 * Public unauthenticated read-only endpoint returning the exact immutable
 * public metadata descriptor bytes used to compute the NEP-177 reference_hash.
 *
 * Sets long-lived immutable cache headers and never mutates or reformats descriptor bytes.
 */
router.get("/metadata/:discoveryId/:version", async (req, res, next) => {
  try {
    const { discoveryId, version } = req.params;

    if (!discoveryId || !version) {
      return res.status(400).json({
        error: "discoveryId and version parameters are required",
        code: "ERR_MISSING_METADATA_PARAMS",
      });
    }

    const descriptorDoc = await PublicMetadataDescriptor.findOne({
      discovery_id: discoveryId.trim(),
      version: version.trim(),
    });

    if (!descriptorDoc) {
      return res.status(404).json({
        error: `Public metadata descriptor for discovery '${discoveryId}' version '${version}' was not found`,
        code: "ERR_METADATA_NOT_FOUND",
      });
    }

    // Set immutable caching headers
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("ETag", `"${descriptorDoc.sha256_digest}"`);

    // Return the exact stored canonical UTF-8 bytes
    return res.status(200).send(descriptorDoc.canonical_descriptor_json);
  } catch (err) {
    next(err);
  }
});

export default router;

