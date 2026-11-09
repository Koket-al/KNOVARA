import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal.jsx";
import { Button } from "../common/Button.jsx";
import { TransactionReviewModal } from "../transaction/TransactionReviewModal.jsx";
import { nearToYocto } from "../../services/formatters.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { api } from "../../services/api.js";
import { calculateSha256Hex } from "../../services/cryptoUtils.js";

export const SCOPES = [
  { value: "AiModelTraining", label: "AI Model Training (Pre-training)" },
  { value: "AiModelFineTuning", label: "AI Model Fine-Tuning" },
  { value: "AiKnowledgeRetrieval", label: "AI RAG & Knowledge Retrieval" },
  { value: "AcademicResearch", label: "Academic & Research Evaluation" },
  { value: "CommercialUse", label: "Commercial Production Use" },
  { value: "ResearchEvaluation", label: "Evaluation & Feasibility Sample" },
  { value: "CustomTerms", label: "Custom Negotiated Terms" },
];

export function CreateOfferModal({ isOpen, onClose, discoveryId, onOfferPrepared }) {
  const { user, isAuthenticated } = useAuth();
  const [offerId, setOfferId] = useState(`offer-${Date.now().toString(36)}`);
  const [scope, setScope] = useState("AiModelTraining");
  const [priceNear, setPriceNear] = useState("1.0");
  const [termsText, setTermsText] = useState("Standard KNOVARA AI Model Training and Research Evaluation License Terms v1.0");
  const [termsHash, setTermsHash] = useState("15709676c4926620c634fd990dd9e66cbdc39d8eb08a6b4a16f49a6501bcfe97");
  const [durationDays, setDurationDays] = useState(365);
  const [storageData, setStorageData] = useState(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [storageModalIntent, setStorageModalIntent] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function checkStorage() {
      if (!isOpen) return;
      try {
        setIsCheckingStorage(true);
        const res = await api.getAccountStorage();
        setStorageData(res);
      } catch (_err) {
        // Ignored
      } finally {
        setIsCheckingStorage(false);
      }
    }
    checkStorage();
  }, [isOpen, isAuthenticated]);

  const isRegistered = storageData?.isRegistered === true;
  const availableStorageYocto = storageData?.storageBalance?.available || "0";
  // Creating an offer deducts ~150-250 bytes (~0.0025 NEAR)
  const hasEnoughStorage = isRegistered && BigInt(availableStorageYocto) >= BigInt("2500000000000000000000");

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

  const handleTermsTextChange = async (e) => {
    const text = e.target.value;
    setTermsText(text);
    if (!text.trim()) return;
    try {
      const bytes = new TextEncoder().encode(text);
      const hash = await calculateSha256Hex(bytes);
      setTermsHash(hash);
    } catch (_err) {
      // ignore
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);

      if (!offerId.trim()) {
        throw new Error("Offer ID is required");
      }
      if (offerId.trim().length > 64) {
        throw new Error("Offer ID must be at most 64 characters");
      }
      if (!priceNear || isNaN(Number(priceNear)) || Number(priceNear) < 0) {
        throw new Error("Price must be a valid non-negative number");
      }
      const days = Number(durationDays);
      if (isNaN(days) || days < 1 || days > 365) {
        throw new Error("Duration must be between 1 and 365 days (max 365 allowed by contract)");
      }
      const cleanHash = termsHash.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(cleanHash)) {
        throw new Error("Terms hash must be a 64-character lowercase hexadecimal string (SHA-256)");
      }

      const priceYocto = nearToYocto(priceNear);

      const intent = await api.prepareTransactionIntent("create-offer", {
        offerId: offerId.trim(),
        discoveryId: discoveryId.trim(),
        scope,
        priceYocto,
        termsHash: cleanHash,
        durationDays: days,
      });

      if (onOfferPrepared) {
        onOfferPrepared(intent);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Failed to prepare create-offer intent");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrimaryAction = async (e) => {
    e?.preventDefault();
    if (storageData && !hasEnoughStorage) {
      await handleDepositStorage();
      return;
    }
    await handleSubmit(e);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Create Licensing Offer — ${discoveryId}`}
        footer={
          <div style={{ display: "flex", gap: "10px" }}>
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handlePrimaryAction}
              isLoading={isSubmitting}
            >
              {storageData && !hasEnoughStorage ? "Deposit Storage (0.02 NEAR) First →" : "Prepare Offer Intent"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {error && <div className="knovara-alert knovara-alert-danger">{error}</div>}

          {/* Storage Alert */}
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
                ⚠️ {!isRegistered ? "Smart Contract Storage Registration Required" : "Insufficient Available Storage Deposit"}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)", lineHeight: 1.4 }}>
                {!isRegistered
                  ? `The KNOVARA smart contract requires rights controller accounts (${user?.accountId || "connected wallet"}) to register a storage deposit to create offers.`
                  : `Your account does not have enough available storage deposit to record a new license offer on-chain.`}
                {" "}Please deposit refundable storage (recommended <strong>0.02 NEAR</strong>) to proceed.
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

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
              Offer Identifier
            </label>
            <input
              type="text"
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
              required
            />
          </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
              Licensing Scope
            </label>
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
              Price (NEAR)
            </label>
            <input
              type="text"
              value={priceNear}
              onChange={(e) => setPriceNear(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
            Duration (Days, max 365)
          </label>
          <input
            type="number"
            value={durationDays}
            min={1}
            max={365}
            onChange={(e) => setDurationDays(e.target.value)}
            required
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
            Terms Description (Cryptographically Hashes to Terms Hash)
          </label>
          <textarea
            rows={2}
            value={termsText}
            onChange={handleTermsTextChange}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
            Terms Hash (64 lowercase Hex characters)
          </label>
          <input
            type="text"
            value={termsHash}
            onChange={(e) => setTermsHash(e.target.value)}
            required
          />
          <span style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
            Binds the exact immutable terms on-chain. Buyers must match this exact hash when requesting a license.
          </span>
        </div>
      </form>
    </Modal>

    {/* Storage Review Modal */}
    <TransactionReviewModal
      isOpen={Boolean(storageModalIntent)}
      onClose={() => setStorageModalIntent(null)}
      intent={storageModalIntent}
      title="Register Storage Balance"
      explanation="Deposits 0.02 NEAR refundable storage deposit into the KNOVARA smart contract to register your account and hold offer records."
      onReconcileSuccess={async () => {
        setStorageModalIntent(null);
        try {
          const res = await api.getAccountStorage();
          setStorageData(res);
        } catch (_e) {}
      }}
    />
  </>
  );
}

