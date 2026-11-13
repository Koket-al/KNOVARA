import express from "express";
import crypto from "crypto";
import { AgentProfile } from "../models/AgentProfile.js";
import { PurchaseIntent } from "../models/PurchaseIntent.js";
import { ApiProduct } from "../models/ApiProduct.js";
import { DiscoveryProjection } from "../models/DiscoveryProjection.js";
import { ApiCredential } from "../models/ApiCredential.js";
import { prepareSubscribeToOfferIntent } from "../services/transactionIntent.js";
import { rotateCredential, revokeCredential } from "../services/credentialService.js";

const router = express.Router();

/**
 * POST /api/v1/agent/profiles
 * Registers a new AI agent and associates with an owner and dedicated agent account.
 */
router.post("/profiles", async (req, res) => {
  try {
    const { name, owner_account_id, agent_account_id, public_key } = req.body;

    if (!name || !owner_account_id || !agent_account_id) {
      return res.status(400).json({
        error: "ERR_MISSING_FIELDS: name, owner_account_id, and agent_account_id are required",
      });
    }

    const agentId = `agent-${crypto.randomUUID().slice(0, 8)}`;

    const profile = await AgentProfile.create({
      agent_id: agentId,
      name,
      owner_account_id: owner_account_id.toLowerCase(),
      agent_account_id: agent_account_id.toLowerCase(),
      public_key: public_key || null,
      verification_status: "verified",
    });

    res.status(201).json({
      success: true,
      agent: profile,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/v1/agent/profiles
 * Retrieves agents belonging to an owner.
 */
router.get("/profiles", async (req, res) => {
  try {
    const { owner_account_id } = req.query;
    const query = {};
    if (owner_account_id) {
      query.owner_account_id = owner_account_id.toLowerCase();
    }
    const agents = await AgentProfile.find(query).lean();
    res.json({ agents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/agent/recommendations
 * Evaluates assets and published API products to recommend suitable data/compute APIs.
 */
router.post("/recommendations", async (req, res) => {
  try {
    const { query, category, max_price_near } = req.body;

    const filter = { status: "published" };
    const products = await ApiProduct.find(filter).lean();

    const matches = [];
    const searchTerms = (query || "").toLowerCase().split(/\s+/).filter(Boolean);

    for (const prod of products) {
      if (max_price_near && prod.monthly_price_near > Number(max_price_near)) {
        continue;
      }

      let score = 1;
      const haystack = `${prod.title} ${prod.description} ${prod.endpoints.map((e) => `${e.path} ${e.summary} ${e.description}`).join(" ")}`.toLowerCase();

      for (const term of searchTerms) {
        if (haystack.includes(term)) {
          score += 2;
        }
      }

      matches.push({
        discovery_id: prod.discovery_id,
        api_product_id: prod.api_product_id,
        title: prod.title,
        description: prod.description,
        offer_id: prod.offer_id,
        monthly_price_near: prod.monthly_price_near,
        monthly_price_yocto: prod.monthly_price_yocto,
        endpoints_count: prod.endpoints.length,
        endpoints: prod.endpoints,
        relevance_score: score,
        recommendation_reason: `Provides ${prod.endpoints.length} verified operations matching '${query || "technology queries"}' at fixed 30-day rate of ${prod.monthly_price_near} NEAR`,
      });
    }

    matches.sort((a, b) => b.relevance_score - a.relevance_score);

    res.json({ recommendations: matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/agent/prepare-intent
 * Prepares a structured purchase intent for human owner approval.
 */
router.post("/prepare-intent", async (req, res) => {
  try {
    const { agent_id, discovery_id, api_product_id } = req.body;

    if (!agent_id || !discovery_id) {
      return res.status(400).json({
        error: "ERR_MISSING_FIELDS: agent_id and discovery_id are required",
      });
    }

    const agent = await AgentProfile.findOne({ agent_id });
    if (!agent) {
      return res.status(404).json({ error: "ERR_AGENT_NOT_FOUND" });
    }

    const product = api_product_id
      ? await ApiProduct.findOne({ api_product_id })
      : await ApiProduct.findOne({ discovery_id, status: "published" });

    if (!product || !product.offer_id) {
      return res.status(404).json({
        error: "ERR_OFFER_NOT_FOUND: No published subscription offer found for this asset",
      });
    }

    const subscriptionId = `sub-${crypto.randomUUID().slice(0, 8)}`;
    const intentId = `intent-${crypto.randomUUID().slice(0, 8)}`;

    const transactionPayload = prepareSubscribeToOfferIntent({
      subscriptionId,
      offerId: product.offer_id,
      acceptedTermsHash: product.canonical_spec_hash,
      exactPriceYocto: product.monthly_price_yocto,
      agentAccountId: agent.agent_account_id,
    });

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1-hour intent window

    const intent = await PurchaseIntent.create({
      intent_id: intentId,
      agent_id: agent.agent_id,
      owner_account_id: agent.owner_account_id,
      agent_account_id: agent.agent_account_id,
      discovery_id: product.discovery_id,
      api_product_id: product.api_product_id,
      offer_id: product.offer_id,
      price_yocto: product.monthly_price_yocto,
      price_near: product.monthly_price_near,
      terms_hash: product.canonical_spec_hash,
      duration_days: 30,
      transaction_payload: transactionPayload,
      status: "prepared",
      expires_at: expiresAt,
    });

    res.status(201).json({
      success: true,
      intent_id: intent.intent_id,
      subscription_id: subscriptionId,
      agent: {
        agent_id: agent.agent_id,
        agent_account_id: agent.agent_account_id,
        owner_account_id: agent.owner_account_id,
      },
      asset: {
        discovery_id: product.discovery_id,
        title: product.title,
        price_near: product.monthly_price_near,
        price_yocto: product.monthly_price_yocto,
        duration_days: 30,
      },
      transaction_payload: transactionPayload,
      expires_at: expiresAt,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/v1/agent/credentials
 * Lists active credentials for an owner's agents (tokens are hashed, prefix only).
 */
router.get("/credentials", async (req, res) => {
  try {
    const { owner_account_id, agent_id } = req.query;
    const query = {};
    if (owner_account_id) query.owner_account_id = owner_account_id.toLowerCase();
    if (agent_id) query.agent_id = agent_id;

    const credentials = await ApiCredential.find(query)
      .select("-token_hash")
      .sort({ created_at: -1 })
      .lean();

    res.json({ credentials });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/agent/credentials/:credentialId/rotate
 * Rotates credential token and returns fresh bearer token once.
 */
router.post("/credentials/:credentialId/rotate", async (req, res) => {
  try {
    const { owner_account_id } = req.body;
    const result = await rotateCredential(req.params.credentialId, owner_account_id);
    res.json({ success: true, credential: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/v1/agent/credentials/:credentialId/revoke
 * Immediately revokes an API credential.
 */
router.post("/credentials/:credentialId/revoke", async (req, res) => {
  try {
    const { owner_account_id } = req.body;
    const result = await revokeCredential(req.params.credentialId, owner_account_id);
    res.json({ success: true, credential: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

