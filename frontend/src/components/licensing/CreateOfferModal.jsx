import React, { useState } from "react";
import { Modal } from "../common/Modal.jsx";
import { Button } from "../common/Button.jsx";
import { nearToYocto } from "../../services/formatters.js";
import { api } from "../../services/api.js";

const SCOPES = [
  "RESEARCH_ONLY",
  "COMMERCIAL_USE",
  "AI_TRAINING",
  "EVALUATION_SAMPLE",
  "EXCLUSIVE",
  "PERPETUAL",
];

export function CreateOfferModal({ isOpen, onClose, discoveryId, onOfferPrepared }) {
  const [offerId, setOfferId] = useState(`offer-${Date.now().toString(36)}`);
  const [scope, setScope] = useState("RESEARCH_ONLY");
  const [priceNear, setPriceNear] = useState("1.0");
  const [termsText, setTermsText] = useState("Standard KNOVARA Academic and Research Evaluation License Terms v1.0");
  const [termsHash, setTermsHash] = useState("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  const [durationDays, setDurationDays] = useState(365);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);

      const priceYocto = nearToYocto(priceNear);

      const intent = await api.prepareTransactionIntent("create-offer", {
        offerId: offerId.trim(),
        discoveryId: discoveryId.trim(),
        scope,
        priceYocto,
        termsHash: termsHash.trim().toLowerCase(),
        durationDays: Number(durationDays),
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Create Licensing Offer — ${discoveryId}`}
      footer={
        <div style={{ display: "flex", gap: "10px" }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting}>
            Prepare Offer Intent
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {error && <div className="knovara-alert knovara-alert-danger">{error}</div>}

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
                <option key={s} value={s}>{s}</option>
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
            Duration (Days)
          </label>
          <input
            type="number"
            value={durationDays}
            min={1}
            max={3650}
            onChange={(e) => setDurationDays(e.target.value)}
            required
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
            Terms Description
          </label>
          <textarea
            rows={2}
            value={termsText}
            onChange={(e) => setTermsText(e.target.value)}
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
  );
}

