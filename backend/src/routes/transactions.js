import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { verifyAndReconcileTransaction } from "../services/transactionVerifier.js";
import { ChainTransaction } from "../models/ChainTransaction.js";
import {
  prepareRegisterDiscoveryIntent,
  prepareCreateOfferIntent,
  prepareDeactivateOfferIntent,
  prepareRequestLicenseIntent,
  prepareApproveRequestIntent,
  prepareRejectRequestIntent,
  preparePayLicenseIntent,
  prepareWithdrawEarningsIntent,
  prepareExpireLicenseIntent,
  prepareStorageDepositIntent,
} from "../services/transactionIntent.js";

const router = Router();

/**
 * POST /api/v1/transactions/reconcile
 * Verifies on-chain transaction execution and synchronizes authoritative state into MongoDB.
 */
router.post("/reconcile", requireAuth, async (req, res, next) => {
  try {
    const { txHash } = req.body || {};
    const sessionAccountId = req.user.accountId;

    if (!txHash || typeof txHash !== "string" || !txHash.trim()) {
      return res.status(400).json({
        error: "Transaction hash is required",
        code: "ERR_MISSING_TX_HASH",
      });
    }

    const result = await verifyAndReconcileTransaction(txHash.trim(), sessionAccountId);
    const httpStatus = result.status === "PENDING" ? 202 : 200;
    return res.status(httpStatus).json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code || "ERR_TRANSACTION_RECONCILIATION_FAILED",
        details: err.details || null,
      });
    }
    next(err);
  }
});

/**
 * GET /api/v1/transactions/:txHash
 * Queries stored status for a reconciled transaction.
 */
router.get("/:txHash", requireAuth, async (req, res, next) => {
  try {
    const { txHash } = req.params;
    const sessionAccountId = req.user.accountId;

    const txDoc = await ChainTransaction.findOne({ transaction_hash: txHash.trim() });
    if (!txDoc) {
      return res.status(404).json({
        error: `Transaction '${txHash}' was not found in reconciliation records`,
        code: "ERR_TRANSACTION_NOT_FOUND",
      });
    }

    if (txDoc.signer_account_id !== sessionAccountId) {
      return res.status(403).json({
        error: "You are not authorized to view transactions for another account",
        code: "ERR_FORBIDDEN_TX_OWNERSHIP",
      });
    }

    return res.status(200).json({
      transactionHash: txDoc.transaction_hash,
      signerAccountId: txDoc.signer_account_id,
      receiverContractId: txDoc.receiver_contract_id,
      functionMethod: txDoc.function_method,
      status: txDoc.status,
      blockHeight: txDoc.block_height,
      blockHash: txDoc.block_hash,
      events: txDoc.event_summaries,
      errorMessage: txDoc.error_message,
      createdAt: txDoc.created_at,
      syncedAt: txDoc.synced_at,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/transactions/intents/:action
 * Prepares validated transaction intent for frontend wallet signing.
 */
router.post("/intents/:action", requireAuth, async (req, res, next) => {
  try {
    const { action } = req.params;
    const payload = req.body || {};

    let intent;
    switch (action) {
      case "register-discovery":
        intent = prepareRegisterDiscoveryIntent(payload);
        break;
      case "create-offer":
        intent = prepareCreateOfferIntent(payload);
        break;
      case "deactivate-offer":
        intent = prepareDeactivateOfferIntent(payload);
        break;
      case "request-license":
        intent = prepareRequestLicenseIntent(payload);
        break;
      case "approve-request":
        intent = prepareApproveRequestIntent(payload);
        break;
      case "reject-request":
        intent = prepareRejectRequestIntent(payload);
        break;
      case "pay-license":
        intent = await preparePayLicenseIntent(payload);
        break;
      case "withdraw-earnings":
        intent = prepareWithdrawEarningsIntent(payload.context);
        break;
      case "expire-license":
        intent = prepareExpireLicenseIntent(payload);
        break;
      case "storage-deposit":
        intent = prepareStorageDepositIntent(payload);
        break;
      default:
        return res.status(400).json({
          error: `Unsupported transaction intent action: '${action}'`,
          code: "ERR_INVALID_INTENT_ACTION",
        });
    }

    return res.status(200).json(intent);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code || "ERR_TRANSACTION_INTENT_FAILED",
      });
    }
    next(err);
  }
});

export default router;
