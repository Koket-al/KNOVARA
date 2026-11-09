import React from "react";
import { Button } from "../components/common/Button.jsx";
import { Card } from "../components/common/Card.jsx";
import { LegalDisclaimer } from "../components/common/LegalDisclaimer.jsx";
import { config } from "../config/env.js";

export function HomePage({ onNavigate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
      {/* Hero Section */}
      <section
        style={{
          padding: "48px 0 24px 0",
          borderBottom: "1px solid var(--knovara-border-strong)",
        }}
      >
        <div style={{ maxWidth: "860px" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.8125rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--knovara-blue-primary)",
              fontWeight: 700,
              marginBottom: "12px",
            }}
          >
            NEAR PROTOCOL &middot; CRYPTOGRAPHIC DISCOVERY REGISTRY
          </div>

          <h1 style={{ marginBottom: "20px", lineHeight: 1.15 }}>
            Cryptographic Priority & Discovery Rights Registry.
          </h1>

          <p
            style={{
              fontSize: "1.0625rem",
              lineHeight: 1.7,
              color: "var(--knovara-text-secondary)",
              marginBottom: "32px",
            }}
          >
            KNOVARA provides an immutable scientific and technical innovation registry on NEAR Protocol.
            Researchers, institutions, and autonomous agents cryptographically anchor evidence, establish verifiable
            chronological priority, and license intellectual discoveries under legally bound smart contracts.
          </p>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <Button
              variant="primary"
              size="lg"
              onClick={() => onNavigate("/discoveries")}
            >
              Explore Discoveries &rarr;
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => onNavigate("/register")}
            >
              Register Discovery
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => onNavigate("/marketplace")}
            >
              Licensing Marketplace
            </Button>
          </div>
        </div>
      </section>

      {/* Mandatory Legal Notice */}
      <LegalDisclaimer />

      {/* 4 Architectural Pillars */}
      <section>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "1.5rem" }}>Foundational Cryptographic Architecture</h2>
          <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginTop: "4px" }}>
            Engineered strictly according to approved Technical Architecture v1.0.4 and PRD v1.1.2.
          </p>
        </div>

        <div className="knovara-grid-2">
          <Card
            title="1. RFC 8785 Evidence Manifests"
            subtitle="Deterministic byte-level SHA-256 verification"
          >
            <p style={{ fontSize: "0.875rem", color: "var(--knovara-text-secondary)" }}>
              Private evidence files are stored in private Cloudflare R2 storage. Canonical JSON manifests (RFC 8785)
              anchor immutable SHA-256 digests on NEAR Testnet. File access is protected and granted only to authorized
              licensees upon on-chain payment confirmation.
            </p>
          </Card>

          <Card
            title="2. Non-Transferable Soulbound Passports"
            subtitle="NEP-171 NFT with NEP-177 Metadata Reference"
          >
            <p style={{ fontSize: "0.875rem", color: "var(--knovara-text-secondary)" }}>
              Discovery Passports are non-transferable NEP-171 tokens separating the Custodian, Rights Controller,
              and Beneficiaries. Public metadata descriptors are served over canonical HTTP endpoints and verified
              against cryptographic reference hashes.
            </p>
          </Card>

          <Card
            title="3. Bound Licensing State Machine"
            subtitle="Requested → Approved / Rejected → Active / Expired"
          >
            <p style={{ fontSize: "0.875rem", color: "var(--knovara-text-secondary)" }}>
              Exact license terms are bound to smart contract records via cryptographic hashes. License buyers
              must explicitly agree to matching hashes, and payments require exact attached yoctoNEAR deposits.
            </p>
          </Card>

          <Card
            title="4. Automated Solvency & Pull-Payments"
            subtitle="Guaranteed balance separation & asynchronous withdrawals"
          >
            <p style={{ fontSize: "0.875rem", color: "var(--knovara-text-secondary)" }}>
              All licensing royalties are apportioned across beneficiaries according to exact basis point splits (summing
              strictly to 10,000). Royalty withdrawals follow the safe pull-payment pattern with reentrancy defenses.
            </p>
          </Card>
        </div>
      </section>

      {/* Technical Infrastructure Overview */}
      <section
        style={{
          backgroundColor: "var(--knovara-surface)",
          padding: "24px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--knovara-border)",
        }}
      >
        <h3 style={{ fontSize: "1.1rem", marginBottom: "12px" }}>Active Testnet Registry Environment</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", textTransform: "uppercase" }}>
              Smart Contract
            </div>
            <code>{config.NEAR_CONTRACT_ID}</code>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", textTransform: "uppercase" }}>
              NEAR Network
            </div>
            <strong style={{ color: "var(--knovara-blue-primary)" }}>{config.NEAR_NETWORK.toUpperCase()}</strong>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", textTransform: "uppercase" }}>
              Authentication
            </div>
            <span>NEP-413 Off-Chain Ed25519</span>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", textTransform: "uppercase" }}>
              Metadata Standard
            </div>
            <span>NEP-177 Canonical Descriptors</span>
          </div>
        </div>
      </section>
    </div>
  );
}

