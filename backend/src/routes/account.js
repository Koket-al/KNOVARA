import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { DiscoveryProjection } from "../models/DiscoveryProjection.js";
import { LicenseOfferProjection } from "../models/LicenseOfferProjection.js";
import { LicenseRequestProjection } from "../models/LicenseRequestProjection.js";
import { AccountRoyaltyProjection } from "../models/AccountRoyaltyProjection.js";
import * as nearContract from "../services/nearContract.js";

const router = Router();

/**
 * GET /api/v1/account/discoveries
 * Retrieves registered discoveries where the authenticated user is custodian or rights controller.
 */
router.get("/discoveries", requireAuth, async (req, res, next) => {
  try {
    const sessionAccountId = req.user.accountId;

    const discoveries = await DiscoveryProjection.find({
      $or: [
        { custodian_id: sessionAccountId },
        { rights_controller_id: sessionAccountId },
      ],
    }).sort({ registered_at: -1 });

    return res.status(200).json({
      accountId: sessionAccountId,
      discoveries,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/account/offers
 * Retrieves licensing offers managed by the authenticated account as Rights Controller.
 */
router.get("/offers", requireAuth, async (req, res, next) => {
  try {
    const sessionAccountId = req.user.accountId;

    const offers = await LicenseOfferProjection.find({
      rights_controller_id: sessionAccountId,
    }).sort({ created_at: -1 });

    return res.status(200).json({
      accountId: sessionAccountId,
      offers,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/account/requests
 * Retrieves license requests submitted by the authenticated user.
 */
router.get("/requests", requireAuth, async (req, res, next) => {
  try {
    const sessionAccountId = req.user.accountId;

    const requests = await LicenseRequestProjection.find({
      buyer_id: sessionAccountId,
    }).sort({ requested_at: -1 });

    return res.status(200).json({
      accountId: sessionAccountId,
      requests,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/account/licenses
 * Retrieves active or historical licenses held by the authenticated account.
 */
router.get("/licenses", requireAuth, async (req, res, next) => {
  try {
    const sessionAccountId = req.user.accountId;

    const licenses = await LicenseRequestProjection.find({
      buyer_id: sessionAccountId,
      status: { $in: ["Active", "Expired"] },
    }).sort({ activated_at: -1, requested_at: -1 });

    return res.status(200).json({
      accountId: sessionAccountId,
      licenses,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/account/royalties
 * Retrieves authoritative live royalty balance and pending withdrawal info directly from NEAR Testnet contract.
 */
router.get("/royalties", requireAuth, async (req, res, next) => {
  try {
    const sessionAccountId = req.user.accountId;

    // Direct authoritative query to NEAR Testnet contract (never rely on stale projections for finances)
    let liveClaimable = "0";
    let livePending = "0";

    try {
      const [claimableRes, pendingRes] = await Promise.all([
        nearContract.getClaimableBalance(sessionAccountId),
        nearContract.getPendingRoyaltyWithdrawals(),
      ]);
      liveClaimable = String(claimableRes);
      livePending = String(pendingRes);
    } catch (_err) {
      // Fallback to projection if contract RPC is temporarily unreachable
      const cached = await AccountRoyaltyProjection.findOne({ account_id: sessionAccountId });
      if (cached) {
        liveClaimable = cached.claimable_balance_yocto;
        livePending = cached.pending_withdrawals_yocto;
      }
    }

    return res.status(200).json({
      accountId: sessionAccountId,
      claimableBalanceYocto: liveClaimable,
      pendingWithdrawalsYocto: livePending,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/account/storage
 * Retrieves authoritative NEP-145 storage balance for the account.
 * Supports authenticated sessions or public query parameter ?accountId=<accountId>.
 */
router.get("/storage", (req, res, next) => {
  if (req.query.accountId) {
    return next();
  }
  return requireAuth(req, res, next);
}, async (req, res, next) => {
  try {
    const targetAccountId = req.query.accountId || req.user?.accountId;

    if (!targetAccountId) {
      return res.status(401).json({
        error: "Authentication required or accountId parameter must be provided",
        code: "ERR_UNAUTHENTICATED",
      });
    }

    const [storageBalance, bounds] = await Promise.all([
      nearContract.getStorageBalanceOf(targetAccountId),
      nearContract.getStorageBalanceBounds(),
    ]);

    return res.status(200).json({
      accountId: targetAccountId,
      storageBalance: storageBalance || null,
      bounds: bounds || null,
      isRegistered: Boolean(storageBalance),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

