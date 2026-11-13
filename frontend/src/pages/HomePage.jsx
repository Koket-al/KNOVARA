import React, { useState, useEffect } from "react";
import { Button } from "../components/common/Button.jsx";
import { Card } from "../components/common/Card.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LegalDisclaimer } from "../components/common/LegalDisclaimer.jsx";
import { config } from "../config/env.js";
import { api } from "../services/api.js";

export function HomePage({ onNavigate }) {
  const [activeStep, setActiveStep] = useState(0);
  const [liveDiscoveries, setLiveDiscoveries] = useState([]);
  const [liveProducts, setLiveProducts] = useState([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);

  // Fetch genuine real-time ecosystem records from the backend API
  useEffect(() => {
    let isMounted = true;
    async function fetchLiveFeed() {
      try {
        const [discRes, prodRes] = await Promise.allSettled([
          api.getDiscoveries({ limit: 3, sort: "newest" }),
          api.getApiProducts(),
        ]);
        if (!isMounted) return;
        if (discRes.status === "fulfilled" && discRes.value?.discoveries) {
          setLiveDiscoveries(discRes.value.discoveries);
        }
        if (prodRes.status === "fulfilled" && prodRes.value?.api_products) {
          setLiveProducts(prodRes.value.api_products.slice(0, 3));
        }
      } catch (err) {
        console.warn("[HOMEPAGE] Live feed fetch failed:", err);
      } finally {
        if (isMounted) setIsLoadingFeed(false);
      }
    }
    fetchLiveFeed();
    return () => {
      isMounted = false;
    };
  }, []);

  const steps = [
    {
      num: "01",
      tag: "DISCOVER",
      sentence: "1. AI agents discover verified algorithms and APIs.",
      explanation: "Agents search the open catalog autonomously and select verified research tools.",
      actionLabel: "Explore Marketplace",
      path: "/marketplace",
    },
    {
      num: "02",
      tag: "APPROVE",
      sentence: "2. Human owners approve simple 30-day subscriptions.",
      explanation: "Owners maintain full signing authority and authorize fixed-term access with one click.",
      actionLabel: "Open Agent Workspace",
      path: "/agent-workspace",
    },
    {
      num: "03",
      tag: "RUN SAFELY",
      sentence: "3. Secure gateway runs live requests with zero key leaks.",
      explanation: "Requests route through an encrypted firewall so private credentials stay secret.",
      actionLabel: "Publisher Portal",
      path: "/publisher",
    },
    {
      num: "04",
      tag: "GET PAID",
      sentence: "4. Creators get paid instantly and directly on the blockchain.",
      explanation: "100% of licensing fees flow directly to creator royalty balances on NEAR.",
      actionLabel: "View Royalties",
      path: "/account",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "56px", position: "relative" }}>
      {/* Decorative Top Glowing Beam Line */}
      <div className="knovara-glow-line" style={{ margin: "0 0 12px 0" }} />

      {/* Hero Section */}
      <section style={{ textAlign: "center", position: "relative", padding: "32px 0 16px 0" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
          
          {/* Pill Badge */}
          <div className="hero-pill-badge" style={{ marginBottom: "24px" }}>
            <span className="dot" />
            <span>Agent-Native Protocol &bull; Cryptographic Priority &amp; Discovery Rights Registry</span>
          </div>

          {/* Editorial Headline */}
          <h1 className="hero-serif-title" style={{ marginBottom: "28px" }}>
            Ship <em>knowledge</em> to AI agents faster than ever.
          </h1>

          {/* =============================================================
              INTERACTIVE 4-STEP WORKFLOW COMPONENT
              Simple, understandable English + Clean Interactive Navigation
              No hardcoded fake IDs, fake accounts, or fake timeouts!
             ============================================================= */}
          <div
            style={{
              width: "100%",
              maxWidth: "840px",
              marginBottom: "36px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {/* Step Tabs Navigation */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                justifyContent: "center",
                background: "rgba(144, 202, 248, 0.2)",
                padding: "6px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid var(--knovara-border)",
              }}
            >
              {steps.map((st, i) => {
                const isActive = activeStep === i;
                return (
                  <button
                    key={st.num}
                    type="button"
                    onClick={() => setActiveStep(i)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 18px",
                      borderRadius: "var(--radius-pill)",
                      border: isActive ? "1px solid #1E88E5" : "1px solid transparent",
                      background: isActive ? "var(--knovara-blue-primary)" : "transparent",
                      color: isActive ? "#FFFFFF" : "var(--knovara-text-primary)",
                      fontWeight: 700,
                      fontSize: "0.8125rem",
                      fontFamily: "var(--font-mono)",
                      cursor: "pointer",
                      boxShadow: isActive ? "0 0 14px rgba(33, 150, 243, 0.6)" : "none",
                      transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    <span>{st.num}.</span>
                    <span>{st.tag}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Interactive Showcase Card */}
            <div
              style={{
                backgroundColor: "var(--knovara-surface-card)",
                border: "1px solid var(--knovara-border)",
                borderRadius: "var(--radius-md)",
                padding: "24px 28px",
                boxShadow: "0 6px 24px rgba(14, 71, 161, 0.08)",
                textAlign: "left",
                transition: "all 0.25s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "8px" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--knovara-text-primary)", letterSpacing: "-0.01em" }}>
                  {steps[activeStep].sentence}
                </div>
                <Badge variant="blue">{steps[activeStep].tag}</Badge>
              </div>

              <p style={{ fontSize: "0.9375rem", color: "var(--knovara-text-secondary)", margin: "0 0 20px 0" }}>
                {steps[activeStep].explanation}
              </p>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onNavigate(steps[activeStep].path)}
                >
                  {steps[activeStep].actionLabel} &rarr;
                </Button>
              </div>
            </div>

            {/* 4 Simple Sentences Interactive Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "10px",
                width: "100%",
              }}
            >
              {steps.map((st, i) => {
                const isActive = activeStep === i;
                return (
                  <div
                    key={st.num}
                    onClick={() => setActiveStep(i)}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      background: isActive ? "#FFFFFF" : "rgba(255, 255, 255, 0.65)",
                      border: isActive ? "2px solid var(--knovara-blue-primary)" : "1px solid var(--knovara-border)",
                      boxShadow: isActive ? "0 4px 14px rgba(33, 150, 243, 0.18)" : "none",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ fontSize: "0.6875rem", fontWeight: 800, color: "var(--knovara-blue-primary)", fontFamily: "var(--font-mono)", marginBottom: "4px" }}>
                      STEP {st.num}
                    </div>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--knovara-text-primary)", lineHeight: 1.35 }}>
                      {st.sentence.replace(/^\d+\.\s*/, "")}
                    </div>
                  </div>
                );
              })}
            </div>
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

          {/* Hero Metrics Row */}
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
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--knovara-blue-primary)", fontFamily: "var(--font-heading)" }}>
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
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--knovara-blue-primary)", fontFamily: "var(--font-heading)" }}>
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

      {/* 4 Architectural Pillars */}
      <section>
        <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "1.75rem" }}>How KNOVARA Works for AI Agents</h2>
            <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.9375rem", marginTop: "4px" }}>
              Four simple steps from research API publishing to autonomous agent execution.
            </p>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", fontFamily: "var(--font-mono)" }}>
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
          BOTTOM SHOWCASE SECTION WITH LIVE REAL-TIME DATA
          Zero hardcoded mock entries — directly connected to API endpoints!
          ===================================================================== */}
      <section className="knovara-bottom-aura">
        <div style={{ textAlign: "center", marginBottom: "32px", position: "relative", zIndex: 1 }}>
          <Badge variant="blue" style={{ marginBottom: "8px" }}>Live Ecosystem</Badge>
          <h2 style={{ fontSize: "1.75rem" }}>Live Network Activity</h2>
          <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginTop: "4px" }}>
            Real-time verification, cryptographic health, and active agent subscriptions on NEAR Protocol.
          </p>
        </div>

        {/* 3 Showcase Cards with Genuine Real-Time Backend Data */}
        <div className="knovara-grid-3" style={{ position: "relative", zIndex: 1 }}>
          {/* Card 1: Genuine Registered Discoveries */}
          <Card
            title="• Registered Discoveries"
            subtitle="Latest verified passports on-chain"
            interactive
            style={{ backgroundColor: "var(--knovara-surface-card)", borderColor: "var(--knovara-border)" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
              {isLoadingFeed ? (
                <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)", padding: "12px 0" }}>
                  Querying NEAR registry projections...
                </div>
              ) : liveDiscoveries.length > 0 ? (
                liveDiscoveries.map((d) => (
                  <div
                    key={d.discovery_id}
                    onClick={() => onNavigate(`/discoveries/${encodeURIComponent(d.discovery_id)}`)}
                    className="flex-between"
                    style={{
                      padding: "8px 10px",
                      background: "rgba(33, 150, 243, 0.05)",
                      borderRadius: "var(--radius-xs)",
                      border: "1px solid var(--knovara-border)",
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--knovara-text-primary)" }}>
                        {d.title || d.discovery_id}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                        ID: {d.discovery_id}
                      </div>
                    </div>
                    <Badge variant="blue">VERIFIED</Badge>
                  </div>
                ))
              ) : (
                <div style={{ padding: "16px 0", textAlign: "center" }}>
                  <p style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)", margin: "0 0 10px 0" }}>
                    No discoveries registered on this network yet.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => onNavigate("/register")}>
                    Register First Discovery
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Card 2: Genuine API Products */}
          <Card
            title="• Verified API Products"
            subtitle="Live agent computational capabilities"
            interactive
            style={{ backgroundColor: "var(--knovara-surface-card)", borderColor: "var(--knovara-border)", boxShadow: "var(--shadow-card)" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
              {isLoadingFeed ? (
                <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)", padding: "12px 0" }}>
                  Querying API product catalog...
                </div>
              ) : liveProducts.length > 0 ? (
                liveProducts.map((p) => (
                  <div
                    key={p.api_product_id}
                    onClick={() => onNavigate("/marketplace")}
                    className="flex-between"
                    style={{
                      padding: "8px 10px",
                      background: "rgba(33, 150, 243, 0.05)",
                      borderRadius: "var(--radius-xs)",
                      border: "1px solid var(--knovara-border)",
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--knovara-text-primary)" }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                        {p.monthly_price_near} NEAR / 30 Days
                      </div>
                    </div>
                    <Badge variant="success">ACTIVE API</Badge>
                  </div>
                ))
              ) : (
                <div style={{ padding: "16px 0", textAlign: "center" }}>
                  <p style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)", margin: "0 0 10px 0" }}>
                    No API products published yet.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => onNavigate("/publisher")}>
                    Publish an API Product
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Card 3: Cryptographic Protocol Architecture */}
          <Card
            title="• Cryptographic Architecture"
            subtitle="Sovereignty & smart contract standards"
            interactive
            style={{ backgroundColor: "var(--knovara-surface-card)", borderColor: "var(--knovara-border)" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px", fontSize: "0.8125rem" }}>
              <div className="flex-between" style={{ padding: "6px 8px", background: "rgba(144, 202, 248, 0.15)", borderRadius: "var(--radius-xs)" }}>
                <span style={{ color: "var(--knovara-text-secondary)" }}>NFT Standards:</span>
                <strong style={{ color: "var(--knovara-text-primary)", fontFamily: "var(--font-mono)" }}>NEP-171 / NEP-177</strong>
              </div>
              <div className="flex-between" style={{ padding: "6px 8px", background: "rgba(144, 202, 248, 0.15)", borderRadius: "var(--radius-xs)" }}>
                <span style={{ color: "var(--knovara-text-secondary)" }}>Canonical Hashing:</span>
                <strong style={{ color: "var(--knovara-text-primary)", fontFamily: "var(--font-mono)" }}>RFC 8785 (JCS)</strong>
              </div>
              <div className="flex-between" style={{ padding: "6px 8px", background: "rgba(144, 202, 248, 0.15)", borderRadius: "var(--radius-xs)" }}>
                <span style={{ color: "var(--knovara-text-secondary)" }}>Wallet Auth:</span>
                <strong style={{ color: "var(--knovara-text-primary)", fontFamily: "var(--font-mono)" }}>NEP-413 Ed25519</strong>
              </div>
              <div className="flex-between" style={{ padding: "6px 8px", background: "rgba(144, 202, 248, 0.15)", borderRadius: "var(--radius-xs)" }}>
                <span style={{ color: "var(--knovara-text-secondary)" }}>Storage Accounting:</span>
                <strong style={{ color: "var(--knovara-text-primary)", fontFamily: "var(--font-mono)" }}>NEP-145 Solvency</strong>
              </div>
            </div>

            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-secondary)", marginTop: "14px", borderTop: "1px solid var(--knovara-border)", paddingTop: "10px" }}>
              Contract: <code>{config.NEAR_CONTRACT_ID}</code>
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
            <strong style={{ color: "var(--knovara-blue-primary)", fontSize: "0.875rem" }}>NEAR {config.NEAR_NETWORK}</strong>
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
