import { Router } from "express";
import { config } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { LicenseOfferProjection } from "../models/LicenseOfferProjection.js";
import { LicenseRequestProjection } from "../models/LicenseRequestProjection.js";
import { DiscoveryProjection } from "../models/DiscoveryProjection.js";
import { EvidenceUpload } from "../models/EvidenceUpload.js";
import { generatePresignedDownloadUrl } from "../services/r2Storage.js";
import * as nearContract from "../services/nearContract.js";
import { normalizeLicenseStatus } from "../services/syncService.js";

const router = Router();

/**
 * GET /api/v1/licenses/offers/:offerId
 * Public read-only endpoint returning a single licensing offer.
 */
router.get("/offers/:offerId", async (req, res, next) => {
  try {
    const { offerId } = req.params;

    const offer = await LicenseOfferProjection.findOne({ offer_id: offerId.trim() });
    if (!offer) {
      return res.status(404).json({
        error: `License offer '${offerId}' not found`,
        code: "ERR_OFFER_NOT_FOUND",
      });
    }

    return res.status(200).json({ offer });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/licenses/offers/:offerId/requests
 * Lists license requests associated with an offer.
 * Accessible to the Rights Controller (sees all requests) or prospective buyers (sees their own requests).
 */
router.get("/offers/:offerId/requests", requireAuth, async (req, res, next) => {
  try {
    const { offerId } = req.params;
    const sessionAccountId = req.user.accountId;

    const offer = await LicenseOfferProjection.findOne({ offer_id: offerId.trim() });
    if (!offer) {
      return res.status(404).json({
        error: `License offer '${offerId}' not found`,
        code: "ERR_OFFER_NOT_FOUND",
      });
    }

    const query = { offer_id: offerId.trim() };
    if (offer.rights_controller_id !== sessionAccountId) {
      // Non-controllers only see their own submitted requests
      query.buyer_id = sessionAccountId;
    }

    const requests = await LicenseRequestProjection.find(query).sort({ requested_at: -1 });
    return res.status(200).json({ offerId, requests });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/licenses/requests/:requestId
 * Retrieves details for a specific license request.
 * Authorized for either the requesting buyer or the discovery rights controller.
 */
router.get("/requests/:requestId", requireAuth, async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const sessionAccountId = req.user.accountId;

    let request = await LicenseRequestProjection.findOne({ request_id: requestId.trim() });

    // Fallback query to live contract if not yet projected
    if (!request) {
      const liveRecord = await nearContract.getLicenseRequest(requestId.trim());
      if (!liveRecord) {
        return res.status(404).json({
          error: `License request '${requestId}' not found`,
          code: "ERR_REQUEST_NOT_FOUND",
        });
      }

      // Check access permission against live on-chain record
      const discovery = await nearContract.getDiscovery(liveRecord.token_id);
      const isAuthorized =
        liveRecord.buyer_id === sessionAccountId ||
        discovery?.rights_controller_id === sessionAccountId;

      if (!isAuthorized) {
        return res.status(403).json({
          error: "You are not authorized to view this license request",
          code: "ERR_FORBIDDEN_REQUEST_ACCESS",
        });
      }

      return res.status(200).json({ request: liveRecord });
    }

    // Access authorization check
    const discovery = await DiscoveryProjection.findOne({ discovery_id: request.discovery_id });
    const isAuthorized =
      request.buyer_id === sessionAccountId ||
      request.rights_controller_id === sessionAccountId ||
      discovery?.rights_controller_id === sessionAccountId;

    if (!isAuthorized) {
      return res.status(403).json({
        error: "You are not authorized to view this license request",
        code: "ERR_FORBIDDEN_REQUEST_ACCESS",
      });
    }

    return res.status(200).json({ request });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/licenses/discoveries/:discoveryId/requests
 * Lists all requests for a discovery. Accessible exclusively to the Rights Controller.
 */
router.get("/discoveries/:discoveryId/requests", requireAuth, async (req, res, next) => {
  try {
    const { discoveryId } = req.params;
    const sessionAccountId = req.user.accountId;

    const discovery = await DiscoveryProjection.findOne({ discovery_id: discoveryId.trim() });
    if (!discovery) {
      return res.status(404).json({
        error: `Discovery '${discoveryId}' not found`,
        code: "ERR_DISCOVERY_NOT_FOUND",
      });
    }

    if (discovery.rights_controller_id !== sessionAccountId) {
      return res.status(403).json({
        error: "Only the designated Rights Controller may view all discovery license requests",
        code: "ERR_FORBIDDEN_NOT_RIGHTS_CONTROLLER",
      });
    }

    const requests = await LicenseRequestProjection.find({
      discovery_id: discoveryId.trim(),
    }).sort({ requested_at: -1 });

    return res.status(200).json({ discoveryId, requests });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/licenses/:licenseId/files/:fileId/download-url
 * Architecture Section 9.4: Scoped File Access & Streamed Download Flow.
 * Verifies caller authorization, validates active on-chain/projected license,
 * confirms file attachment, and issues short-lived presigned GET download URL.
 */
router.post("/:licenseId/files/:fileId/download-url", requireAuth, async (req, res, next) => {
  try {
    const { licenseId, fileId } = req.params;
    const sessionAccountId = req.user.accountId;

    if (!licenseId || !fileId) {
      return res.status(400).json({
        error: "licenseId and fileId are required parameters",
        code: "ERR_MISSING_DOWNLOAD_PARAMS",
      });
    }

    const cleanLicenseId = licenseId.trim();
    const cleanFileId = fileId.trim();

    // Step 1: Authoritative on-chain license verification via NEAR RPC (Fail Closed)
    let onChainRecord;
    try {
      onChainRecord = await nearContract.getLicense(cleanLicenseId);
    } catch (rpcErr) {
      return res.status(503).json({
        error: "Authoritative NEAR state verification failed due to RPC error. Download access failed closed.",
        code: "ERR_CHAIN_VERIFICATION_UNAVAILABLE",
        details: rpcErr.message,
      });
    }

    if (!onChainRecord) {
      return res.status(404).json({
        error: `License '${cleanLicenseId}' was not found on-chain`,
        code: "ERR_LICENSE_NOT_FOUND",
      });
    }

    // Step 2: Normalize Rust enum status and assert Active
    const normalized = normalizeLicenseStatus(onChainRecord.status);
    if (!normalized || normalized.status !== "Active") {
      const statusName = normalized?.status || "Unknown";
      if (statusName === "Expired") {
        return res.status(403).json({
          error: "This license has expired on-chain. Renew the license to regain evidence file access.",
          code: "ERR_LICENSE_EXPIRED",
        });
      }
      return res.status(403).json({
        error: `Authoritative on-chain license is not active (current status: '${statusName}'). Payment must be confirmed on-chain prior to download access.`,
        code: "ERR_LICENSE_NOT_ACTIVE",
      });
    }

    // Step 3: Check authoritative on-chain expiration timestamp
    if (normalized.expiresAt && normalized.expiresAt.getTime() <= Date.now()) {
      return res.status(403).json({
        error: "This license has expired on-chain. Renew the license to regain evidence file access.",
        code: "ERR_LICENSE_EXPIRED",
      });
    }

    // Step 4: Verify caller wallet authorization (buyer or rights controller)
    const projection = await LicenseRequestProjection.findOne({ request_id: cleanLicenseId });
    let rightsControllerId = projection?.rights_controller_id || null;

    if (!rightsControllerId) {
      try {
        const disc = await nearContract.getDiscovery(onChainRecord.token_id || onChainRecord.discovery_id);
        rightsControllerId = disc?.rights_controller_id || null;
      } catch (_e) {}
    }

    const isAuthorizedCaller =
      onChainRecord.buyer_id === sessionAccountId ||
      (rightsControllerId && rightsControllerId === sessionAccountId);

    if (!isAuthorizedCaller) {
      return res.status(403).json({
        error: "You are not authorized to access licensed files for this license agreement",
        code: "ERR_FORBIDDEN_NOT_LICENSEE",
      });
    }

    // Step 5: Locate the evidence item
    let evidence;
    if (cleanFileId === "primary-evidence" || cleanFileId === "default" || cleanFileId === "primary") {
      evidence = await EvidenceUpload.findOne({
        attached_discovery_id: onChainRecord.discovery_id,
        status: "ATTACHED",
      }).sort({ created_at: -1 });
    } else {
      evidence = await EvidenceUpload.findOne({
        upload_id: cleanFileId,
      });
    }

    if (!evidence) {
      return res.status(404).json({
        error: `Evidence file '${cleanFileId}' was not found for licensed discovery '${onChainRecord.discovery_id}'`,
        code: "ERR_EVIDENCE_NOT_FOUND",
      });
    }

    // Step 6: Verify evidence is strictly ATTACHED and associated with the licensed discovery
    if (evidence.status !== "ATTACHED" || evidence.attached_discovery_id !== onChainRecord.discovery_id) {
      return res.status(403).json({
        error: "Evidence file is not attached to this licensed discovery",
        code: "ERR_EVIDENCE_NOT_ATTACHED_OR_OUT_OF_SCOPE",
      });
    }

    // Step 7: Compute constrained presigned TTL (min 900 seconds, remaining license seconds)
    let ttlSeconds = 900;
    if (normalized.expiresAt) {
      const remainingSecs = Math.floor((normalized.expiresAt.getTime() - Date.now()) / 1000);
      if (remainingSecs > 0) {
        ttlSeconds = Math.min(900, remainingSecs);
      }
    }

    // Step 8: Issue presigned GET download URL
    const presignedUrl = await generatePresignedDownloadUrl({
      bucket: config.R2_EVIDENCE_BUCKET,
      key: evidence.r2_object_key,
      filename: evidence.original_filename,
      expiresIn: ttlSeconds,
    });

    return res.status(200).json({
      licenseId: onChainRecord.request_id || cleanLicenseId,
      fileId: evidence.upload_id,
      filename: evidence.original_filename,
      downloadUrl: presignedUrl,
      presignedUrl,
      sha256: evidence.sha256_digest,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/licenses/:licenseId/files
 * Returns the list of accessible attached evidence files for this active license.
 */
router.get("/:licenseId/files", requireAuth, async (req, res, next) => {
  try {
    const { licenseId } = req.params;
    const sessionAccountId = req.user.accountId;

    const onChainRecord = await nearContract.getLicense(licenseId.trim());
    if (!onChainRecord) {
      return res.status(404).json({ error: "License not found", code: "ERR_LICENSE_NOT_FOUND" });
    }

    const normalized = normalizeLicenseStatus(onChainRecord.status);
    if (!normalized || normalized.status !== "Active") {
      return res.status(403).json({ error: "License is not active", code: "ERR_LICENSE_NOT_ACTIVE" });
    }

    const projection = await LicenseRequestProjection.findOne({ request_id: licenseId.trim() });
    let rightsControllerId = projection?.rights_controller_id || null;
    if (!rightsControllerId) {
      try {
        const disc = await nearContract.getDiscovery(onChainRecord.token_id || onChainRecord.discovery_id);
        rightsControllerId = disc?.rights_controller_id || null;
      } catch (_e) {}
    }

    const isAuthorized =
      onChainRecord.buyer_id === sessionAccountId ||
      (rightsControllerId && rightsControllerId === sessionAccountId);

    if (!isAuthorized) {
      return res.status(403).json({ error: "Unauthorized", code: "ERR_FORBIDDEN_NOT_LICENSEE" });
    }

    const files = await EvidenceUpload.find({
      attached_discovery_id: onChainRecord.discovery_id,
      status: "ATTACHED",
    }).select("upload_id original_filename declared_content_type actual_size classification created_at").sort({ created_at: -1 });

    return res.status(200).json({ licenseId, discoveryId: onChainRecord.discovery_id, files });
  } catch (err) {
    next(err);
  }
});

export default router;
