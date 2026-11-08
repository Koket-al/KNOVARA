import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { LicenseOfferProjection } from "../models/LicenseOfferProjection.js";
import { LicenseRequestProjection } from "../models/LicenseRequestProjection.js";
import { DiscoveryProjection } from "../models/DiscoveryProjection.js";
import * as nearContract from "../services/nearContract.js";

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

export default router;
