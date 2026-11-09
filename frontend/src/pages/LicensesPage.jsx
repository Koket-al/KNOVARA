import React, { useState, useEffect, useCallback } from "react";
import { Card } from "../components/common/Card.jsx";
import { Button } from "../components/common/Button.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LoadingSpinner } from "../components/common/LoadingSpinner.jsx";
import { ErrorAlert } from "../components/common/ErrorAlert.jsx";
import { TransactionReviewModal } from "../components/transaction/TransactionReviewModal.jsx";
import { formatDate, yoctoToNear, truncateHash } from "../services/formatters.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";

export function LicensesPage({ onNavigate }) {
  const { user, isAuthenticated, loginWithWallet } = useAuth();
  const [activeTab, setActiveTab] = useState("buyer"); // "buyer" | "controller"

  // Buyer state
  const [myRequests, setMyRequests] = useState([]);
  const [myLicenses, setMyLicenses] = useState([]);

  // Controller state
  const [controllerRequests, setControllerRequests] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Intent Review
  const [pendingIntent, setPendingIntent] = useState(null);
  const [intentExplanation, setIntentExplanation] = useState("");

  // Download state
  const [downloadingFileId, setDownloadingFileId] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [downloadSuccess, setDownloadSuccess] = useState(null);

  const fetchLicenseData = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);

      const [reqRes, licRes, offersRes] = await Promise.all([
        api.getAccountRequests().catch(() => ({ requests: [] })),
        api.getAccountLicenses().catch(() => ({ licenses: [] })),
        api.getAccountOffers().catch(() => ({ offers: [] })),
      ]);

      setMyRequests(reqRes.requests || []);
      setMyLicenses(licRes.licenses || []);

      // For controller, fetch requests for all offers owned by account
      const managedOffers = offersRes.offers || [];
      const controllerReqsNested = await Promise.all(
        managedOffers.map(async (o) => {
          try {
            const r = await api.getOfferRequests(o.offer_id);
            return (r.requests || []).map((req) => ({
              ...req,
              offerPriceYocto: o.price_yocto,
              offerScope: o.scope,
            }));
          } catch (_e) {
            return [];
          }
        })
      );

      setControllerRequests(controllerReqsNested.flat());
    } catch (err) {
      setError(err.message || "Failed to load licensing records");
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchLicenseData();
  }, [fetchLicenseData]);

  if (!isAuthenticated) {
    return (
      <Card style={{ padding: "48px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>Authentication Required</h2>
        <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginBottom: "20px" }}>
          Please connect your NEAR Testnet wallet to view and manage your license agreements.
        </p>
        <Button variant="primary" onClick={() => loginWithWallet()}>
          Connect NEAR Wallet
        </Button>
      </Card>
    );
  }

  // Handle Approve Request (as Controller)
  const handleApproveRequest = async (requestId) => {
    try {
      setError(null);
      const intent = await api.prepareTransactionIntent("approve-request", { requestId });
      setIntentExplanation(`Approves license request '${requestId}'. Enables prospective buyer to submit on-chain payment.`);
      setPendingIntent(intent);
    } catch (err) {
      setError(err.message || "Failed to prepare approve intent");
    }
  };

  // Handle Reject Request (as Controller)
  const handleRejectRequest = async (requestId) => {
    const reason = window.prompt("Reason for rejection:", "Does not meet licensing criteria") || "Rejected by rights controller";
    try {
      setError(null);
      const intent = await api.prepareTransactionIntent("reject-request", { requestId, reason });
      setIntentExplanation(`Rejects license request '${requestId}' with reason: "${reason}".`);
      setPendingIntent(intent);
    } catch (err) {
      setError(err.message || "Failed to prepare reject intent");
    }
  };

  // Handle Pay License (as Buyer)
  const handlePayLicense = async (request) => {
    try {
      setError(null);
      const intent = await api.prepareTransactionIntent("pay-license", {
        requestId: request.request_id,
        acceptedTermsHash: request.accepted_terms_hash,
      });
      setIntentExplanation(
        `Executes on-chain payment of ${yoctoToNear(intent.attachedDeposit)} NEAR to activate license '${request.request_id}'.`
      );
      setPendingIntent(intent);
    } catch (err) {
      setError(err.message || "Failed to prepare payment intent");
    }
  };

  // Handle Download Protected Evidence
  const handleDownloadFile = async (licenseId, fileId = "primary-evidence") => {
    try {
      setDownloadingFileId(licenseId);
      setDownloadError(null);
      setDownloadSuccess(null);

      // 1. Try robust direct-stream download via blob (bypasses browser popup shields)
      try {
        const result = await api.downloadLicenseEvidence(licenseId, fileId);
        setDownloadSuccess({ licenseId, filename: result.filename });
        return;
      } catch (streamErr) {
        console.warn("[DOWNLOAD] Direct stream failed, attempting presigned fallback:", streamErr);
      }

      // 2. Fallback to presigned URL via non-popup anchor click
      const res = await api.getEvidenceDownloadUrl(licenseId, fileId || "primary-evidence");
      const targetUrl = res?.downloadUrl || res?.presignedUrl;
      if (targetUrl) {
        const link = document.createElement("a");
        link.href = targetUrl;
        link.setAttribute("download", res?.filename || "evidence.pdf");
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (document.body.contains(link)) document.body.removeChild(link);
        }, 500);
        setDownloadSuccess({ licenseId, filename: res?.filename || "evidence.pdf" });
      } else {
        throw new Error("No download URL returned by server");
      }
    } catch (err) {
      setDownloadError(err.message || "Download access denied by backend policy");
    } finally {
      setDownloadingFileId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="flex-between" style={{ flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "2rem" }}>Licensing Management</h1>
          <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginTop: "4px" }}>
            State Machine: <code>REQUESTED &rarr; APPROVED / REJECTED &rarr; ACTIVE / EXPIRED</code>
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: "flex", gap: "8px", backgroundColor: "var(--knovara-surface)", padding: "4px", borderRadius: "var(--radius-sm)" }}>
          <Button
            variant={activeTab === "buyer" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setActiveTab("buyer")}
          >
            My License Agreements ({myRequests.length})
          </Button>
          <Button
            variant={activeTab === "controller" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setActiveTab("controller")}
          >
            Incoming Requests to Review ({controllerRequests.length})
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      {downloadError && <ErrorAlert message={downloadError} onDismiss={() => setDownloadError(null)} />}

      {isLoading ? (
        <LoadingSpinner message="Querying license states and permissions..." />
      ) : activeTab === "buyer" ? (
        /* =================== BUYER TAB =================== */
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {myRequests.length === 0 ? (
            <Card style={{ padding: "48px 24px", textAlign: "center", color: "var(--knovara-text-muted)" }}>
              <h3 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>No License Requests Submitted</h3>
              <p style={{ fontSize: "0.875rem", maxWidth: "480px", margin: "0 auto 16px auto" }}>
                You have not submitted any license requests yet. Explore the marketplace to license technical discoveries.
              </p>
              <Button variant="primary" size="sm" onClick={() => onNavigate("/marketplace")}>
                Browse Licensing Marketplace
              </Button>
            </Card>
          ) : (
            myRequests.map((req) => {
              const status = req.status || "Requested";
              const isApproved = status === "Approved";
              const isActive = status === "Active";
              const isRejected = status === "Rejected";

              return (
                <Card key={req.request_id}>
                  <div className="flex-between" style={{ marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <Badge
                        variant={
                          isActive ? "success" : isApproved ? "sky" : isRejected ? "danger" : "warning"
                        }
                      >
                        {status.toUpperCase()}
                      </Badge>
                      <span style={{ fontWeight: 600 }}>Request ID: {req.request_id}</span>
                    </div>

                    <span style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                      Requested: {formatDate(req.requested_at)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "12px",
                      backgroundColor: "var(--knovara-surface)",
                      padding: "12px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.75rem",
                      marginBottom: "16px",
                    }}
                  >
                    <div>
                      <span style={{ color: "var(--knovara-text-muted)" }}>Discovery: </span>
                      <code>{req.discovery_id}</code>
                    </div>
                    <div>
                      <span style={{ color: "var(--knovara-text-muted)" }}>Offer ID: </span>
                      <code>{req.offer_id}</code>
                    </div>
                    <div>
                      <span style={{ color: "var(--knovara-text-muted)" }}>Price: </span>
                      <strong style={{ color: "var(--knovara-blue-primary)" }}>
                        {yoctoToNear(req.price_yocto)} NEAR
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--knovara-text-muted)" }}>Accepted Terms Hash: </span>
                      <code>{truncateHash(req.accepted_terms_hash, 8, 6)}</code>
                    </div>
                  </div>

                  {/* Actions according to lifecycle */}
                  <div className="flex-between" style={{ borderTop: "1px solid var(--knovara-border)", paddingTop: "12px" }}>
                    <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)" }}>
                      {isApproved && "Payment approved by Rights Controller. Proceed with payment to activate."}
                      {isActive && "License is active on-chain. Protected evidence files are accessible."}
                      {isRejected && `Request rejected: ${req.rejection_reason || "No reason given."}`}
                      {status === "Requested" && "Awaiting Rights Controller review and cryptographic approval."}
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      {isApproved && (
                        <Button variant="primary" size="sm" onClick={() => handlePayLicense(req)}>
                          Pay & Activate License ({yoctoToNear(req.price_yocto)} NEAR)
                        </Button>
                      )}

                      {isActive && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <Button
                              variant="sky"
                              size="sm"
                              isLoading={downloadingFileId === req.request_id}
                              onClick={() => handleDownloadFile(req.request_id, "primary-evidence")}
                            >
                              ⬇ Download Licensed Evidence
                            </Button>
                            <a
                              href={`/api/v1/licenses/${encodeURIComponent(req.request_id)}/download`}
                              download
                              className="knovara-btn knovara-btn-outline"
                              style={{
                                textDecoration: "none",
                                fontSize: "0.75rem",
                                padding: "4px 8px",
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                              title="Direct browser stream download"
                            >
                              Direct Link
                            </a>
                          </div>
                          {downloadSuccess && downloadSuccess.licenseId === req.request_id && (
                            <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 600 }}>
                              ✓ {downloadSuccess.filename} downloaded successfully!
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        /* =================== CONTROLLER TAB =================== */
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {controllerRequests.length === 0 ? (
            <Card style={{ padding: "48px 24px", textAlign: "center", color: "var(--knovara-text-muted)" }}>
              <h3 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>No Incoming License Requests</h3>
              <p style={{ fontSize: "0.875rem", maxWidth: "480px", margin: "0 auto" }}>
                There are no pending requests for discoveries where you are the Rights Controller.
              </p>
            </Card>
          ) : (
            controllerRequests.map((req) => {
              const status = req.status || "Requested";
              const isRequested = status === "Requested";

              return (
                <Card key={req.request_id}>
                  <div className="flex-between" style={{ marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <Badge
                        variant={
                          status === "Active" ? "success" : status === "Approved" ? "sky" : status === "Rejected" ? "danger" : "warning"
                        }
                      >
                        {status.toUpperCase()}
                      </Badge>
                      <span style={{ fontWeight: 600 }}>Request ID: {req.request_id}</span>
                    </div>

                    <span style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                      Buyer: <code>{req.buyer_id}</code>
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "12px",
                      backgroundColor: "var(--knovara-surface)",
                      padding: "12px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.75rem",
                      marginBottom: "16px",
                    }}
                  >
                    <div>
                      <span style={{ color: "var(--knovara-text-muted)" }}>Discovery: </span>
                      <code>{req.discovery_id}</code>
                    </div>
                    <div>
                      <span style={{ color: "var(--knovara-text-muted)" }}>Offer ID: </span>
                      <code>{req.offer_id}</code>
                    </div>
                    <div>
                      <span style={{ color: "var(--knovara-text-muted)" }}>Bound Terms Hash: </span>
                      <code>{truncateHash(req.accepted_terms_hash, 8, 6)}</code>
                    </div>
                  </div>

                  {isRequested && (
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--knovara-border)", paddingTop: "12px" }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRejectRequest(req.request_id)}
                      >
                        Reject Request
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApproveRequest(req.request_id)}
                      >
                        Approve License Request
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Transaction Intent Review Modal */}
      <TransactionReviewModal
        isOpen={Boolean(pendingIntent)}
        onClose={() => setPendingIntent(null)}
        intent={pendingIntent}
        title="Review Transaction Intent"
        explanation={intentExplanation}
        onReconcileSuccess={() => {
          setPendingIntent(null);
          fetchLicenseData();
        }}
      />
    </div>
  );
}
