import React from "react";
import { LegalDisclaimer } from "../common/LegalDisclaimer.jsx";
import { config } from "../../config/env.js";

export function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "var(--knovara-surface-card)",
        borderTop: "1px solid var(--knovara-border-strong)",
        marginTop: "64px",
        padding: "48px 0 32px 0",
      }}
    >
      <div className="knovara-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <LegalDisclaimer />

        <div
          className="flex-between"
          style={{
            flexWrap: "wrap",
            gap: "16px",
            borderTop: "1px solid var(--knovara-border)",
            paddingTop: "24px",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.1rem" }}>
              KNOVARA
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)", marginTop: "4px" }}>
              Decentralized Discovery Rights & Cryptographic Verification Registry
            </div>
          </div>

          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)" }}>
            <div>
              Network: <strong>NEAR {config.NEAR_NETWORK}</strong>
            </div>
            <div style={{ marginTop: "2px" }}>
              Contract: <code>{config.NEAR_CONTRACT_ID}</code>
            </div>
          </div>
        </div>

        <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", textAlign: "center", marginTop: "12px" }}>
          Built with React 18 &middot; Node.js 24 &middot; MongoDB Atlas &middot; Cloudflare R2 &middot; NEP-171 / NEP-177 / NEP-413
        </div>
      </div>
    </footer>
  );
}

