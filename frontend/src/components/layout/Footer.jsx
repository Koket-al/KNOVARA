import React from "react";
import { LegalDisclaimer } from "../common/LegalDisclaimer.jsx";
import { config } from "../../config/env.js";

export function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "rgba(11, 11, 12, 0.95)",
        borderTop: "1px solid var(--knovara-border)",
        marginTop: "80px",
        padding: "48px 0 36px 0",
        position: "relative",
      }}
    >
      <div className="knovara-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <LegalDisclaimer />

        <div className="knovara-glow-line" style={{ margin: "16px 0" }} />

        <div
          className="flex-between"
          style={{
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.15rem", color: "#FFFFFF" }}>
              KNOVARA<span style={{ color: "var(--knovara-lime)" }}>.</span>
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)", marginTop: "4px" }}>
              Permanent cryptographic priority and decentralized licensing on NEAR.
            </div>
          </div>

          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)" }}>
            <div>
              Network: <strong style={{ color: "var(--knovara-lime)" }}>NEAR {config.NEAR_NETWORK}</strong>
            </div>
            <div style={{ marginTop: "4px" }}>
              Contract: <code>{config.NEAR_CONTRACT_ID}</code>
            </div>
          </div>
        </div>

        <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", textAlign: "center", marginTop: "16px" }}>
          Built with React &middot; NEAR Protocol &middot; Cloudflare R2 &middot; NEP-171 &middot; NEP-413
        </div>
      </div>
    </footer>
  );
}
