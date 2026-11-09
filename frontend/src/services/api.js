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

  async getAccountStorage() {
    return request("/account/storage", { method: "GET" });
  },

  // ---------------------------------------------------------------------------
  // TRANSACTION INTENTS & RECONCILIATION
  // ---------------------------------------------------------------------------
  async prepareTransactionIntent(action, payload) {
    return request(`/transactions/intents/${encodeURIComponent(action)}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
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

