import React, { useState, useEffect } from "react";
import { Card } from "../components/common/Card.jsx";
import { Button } from "../components/common/Button.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { ErrorAlert } from "../components/common/ErrorAlert.jsx";
import { TransactionReviewModal } from "../components/transaction/TransactionReviewModal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";

const SAMPLE_OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Advanced Materials Research API",
    version: "1.0.0",
    description: "Proprietary alloy and composite material property recommendation service based on MMPDS-01 and ASM datasets."
  },
  paths: {
    "/v1/materials/recommendations": {
      post: {
        operationId: "get_material_recommendations",
        summary: "Recommend aerospace materials matching constraints",
        description: "Filters and ranks materials by density, tensile strength, and corrosion grade."
      }
    }
  }
};

export function PublisherPortalPage({ onNavigate }) {
  const { user, isAuthenticated, loginWithWallet } = useAuth();

  const [discoveries, setDiscoveries] = useState([]);
  const [selectedDiscoveryId, setSelectedDiscoveryId] = useState("");
  const [title, setTitle] = useState("Advanced Materials Research API");
  const [version, setVersion] = useState("1.0.0");
  const [monthlyPriceNear, setMonthlyPriceNear] = useState("1.0");
  const [specJson, setSpecJson] = useState(JSON.stringify(SAMPLE_OPENAPI_SPEC, null, 2));

  // Provider config
  const [baseUrl, setBaseUrl] = useState("http://localhost:5050");
  const [secretToken, setSecretToken] = useState("demo_adv_materials_secret_2026");
  const [headerName, setHeaderName] = useState("x-provider-api-key");

  // Output / Feedback state
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [registeredProduct, setRegisteredProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Transaction Review Modal
  const [activeIntent, setActiveIntent] = useState(null);
  const [showTxModal, setShowTxModal] = useState(false);

  // Load user's discoveries
  useEffect(() => {
    let isMounted = true;
    async function loadDiscoveries() {
      try {
        const res = await api.getDiscoveries({ limit: 50 });
        if (isMounted && res.discoveries?.length > 0) {
          setDiscoveries(res.discoveries);
          setSelectedDiscoveryId(res.discoveries[0].discovery_id);
        }
      } catch (_e) {}
    }
    loadDiscoveries();
    return () => { isMounted = false; };
  }, []);

  const handleRegisterProduct = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      let parsedSpec;
      try {
        parsedSpec = JSON.parse(specJson);
      } catch (_err) {
        throw new Error("Invalid JSON in OpenAPI Specification field");
      }

      const disc = discoveries.find((d) => d.discovery_id === selectedDiscoveryId) || {
        discovery_id: selectedDiscoveryId || `disc-mat-${Date.now().toString(36)}`,
        token_id: `token-mat-${Date.now().toString(36)}`,
      };

      // 1. Register API Product in backend
      const res = await fetch("/api/v1/api-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discovery_id: disc.discovery_id,
          token_id: disc.token_id,
          title,
          version,
          openapi_spec: parsedSpec,
          monthly_price_near: Number(monthlyPriceNear),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register API product");
      }

      const createdProduct = data.product;

      // 2. Configure encrypted provider upstream
      const confRes = await fetch(`/api/v1/api-products/${createdProduct.api_product_id}/provider-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: baseUrl,
          secret_token: secretToken,
          header_name: headerName,
        }),
      });

      const confData = await confRes.json();
      if (!confRes.ok) {
        throw new Error(confData.error || "Failed to save encrypted provider config");
      }

      setRegisteredProduct(createdProduct);
      setSuccessMsg(`API Product successfully registered with ${createdProduct.endpoints_count} operations! Upstream credentials encrypted with AES-256-GCM.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrepareOffer = async () => {
    if (!registeredProduct) return;
    setError(null);
    try {
      const res = await fetch(`/api/v1/api-products/${registeredProduct.api_product_id}/prepare-offer-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to prepare subscription offer intent");
      }

      setActiveIntent(data.intent);
      setShowTxModal(true);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "2.25rem", fontWeight: 900, color: "var(--knovara-text-primary)", marginBottom: "8px" }}>
          Publisher Portal<span style={{ color: "var(--knovara-blue-primary)" }}>.</span>
        </h1>
        <p style={{ color: "var(--knovara-text-secondary)", fontSize: "1.0625rem" }}>
          Publish and monetize computational APIs, proprietary datasets, and AI technologies.
          Bound to Discovery Rights Passport NFTs on NEAR Protocol.
        </p>
      </div>

      {!isAuthenticated && (
        <Card style={{ marginBottom: "24px", borderColor: "var(--knovara-border-lime)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h3 style={{ color: "var(--knovara-text-primary)", fontSize: "1.125rem", margin: "0 0 4px 0" }}>
                Connect Rights Controller Wallet
              </h3>
              <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", margin: 0 }}>
                Publishing direct subscription offers requires rights controller authority over the Discovery NFT.
              </p>
            </div>
            <Button variant="primary" onClick={() => loginWithWallet()}>
              Connect NEAR Wallet
            </Button>
          </div>
        </Card>
      )}

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {successMsg && (
        <div
          style={{
            backgroundColor: "rgba(198, 244, 50, 0.12)",
            border: "1px solid var(--knovara-border-lime)",
            color: "var(--knovara-lime)",
            padding: "16px 20px",
            borderRadius: "var(--radius-md)",
            marginBottom: "24px",
            fontSize: "0.9375rem",
          }}
        >
          {successMsg}
        </div>
      )}

      <form onSubmit={handleRegisterProduct}>
        <Card title="1. Link Discovery Rights Passport" style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "6px" }}>
                Select Registered Discovery Asset
              </label>
              {discoveries.length > 0 ? (
                <select
                  value={selectedDiscoveryId}
                  onChange={(e) => setSelectedDiscoveryId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: "var(--knovara-surface-card)",
                    color: "var(--knovara-text-primary)",
                    border: "1px solid var(--knovara-border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  {discoveries.map((d) => (
                    <option key={d.discovery_id} value={d.discovery_id}>
                      {d.title || d.discovery_id} ({d.discovery_id})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. disc-mat-001"
                  value={selectedDiscoveryId}
                  onChange={(e) => setSelectedDiscoveryId(e.target.value)}
                  required
                />
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "6px" }}>
                  API Product Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "6px" }}>
                  Fixed Monthly Price (NEAR) — 30-Day Duration
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={monthlyPriceNear}
                  onChange={(e) => setMonthlyPriceNear(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
        </Card>

        <Card title="2. OpenAPI 3.0 / 3.1 Specification" style={{ marginBottom: "24px" }}>
          <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginBottom: "12px" }}>
            Define endpoints, request schemas, and operation IDs. The KNOVARA gateway uses this spec to validate and route agent requests.
          </p>
          <textarea
            rows={10}
            value={specJson}
            onChange={(e) => setSpecJson(e.target.value)}
            style={{
              width: "100%",
              fontFamily: "var(--font-mono)",
              fontSize: "0.8125rem",
              background: "var(--knovara-surface-card)",
              color: "var(--knovara-text-primary)",
              border: "1px solid var(--knovara-border)",
              borderRadius: "var(--radius-sm)",
              padding: "12px",
            }}
            required
          />
        </Card>

        <Card title="3. Secure Upstream Provider Configuration" style={{ marginBottom: "24px" }}>
          <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginBottom: "12px" }}>
            The secret key is encrypted with <strong>AES-256-GCM</strong> on KNOVARA and never exposed to agents or frontend clients.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "6px" }}>
                Upstream Provider Base URL
              </label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:5050 or https://api.mycompany.com"
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "6px" }}>
                  Private Upstream Secret / Bearer Token
                </label>
                <input
                  type="password"
                  value={secretToken}
                  onChange={(e) => setSecretToken(e.target.value)}
                  placeholder="Enters memory only for upstream dispatch"
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "6px" }}>
                  Header Name
                </label>
                <input
                  type="text"
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  placeholder="x-provider-api-key"
                  required
                />
              </div>
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", gap: "16px", marginBottom: "32px" }}>
          <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting}>
            Register API Product & Encrypt Credentials
          </Button>
          {registeredProduct && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handlePrepareOffer}
              style={{ borderColor: "var(--knovara-lime)", color: "var(--knovara-lime)" }}
            >
              Authorize On-Chain Subscription Offer
            </Button>
          )}
        </div>
      </form>

      {/* Transaction Review Modal */}
      {showTxModal && activeIntent && (
        <TransactionReviewModal
          isOpen={showTxModal}
          onClose={() => setShowTxModal(false)}
          intent={activeIntent}
          onConfirmed={() => {
            setShowTxModal(false);
            setSuccessMsg("On-chain subscription offer confirmed! Agents can now atomically subscribe.");
          }}
        />
      )}
    </div>
  );
}

export default PublisherPortalPage;

