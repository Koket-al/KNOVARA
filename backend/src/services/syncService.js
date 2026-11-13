import { DiscoveryProjection } from "../models/DiscoveryProjection.js";
import { LicenseOfferProjection } from "../models/LicenseOfferProjection.js";
import { LicenseRequestProjection } from "../models/LicenseRequestProjection.js";
import { AccountRoyaltyProjection } from "../models/AccountRoyaltyProjection.js";
import { EvidenceManifest } from "../models/EvidenceManifest.js";
import { PublicMetadataDescriptor } from "../models/PublicMetadataDescriptor.js";
import { EvidenceUpload } from "../models/EvidenceUpload.js";
import { ApiProduct } from "../models/ApiProduct.js";
import { SubscriptionProjection } from "../models/SubscriptionProjection.js";
import * as nearContract from "./nearContract.js";

/**
 * Monotonic allowed preceding statuses derived strictly from KNOVARA contract lifecycle:
 * - Requested -> Approved or Rejected
 * - Approved -> Active or Expired
 * - Active -> Expired
 * - Rejected -> (Terminal)
 * - Expired -> (Terminal)
 */
export const ALLOWED_PRECEDING_STATUSES = {
  Requested: ["Requested"],
  Approved: ["Requested", "Approved"],
  Rejected: ["Requested", "Rejected"],
  Active: ["Requested", "Approved", "Active"],
  Expired: ["Requested", "Approved", "Active", "Expired"],
};

/**
 * Normalizes on-chain NEAR SDK Rust LicenseStatus enum values into structured JS representations.
 *
 * Rust enum variants in contracts/knovara/src/license.rs:
 * - Requested
 * - Approved { payment_deadline: Timestamp }
 * - Rejected { reason: String }
 * - Active { activated_at: Timestamp, expires_at: Timestamp }
 * - Expired
 *
 * @param {string|object} onChainStatus
 * @returns {{ status: string, paymentDeadline?: Date, rejectionReason?: string, activatedAt?: Date, expiresAt?: Date } | null}
 */
export function normalizeLicenseStatus(onChainStatus, record = {}) {
  if (!onChainStatus) return null;

  if (typeof onChainStatus === "string") {
    const valid = ["Requested", "Approved", "Rejected", "Active", "Expired"];
    if (valid.includes(onChainStatus)) {
      const res = { status: onChainStatus };
      if (onChainStatus === "Approved") {
        const nanos = record.payment_deadline;
        res.paymentDeadline = nanos ? new Date(Number(nanos) / 1_000_000) : null;
      } else if (onChainStatus === "Rejected") {
        res.rejectionReason = record.rejection_reason || "";
      } else if (onChainStatus === "Active") {
        if (record.activated_at) res.activatedAt = new Date(Number(record.activated_at) / 1_000_000);
        if (record.expires_at) res.expiresAt = new Date(Number(record.expires_at) / 1_000_000);
      }
      return res;
    }
    return null;
  }

  if (typeof onChainStatus === "object" && onChainStatus !== null) {
    if ("Requested" in onChainStatus) {
      return { status: "Requested" };
    }
    if ("Approved" in onChainStatus) {
      const details = onChainStatus.Approved || {};
      const nanos = details.payment_deadline || record.payment_deadline;
      return {
        status: "Approved",
        paymentDeadline: nanos ? new Date(Number(nanos) / 1_000_000) : null,
      };
    }
    if ("Rejected" in onChainStatus) {
      const details = onChainStatus.Rejected || {};
      return {
        status: "Rejected",
        rejectionReason: typeof details.reason === "string" ? details.reason : (record.rejection_reason || ""),
      };
    }
    if ("Active" in onChainStatus) {
      const details = onChainStatus.Active || {};
      const act = details.activated_at || record.activated_at;
      const exp = details.expires_at || record.expires_at;
      return {
        status: "Active",
        activatedAt: act ? new Date(Number(act) / 1_000_000) : null,
        expiresAt: exp ? new Date(Number(exp) / 1_000_000) : null,
      };
    }
    if ("Expired" in onChainStatus) {
      return { status: "Expired" };
    }
  }

  return null;
}

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
  const blockHeight =
    txResult.transaction_outcome?.block_height ||
    txResult.receipts_outcome?.[0]?.block_height ||
    txResult.block_height ||
    0;
  const blockHash =
    txResult.transaction_outcome?.block_hash ||
    txResult.receipts_outcome?.[0]?.block_hash ||
    txResult.block_hash ||
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

    case "create_api_subscription_offer":
      return handleSyncSubscriptionOffer({ txResult, events, blockHeight, blockHash });

    case "subscribe_to_offer":
      return handleSyncSubscriptionActivated({ txResult, events, blockHeight, blockHash });

    case "renew_subscription":
      return handleSyncSubscriptionRenewed({ txResult, events, blockHeight, blockHash });

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

  // 3. Strict fail-closed consistency checks against locally prepared evidence manifest and public descriptor
  const preparedManifest = await EvidenceManifest.findOne({ discovery_id: discoveryId });
  const preparedDescriptor = await PublicMetadataDescriptor.findOne({ discovery_id: discoveryId });

  let syncStatus = "SYNCED";
  let reconciliationError = null;

  if (!preparedManifest) {
    syncStatus = "RECONCILIATION_REQUIRED";
    reconciliationError = "MISSING_EVIDENCE_MANIFEST";
  } else if (!preparedDescriptor) {
    syncStatus = "RECONCILIATION_REQUIRED";
    reconciliationError = "MISSING_PUBLIC_METADATA_DESCRIPTOR";
  } else if (onChainDiscovery.token_id && onChainDiscovery.token_id !== tokenId) {
    syncStatus = "RECONCILIATION_REQUIRED";
    reconciliationError = "TOKEN_ID_ASSOCIATION_MISMATCH";
  } else if (
    !preparedManifest.evidence_manifest_hash ||
    !onChainDiscovery.evidence_manifest_hash ||
    preparedManifest.evidence_manifest_hash.toLowerCase() !== onChainDiscovery.evidence_manifest_hash.toLowerCase()
  ) {
    syncStatus = "RECONCILIATION_REQUIRED";
    reconciliationError = "MANIFEST_HASH_MISMATCH";
  } else if (
    !preparedDescriptor.reference_hash ||
    !onChainNft.metadata?.reference_hash ||
    preparedDescriptor.reference_hash !== onChainNft.metadata.reference_hash
  ) {
    syncStatus = "RECONCILIATION_REQUIRED";
    reconciliationError = "REFERENCE_HASH_MISMATCH";
  } else if (
    !preparedDescriptor.reference ||
    !onChainNft.metadata?.reference ||
    preparedDescriptor.reference !== onChainNft.metadata.reference
  ) {
    syncStatus = "RECONCILIATION_REQUIRED";
    reconciliationError = "REFERENCE_URL_MISMATCH";
  } else if (
    !Array.isArray(preparedManifest.evidence_item_ids) ||
    preparedManifest.evidence_item_ids.length === 0
  ) {
    syncStatus = "RECONCILIATION_REQUIRED";
    reconciliationError = "INVALID_MANIFEST_EVIDENCE_ITEMS";
  }

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

  // 6. Mark EvidenceUpload records as ATTACHED strictly if reconciliation succeeded
  if (syncStatus === "SYNCED" && Array.isArray(preparedManifest?.evidence_item_ids) && preparedManifest.evidence_item_ids.length > 0) {
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
      hashMismatch: syncStatus === "RECONCILIATION_REQUIRED",
      ...(reconciliationError ? { error: reconciliationError } : {}),
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
  if (existing) {
    if (existing.block_height > blockHeight) {
      return { syncStatus: "SYNCED", details: { offerId, ignoredStale: true, reason: "older_block" } };
    }
    // Deactivated offer cannot be reactivated
    if (existing.is_active === false && onChainOffer.is_active === true) {
      return { syncStatus: "SYNCED", details: { offerId, ignoredStale: true, is_active: false, reason: "cannot_reactivate_deactivated" } };
    }
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

  const normalized = normalizeLicenseStatus(onChainRecord.status);
  if (!normalized) {
    return {
      syncStatus: "RECONCILIATION_REQUIRED",
      details: {
        error: `ERR_UNRECOGNIZED_LICENSE_STATUS: Contract returned unrecognized status ${JSON.stringify(onChainRecord.status)}`,
      },
    };
  }

  // Stale check
  const existing = await LicenseRequestProjection.findOne({ request_id: requestId });
  if (existing) {
    if (existing.block_height > blockHeight) {
      return { syncStatus: "SYNCED", details: { requestId, ignoredStale: true, reason: "older_block" } };
    }
    // An existing forward status (Approved, Active, Rejected, Expired) must NEVER be reverted to Requested
    if (existing.status !== "Requested") {
      return {
        syncStatus: "SYNCED",
        details: {
          requestId,
          ignoredStale: true,
          currentStatus: existing.status,
          targetStatus: normalized.status,
          reason: "cannot_revert_forward_status",
        },
      };
    }
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
        status: normalized.status,
        requested_at: new Date(Number(onChainRecord.requested_at) / 1_000_000),
        block_height: blockHeight,
        block_hash: blockHash,
        last_synced_at: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return { syncStatus: "SYNCED", details: { requestId, status: normalized.status } };
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

  const normalized = normalizeLicenseStatus(onChainRecord.status, onChainRecord);
  if (!normalized) {
    return {
      syncStatus: "RECONCILIATION_REQUIRED",
      details: {
        error: `ERR_UNRECOGNIZED_LICENSE_STATUS: Contract returned unrecognized status ${JSON.stringify(onChainRecord.status)}`,
      },
    };
  }

  const targetStatus = normalized.status;

  // Stale and monotonicity check against existing projection
  const existing = await LicenseRequestProjection.findOne({ request_id: requestId });
  if (existing) {
    if (existing.block_height > blockHeight) {
      return { syncStatus: "SYNCED", details: { requestId, ignoredStale: true, reason: "older_block" } };
    }
    const allowedPriors = ALLOWED_PRECEDING_STATUSES[targetStatus] || [];
    if (!allowedPriors.includes(existing.status)) {
      return {
        syncStatus: "SYNCED",
        details: {
          requestId,
          ignoredStale: true,
          currentStatus: existing.status,
          targetStatus,
          reason: "invalid_preceding_status",
        },
      };
    }
  }

  const allowedPriors = ALLOWED_PRECEDING_STATUSES[targetStatus] || [];
  const setPayload = {
    status: targetStatus,
    payment_deadline: normalized.paymentDeadline || (statusEvent?.data?.[0]?.payment_deadline ? new Date(Number(statusEvent.data[0].payment_deadline) / 1_000_000) : null),
    rejection_reason: normalized.rejectionReason || null,
    block_height: blockHeight,
    block_hash: blockHash,
    last_synced_at: new Date(),
  };

  if (existing) {
    await LicenseRequestProjection.findOneAndUpdate(
      {
        request_id: requestId,
        status: { $in: allowedPriors },
        block_height: { $lte: blockHeight },
      },
      { $set: setPayload }
    );
  } else {
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
          requested_at: new Date(Number(onChainRecord.requested_at) / 1_000_000),
          ...setPayload,
        },
      },
      { upsert: true, new: true }
    );
  }

  return { syncStatus: "SYNCED", details: { requestId, status: targetStatus } };
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

  const normalized = normalizeLicenseStatus(onChainRecord.status, onChainRecord);
  if (!normalized) {
    return {
      syncStatus: "RECONCILIATION_REQUIRED",
      details: {
        error: `ERR_UNRECOGNIZED_LICENSE_STATUS: Contract returned unrecognized status ${JSON.stringify(onChainRecord.status)}`,
      },
    };
  }

  // A Rejected request must never become Active
  if (normalized.status === "Rejected") {
    return {
      syncStatus: "RECONCILIATION_REQUIRED",
      details: { error: "ERR_CANNOT_ACTIVATE_REJECTED: Rejected license request cannot be activated" },
    };
  }

  const targetStatus = normalized.status === "Expired" ? "Expired" : "Active";

  // Stale and monotonicity check against existing projection
  const existing = await LicenseRequestProjection.findOne({ request_id: requestId });
  if (existing) {
    if (existing.block_height > blockHeight) {
      return { syncStatus: "SYNCED", details: { requestId, ignoredStale: true, reason: "older_block" } };
    }
    const allowedPriors = ALLOWED_PRECEDING_STATUSES[targetStatus] || [];
    if (!allowedPriors.includes(existing.status)) {
      return {
        syncStatus: "SYNCED",
        details: {
          requestId,
          ignoredStale: true,
          currentStatus: existing.status,
          targetStatus,
          reason: "invalid_preceding_status",
        },
      };
    }
  }

  const allowedPriors = ALLOWED_PRECEDING_STATUSES[targetStatus] || [];
  const setPayload = {
    status: targetStatus,
    activated_at: normalized.activatedAt || (paidEvent?.data?.[0]?.activated_at ? new Date(Number(paidEvent.data[0].activated_at) / 1_000_000) : null) || new Date(),
    expires_at: normalized.expiresAt || (paidEvent?.data?.[0]?.expires_at ? new Date(Number(paidEvent.data[0].expires_at) / 1_000_000) : null),
    block_height: blockHeight,
    block_hash: blockHash,
    last_synced_at: new Date(),
  };

  if (existing) {
    await LicenseRequestProjection.findOneAndUpdate(
      {
        request_id: requestId,
        status: { $in: allowedPriors },
        block_height: { $lte: blockHeight },
      },
      { $set: setPayload }
    );
  } else {
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
          requested_at: new Date(Number(onChainRecord.requested_at) / 1_000_000),
          ...setPayload,
        },
      },
      { upsert: true, new: true }
    );
  }

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
              {
                account_id: acc,
                $or: [{ block_height: { $lte: blockHeight } }, { block_height: null }],
              },
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

  return { syncStatus: "SYNCED", details: { requestId, status: targetStatus, expiresAt: normalized.expiresAt || null } };
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

  // Stale check for account royalty projection
  const existing = await AccountRoyaltyProjection.findOne({ account_id: signerAccountId });
  if (existing && existing.block_height > blockHeight) {
    return {
      syncStatus: failedEvent || hasFailedReceipt ? "RECONCILIATION_REQUIRED" : "SYNCED",
      details: { account: signerAccountId, ignoredStale: true, reason: "older_block" },
    };
  }

  // Authoritative re-query of caller's claimable balance and pending withdrawals
  const [claimableBalance, pendingWithdrawals] = await Promise.all([
    nearContract.getClaimableBalance(signerAccountId),
    nearContract.getPendingRoyaltyWithdrawals(),
  ]);

  await AccountRoyaltyProjection.findOneAndUpdate(
    {
      account_id: signerAccountId,
      $or: [{ block_height: { $lte: blockHeight } }, { block_height: null }],
    },
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

  // Stale and monotonicity check against existing projection
  const existing = await LicenseRequestProjection.findOne({ request_id: requestId });
  if (existing) {
    if (existing.block_height > blockHeight) {
      return { syncStatus: "SYNCED", details: { requestId, ignoredStale: true, reason: "older_block" } };
    }
    const allowedPriors = ALLOWED_PRECEDING_STATUSES["Expired"];
    if (!allowedPriors.includes(existing.status)) {
      return {
        syncStatus: "SYNCED",
        details: {
          requestId,
          ignoredStale: true,
          currentStatus: existing.status,
          targetStatus: "Expired",
          reason: "invalid_preceding_status",
        },
      };
    }
  }

  const allowedPriors = ALLOWED_PRECEDING_STATUSES["Expired"];
  await LicenseRequestProjection.findOneAndUpdate(
    {
      request_id: requestId,
      status: { $in: allowedPriors },
      block_height: { $lte: blockHeight },
    },
    {
      $set: {
        status: "Expired",
        block_height: blockHeight,
        block_hash: blockHash,
        last_synced_at: new Date(),
      },
    }
  );

  return { syncStatus: "SYNCED", details: { requestId, status: "Expired" } };
}


/**
 * Reconciles API subscription offer creation.
 */
async function handleSyncSubscriptionOffer({ txResult, events, blockHeight, blockHash }) {
  const offerEvent = events.find(
    (e) => e.standard === "knovara_subscription" && e.event === "subscription_offer_created"
  );

  let offerId = offerEvent?.data?.[0]?.offer_id;
  let apiProductId = offerEvent?.data?.[0]?.api_product_id;

  if (!offerId) {
    const action = txResult.transaction?.actions?.find(
      (a) => a.FunctionCall?.method_name === "create_api_subscription_offer"
    );
    if (action) {
      try {
        const decoded = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8"));
        offerId = decoded.offer_id;
        apiProductId = decoded.api_product_id;
      } catch (_e) {}
    }
  }

  if (!offerId) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: "Missing offer_id" } };
  }

  const onChainOffer = await nearContract.getApiSubscriptionOffer(offerId);
  if (!onChainOffer) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: `Offer '${offerId}' not found on chain` } };
  }

  if (apiProductId) {
    await ApiProduct.findOneAndUpdate(
      { api_product_id: apiProductId },
      {
        offer_id: offerId,
        status: "published",
        monthly_price_yocto: String(onChainOffer.price_yocto),
        duration_days: onChainOffer.duration_days,
        updated_at: new Date(),
      }
    );
  }

  return { syncStatus: "SYNCED", details: { offerId, apiProductId, blockHeight } };
}

/**
 * Reconciles atomic API subscription activation.
 */
async function handleSyncSubscriptionActivated({ txResult, events, blockHeight, blockHash }) {
  const subEvent = events.find(
    (e) => e.standard === "knovara_subscription" && e.event === "subscription_activated"
  );

  let subscriptionId = subEvent?.data?.[0]?.subscription_id;

  if (!subscriptionId) {
    const action = txResult.transaction?.actions?.find(
      (a) => a.FunctionCall?.method_name === "subscribe_to_offer"
    );
    if (action) {
      try {
        const decoded = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8"));
        subscriptionId = decoded.subscription_id;
      } catch (_e) {}
    }
  }

  if (!subscriptionId) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: "Missing subscription_id" } };
  }

  const onChainSub = await nearContract.getSubscription(subscriptionId);
  if (!onChainSub) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: `Subscription '${subscriptionId}' not found on chain` } };
  }

  const activatedAt = new Date(Number(BigInt(onChainSub.activated_at) / 1_000_000n));
  const expiresAt = new Date(Number(BigInt(onChainSub.expires_at) / 1_000_000n));
  const isExpired = new Date() > expiresAt;

  await SubscriptionProjection.findOneAndUpdate(
    { subscription_id: subscriptionId },
    {
      subscription_id: subscriptionId,
      offer_id: onChainSub.offer_id,
      discovery_id: onChainSub.discovery_id,
      token_id: onChainSub.token_id,
      subscriber_id: onChainSub.subscriber_id.toLowerCase(),
      api_product_id: onChainSub.api_product_id,
      openapi_spec_hash: onChainSub.openapi_spec_hash,
      accepted_terms_hash: onChainSub.accepted_terms_hash,
      price_yocto: String(onChainSub.price_yocto),
      activated_at: activatedAt,
      expires_at: expiresAt,
      status: isExpired ? "Expired" : "Active",
      block_height: blockHeight,
      block_hash: blockHash,
      last_synced_at: new Date(),
    },
    { upsert: true, new: true }
  );

  return { syncStatus: "SYNCED", details: { subscriptionId, status: isExpired ? "Expired" : "Active", blockHeight } };
}

/**
 * Reconciles API subscription renewal.
 */
async function handleSyncSubscriptionRenewed({ txResult, events, blockHeight, blockHash }) {
  const renewEvent = events.find(
    (e) => e.standard === "knovara_subscription" && e.event === "subscription_renewed"
  );

  let subscriptionId = renewEvent?.data?.[0]?.subscription_id;

  if (!subscriptionId) {
    const action = txResult.transaction?.actions?.find(
      (a) => a.FunctionCall?.method_name === "renew_subscription"
    );
    if (action) {
      try {
        const decoded = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8"));
        subscriptionId = decoded.subscription_id;
      } catch (_e) {}
    }
  }

  if (!subscriptionId) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: "Missing subscription_id" } };
  }

  const onChainSub = await nearContract.getSubscription(subscriptionId);
  if (!onChainSub) {
    return { syncStatus: "RECONCILIATION_REQUIRED", details: { error: `Subscription '${subscriptionId}' not found on chain` } };
  }

  const expiresAt = new Date(Number(BigInt(onChainSub.expires_at) / 1_000_000n));

  await SubscriptionProjection.findOneAndUpdate(
    { subscription_id: subscriptionId },
    {
      expires_at: expiresAt,
      status: "Active",
      block_height: blockHeight,
      block_hash: blockHash,
      last_synced_at: new Date(),
    }
  );

  return { syncStatus: "SYNCED", details: { subscriptionId, renewed: true, expiresAt, blockHeight } };
}
