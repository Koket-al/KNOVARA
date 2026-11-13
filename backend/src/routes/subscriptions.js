import express from "express";
import { SubscriptionProjection } from "../models/SubscriptionProjection.js";
import { AgentProfile } from "../models/AgentProfile.js";
import { issueCredential } from "../services/credentialService.js";
import * as nearContract from "../services/nearContract.js";

const router = express.Router();

/**
 * GET /api/v1/subscriptions
 * Lists subscriptions by subscriber or discovery.
 */
router.get("/", async (req, res) => {
  try {
    const { subscriber_id, discovery_id } = req.query;
    const query = {};
    if (subscriber_id) query.subscriber_id = subscriber_id.toLowerCase();
    if (discovery_id) query.discovery_id = discovery_id;

    const subscriptions = await SubscriptionProjection.find(query)
      .sort({ activated_at: -1 })
      .lean();

    res.json({ subscriptions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/subscriptions/:subscriptionId
 * Retrieves detailed subscription projection.
 */
router.get("/:subscriptionId", async (req, res) => {
  try {
    const sub = await SubscriptionProjection.findOne({
      subscription_id: req.params.subscriptionId,
    }).lean();

    if (!sub) {
      return res.status(404).json({ error: "ERR_SUBSCRIPTION_NOT_FOUND" });
    }

    res.json({ subscription: sub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/subscriptions/:subscriptionId/issue-credential
 * Issues an API credential for a confirmed active subscription.
 */
router.post("/:subscriptionId/issue-credential", async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    let sub = await SubscriptionProjection.findOne({ subscription_id: subscriptionId });
    if (!sub) {
      // Fallback check on chain
      const onChain = await nearContract.getSubscription(subscriptionId);
      if (!onChain) {
        return res.status(404).json({ error: "ERR_SUBSCRIPTION_NOT_FOUND" });
      }

      const activatedAt = new Date(Number(BigInt(onChain.activated_at) / 1_000_000n));
      const expiresAt = new Date(Number(BigInt(onChain.expires_at) / 1_000_000n));

      sub = await SubscriptionProjection.create({
        subscription_id: subscriptionId,
        offer_id: onChain.offer_id,
        discovery_id: onChain.discovery_id,
        token_id: onChain.token_id,
        subscriber_id: onChain.subscriber_id.toLowerCase(),
        api_product_id: onChain.api_product_id,
        openapi_spec_hash: onChain.openapi_spec_hash,
        accepted_terms_hash: onChain.accepted_terms_hash,
        price_yocto: String(onChain.price_yocto),
        activated_at: activatedAt,
        expires_at: expiresAt,
        status: new Date() > expiresAt ? "Expired" : "Active",
        block_height: 0,
        last_synced_at: new Date(),
      });
    }

    if (sub.status === "Expired" || new Date() > new Date(sub.expires_at)) {
      return res.status(403).json({ error: "ERR_SUBSCRIPTION_EXPIRED" });
    }

    // Resolve agent profile to bind owner and agent account
    const agent = await AgentProfile.findOne({
      agent_account_id: sub.subscriber_id.toLowerCase(),
    });

    const ownerAccountId = agent ? agent.owner_account_id : sub.subscriber_id;
    const agentId = agent ? agent.agent_id : `agent-${sub.subscriber_id}`;

    const issued = await issueCredential({
      agent_id: agentId,
      owner_account_id: ownerAccountId,
      agent_account_id: sub.subscriber_id,
      discovery_id: sub.discovery_id,
      api_product_id: sub.api_product_id,
      subscription_id: sub.subscription_id,
      expires_at: sub.expires_at,
    });

    res.status(201).json({
      success: true,
      credential: issued,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

