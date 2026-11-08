import { Router } from "express";
import { DiscoveryProjection } from "../models/DiscoveryProjection.js";
import { LicenseOfferProjection } from "../models/LicenseOfferProjection.js";
import * as nearContract from "../services/nearContract.js";

const router = Router();

/**
 * GET /api/v1/discoveries
 * Search and browse public registered discoveries.
 * Supports pagination, text search (title/description), category filter, and sorting.
 */
router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "12", 10)));
    const skip = (page - 1) * limit;

    const query = {};

    // Filter by category
    if (req.query.category && typeof req.query.category === "string") {
      query["public_metadata.category"] = req.query.category.trim().toUpperCase();
    }

    // Text search on title and description
    if (req.query.q && typeof req.query.q === "string" && req.query.q.trim()) {
      const q = req.query.q.trim();
      query.$or = [
        { "public_metadata.title": { $regex: q, $options: "i" } },
        { "public_metadata.description": { $regex: q, $options: "i" } },
        { discovery_id: { $regex: q, $options: "i" } },
      ];
    }

    // Sorting
    const sort = req.query.sort === "oldest" ? { registered_at: 1 } : { registered_at: -1 };

    const [items, total] = await Promise.all([
      DiscoveryProjection.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select("-__v"),
      DiscoveryProjection.countDocuments(query),
    ]);

    return res.status(200).json({
      discoveries: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/discoveries/:discoveryId
 * Retrieves public details for a single registered discovery.
 */
router.get("/:discoveryId", async (req, res, next) => {
  try {
    const { discoveryId } = req.params;

    const discovery = await DiscoveryProjection.findOne({
      discovery_id: discoveryId.trim(),
    });

    if (!discovery) {
      return res.status(404).json({
        error: `Discovery '${discoveryId}' was not found`,
        code: "ERR_DISCOVERY_NOT_FOUND",
      });
    }

    return res.status(200).json({
      discovery,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/discoveries/:discoveryId/passport
 * Retrieves authoritative on-chain NEP-171 Passport NFT token metadata.
 */
router.get("/:discoveryId/passport", async (req, res, next) => {
  try {
    const { discoveryId } = req.params;

    const discovery = await DiscoveryProjection.findOne({
      discovery_id: discoveryId.trim(),
    });

    if (!discovery) {
      return res.status(404).json({
        error: `Discovery '${discoveryId}' was not found`,
        code: "ERR_DISCOVERY_NOT_FOUND",
      });
    }

    // Query live contract for authoritative NFT token data
    const token = await nearContract.getNftToken(discovery.token_id);

    return res.status(200).json({
      tokenId: discovery.token_id,
      discoveryId: discovery.discovery_id,
      custodianId: discovery.custodian_id,
      rightsControllerId: discovery.rights_controller_id,
      token: token || null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/discoveries/:discoveryId/offers
 * Retrieves active licensing offers created for this discovery.
 */
router.get("/:discoveryId/offers", async (req, res, next) => {
  try {
    const { discoveryId } = req.params;

    const offers = await LicenseOfferProjection.find({
      discovery_id: discoveryId.trim(),
      is_active: true,
    }).sort({ created_at: -1 });

    return res.status(200).json({
      discoveryId,
      offers,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

