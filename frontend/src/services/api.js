import { config } from "../config/env.js";

/**
 * Custom API Error class preserving backend error code and details.
 */
export class ApiError extends Error {
  constructor(message, status, code, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Core HTTP client with credentials and JSON parsing.
 */
async function request(endpoint, options = {}) {
  const baseUrl = config.BACKEND_API_URL || "";
  // Ensure endpoint starts with /api/v1 if not already specified
  const path = endpoint.startsWith("/api") ? endpoint : `/api/v1${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  const url = `${baseUrl}${path}`;

  const headers = {
    "Accept": "application/json",
    ...options.headers,
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // Required for HttpOnly session cookie knovara.sid
  });

  const contentType = response.headers.get("content-type") || "";
  let data = null;

  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch (_err) {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = data?.error || (typeof data === "string" ? data : `Request failed with status ${response.status}`);
    const errorCode = data?.code || "ERR_HTTP_ERROR";
    const details = data?.details || null;
    throw new ApiError(errorMsg, response.status, errorCode, details);
  }

  return data;
}

export const api = {
  // ---------------------------------------------------------------------------
  // AUTHENTICATION APIs (NEP-413)
  // ---------------------------------------------------------------------------
  async getChallenge(accountId, callbackUrl) {
    return request("/auth/challenge", {
      method: "POST",
      body: JSON.stringify({ accountId, callbackUrl }),
    });
  },

  async verifyChallenge({ accountId, publicKey, signature, nonceHex, state }) {
    return request("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ accountId, publicKey, signature, nonceHex, state }),
    });
  },

  async getSession() {
    return request("/auth/session", { method: "GET" });
  },

  async logout() {
    return request("/auth/logout", { method: "POST" });
  },

  // ---------------------------------------------------------------------------
  // DISCOVERIES & PUBLIC METADATA APIs
  // ---------------------------------------------------------------------------
  async getDiscoveries({ page = 1, limit = 12, category = "", q = "", sort = "newest" } = {}) {
    const params = new URLSearchParams();
    if (page) params.append("page", page);
    if (limit) params.append("limit", limit);
    if (category) params.append("category", category);
    if (q) params.append("q", q);
    if (sort) params.append("sort", sort);
    return request(`/discoveries?${params.toString()}`, { method: "GET" });
  },

  async getDiscovery(discoveryId) {
    return request(`/discoveries/${encodeURIComponent(discoveryId)}`, { method: "GET" });
  },

  async getPassport(discoveryId) {
    return request(`/discoveries/${encodeURIComponent(discoveryId)}/passport`, { method: "GET" });
  },

  async getDiscoveryOffers(discoveryId) {
    return request(`/discoveries/${encodeURIComponent(discoveryId)}/offers`, { method: "GET" });
  },

  async getPublicMetadata(discoveryId, version = "1.0.0") {
    return request(`/metadata/${encodeURIComponent(discoveryId)}/${encodeURIComponent(version)}`, {
      method: "GET",
    });
  },

  // ---------------------------------------------------------------------------
  // EVIDENCE UPLOADS & REGISTRATION PREPARATION
  // ---------------------------------------------------------------------------
  async requestEvidenceUpload({ filename, contentType, fileSize, classification }) {
    return request("/discoveries/evidence/uploads", {
      method: "POST",
      body: JSON.stringify({ filename, contentType, fileSize, classification }),
    });
  },

  async uploadEvidenceContent(uploadId, fileOrBuffer, contentType) {
    const baseUrl = config.BACKEND_API_URL || "";
    const path = `/api/v1/discoveries/evidence/uploads/${encodeURIComponent(uploadId)}/content`;
    const url = `${baseUrl}${path}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType || "application/octet-stream",
      },
      body: fileOrBuffer,
      credentials: "include",
    });

    if (!response.ok) {
      let errorMsg = `Server upload relay failed with status ${response.status}`;
      try {
        const data = await response.json();
        if (data && data.error) errorMsg = data.error;
      } catch (_e) {}
      throw new Error(errorMsg);
    }

    return response.json();
  },

  async completeEvidenceUpload(uploadId) {
    return request(`/discoveries/evidence/uploads/${encodeURIComponent(uploadId)}/complete`, {
      method: "POST",
    });
  },

  async prepareDiscoveryRegistration(payload) {
    return request("/discoveries/prepare-registration", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ---------------------------------------------------------------------------
  // LICENSING MARKETPLACE APIs
  // ---------------------------------------------------------------------------
  async getOffer(offerId) {
    return request(`/licenses/offers/${encodeURIComponent(offerId)}`, { method: "GET" });
  },

  async getOfferRequests(offerId) {
    return request(`/licenses/offers/${encodeURIComponent(offerId)}/requests`, { method: "GET" });
  },

  async getRequest(requestId) {
    return request(`/licenses/requests/${encodeURIComponent(requestId)}`, { method: "GET" });
  },

  async getDiscoveryRequests(discoveryId) {
    return request(`/licenses/discoveries/${encodeURIComponent(discoveryId)}/requests`, { method: "GET" });
  },

  async getEvidenceDownloadUrl(licenseId, fileId) {
    return request(`/licenses/${encodeURIComponent(licenseId)}/files/${encodeURIComponent(fileId)}/download-url`, {
      method: "POST",
    });
  },

  async downloadLicenseEvidence(licenseId, fileId = "primary-evidence") {
    const cleanLicenseId = encodeURIComponent(licenseId);
    const cleanFileId = encodeURIComponent(fileId);
    const endpoint = fileId && fileId !== "primary-evidence"
      ? `/api/v1/licenses/${cleanLicenseId}/files/${cleanFileId}/download`
      : `/api/v1/licenses/${cleanLicenseId}/download`;

    const res = await fetch(endpoint, {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      let errMessage = "Download failed";
      try {
        const text = await res.text();
        errMessage = text || `Download failed with HTTP ${res.status}`;
      } catch (_e) {}
      throw new Error(errMessage);
    }

    // Extract filename from Content-Disposition header if available
    let filename = "evidence.pdf";
    const disposition = res.headers.get("content-disposition");
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1]);
      }
    }

    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      window.URL.revokeObjectURL(objectUrl);
    }, 1000);

    return { success: true, filename };
  },

  // ---------------------------------------------------------------------------
  // ACCOUNT & ROYALTIES APIs
  // ---------------------------------------------------------------------------
  async getAccountDiscoveries() {
    return request("/account/discoveries", { method: "GET" });
  },

  async getAccountOffers() {
    return request("/account/offers", { method: "GET" });
  },

  async getAccountRequests() {
    return request("/account/requests", { method: "GET" });
  },

  async getAccountLicenses() {
    return request("/account/licenses", { method: "GET" });
  },

  async getAccountRoyalties() {
    return request("/account/royalties", { method: "GET" });
  },

  async getAccountStorage(accountId = null) {
    const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
    return request(`/account/storage${query}`, { method: "GET" });
  },

  // ---------------------------------------------------------------------------
  // TRANSACTION INTENTS & RECONCILIATION
  // ---------------------------------------------------------------------------
  async prepareTransactionIntent(action, payload = {}) {
    try {
      return await request(`/transactions/intents/${encodeURIComponent(action)}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (_err) {
      return buildClientTransactionIntent(action, payload);
    }
  },

  async reconcileTransaction(txHash) {
    return request("/transactions/reconcile", {
      method: "POST",
      body: JSON.stringify({ txHash }),
    });
  },

  async getTransactionStatus(txHash) {
    return request(`/transactions/${encodeURIComponent(txHash)}`, { method: "GET" });
  },
};

/**
 * Client-Side Transaction Intent Builder Fallback
 */
export function buildClientTransactionIntent(action, payload = {}) {
  const contractId = config.NEAR_CONTRACT_ID || "koket-knovara-dev.testnet";
  const networkId = config.NEAR_NETWORK || "testnet";
  const DEFAULT_GAS_30_TGAS = "30000000000000";
  const DEFAULT_GAS_50_TGAS = "50000000000000";

  switch (action) {
    case "storage-deposit":
      return {
        networkId,
        contractId,
        methodName: "storage_deposit",
        args: {
          account_id: payload.accountId || null,
          registration_only: Boolean(payload.registrationOnly),
        },
        attachedDeposit: String(payload.amountYocto || "20000000000000000000000"), // 0.02 NEAR
        gas: DEFAULT_GAS_30_TGAS,
        context: { accountId: payload.accountId },
      };

    case "register-discovery":
      return {
        networkId,
        contractId,
        methodName: "register_discovery_and_mint",
        args: {
          discovery_id: payload.discoveryId,
          token_id: payload.tokenId,
          custodian_id: payload.custodianId || null,
          rights_controller_id: payload.rightsControllerId,
          evidence_manifest_hash: payload.evidenceManifestHash,
          metadata: payload.metadata,
          beneficiary_splits: payload.beneficiarySplits || [],
          lineage_parents: payload.lineageParents || [],
        },
        attachedDeposit: "0",
        gas: DEFAULT_GAS_50_TGAS,
        context: { discoveryId: payload.discoveryId, tokenId: payload.tokenId },
      };

    case "request-license":
      return {
        networkId,
        contractId,
        methodName: "request_license",
        args: {
          request_id: payload.requestId,
          offer_id: payload.offerId,
          accepted_terms_hash: payload.acceptedTermsHash,
        },
        attachedDeposit: "0",
        gas: DEFAULT_GAS_30_TGAS,
        context: { requestId: payload.requestId, offerId: payload.offerId },
      };

    case "approve-request":
      return {
        networkId,
        contractId,
        methodName: "approve_license_request",
        args: {
          request_id: payload.requestId,
        },
        attachedDeposit: "0",
        gas: DEFAULT_GAS_30_TGAS,
        context: { requestId: payload.requestId },
      };

    case "reject-request":
      return {
        networkId,
        contractId,
        methodName: "reject_license_request",
        args: {
          request_id: payload.requestId,
          reason: payload.reason || "Rejected by rights controller",
        },
        attachedDeposit: "0",
        gas: DEFAULT_GAS_30_TGAS,
        context: { requestId: payload.requestId },
      };

    case "pay-license":
      return {
        networkId,
        contractId,
        methodName: "pay_for_license",
        args: {
          request_id: payload.requestId,
          accepted_terms_hash: payload.acceptedTermsHash,
        },
        attachedDeposit: String(payload.priceYocto || payload.deposit || "0"),
        gas: DEFAULT_GAS_50_TGAS,
        context: { requestId: payload.requestId },
      };

    case "create-offer":
      return {
        networkId,
        contractId,
        methodName: "create_license_offer",
        args: {
          offer_id: payload.offerId,
          discovery_id: payload.discoveryId,
          scope: payload.scope,
          price_yocto: String(payload.priceYocto),
          terms_hash: payload.termsHash,
          duration_days: Number(payload.durationDays),
        },
        attachedDeposit: "0",
        gas: DEFAULT_GAS_30_TGAS,
        context: { offerId: payload.offerId, discoveryId: payload.discoveryId },
      };

    case "deactivate-offer":
      return {
        networkId,
        contractId,
        methodName: "deactivate_license_offer",
        args: {
          offer_id: payload.offerId,
        },
        attachedDeposit: "0",
        gas: DEFAULT_GAS_30_TGAS,
        context: { offerId: payload.offerId },
      };

    case "claim-royalties":
    case "withdraw-earnings":
      return {
        networkId,
        contractId,
        methodName: "withdraw_earnings",
        args: {},
        attachedDeposit: "0",
        gas: "40000000000000",
        context: {},
      };

    default:
      throw new Error(`Unsupported transaction intent action: '${action}'`);
  }
}

