import React, { useState, useEffect } from "react";
import { Card } from "../components/common/Card.jsx";
import { Button } from "../components/common/Button.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LegalDisclaimer } from "../components/common/LegalDisclaimer.jsx";
import { LoadingSpinner } from "../components/common/LoadingSpinner.jsx";
import { ErrorAlert } from "../components/common/ErrorAlert.jsx";
import { api } from "../services/api.js";

export function PassportDetailPage({ discoveryId, onNavigate }) {
  const [passportData, setPassportData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadPassport() {
      try {
        setIsLoading(true);
        setError(null);
        const res = await api.getPassport(discoveryId);
        setPassportData(res);
      } catch (err) {
        setError(err.message || "Failed to load on-chain passport");
      } finally {
        setIsLoading(false);
      }
    }
    loadPassport();
  }, [discoveryId]);

  if (isLoading) {
    return <LoadingSpinner message="Querying live NEAR Testnet NEP-171 NFT contract..." />;
  }

  if (error || !passportData) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <ErrorAlert message={error || "Passport NFT not found"} />
        <Button variant="secondary" onClick={() => onNavigate(`/discoveries/${encodeURIComponent(discoveryId)}`)}>
          &larr; Return to Discovery Details
        </Button>
      </div>
    );
  }

  const { token, tokenId, custodianId, rightsControllerId } = passportData;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="flex-between">
        <button
          type="button"
          onClick={() => onNavigate(`/discoveries/${encodeURIComponent(discoveryId)}`)}
          style={{
            background: "none",
            border: "none",
            color: "var(--knovara-blue-primary)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: "0.8125rem",
            fontWeight: 600,
          }}
        >
          &larr; Return to Discovery
        </button>

        <Badge variant="blue" style={{ fontSize: "0.8125rem" }}>
          SOULBOUND NEP-171 NFT
        </Badge>
      </div>

      <LegalDisclaimer />

      <Card
        title={`NEP-171 Discovery Rights Passport — Token #${tokenId}`}
        subtitle="Authoritative live contract state on NEAR Testnet"
      >
        <div
          style={{
            backgroundColor: "var(--knovara-blue-subtle)",
            border: "1px solid var(--knovara-blue-border)",
            borderRadius: "var(--radius-sm)",
            padding: "16px",
            marginBottom: "20px",
          }}
        >
          <strong>Non-Transferability Invariant: </strong> This Discovery Rights Passport is soulbound to the
          designated Custodian account. In accordance with Section 4.2 of the PRD, transfers (<code>nft_transfer</code> and{" "}
          <code>nft_transfer_call</code>) are permanently rejected by the contract.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
            backgroundColor: "var(--knovara-surface)",
            padding: "16px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--knovara-border)",
            marginBottom: "24px",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Token Identifier
            </div>
            <code>{tokenId}</code>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Associated Discovery ID
            </div>
            <code>{discoveryId}</code>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Current Custodian (Owner)
            </div>
            <code>{custodianId || token?.owner_id}</code>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Rights Controller
            </div>
            <strong style={{ color: "var(--knovara-blue-primary)" }}>
              <code>{rightsControllerId}</code>
            </strong>
          </div>
        </div>

        {/* Live Token Metadata */}
        {token?.metadata && (
          <div style={{ marginBottom: "20px" }}>
            <h4 style={{ fontSize: "1rem", marginBottom: "12px" }}>NEP-177 On-Chain Metadata Record</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.875rem" }}>
              <div>
                <strong>Title: </strong> {token.metadata.title}
              </div>
              <div>
                <strong>Description: </strong> {token.metadata.description}
              </div>
              <div>
                <strong>Reference URL: </strong>{" "}
                <a href={token.metadata.reference} target="_blank" rel="noreferrer">
                  {token.metadata.reference}
                </a>
              </div>
              <div>
                <strong>Reference Hash (Base64): </strong>{" "}
                <code style={{ wordBreak: "break-all" }}>{token.metadata.reference_hash}</code>
              </div>
            </div>
          </div>
        )}

        {/* Raw On-Chain Token Response */}
        <div>
          <h4 style={{ fontSize: "0.875rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "8px" }}>
            Authoritative Contract JSON Output
          </h4>
          <pre
            style={{
              padding: "16px",
              backgroundColor: "#1C1917",
              color: "#E9E1CD",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8125rem",
              overflowX: "auto",
            }}
          >
            {JSON.stringify(token || passportData, null, 2)}
          </pre>
        </div>
      </Card>
    </div>
  );
}
