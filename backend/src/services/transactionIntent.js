import { config } from "../config/env.js";
import * as nearContract from "./nearContract.js";

const DEFAULT_GAS_30_TGAS = "30000000000000";
const DEFAULT_GAS_50_TGAS = "50000000000000";

/**
 * Builds an unsigned transaction-intent structure for the user's connected wallet.
 *
 * @param {object} params
 * @param {string} params.methodName
 * @param {object} params.args
 * @param {string} [params.attachedDeposit="0"]
 * @param {string} [params.gas]
 * @param {object} [params.context={}]
 * @returns {object} - Unsigned transaction intent payload
 */
export function buildTransactionIntent({
  methodName,
  args,
  attachedDeposit = "0",
  gas = DEFAULT_GAS_30_TGAS,
  context = {},
}) {
  return {
    networkId: config.NEAR_NETWORK || "testnet",
    contractId: config.NEAR_CONTRACT_ID || "koket-knovara-dev.testnet",
    methodName,
    args,
    attachedDeposit: String(attachedDeposit), // Exact yoctoNEAR decimal string
    gas: String(gas),
    context,
  };
}

/**
 * Prepares intent for `register_discovery_and_mint`.
 */
export function prepareRegisterDiscoveryIntent(params) {
  const {
    discoveryId,
    tokenId,
    custodianId,
    rightsControllerId,
    evidenceManifestHash,
    metadata,
    beneficiarySplits,
    lineageParents = [],
  } = params;

  return buildTransactionIntent({
    methodName: "register_discovery_and_mint",
    args: {
      discovery_id: discoveryId,
      token_id: tokenId,
      custodian_id: custodianId || null,
      rights_controller_id: rightsControllerId,
      evidence_manifest_hash: evidenceManifestHash,
      metadata,
      beneficiary_splits: beneficiarySplits,
      lineage_parents: lineageParents,
    },
    attachedDeposit: "0",
    gas: DEFAULT_GAS_50_TGAS,
    context: { discoveryId, tokenId },
  });
}

const CANONICAL_SCOPES = {
  academicresearch: "AcademicResearch",
  commercialuse: "CommercialUse",
  aimodeltraining: "AiModelTraining",
  aimodelfinetuning: "AiModelFineTuning",
  aiknowledgeretrieval: "AiKnowledgeRetrieval",
  researchevaluation: "ResearchEvaluation",
  customterms: "CustomTerms",
  research_only: "AcademicResearch",
  academic_noncommercial: "AcademicResearch",
  academic: "AcademicResearch",
  commercial_use: "CommercialUse",
  commercial_exclusive: "CommercialUse",
  commercial: "CommercialUse",
  ai_training: "AiModelTraining",
  ai_model_training: "AiModelTraining",
  ai_model_fine_tuning: "AiModelFineTuning",
  ai_knowledge_retrieval: "AiKnowledgeRetrieval",
  evaluation_sample: "ResearchEvaluation",
  research_evaluation: "ResearchEvaluation",
  custom_terms: "CustomTerms",
  exclusive: "CommercialUse",
  perpetual: "CommercialUse",
};

export function normalizeLicenseScope(scope) {
  if (!scope || typeof scope !== "string") return "AcademicResearch";
  const clean = scope.trim();
  const normalized = CANONICAL_SCOPES[clean.toLowerCase()];
  return normalized || clean;
}

/**
 * Prepares intent for `create_license_offer`.
 */
export function prepareCreateOfferIntent(params) {
  const {
    offerId,
    discoveryId,
    scope,
    priceYocto,
    termsHash,
    durationDays,
  } = params;

  return buildTransactionIntent({
    methodName: "create_license_offer",
    args: {
      offer_id: offerId,
      discovery_id: discoveryId,
      scope: normalizeLicenseScope(scope),
      price_yocto: String(priceYocto),
      terms_hash: termsHash,
      duration_days: Number(durationDays),
    },
    attachedDeposit: "0",
    gas: DEFAULT_GAS_30_TGAS,
    context: { offerId, discoveryId },
  });
}

/**
 * Prepares intent for `deactivate_license_offer`.
 */
export function prepareDeactivateOfferIntent(params) {
  const { offerId } = params;

  return buildTransactionIntent({
    methodName: "deactivate_license_offer",
    args: {
      offer_id: offerId,
    },
    attachedDeposit: "0",
    gas: DEFAULT_GAS_30_TGAS,
    context: { offerId },
  });
}

/**
 * Prepares intent for `request_license`.
 */
export function prepareRequestLicenseIntent(params) {
  const {
    requestId,
    offerId,
    acceptedTermsHash,
  } = params;

  return buildTransactionIntent({
    methodName: "request_license",
    args: {
      request_id: requestId,
      offer_id: offerId,
      accepted_terms_hash: acceptedTermsHash,
    },
    attachedDeposit: "0",
    gas: DEFAULT_GAS_30_TGAS,
    context: { requestId, offerId },
  });
}

/**
 * Prepares intent for `approve_license_request`.
 */
export function prepareApproveRequestIntent(params) {
  const { requestId } = params;

  return buildTransactionIntent({
    methodName: "approve_license_request",
    args: {
      request_id: requestId,
    },
    attachedDeposit: "0",
    gas: DEFAULT_GAS_30_TGAS,
    context: { requestId },
  });
}

/**
 * Prepares intent for `reject_license_request`.
 */
export function prepareRejectRequestIntent(params) {
  const { requestId, reason } = params;

  return buildTransactionIntent({
    methodName: "reject_license_request",
    args: {
      request_id: requestId,
      reason: reason || "Rejected by rights controller",
    },
    attachedDeposit: "0",
    gas: DEFAULT_GAS_30_TGAS,
    context: { requestId },
  });
}

/**
 * Prepares intent for `pay_for_license`.
 * Authoritatively derives the exact attached deposit from the on-chain approved request.
 */
export async function preparePayLicenseIntent(params) {
  const { requestId, acceptedTermsHash } = params;

  // Query authoritative request to guarantee exact attached deposit match
  const record = await nearContract.getLicenseRequest(requestId);
  if (!record) {
    const err = new Error(`ERR_REQUEST_NOT_FOUND: License request '${requestId}' not found on chain`);
    err.status = 404;
    err.code = "ERR_REQUEST_NOT_FOUND";
    throw err;
  }

  const termsHash = acceptedTermsHash || record.accepted_terms_hash;
  const exactPriceYocto = String(record.price_yocto);

  return buildTransactionIntent({
    methodName: "pay_for_license",
    args: {
      request_id: requestId,
      accepted_terms_hash: termsHash,
    },
    attachedDeposit: exactPriceYocto, // MUST match record.price_yocto exactly!
    gas: DEFAULT_GAS_50_TGAS,
    context: {
      requestId,
      priceYocto: exactPriceYocto,
      discoveryId: record.discovery_id,
    },
  });
}

/**
 * Prepares intent for `withdraw_earnings`.
 */
export function prepareWithdrawEarningsIntent(context = {}) {
  return buildTransactionIntent({
    methodName: "withdraw_earnings",
    args: {},
    attachedDeposit: "0",
    gas: "40000000000000",
    context,
  });
}

/**
 * Prepares intent for `expire_license`.
 */
export function prepareExpireLicenseIntent(params) {
  const { requestId } = params;

  return buildTransactionIntent({
    methodName: "expire_license",
    args: {
      request_id: requestId,
    },
    attachedDeposit: "0",
    gas: DEFAULT_GAS_30_TGAS,
    context: { requestId },
  });
}

/**
 * Prepares intent for `storage_deposit`.
 */
export function prepareStorageDepositIntent(params = {}) {
  const { accountId, amountYocto, registrationOnly } = params;

  return buildTransactionIntent({
    methodName: "storage_deposit",
    args: {
      account_id: accountId || null,
      registration_only: Boolean(registrationOnly),
    },
    attachedDeposit: amountYocto ? String(amountYocto) : "2700000000000000000000",
    gas: DEFAULT_GAS_30_TGAS,
    context: { accountId },
  });
}

