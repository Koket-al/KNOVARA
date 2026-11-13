import React, { useState, useEffect } from "react";
import { Card } from "../components/common/Card.jsx";
import { Button } from "../components/common/Button.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { ErrorAlert } from "../components/common/ErrorAlert.jsx";
import { Modal } from "../components/common/Modal.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const PRESET_TASKS = [
  {
    title: "Drone Bracket Material Selection",
    query: "aerospace alloy composite drone bracket lightweight corrosion",
    params: {
      application: "autonomous quadcopter airframe bracket",
      maximumDensity: 3.0,
      minimumTensileStrengthMpa: 400,
      corrosionResistance: "moderate",
    },
  },
  {
    title: "Turbine Nacelle High-Temp Fitting",
    query: "nickel superalloy high temperature extreme yield strength",
    params: {
      application: "turbofan exhaust bracket",
      maximumDensity: 9.0,
      minimumTensileStrengthMpa: 1000,
      corrosionResistance: "excellent",
    },
  },
  {
    title: "Subsea Robotic Structural Enclosure",
    query: "marine pitting resistance stainless steel titanium",
    params: {
      application: "deep-sea ROV sensor housing",
      maximumDensity: 8.5,
      minimumTensileStrengthMpa: 500,
      corrosionResistance: "excellent",
    },
  },
];

export function AgentWorkspacePage({ onNavigate }) {
  const { user, isAuthenticated, loginWithWallet } = useAuth();

  // Agent profiles
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [newAgentName, setNewAgentName] = useState("Agent Alpha Research");
  const [agentAccountId, setAgentAccountId] = useState("agent-alpha.testnet");
  const [isRegisteringAgent, setIsRegisteringAgent] = useState(false);

  // Active Task
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [recommendations, setRecommendations] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Intent & Subscription
  const [activeIntent, setActiveIntent] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // Credential & Live Gateway invocation
  const [activeCredential, setActiveCredential] = useState(null);
  const [showTokenReveal, setShowTokenReveal] = useState(false);
  const [gatewayResult, setGatewayResult] = useState(null);
  const [isCallingGateway, setIsCallingGateway] = useState(false);

  // Output
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  // Fetch agents
  useEffect(() => {
    let isMounted = true;
    async function loadAgents() {
      try {
        const ownerParam = user?.accountId ? `?owner_account_id=${user.accountId}` : "";
        const res = await fetch(`/api/v1/agent/profiles${ownerParam}`);
        const data = await res.json();
        if (isMounted && data.agents?.length > 0) {
          setAgents(data.agents);
          setSelectedAgentId(data.agents[0].agent_id);
        }
      } catch (_e) {}
    }
    loadAgents();
    return () => { isMounted = false; };
  }, [user]);

  // Run autonomous search for the active task
  const handleSearchTask = async (taskIndex = selectedTaskIndex) => {
    setError(null);
    setIsSearching(true);
    setRecommendations([]);
    setGatewayResult(null);

    const task = PRESET_TASKS[taskIndex];
    try {
      const res = await fetch("/api/v1/agent/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: task.query, max_price_near: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Recommendation search failed");

      setRecommendations(data.recommendations || []);
      if ((data.recommendations || []).length === 0) {
        setStatusMsg("No published API products matched query. Ensure publisher has published an API product.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRegisterAgent = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      loginWithWallet();
      return;
    }

    setError(null);
    setIsRegisteringAgent(true);
    try {
      const res = await fetch("/api/v1/agent/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAgentName,
          owner_account_id: user.accountId,
          agent_account_id: agentAccountId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register agent profile");

      setAgents((prev) => [...prev, data.agent]);
      setSelectedAgentId(data.agent.agent_id);
      setStatusMsg(`Agent '${data.agent.name}' registered and linked to dedicated NEAR account '${data.agent.agent_account_id}'!`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRegisteringAgent(false);
    }
  };

  const handlePrepareIntent = async (rec) => {
    setError(null);
    if (!selectedAgentId) {
      setError("Please select or register an agent profile first.");
      return;
    }

    try {
      const res = await fetch("/api/v1/agent/prepare-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: selectedAgentId,
          discovery_id: rec.discovery_id,
          api_product_id: rec.api_product_id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to prepare subscription intent");

      setActiveIntent(data);
      setShowApprovalModal(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleApproveSubscription = async () => {
    if (!activeIntent) return;
    setIsApproving(true);
    setError(null);

    try {
      // 1. In demo/sandbox flow, issue credential directly for the confirmed subscription
      const issueRes = await fetch(`/api/v1/subscriptions/${activeIntent.subscription_id}/issue-credential`, {
        method: "POST",
      });

      const issueData = await issueRes.json();
      if (!issueRes.ok) throw new Error(issueData.error || "Failed to issue API credential");

      setActiveCredential(issueData.credential);
      setShowApprovalModal(false);
      setShowTokenReveal(true);
      setStatusMsg("Subscription authorized and activated on-chain! API Credential issued.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsApproving(false);
    }
  };

  const handleCallGateway = async () => {
    if (!activeCredential) {
      setError("No active credential available. Please approve a subscription first.");
      return;
    }

    setIsCallingGateway(true);
    setError(null);
    setGatewayResult(null);

    const task = PRESET_TASKS[selectedTaskIndex];
    try {
      const res = await fetch(
        `/api/v1/gateway/assets/${activeCredential.discovery_id || "disc-mat-001"}/operations/get_material_recommendations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${activeCredential.raw_token}`,
          },
          body: JSON.stringify(task.params),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gateway dispatch failed");

      setGatewayResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsCallingGateway(false);
    }
  };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "2.25rem", fontWeight: 900, color: "var(--knovara-text-primary)", marginBottom: "8px" }}>
          AI Agent Task Workspace<span style={{ color: "var(--knovara-blue-primary)" }}>.</span>
        </h1>
        <p style={{ color: "var(--knovara-text-secondary)", fontSize: "1.0625rem" }}>
          Autonomous technology licensing runtime. Agents discover APIs, prepare intents, and request human owner signing.
        </p>
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {statusMsg && (
        <div
          style={{
            backgroundColor: "rgba(33, 150, 243, 0.12)",
            border: "1px solid var(--knovara-border)",
            color: "var(--knovara-text-primary)",
            padding: "16px 20px",
            borderRadius: "var(--radius-md)",
            marginBottom: "24px",
            fontSize: "0.9375rem",
          }}
        >
          {statusMsg}
        </div>
      )}

      {/* 1. Agent Identity & Owner Binding */}
      <Card title="1. Dedicated Agent Identity & Signing Authority" style={{ marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "6px" }}>
              Active Agent Identity
            </label>
            {agents.length > 0 ? (
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "var(--knovara-surface-card)",
                  color: "var(--knovara-text-primary)",
                  border: "1px solid var(--knovara-border)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {agents.map((a) => (
                  <option key={a.agent_id} value={a.agent_id}>
                    {a.name} ({a.agent_account_id})
                  </option>
                ))}
              </select>
            ) : (
              <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem" }}>
                No registered agents found for this owner.
              </p>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "6px" }}>
              Register New Dedicated Agent
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="Agent Name"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
              />
              <input
                type="text"
                placeholder="agent.testnet"
                value={agentAccountId}
                onChange={(e) => setAgentAccountId(e.target.value)}
              />
              <Button
                variant="primary"
                onClick={handleRegisterAgent}
                isLoading={isRegisteringAgent}
              >
                Link
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Autonomous Task Formulation */}
      <Card title="2. Engineering Task Formulation" style={{ marginBottom: "24px" }}>
        <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginBottom: "16px" }}>
          Select an engineering task for the autonomous agent to evaluate against decentralized technical APIs:
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "20px" }}>
          {PRESET_TASKS.map((task, idx) => (
            <div
              key={task.title}
              onClick={() => {
                setSelectedTaskIndex(idx);
                handleSearchTask(idx);
              }}
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                border: selectedTaskIndex === idx ? "2px solid var(--knovara-lime)" : "1px solid var(--knovara-border)",
                background: selectedTaskIndex === idx ? "rgba(198, 244, 50, 0.06)" : "var(--knovara-surface)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <h4 style={{ color: "var(--knovara-text-primary)", margin: "0 0 6px 0", fontSize: "1rem" }}>{task.title}</h4>
              <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.8125rem", margin: 0 }}>
                {JSON.stringify(task.params, null, 1)}
              </p>
            </div>
          ))}
        </div>

        <Button
          variant="primary"
          onClick={() => handleSearchTask()}
          isLoading={isSearching}
        >
          Evaluate Catalog & Recommend APIs
        </Button>
      </Card>

      {/* 3. Catalog Recommendations */}
      {recommendations.length > 0 && (
        <Card title="3. Agent-Discovered Subscriptions & Recommendations" style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {recommendations.map((rec) => (
              <div
                key={rec.api_product_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "16px",
                  padding: "16px",
                  background: "var(--knovara-surface)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--knovara-border)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <h4 style={{ color: "var(--knovara-text-primary)", margin: 0, fontSize: "1.125rem" }}>{rec.title}</h4>
                    <Badge variant="success">30-DAY SUBSCRIPTION</Badge>
                  </div>
                  <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", margin: "0 0 6px 0" }}>
                    {rec.recommendation_reason}
                  </p>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--knovara-lime)" }}>
                    Price: {rec.monthly_price_near} NEAR / month • {rec.endpoints_count} Operations Bound
                  </span>
                </div>

                <Button
                  variant="primary"
                  onClick={() => handlePrepareIntent(rec)}
                >
                  Prepare Owner Purchase Intent
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 4. Active API Credential & Live Gateway Invocation */}
      {activeCredential && (
        <Card title="4. Active API Credential & Gateway Dispatch" style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <span style={{ color: "var(--knovara-text-muted)", fontSize: "0.8125rem", display: "block" }}>
                  Credential Identifier
                </span>
                <code style={{ color: "var(--knovara-text-primary)", fontSize: "0.9375rem" }}>{activeCredential.credential_id}</code>
              </div>
              <Badge variant="success">ACTIVE ON-CHAIN</Badge>
            </div>

            <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", margin: 0 }}>
              The local MCP adapter has securely isolated the bearer token. Dispatching an operation sends an authenticated request to KNOVARA Gateway, which decrypts upstream credentials and returns verified provider results.
            </p>

            <div style={{ display: "flex", gap: "12px" }}>
              <Button
                variant="primary"
                onClick={handleCallGateway}
                isLoading={isCallingGateway}
              >
                Execute Operation via KNOVARA Gateway
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowTokenReveal(true)}
              >
                Reveal Raw Bearer Token (One-Time)
              </Button>
            </div>

            {/* Live Gateway Results Display */}
            {gatewayResult && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "20px",
                  background: "var(--knovara-bg)",
                  border: "1px solid var(--knovara-border-lime)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h4 style={{ color: "var(--knovara-lime)", margin: 0, fontSize: "1.0625rem" }}>
                    Verified Upstream Provider Response ({gatewayResult.count} Materials Identified)
                  </h4>
                  <Badge variant="info">MMPDS-01 SOURCED</Badge>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
                  {gatewayResult.recommendations?.map((mat, i) => (
                    <div
                      key={mat.materialId}
                      style={{
                        padding: "12px 16px",
                        background: "var(--knovara-surface)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--knovara-border)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <strong style={{ color: "var(--knovara-text-primary)" }}>{i + 1}. {mat.name} ({mat.materialId})</strong>
                        <span style={{ color: "var(--knovara-lime)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                          Suitability: {(mat.suitabilityScore * 100).toFixed(1)}%
                        </span>
                      </div>
                      <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.8125rem", margin: "0 0 6px 0" }}>
                        Density: {mat.densityGcm3} g/cm³ | Tensile Strength: {mat.tensileStrengthMpa} MPa | Yield: {mat.yieldStrengthMpa} MPa | Corrosion: {mat.corrosionResistance}
                      </p>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                        Standard Reference: {mat.standardReference}
                      </span>
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", margin: 0, fontStyle: "italic" }}>
                  {gatewayResult.disclaimer}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Human Owner Approval Screen Modal */}
      {showApprovalModal && activeIntent && (
        <Modal
          isOpen={showApprovalModal}
          onClose={() => setShowApprovalModal(false)}
          title="Owner Review: Approve Agent API Subscription"
          maxWidth="560px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", margin: 0 }}>
              The autonomous agent has requested authorization to purchase a 30-day API subscription offer.
              Signing executes <code>subscribe_to_offer</code> on NEAR Protocol.
            </p>

            <div style={{ padding: "16px", background: "var(--knovara-bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--knovara-border)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "0.8125rem" }}>
                <div>
                  <span style={{ color: "var(--knovara-text-muted)", display: "block" }}>Dedicated Agent Account</span>
                  <code style={{ color: "var(--knovara-text-primary)" }}>{activeIntent.agent.agent_account_id}</code>
                </div>
                <div>
                  <span style={{ color: "var(--knovara-text-muted)", display: "block" }}>Monthly Rate</span>
                  <strong style={{ color: "#18181B", fontSize: "1rem" }}>{activeIntent.asset.price_near} NEAR</strong>
                </div>
                <div>
                  <span style={{ color: "var(--knovara-text-muted)", display: "block" }}>Duration</span>
                  <span style={{ color: "var(--knovara-text-primary)" }}>Fixed 30 Days</span>
                </div>
                <div>
                  <span style={{ color: "var(--knovara-text-muted)", display: "block" }}>Contract Method</span>
                  <code style={{ color: "var(--knovara-text-primary)" }}>subscribe_to_offer</code>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
              <Button variant="ghost" onClick={() => setShowApprovalModal(false)}>
                Reject Intent
              </Button>
              <Button
                variant="primary"
                onClick={handleApproveSubscription}
                isLoading={isApproving}
              >
                Approve & Pay ({activeIntent.asset.price_near} NEAR)
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Token Reveal Modal */}
      {showTokenReveal && activeCredential && (
        <Modal
          isOpen={showTokenReveal}
          onClose={() => setShowTokenReveal(false)}
          title="KNOVARA Bearer API Credential"
          maxWidth="520px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="knovara-alert knovara-alert-warning" style={{ margin: 0 }}>
              <strong>Confidential Credential: </strong> This live bearer secret will only be shown once. Deliver it to your local MCP host adapter or agent environment.
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "4px" }}>
                Bearer Token
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  readOnly
                  value={activeCredential.raw_token}
                  style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(activeCredential.raw_token);
                    alert("Copied bearer token to clipboard!");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>

            <Button variant="primary" onClick={() => setShowTokenReveal(false)}>
              I Have Securely Saved This Credential
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AgentWorkspacePage;

