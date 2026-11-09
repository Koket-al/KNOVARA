import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal.jsx";
import { Button } from "../common/Button.jsx";
import { Badge } from "../common/Badge.jsx";
import { TransactionReviewModal } from "../transaction/TransactionReviewModal.jsx";
import { yoctoToNear, nearToYocto } from "../../services/formatters.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { api } from "../../services/api.js";

export function RequestLicenseModal({ isOpen, onClose, offer, onRequestPrepared }) {
  const { user, isAuthenticated, loginWithWallet } = useAuth();
  const [requestId, setRequestId] = useState(`req-${Date.now().toString(36)}`);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [storageData, setStorageData] = useState(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [storageModalIntent, setStorageModalIntent] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function checkStorage() {
      if (!isOpen || !offer) return;
      try {
        setIsCheckingStorage(true);
        const res = await api.getAccountStorage(user?.accountId || null);
        setStorageData(res);
      } catch (_err) {
        // Ignored, fallback to client intent
      } finally {
        setIsCheckingStorage(false);
      }
    }
    checkStorage();
  }, [isOpen, offer, user?.accountId]);

  if (!isOpen || !offer) return null;

  const offerId = offer.offer_id || offer.offerId || "";
  const discoveryId = offer.discovery_id || offer.discoveryId || "";
  const scope = offer.scope || "AcademicResearch";
  const termsHash = String(offer.terms_hash || offer.termsHash || "");
  const durationDays = offer.duration_days ?? offer.durationDays ?? 0;
  const priceYocto = String(offer.price_yocto || offer.priceYocto || "0");
  const priceNear = yoctoToNear(priceYocto);

  const isRegistered = storageData?.isRegistered === true;
  let hasEnoughStorage = false;
  try {
    const availableStorageYocto = storageData?.storageBalance?.available || "0";
    hasEnoughStorage = isRegistered && BigInt(String(availableStorageYocto)) >= BigInt("3000000000000000000000");
  } catch (_e) {
    hasEnoughStorage = false;
  }

  const handleDepositStorage = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      const amountYocto = nearToYocto("0.02");
      const intent = await api.prepareTransactionIntent("storage-deposit", {
        accountId: user?.accountId || null,
        amountYocto,
        registrationOnly: false,
      });
      setStorageModalIntent(intent);
    } catch (err) {
      setError(err.message || "Failed to prepare storage deposit intent");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrimaryAction = async (e) => {
    e?.preventDefault();
    setError(null);

    // If wallet not connected, prompt login
    if (!isAuthenticated && !user?.accountId) {
      if (typeof loginWithWallet === "function") {
        await loginWithWallet();
      }
      return;
    }

    // If storage is not registered, guide user directly to storage deposit
    if (storageData && !hasEnoughStorage) {
      await handleDepositStorage();
      return;
    }

    if (!acceptedTerms) {
      setError("Please check the box below to accept the terms binding before submitting a license request.");
      return;
    }

    await handleSubmit(e);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!acceptedTerms) {
      setError("Please check the box below to accept the terms binding before submitting a license request.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const intent = await api.prepareTransactionIntent("request-license", {
        requestId: requestId.trim(),
        offerId,
        acceptedTermsHash: termsHash,
      });

      if (onRequestPrepared) {
        onRequestPrepared(intent);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Failed to prepare license request intent");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Request License — Offer ${offerId}`}
        footer={
          <div style={{ display: "flex", gap: "10px" }}>
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handlePrimaryAction}
              isLoading={isSubmitting || isCheckingStorage}
            >
              {!user?.accountId
                ? "Connect Wallet to Request"
                : storageData && !hasEnoughStorage
                  ? "Deposit Storage (0.02 NEAR) First →"
                  : "Prepare Request Intent"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {error && <div className="knovara-alert knovara-alert-danger">{error}</div>}

          {/* Storage Registration Alert */}
          {storageData && !hasEnoughStorage && (
            <div
              className="knovara-alert knovara-alert-warning"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                margin: 0,
                border: "1px solid var(--knovara-border-strong)",
              }}
            >
              <div style={{ fontWeight: 600 }}>
                ⚠️ {!isRegistered ? "Smart Contract Buyer Storage Registration Required" : "Insufficient Available Storage Deposit"}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)", lineHeight: 1.4 }}>
                {!isRegistered
                  ? `The KNOVARA smart contract requires your buyer account (${user?.accountId || "connected wallet"}) to register a refundable storage deposit before requesting a license.`
                  : `Your account does not have enough available storage deposit to hold on-chain license request and rights dependency records.`}
                {" "}Please deposit refundable storage (recommended <strong>0.02 NEAR</strong>) to continue.
              </div>
              <div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleDepositStorage}
                  isLoading={isSubmitting}
                >
                  {!isRegistered ? "Deposit Storage (0.02 NEAR) →" : "Top Up Storage (0.02 NEAR) →"}
                </Button>
              </div>
            </div>
          )}

          <div
            style={{
              backgroundColor: "var(--knovara-surface)",
              padding: "16px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--knovara-border)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
                Scope
              </div>
              <Badge variant="blue">{scope}</Badge>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
                Price
              </div>
              <strong style={{ color: "var(--knovara-blue-primary)" }}>{priceNear} NEAR</strong>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
                Duration
              </div>
              <div>{durationDays} Days</div>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
                Discovery
              </div>
              <code>{discoveryId}</code>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
              Terms Hash (Cryptographically Bound)
            </label>
            <code style={{ display: "block", padding: "8px" }}>{termsHash || "Not specified"}</code>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
              Request Identifier
            </label>
            <input
              type="text"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              required
            />
          </div>

          <div
            style={{
              backgroundColor: "var(--knovara-surface-card)",
              padding: "12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--knovara-border-strong)",
            }}
          >
            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                style={{ width: "18px", height: "18px", marginTop: "2px" }}
              />
              <span style={{ fontSize: "0.8125rem" }}>
                I agree to the specified licensing scope and accept the terms cryptographically bound by hash{" "}
                <code>{termsHash ? `${termsHash.slice(0, 12)}...` : "immutable license hash"}</code>.
              </span>
            </label>
          </div>
        </form>
      </Modal>

      {/* Storage Deposit Review Modal */}
      <TransactionReviewModal
        isOpen={Boolean(storageModalIntent)}
        onClose={() => setStorageModalIntent(null)}
        intent={storageModalIntent}
        title="Register Buyer Storage Balance"
        explanation="Deposits 0.02 NEAR refundable storage deposit into the KNOVARA smart contract to register your account and hold license records."
        onReconcileSuccess={async () => {
          setStorageModalIntent(null);
          try {
            const res = await api.getAccountStorage(user?.accountId || null);
            setStorageData(res);
          } catch (_e) { }
        }}
      />
    </>
  );
}
