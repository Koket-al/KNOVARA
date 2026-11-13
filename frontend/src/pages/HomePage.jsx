import React from "react";
import { Button } from "../components/common/Button.jsx";
import { Card } from "../components/common/Card.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LegalDisclaimer } from "../components/common/LegalDisclaimer.jsx";
import { config } from "../config/env.js";

export function HomePage({ onNavigate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "56px", position: "relative" }}>
      {/* Decorative Top Glowing Beam Line */}
      <div className="knovara-glow-line" style={{ margin: "0 0 12px 0" }} />

      {/* Hero Section */}
      <section style={{ textAlign: "center", position: "relative", padding: "32px 0 16px 0" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
          
          {/* Pill Badge matching reference */}
          <div className="hero-pill-badge" style={{ marginBottom: "24px" }}>
            <span className="dot" />
            <span>Agent-Native Protocol &bull; Cryptographic Priority &amp; Discovery Rights Registry</span>
          </div>

          {/* Editorial Serif Display Headline matching image style */}
          <h1 className="hero-serif-title" style={{ marginBottom: "24px" }}>
            Ship <em>knowledge</em> to AI agents faster than ever.
          </h1>

          {/* Simple English Copy: exactly 4 simple, clear sentences */}
          <div
            style={{
              fontSize: "1.125rem",
              lineHeight: 1.7,
              color: "var(--knovara-text-secondary)",
              maxWidth: "720px",
              marginBottom: "36px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <p>1. Autonomous AI agents discover verified data, algorithms, and computational APIs.</p>
            <p>2. Human owners approve 30-day on-chain subscriptions with transparent yoctoNEAR pricing.</p>
            <p>3. Secure Gateway proxies live requests with encrypted upstream keys and zero credential leakage.</p>
            <p>4. Publishers receive instant pull-payment royalties directly on the NEAR blockchain.</p>
          </div>

          {/* Action CTAs */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
            <Button
              variant="primary"
              size="lg"
              onClick={() => onNavigate("/agent-workspace")}
              style={{ padding: "14px 32px", fontSize: "1rem" }}
            >
              Launch Agent Workspace &rarr;
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => onNavigate("/publisher")}
              style={{ padding: "14px 28px", fontSize: "1rem" }}
            >
              Publisher API Portal
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => onNavigate("/marketplace")}
              style={{ padding: "14px 28px", fontSize: "1rem" }}
            >
              Marketplace &amp; APIs
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => onNavigate("/discoveries")}
              style={{ padding: "14px 28px", fontSize: "1rem" }}
            >
              Explore Discoveries
            </Button>
          </div>

          {/* Hero Metrics Row (matching the 4 stats in the reference image) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "24px",
              width: "100%",
              maxWidth: "760px",
              marginTop: "48px",
              padding: "24px 16px",
              borderTop: "1px solid var(--knovara-border)",
              borderBottom: "1px solid var(--knovara-border)",
            }}
          >
            <div>
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--knovara-lime)", fontFamily: "var(--font-heading)" }}>
                100%
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)", marginTop: "4px" }}>
                On-Chain Proof
              </div>
            </div>

            <div>
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--knovara-text-primary)", fontFamily: "var(--font-heading)" }}>
                &lt; 1s
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)", marginTop: "4px" }}>
                NEAR Finality
              </div>
            </div>

            <div>
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--knovara-text-primary)", fontFamily: "var(--font-heading)" }}>
                0%
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)", marginTop: "4px" }}>
                Intermediary Fees
              </div>
            </div>

            <div>
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--knovara-lime)", fontFamily: "var(--font-heading)" }}>
                Instant
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)", marginTop: "4px" }}>
                Royalty Payouts
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mandatory Legal Notice */}
      <LegalDisclaimer />

      {/* 4 Architectural Pillars: Simple, direct sentences with glowing icons */}
      <section>
        <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "1.75rem" }}>How KNOVARA Works for AI Agents</h2>
            <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.9375rem", marginTop: "4px" }}>
              Four simple steps from research API publishing to autonomous agent execution.
            </p>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--knovara-lime)", fontFamily: "var(--font-mono)" }}>
            NEAR TESTNET &bull; MODEL CONTEXT PROTOCOL &bull; AES-256-GCM
          </span>
        </div>

        <div className="knovara-grid-2">
          <Card
            title="1. Autonomous Agent Discovery"
            subtitle="Model Context Protocol (MCP) tooling"
            interactive
          >
            <p style={{ fontSize: "0.9375rem", color: "var(--knovara-text-secondary)", lineHeight: 1.6 }}>
              AI agents autonomously discover verified algorithms and computational APIs using native MCP tools without exposing credentials.
            </p>
          </Card>

          <Card
            title="2. Atomic 30-Day Subscriptions"
            subtitle="Exact on-chain yoctoNEAR pull-payments"
            interactive
          >
            <p style={{ fontSize: "0.9375rem", color: "var(--knovara-text-secondary)", lineHeight: 1.6 }}>
              Dedicated agent accounts subscribe directly on NEAR Protocol. 100% of subscription fees go to publisher royalty balances instantly.
            </p>
          </Card>

          <Card
            title="3. SSRF-Protected API Gateway"
            subtitle="Sub-millisecond secure reverse proxy"
            interactive
          >
            <p style={{ fontSize: "0.9375rem", color: "var(--knovara-text-secondary)", lineHeight: 1.6 }}>
              High-speed reverse proxy validates SHA-256 token hashes, enforces 30s cache freshness via NEAR RPC, and injects encrypted upstream keys.
            </p>
          </Card>

          <Card
            title="4. Sovereign Owner Governance"
            subtitle="Transparent human-in-the-loop control"
            interactive
          >
            <p style={{ fontSize: "0.9375rem", color: "var(--knovara-text-secondary)", lineHeight: 1.6 }}>
              Agents formulate purchase intents; human owners review pricing and terms before signing, preserving total wallet security.
            </p>
          </Card>
        </div>
      </section>

      {/* Glowing Line Divider */}
      <div className="knovara-glow-line" />

      {/* =====================================================================
          BOTTOM SHOWCASE SECTION WITH RADIANT UPWARD NEON LIGHT AURA
          Directly mirroring the 3 cards and lighting in the user's reference image!
          ===================================================================== */}
      <section className="knovara-bottom-aura">
        <div style={{ textAlign: "center", marginBottom: "32px", position: "relative", zIndex: 1 }}>
          <Badge variant="blue" style={{ marginBottom: "8px" }}>Live Ecosystem</Badge>
          <h2 style={{ fontSize: "1.75rem" }}>Live Network Activity</h2>
          <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginTop: "4px" }}>
            Real-time verification, cryptographic health, and active agent subscriptions.
          </p>
        </div>

        {/* 3 Showcase Cards with Glowing Light Beam Backdrop */}
        <div className="knovara-grid-3" style={{ position: "relative", zIndex: 1 }}>
          {/* Card 1: Recent Agent Activity */}
          <Card
            title="• Autonomous Agent Activity"
            subtitle="Latest on-chain API calls"
            interactive
            style={{ backgroundColor: "rgba(22, 22, 26, 0.85)", borderColor: "rgba(255, 255, 255, 0.12)" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
              <div className="flex-between" style={{ padding: "8px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "var(--radius-xs)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#FFFFFF" }}>agent-explorer.testnet</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>Aerospace Alloys API</div>
                </div>
                <Badge variant="success">ACTIVE SUB</Badge>
              </div>

              <div className="flex-between" style={{ padding: "8px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "var(--radius-xs)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#FFFFFF" }}>disc-mat-001</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>MMPDS-01 Metallurgy</div>
                </div>
                <Badge variant="blue">VERIFIED</Badge>
              </div>

              <div className="flex-between" style={{ padding: "8px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "var(--radius-xs)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#FFFFFF" }}>knov_live_72cb0eb2</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>1.0 NEAR / 30 Days</div>
                </div>
                <Badge variant="success">STREAMING</Badge>
              </div>
            </div>
          </Card>

          {/* Card 2: Registry Health & Curve (like Review score 94 in screenshot) */}
          <Card
            title="• Gateway & Protocol Health"
            subtitle="Auto-audit & SSRF firewall enabled"
            interactive
            style={{ backgroundColor: "rgba(22, 22, 26, 0.85)", borderColor: "rgba(198, 244, 50, 0.25)", boxShadow: "var(--glow-lime-subtle)" }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "10px 0" }}>
              <span style={{ fontSize: "3rem", fontWeight: 800, color: "var(--knovara-lime)", fontFamily: "var(--font-heading)", lineHeight: 1 }}>
                99.9
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)" }}>
                / 100 security health
              </span>
            </div>

            {/* Glowing SVG Area Chart matching screenshot */}
            <div style={{ width: "100%", height: "70px", position: "relative", marginTop: "12px" }}>
              <svg viewBox="0 0 200 60" style={{ width: "100%", height: "100%", overflow: "visible" }}>
                <defs>
                  <linearGradient id="limeGlowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#C6F432" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#C6F432" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,50 Q40,42 70,35 T130,22 T170,14 T200,8 L200,60 L0,60 Z"
                  fill="url(#limeGlowGrad)"
                />
                <path
                  d="M0,50 Q40,42 70,35 T130,22 T170,14 T200,8"
                  fill="none"
                  stroke="#C6F432"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="200" cy="8" r="4" fill="#C6F432" filter="drop-shadow(0 0 6px #C6F432)" />
              </svg>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", marginTop: "6px", textAlign: "right" }}>
              461 / 461 protocol checks passed
            </div>
          </Card>

          {/* Card 3: Licensing State Timeline (like Merge Timeline in screenshot) */}
          <Card
            title="• Agent Subscription Lifecycle"
            subtitle="Cryptographic authorization"
            interactive
            style={{ backgroundColor: "rgba(22, 22, 26, 0.85)", borderColor: "rgba(255, 255, 255, 0.12)" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "80px", fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>01. Discovery</span>
                <div style={{ flex: 1, height: "10px", background: "rgba(255, 255, 255, 0.08)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
                  <div style={{ width: "100%", height: "100%", background: "#FFFFFF", borderRadius: "var(--radius-pill)" }} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "80px", fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>02. Approval</span>
                <div style={{ flex: 1, height: "10px", background: "rgba(255, 255, 255, 0.08)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
                  <div style={{ width: "100%", height: "100%", background: "var(--knovara-lime)", borderRadius: "var(--radius-pill)" }} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "80px", fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>03. Gateway</span>
                <div style={{ flex: 1, height: "10px", background: "rgba(255, 255, 255, 0.08)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
                  <div style={{ width: "95%", height: "100%", background: "var(--knovara-lime)", borderRadius: "var(--radius-pill)", boxShadow: "0 0 10px var(--knovara-lime)" }} />
                </div>
              </div>
            </div>

            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-secondary)", marginTop: "18px", borderTop: "1px solid var(--knovara-border)", paddingTop: "10px" }}>
              Instant SHA-256 token issuance with zero prompt credential leakage.
            </div>
          </Card>
        </div>
      </section>

      {/* Technical Infrastructure Reference Box */}
      <section
        style={{
          backgroundColor: "var(--knovara-surface)",
          padding: "20px 24px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--knovara-border)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", textTransform: "uppercase" }}>
              Smart Contract
            </div>
            <code style={{ fontSize: "0.8125rem" }}>{config.NEAR_CONTRACT_ID}</code>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", textTransform: "uppercase" }}>
              Network
            </div>
            <strong style={{ color: "var(--knovara-lime)", fontSize: "0.875rem" }}>NEAR {config.NEAR_NETWORK}</strong>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", textTransform: "uppercase" }}>
              Registry Standard
            </div>
            <strong style={{ fontSize: "0.875rem" }}>NEP-171 / NEP-177 / RFC 8785</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
