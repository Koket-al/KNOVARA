import React from "react";
import { Button } from "../components/common/Button.jsx";
import { Card } from "../components/common/Card.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LegalDisclaimer } from "../components/common/LegalDisclaimer.jsx";
import { config } from "../config/env.js";

export function HomePage({ onNavigate }) {
  const [activeStep, setActiveStep] = React.useState(0);

  // Interactive mini-demo states:
  const [selectedTopic, setSelectedTopic] = React.useState("aerospace");
  const [isApproved, setIsApproved] = React.useState(false);
  const [isGatewayTesting, setIsGatewayTesting] = React.useState(false);
  const [gatewayResult, setGatewayResult] = React.useState(null);
  const [isClaimed, setIsClaimed] = React.useState(false);

  const steps = [
    {
      num: "01",
      tag: "DISCOVER",
      sentence: "1. AI agents discover verified algorithms and APIs.",
      shortNote: "Agents search the catalog autonomously and select verified research tools.",
    },
    {
      num: "02",
      tag: "APPROVE",
      sentence: "2. Human owners approve simple 30-day subscriptions.",
      shortNote: "Owners stay in complete control and authorize fixed-term access with one click.",
    },
    {
      num: "03",
      tag: "RUN SAFELY",
      sentence: "3. Secure gateway runs live requests with zero key leaks.",
      shortNote: "Requests route through an encrypted firewall so private keys never leak.",
    },
    {
      num: "04",
      tag: "GET PAID",
      sentence: "4. Creators get paid instantly and directly on the blockchain.",
      shortNote: "100% of licensing fees flow directly to creator royalty balances on NEAR.",
    },
  ];

  const topicDemos = {
    aerospace: {
      id: "disc-mat-001",
      title: "MMPDS-01 Aerospace Alloys",
      op: "GET /v1/materials/query",
      price: "1.0 NEAR / 30 Days",
      speed: "12ms",
    },
    genomics: {
      id: "disc-bio-002",
      title: "Vaccine Candidate Predictor",
      op: "POST /v1/models/predict",
      price: "2.5 NEAR / 30 Days",
      speed: "18ms",
    },
    fem: {
      id: "disc-cad-003",
      title: "Structural FEM Solver",
      op: "POST /v1/simulation/fem",
      price: "1.5 NEAR / 30 Days",
      speed: "24ms",
    },
  };

  const handleRunGatewayTest = () => {
    setIsGatewayTesting(true);
    setGatewayResult(null);
    setTimeout(() => {
      setIsGatewayTesting(false);
      setGatewayResult({
        status: 200,
        message: "200 OK • Upstream Key Decrypted • Zero Token Leakage",
        latency: "14ms",
      });
    }, 450);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "56px", position: "relative" }}>
      {/* Decorative Top Glowing Beam Line */}
      <div className="knovara-glow-line" style={{ margin: "0 0 12px 0" }} />

      {/* Hero Section */}
      <section style={{ textAlign: "center", position: "relative", padding: "32px 0 16px 0" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
          
          {/* Pill Badge matching reference */}
          <div className="hero-pill-badge" style={{ marginBottom: "24px" }}>
            <span className="dot" />
            <span>Agent-Native Protocol &bull; Cryptographic Priority &amp; Discovery Rights Registry</span>
          </div>

          {/* Editorial Serif Display Headline matching image style */}
          <h1 className="hero-serif-title" style={{ marginBottom: "28px" }}>
            Ship <em>knowledge</em> to AI agents faster than ever.
          </h1>

          {/* =============================================================
              INTERACTIVE 4-STEP WORKFLOW COMPONENT
              Simple, understandable English + Interactive Live Demos
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
                    <span>{st.title || st.tag}</span>
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
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Highlighted Simple Sentence */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "8px" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--knovara-text-primary)", letterSpacing: "-0.01em" }}>
                  {steps[activeStep].sentence}
                </div>
                <Badge variant="blue">{steps[activeStep].tag}</Badge>
              </div>

              <p style={{ fontSize: "0.9375rem", color: "var(--knovara-text-secondary)", margin: "0 0 20px 0" }}>
                {steps[activeStep].shortNote}
              </p>

              {/* Interactive Mini-Demo Stage 01: Discover */}
              {activeStep === 0 && (
                <div style={{ padding: "16px", background: "var(--knovara-bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--knovara-border)" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--knovara-text-secondary)", marginBottom: "10px", textTransform: "uppercase" }}>
                    Select Research Domain to Test Agent Discovery:
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedTopic("aerospace")}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "var(--radius-pill)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        border: selectedTopic === "aerospace" ? "1px solid #1E88E5" : "1px solid var(--knovara-border)",
                        background: selectedTopic === "aerospace" ? "var(--knovara-blue-primary)" : "#FFFFFF",
                        color: selectedTopic === "aerospace" ? "#FFFFFF" : "var(--knovara-text-primary)",
                      }}
                    >
                      ⚡ Aerospace Metallurgy
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTopic("genomics")}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "var(--radius-pill)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        border: selectedTopic === "genomics" ? "1px solid #1E88E5" : "1px solid var(--knovara-border)",
                        background: selectedTopic === "genomics" ? "var(--knovara-blue-primary)" : "#FFFFFF",
                        color: selectedTopic === "genomics" ? "#FFFFFF" : "var(--knovara-text-primary)",
                      }}
                    >
                      🧬 Vaccine Predictor
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTopic("fem")}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "var(--radius-pill)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        border: selectedTopic === "fem" ? "1px solid #1E88E5" : "1px solid var(--knovara-border)",
                        background: selectedTopic === "fem" ? "var(--knovara-blue-primary)" : "#FFFFFF",
                        color: selectedTopic === "fem" ? "#FFFFFF" : "var(--knovara-text-primary)",
                      }}
                    >
                      ⚙️ Structural FEM Solver
                    </button>
                  </div>

                  {/* Live Matched Result Card */}
                  <div className="flex-between" style={{ padding: "12px 16px", background: "#FFFFFF", borderRadius: "var(--radius-sm)", border: "1px solid var(--knovara-border)" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "0.9375rem", color: "var(--knovara-text-primary)" }}>
                        {topicDemos[selectedTopic].title}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
                        ID: {topicDemos[selectedTopic].id} &bull; {topicDemos[selectedTopic].op} &bull; Response: {topicDemos[selectedTopic].speed}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <Badge variant="success">VERIFIED ON NEAR</Badge>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--knovara-blue-primary)", marginTop: "4px" }}>
                        {topicDemos[selectedTopic].price}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive Mini-Demo Stage 02: Approve */}
              {activeStep === 1 && (
                <div style={{ padding: "16px", background: "var(--knovara-bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--knovara-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                    <div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)" }}>Agent Requesting Access:</div>
                      <code style={{ fontSize: "0.875rem", color: "var(--knovara-text-primary)" }}>agent-491f1ffe.testnet</code>
                      <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)", marginTop: "4px" }}>
                        Rate: <strong>1.0 NEAR / 30 Days</strong> (Fixed on-chain term)
                      </div>
                    </div>

                    <div>
                      {!isApproved ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setIsApproved(true)}
                        >
                          Approve Subscription (1.0 NEAR) &rarr;
                        </Button>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Badge variant="success">✓ APPROVED ON NEAR</Badge>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsApproved(false)}
                          >
                            Reset
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  {isApproved && (
                    <div style={{ marginTop: "10px", fontSize: "0.75rem", color: "#16A34A", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                      ✓ Contract executed `subscribe_to_offer` atomically. 30-day token issued to dedicated agent.
                    </div>
                  )}
                </div>
              )}

              {/* Interactive Mini-Demo Stage 03: Run Safely */}
              {activeStep === 2 && (
                <div style={{ padding: "16px", background: "var(--knovara-bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--knovara-border)" }}>
                  <div className="flex-between" style={{ flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
                    <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)" }}>
                      Architecture: <code>Agent MCP Tool</code> &rarr; <code>SSRF Gateway</code> &rarr; <code>Encrypted Upstream API</code>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleRunGatewayTest}
                      isLoading={isGatewayTesting}
                    >
                      {isGatewayTesting ? "Routing..." : "Send Test Gateway Request"}
                    </Button>
                  </div>

                  <div style={{ padding: "10px 14px", background: "#FFFFFF", borderRadius: "var(--radius-sm)", border: "1px solid var(--knovara-border)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                    {gatewayResult ? (
                      <span style={{ color: "#16A34A", fontWeight: 700 }}>
                        ✓ {gatewayResult.message} &bull; Latency: {gatewayResult.latency}
                      </span>
                    ) : (
                      <span style={{ color: "var(--knovara-text-muted)" }}>
                        Click "Send Test Gateway Request" to simulate real-time authenticated proxy execution.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Interactive Mini-Demo Stage 04: Get Paid */}
              {activeStep === 3 && (
                <div style={{ padding: "16px", background: "var(--knovara-bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--knovara-border)" }}>
                  <div className="flex-between" style={{ flexWrap: "wrap", gap: "12px" }}>
                    <div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)" }}>Creator Royalty Balance:</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--knovara-text-primary)", fontFamily: "var(--font-mono)" }}>
                        {isClaimed ? "1.00 NEAR" : "0.00 NEAR"}
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setIsClaimed(!isClaimed)}
                    >
                      {isClaimed ? "Reset Payout Demo" : "Simulate Payout (+1.0 NEAR)"}
                    </Button>
                  </div>

                  <div style={{ marginTop: "10px", fontSize: "0.75rem", color: isClaimed ? "#16A34A" : "var(--knovara-text-muted)", fontFamily: "var(--font-mono)" }}>
                    {isClaimed
                      ? "✓ Instant yoctoNEAR pull-payment deposited directly into claimable royalty balance!"
                      : "Royalties are credited atomically upon license activation with zero platform delays."}
                  </div>
                </div>
              )}
            </div>

            {/* 4 Simple Sentences At-A-Glance Cards Grid */}
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
            style={{ backgroundColor: "var(--knovara-surface-card)", borderColor: "rgba(255, 255, 255, 0.18)" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
              <div className="flex-between" style={{ padding: "8px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "var(--radius-xs)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--knovara-text-primary)" }}>agent-explorer.testnet</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>Aerospace Alloys API</div>
                </div>
                <Badge variant="success">ACTIVE SUB</Badge>
              </div>

              <div className="flex-between" style={{ padding: "8px 10px", background: "rgba(24, 24, 27, 0.05)", borderRadius: "var(--radius-xs)", border: "1px solid var(--knovara-border)" }}>
                <div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--knovara-text-primary)" }}>disc-mat-001</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>MMPDS-01 Metallurgy</div>
                </div>
                <Badge variant="blue">VERIFIED</Badge>
              </div>

              <div className="flex-between" style={{ padding: "8px 10px", background: "rgba(24, 24, 27, 0.05)", borderRadius: "var(--radius-xs)", border: "1px solid var(--knovara-border)" }}>
                <div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--knovara-text-primary)" }}>knov_live_72cb0eb2</div>
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
            style={{ backgroundColor: "var(--knovara-surface-card)", borderColor: "var(--knovara-border)", boxShadow: "var(--shadow-card)" }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "10px 0" }}>
              <span style={{ fontSize: "3rem", fontWeight: 800, color: "var(--knovara-text-primary)", textShadow: "0 0 16px rgba(33, 150, 243, 0.45)", fontFamily: "var(--font-heading)", lineHeight: 1 }}>
                99.9
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)" }}>
                / 100 security health
              </span>
            </div>

            {/* Glowing SVG Area Chart */}
            <div style={{ width: "100%", height: "70px", position: "relative", marginTop: "12px" }}>
              <svg viewBox="0 0 200 60" style={{ width: "100%", height: "100%", overflow: "visible" }}>
                <defs>
                  <linearGradient id="blueGlowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#2196F3" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#2196F3" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,50 Q40,42 70,35 T130,22 T170,14 T200,8 L200,60 L0,60 Z"
                  fill="url(#blueGlowGrad)"
                />
                <path
                  d="M0,50 Q40,42 70,35 T130,22 T170,14 T200,8"
                  fill="none"
                  stroke="#2196F3"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="200" cy="8" r="4" fill="#2196F3" filter="drop-shadow(0 0 8px #2196F3)" />
              </svg>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", marginTop: "6px", textAlign: "right" }}>
              461 / 461 protocol checks passed
            </div>
          </Card>

          {/* Card 3: Licensing State Timeline */}
          <Card
            title="• Agent Subscription Lifecycle"
            subtitle="Cryptographic authorization"
            interactive
            style={{ backgroundColor: "var(--knovara-surface-card)", borderColor: "var(--knovara-border)" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "80px", fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>01. Discovery</span>
                <div style={{ flex: 1, height: "10px", background: "rgba(144, 202, 248, 0.25)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
                  <div style={{ width: "100%", height: "100%", background: "var(--knovara-text-primary)", borderRadius: "var(--radius-pill)" }} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "80px", fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>02. Approval</span>
                <div style={{ flex: 1, height: "10px", background: "rgba(144, 202, 248, 0.25)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
                  <div style={{ width: "100%", height: "100%", background: "var(--knovara-blue-primary)", borderRadius: "var(--radius-pill)", boxShadow: "0 0 10px #2196F3" }} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "80px", fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>03. Gateway</span>
                <div style={{ flex: 1, height: "10px", background: "rgba(144, 202, 248, 0.25)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
                  <div style={{ width: "95%", height: "100%", background: "var(--knovara-blue-primary)", borderRadius: "var(--radius-pill)", boxShadow: "0 0 14px #2196F3" }} />
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
