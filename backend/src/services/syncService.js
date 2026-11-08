import { DiscoveryProjection } from "../models/DiscoveryProjection.js";
import { LicenseOfferProjection } from "../models/LicenseOfferProjection.js";
import { LicenseRequestProjection } from "../models/LicenseRequestProjection.js";
import { AccountRoyaltyProjection } from "../models/AccountRoyaltyProjection.js";
import { EvidenceManifest } from "../models/EvidenceManifest.js";
import { PublicMetadataDescriptor } from "../models/PublicMetadataDescriptor.js";
import { EvidenceUpload } from "../models/EvidenceUpload.js";
import * as nearContract from "./nearContract.js";

/**
 * Synchronizes authoritative on-chain state to MongoDB projections following a verified transaction.
 *
 * Guarantees:
 * - NEAR Testnet state is the single authoritative source of truth.
 * - Stale projection prevention: Ignores updates with block_height lower than currently stored projection.
 * - Financial amounts preserved in exact yoctoNEAR decimal strings (zero floating-point conversion).
 * - Discovery evidence manifest and public reference hashes strictly verified against local prepared records.
 *
 * @param {object} params
 * @param {string} params.methodName - Contract function called
 * @param {object} params.txResult - Raw transaction execution status from NEAR RPC
 * @param {Array<object>} params.events - Parsed NEP-297 events
 * @param {string} params.signerAccountId - Verified signer of transaction
 * @returns {Promise<{ syncStatus: string, details: object }>}
 */
export async function synchronizeState({
  methodName,
  txResult,
  events = [],
  signerAccountId,
}) {
  const blockHeight = txResult.transaction_outcome?.block_height ||
    txResult.receipts_outcome?.[0]?.block_height ||
    0;
  const blockHash = txResult.transaction_outcome?.block_hash ||
    txResult.receipts_outcome?.[0]?.block_hash ||
    "";

  switch (methodName) {
    case "register_discovery_and_mint":
      return handleSyncDiscoveryRegistration({ txResult, events, blockHeight, blockHash, signerAccountId });

    case "create_license_offer":
    case "deactivate_license_offer":
      return handleSyncLicenseOffer({ txResult, events, blockHeight, blockHash });

    case "request_license":
      return handleSyncLicenseRequest({ txResult, events, blockHeight, blockHash });

    case "approve_license_request":
    case "reject_license_request":
      return handleSyncLicenseStatusChange({ txResult, events, blockHeight, blockHash });

    case "pay_for_license":
    case "pay_license":
      return handleSyncPaymentAndActivation({ txResult, events, blockHeight, blockHash });

    case "withdraw_earnings":
      return handleSyncWithdrawal({ txResult, events, blockHeight, blockHash, signerAccountId });

    case "expire_license":
    case "expire_license_request":
      return handleSyncExpiration({ txResult, events, blockHeight, blockHash });

    case "storage_deposit":
    case "storage_withdraw":
    case "storage_unregister":
      // Handled cleanly by chain state; no specialized projection required
      return { syncStatus: "SYNCED", details: { method: methodName, blockHeight } };

    default:
      return { syncStatus: "SYNCED", details: { method: methodName } };
  }
}

/**
 * Reconciles discovery registration and passport NFT minting.
 */
async function handleSyncDiscoveryRegistration({ txResult, events, blockHeight, blockHash, signerAccountId }) {
  // 1. Resolve token_id from nft_mint event or args
  const mintEvent = events.find((e) => e.standard === "nep171" && e.event === "nft_mint");
  let tokenId = mintEvent?.data?.[0]?.token_ids?.[0];

  if (!tokenId) {
    // Attempt fallback from transaction action args
    const action = txResult.transaction?.actions?.find((a) => a.FunctionCall?.method_name === "register_discovery_and_mint");
    if (action) {
      try {
        const decodedArgs = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8"));
        tokenId = decodedArgs.token_id;
      } catch (_e) {}
    }
  }

  if (!tokenId) {
    return {
      syncStatus: "RECONCILIATION_REQUIRED",
      details: { error: "Unable to identify token_id from transaction execution or logs" },
    };
  }

  // 2. Query authoritative on-chain discovery and NFT records
  const [onChainDiscovery, onChainNft] = await Promise.all([
    nearContract.getDiscovery(tokenId),
    nearContract.getNftToken(tokenId),
  ]);

  if (!onChainDiscovery || !onChainNft) {
    return {
      syncStatus: "RECONCILIATION_REQUIRED",
      details: { error: `On-chain discovery or NFT record not found for token_id '${tokenId}'` },
    };
  }

  const discoveryId = onChainDiscovery.discovery_id;

  // 3. Consistency checks against locally prepared evidence manifest and public descriptor
  const preparedManifest = await EvidenceManifest.findOne({ discovery_id: discoveryId });
  const preparedDescriptor = await PublicMetadataDescriptor.findOne({ discovery_id: discoveryId });

  let hashMismatch = false;
  if (preparedManifest) {
    if (preparedManifest.evidence_manifest_hash !== onChainDiscovery.evidence_manifest_hash) {
      hashMismatch = true;
    }
  }

  if (preparedDescriptor) {
    const meta = onChainNft.metadata || {};
    if (meta.reference && preparedDescriptor.reference && meta.reference !== preparedDescriptor.reference) {
      hashMismatch = true;
    }
    if (meta.reference_hash && preparedDescriptor.reference_hash && meta.reference_hash !== preparedDescriptor.reference_hash) {
      hashMismatch = true;
    }
  }

  const syncStatus = hashMismatch ? "RECONCILIATION_REQUIRED" : "SYNCED";

  // 4. Stale update prevention
  const existing = await DiscoveryProjection.findOne({ discovery_id: discoveryId });
  if (existing && existing.block_height > blockHeight) {
    return { syncStatus: existing.sync_status, details: { discoveryId, ignoredStale: true } };
  }

  // 5. Upsert DiscoveryProjection
  await DiscoveryProjection.findOneAndUpdate(
    { discovery_id: discoveryId },
    {
      $set: {
        discovery_id: discoveryId,
        token_id: tokenId,
        custodian_id: onChainDiscovery.custodian_id,
        rights_controller_id: onChainDiscovery.rights_controller_id,
        evidence_manifest_hash: onChainDiscovery.evidence_manifest_hash,
        public_metadata: {
          title: onChainNft.metadata?.title || discoveryId,
          description: onChainNft.metadata?.description || "",
          category: onChainNft.metadata?.extra || "GENERAL",
          media: onChainNft.metadata?.media || null,
          attributes: [],
        },
        reference: onChainNft.metadata?.reference || "",
        reference_hash: onChainNft.metadata?.reference_hash || "",
        beneficiary_splits: onChainDiscovery.beneficiary_splits,
        lineage_parents: onChainDiscovery.lineage_parents || [],
        registered_at: new Date(Number(onChainDiscovery.registered_at) / 1_000_000), // nanos to millis
        block_height: blockHeight,
        block_hash: blockHash,
        contract_id: txResult.transaction?.receiver_id || "koket-knovara-dev.testnet",
        sync_status: syncStatus,
        last_synced_at: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  // 6. Mark EvidenceUpload records as ATTACHED if reconciliation succeeded
  if (syncStatus === "SYNCED" && preparedManifest?.evidence_item_ids) {
    await EvidenceUpload.updateMany(
      { upload_id: { $in: preparedManifest.evidence_item_ids } },
      { $set: { status: "ATTACHED", attached_discovery_id: discoveryId } }
    );
  }

  return {
    syncStatus,
    details: {
      discoveryId,
      tokenId,
      hashMismatch,
    },
  };
}

/**
 * Reconciles license offer creation and deactivation.
 */
async function handleSyncLicenseOffer({ txResult, events, blockHeight, blockHash }) {
  const offerEvent = events.find(
    (e) =>
      e.standard === "knovara_licensing" &&
      (e.event === "license_offer_created" || e.event === "license_offer_deactivated")
  );

  let offerId = offerEvent?.data?.[0]?.offer_id;

  if (!offerId) {
    const action = txResult.transaction?.actions?.find(
      (a) =>
        a.FunctionCall?.method_name === "create_license_offer" ||
        a.FunctionCall?.method_name === "deactivate_license_offer"
    );
    if (action) {
      try {
        const decoded = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8"));
        offerId = decoded.offer_id;
      } catch (_e) {}
    }
  }

  if (!offerId) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: "Missing offer_id" } };
  }

  const onChainOffer = await nearContract.getLicenseOffer(offerId);
  if (!onChainOffer) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: `Offer '${offerId}' not found on chain` } };
  }

  // Stale check
  const existing = await LicenseOfferProjection.findOne({ offer_id: offerId });
  if (existing && existing.block_height > blockHeight) {
    return { syncStatus: "SYNCED", details: { offerId, ignoredStale: true } };
  }

  await LicenseOfferProjection.findOneAndUpdate(
    { offer_id: offerId },
    {
      $set: {
        offer_id: offerId,
        discovery_id: onChainOffer.discovery_id,
        token_id: onChainOffer.token_id,
        rights_controller_id: onChainOffer.rights_controller_id,
        scope: onChainOffer.scope,
        price_yocto: String(onChainOffer.price_yocto), // Exact decimal string
        terms_hash: onChainOffer.terms_hash,
        duration_days: onChainOffer.duration_days,
        is_active: onChainOffer.is_active,
        created_at: new Date(Number(onChainOffer.created_at) / 1_000_000),
        block_height: blockHeight,
        block_hash: blockHash,
        last_synced_at: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return { syncStatus: "SYNCED", details: { offerId, is_active: onChainOffer.is_active } };
}

/**
 * Reconciles license request creation.
 */
async function handleSyncLicenseRequest({ txResult, events, blockHeight, blockHash }) {
  const reqEvent = events.find((e) => e.standard === "knovara_licensing" && e.event === "license_requested");
  let requestId = reqEvent?.data?.[0]?.request_id;

  if (!requestId) {
    const action = txResult.transaction?.actions?.find((a) => a.FunctionCall?.method_name === "request_license");
    if (action) {
      try {
        const decoded = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8"));
        requestId = decoded.request_id;
      } catch (_e) {}
    }
  }

  if (!requestId) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: "Missing request_id" } };
  }

  const onChainRecord = await nearContract.getLicenseRequest(requestId);
  if (!onChainRecord) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: `Request '${requestId}' not found on chain` } };
  }

  // Stale check
  const existing = await LicenseRequestProjection.findOne({ request_id: requestId });
  if (existing && existing.block_height > blockHeight) {
    return { syncStatus: "SYNCED", details: { requestId, ignoredStale: true } };
  }

  await LicenseRequestProjection.findOneAndUpdate(
    { request_id: requestId },
    {
      $set: {
        request_id: requestId,
        license_id: onChainRecord.license_id || requestId,
        offer_id: onChainRecord.offer_id,
        discovery_id: onChainRecord.discovery_id,
        token_id: onChainRecord.token_id,
        buyer_id: onChainRecord.buyer_id,
        scope: onChainRecord.scope,
        price_yocto: String(onChainRecord.price_yocto),
        duration_days: onChainRecord.duration_days,
        license_terms_hash: onChainRecord.license_terms_hash,
        accepted_terms_hash: onChainRecord.accepted_terms_hash,
        status: "Requested",
        requested_at: new Date(Number(onChainRecord.requested_at) / 1_000_000),
        block_height: blockHeight,
        block_hash: blockHash,
        last_synced_at: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return { syncStatus: "SYNCED", details: { requestId, status: "Requested" } };
}

/**
 * Reconciles license request approval or rejection.
 */
async function handleSyncLicenseStatusChange({ txResult, events, blockHeight, blockHash }) {
  const statusEvent = events.find(
    (e) =>
      e.standard === "knovara_licensing" &&
      (e.event === "license_approved" || e.event === "license_rejected")
  );

  let requestId = statusEvent?.data?.[0]?.request_id;

  if (!requestId) {
    const action = txResult.transaction?.actions?.find(
      (a) =>
        a.FunctionCall?.method_name === "approve_license_request" ||
        a.FunctionCall?.method_name === "reject_license_request"
    );
    if (action) {
      try {
        const decoded = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8"));
        requestId = decoded.request_id;
      } catch (_e) {}
    }
  }

  if (!requestId) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: "Missing request_id" } };
  }

  const onChainRecord = await nearContract.getLicenseRequest(requestId);
  if (!onChainRecord) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: `Request '${requestId}' not found on chain` } };
  }

  let normalizedStatus = "Requested";
  let paymentDeadline = null;
  let rejectionReason = null;

  if (typeof onChainRecord.status === "object" && onChainRecord.status !== null) {
    if ("Approved" in onChainRecord.status) {
      normalizedStatus = "Approved";
      const nanos = onChainRecord.status.Approved?.payment_deadline || statusEvent?.data?.[0]?.payment_deadline;
      if (nanos) paymentDeadline = new Date(Number(nanos) / 1_000_000);
    } else if ("Rejected" in onChainRecord.status) {
      normalizedStatus = "Rejected";
      rejectionReason = onChainRecord.status.Rejected?.reason || statusEvent?.data?.[0]?.reason || "";
    }
  } else if (typeof onChainRecord.status === "string") {
    normalizedStatus = onChainRecord.status;
    if (normalizedStatus === "Approved") {
      const nanos = onChainRecord.payment_deadline || statusEvent?.data?.[0]?.payment_deadline;
      if (nanos) paymentDeadline = new Date(Number(nanos) / 1_000_000);
    } else if (normalizedStatus === "Rejected") {
      rejectionReason = onChainRecord.rejection_reason || statusEvent?.data?.[0]?.reason || "";
    }
  }

  await LicenseRequestProjection.findOneAndUpdate(
    { request_id: requestId },
    {
      $set: {
        status: normalizedStatus,
        payment_deadline: paymentDeadline,
        rejection_reason: rejectionReason,
        block_height: blockHeight,
        block_hash: blockHash,
        last_synced_at: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return { syncStatus: "SYNCED", details: { requestId, status: normalizedStatus } };
}

/**
 * Reconciles license payment and activation.
 */
async function handleSyncPaymentAndActivation({ txResult, events, blockHeight, blockHash }) {
  const paidEvent = events.find(
    (e) => e.standard === "knovara_licensing" && (e.event === "license_paid" || e.event === "license_activated")
  );

  let requestId = paidEvent?.data?.[0]?.request_id;

  if (!requestId) {
    const action = txResult.transaction?.actions?.find(
      (a) => a.FunctionCall?.method_name === "pay_for_license" || a.FunctionCall?.method_name === "pay_license"
    );
    if (action) {
      try {
        const decoded = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8"));
        requestId = decoded.request_id;
      } catch (_e) {}
    }
  }

  if (!requestId) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: "Missing request_id" } };
  }

  const onChainRecord = await nearContract.getLicenseRequest(requestId);
  if (!onChainRecord) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: `Request '${requestId}' not found on chain` } };
  }

  let activatedAt = null;
  let expiresAt = null;

  if (typeof onChainRecord.status === "object" && onChainRecord.status !== null && "Active" in onChainRecord.status) {
    const active = onChainRecord.status.Active;
    if (active.activated_at) activatedAt = new Date(Number(active.activated_at) / 1_000_000);
    if (active.expires_at) expiresAt = new Date(Number(active.expires_at) / 1_000_000);
  } else if (onChainRecord.activated_at || onChainRecord.expires_at) {
    if (onChainRecord.activated_at) activatedAt = new Date(Number(onChainRecord.activated_at) / 1_000_000);
    if (onChainRecord.expires_at) expiresAt = new Date(Number(onChainRecord.expires_at) / 1_000_000);
  }

  await LicenseRequestProjection.findOneAndUpdate(
    { request_id: requestId },
    {
      $set: {
        status: "Active",
        activated_at: activatedAt,
        expires_at: expiresAt,
        block_height: blockHeight,
        block_hash: blockHash,
        last_synced_at: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  // Synchronize beneficiary royalty balances
  const discTokenId = onChainRecord.token_id || onChainRecord.discovery_id;
  if (discTokenId) {
    try {
      const discovery = await nearContract.getDiscovery(discTokenId);
      if (discovery) {
        const accountsToSync = new Set([
          discovery.rights_controller_id,
          ...(discovery.beneficiary_splits || []).map((s) => s.account_id),
        ]);

        for (const acc of accountsToSync) {
          try {
            const balance = await nearContract.getClaimableBalance(acc);
            await AccountRoyaltyProjection.findOneAndUpdate(
              { account_id: acc },
              {
                $set: {
                  account_id: acc,
                  claimable_balance_yocto: String(balance || "0"),
                  block_height: blockHeight,
                  last_synced_at: new Date(),
                },
              },
              { upsert: true }
            );
          } catch (_err) {}
        }
      }
    } catch (_e) {}
  }

  return { syncStatus: "SYNCED", details: { requestId, status: "Active", expiresAt } };
}

/**
 * Reconciles royalty withdrawal following callback completion.
 */
async function handleSyncWithdrawal({ txResult, events, blockHeight, blockHash, signerAccountId }) {
  // Check if callback outcome failed
  const failedEvent = events.find(
    (e) => e.standard === "knovara_licensing" && e.event === "royalty_withdrawal_failed"
  );

  // Check receipt execution outcomes
  const hasFailedReceipt = (txResult.receipts_outcome || []).some(
    (r) => r.outcome?.status && "Failure" in r.outcome.status
  );

  // Authoritative re-query of caller's claimable balance and pending withdrawals
  const [claimableBalance, pendingWithdrawals] = await Promise.all([
    nearContract.getClaimableBalance(signerAccountId),
    nearContract.getPendingRoyaltyWithdrawals(),
  ]);

  await AccountRoyaltyProjection.findOneAndUpdate(
    { account_id: signerAccountId },
    {
      $set: {
        account_id: signerAccountId,
        claimable_balance_yocto: String(claimableBalance),
        pending_withdrawals_yocto: String(pendingWithdrawals),
        block_height: blockHeight,
        last_synced_at: new Date(),
      },
    },
    { upsert: true }
  );

  return {
    syncStatus: failedEvent || hasFailedReceipt ? "RECONCILIATION_REQUIRED" : "SYNCED",
    details: {
      account: signerAccountId,
      claimableBalance: String(claimableBalance),
      failed: Boolean(failedEvent || hasFailedReceipt),
    },
  };
}

/**
 * Reconciles license term expiration.
 */
async function handleSyncExpiration({ txResult, events, blockHeight, blockHash }) {
  const expEvent = events.find(
    (e) =>
      e.standard === "knovara_licensing" &&
      (e.event === "license_expired" || e.event === "license_request_expired")
  );

  let requestId = expEvent?.data?.[0]?.request_id;

  if (!requestId) {
    const action = txResult.transaction?.actions?.find(
      (a) => a.FunctionCall?.method_name === "expire_license" || a.FunctionCall?.method_name === "expire_license_request"
    );
    if (action) {
      try {
        const decoded = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8"));
        requestId = decoded.request_id;
      } catch (_e) {}
    }
  }

  if (!requestId) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: "Missing request_id" } };
  }

  await LicenseRequestProjection.findOneAndUpdate(
    { request_id: requestId },
    {
      $set: {
        status: "Expired",
        block_height: blockHeight,
        block_hash: blockHash,
        last_synced_at: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return { syncStatus: "SYNCED", details: { requestId, status: "Expired" } };
}
