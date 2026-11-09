import React, { useState } from "react";
import { Modal } from "../common/Modal.jsx";
import { Button } from "../common/Button.jsx";
import { Badge } from "../common/Badge.jsx";
import { yoctoToNear } from "../../services/formatters.js";
import { api } from "../../services/api.js";

export function RequestLicenseModal({ isOpen, onClose, offer, onRequestPrepared }) {
  const [requestId, setRequestId] = useState(`req-${Date.now().toString(36)}`);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!offer) return null;

  const priceNear = yoctoToNear(offer.price_yocto || "0");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!acceptedTerms) {
      setError("You must accept the terms binding to submit a license request");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const intent = await api.prepareTransactionIntent("request-license", {
        requestId: requestId.trim(),
        offerId: offer.offer_id,
        acceptedTermsHash: offer.terms_hash,
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Request License — Offer ${offer.offer_id}`}
      footer={
        <div style={{ display: "flex", gap: "10px" }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!acceptedTerms} isLoading={isSubmitting}>
            Prepare Request Intent
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {error && <div className="knovara-alert knovara-alert-danger">{error}</div>}

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
            <Badge variant="blue">{offer.scope}</Badge>
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
            <div>{offer.duration_days} Days</div>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Discovery
            </div>
            <code>{offer.discovery_id}</code>
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
            Terms Hash (Cryptographically Bound)
          </label>
          <code style={{ display: "block", padding: "8px" }}>{offer.terms_hash}</code>
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
              <code>{offer.terms_hash.slice(0, 12)}...</code>.
            </span>
          </label>
        </div>
      </form>
    </Modal>
  );
}

