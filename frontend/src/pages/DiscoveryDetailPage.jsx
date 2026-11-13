import React, { useState, useEffect, useCallback } from "react";
import { Card } from "../components/common/Card.jsx";
import { Button } from "../components/common/Button.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LegalDisclaimer } from "../components/common/LegalDisclaimer.jsx";
import { LoadingSpinner } from "../components/common/LoadingSpinner.jsx";
import { ErrorAlert } from "../components/common/ErrorAlert.jsx";
import { CreateOfferModal } from "../components/licensing/CreateOfferModal.jsx";
import { RequestLicenseModal } from "../components/licensing/RequestLicenseModal.jsx";
import { TransactionReviewModal } from "../components/transaction/TransactionReviewModal.jsx";
import { formatDate, yoctoToNear, formatBasisPoints } from "../services/formatters.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";

export function DiscoveryDetailPage({ discoveryId, onNavigate }) {
  const { user } = useAuth();
  const [discovery, setDiscovery] = useState(null);
  const [offers, setOffers] = useState([]);
  const [apiProducts, setApiProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals state
  const [showCreateOffer, setShowCreateOffer] = useState(false);
  const [selectedOfferForRequest, setSelectedOfferForRequest] = useState(null);
  const [pendingIntent, setPendingIntent] = useState(null);
  const [intentExplanation, setIntentExplanation] = useState("");

  const loadData = useCallback(async () => {
    if (!discoveryId) return;
    try {
      setIsLoading(true);
      setError(null);

      const [discRes, offersRes, productsRes] = await Promise.all([
        api.getDiscovery(discoveryId),
        api.getDiscoveryOffers(discoveryId).catch(() => ({ offers: [] })),
        api.getApiProducts(discoveryId).catch(() => ({ products: [] })),
      ]);

      setDiscovery(discRes.discovery);
      setOffers(offersRes.offers || []);
      setApiProducts(productsRes.products || []);
    } catch (err) {
      setError(err.message || "Failed to load discovery details");
    } finally {
      setIsLoading(false);
    }
  }, [discoveryId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return <LoadingSpinner message="Retrieving cryptographic discovery records..." />;
  }

  if (error || !discovery) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <ErrorAlert message={error || "Discovery not found"} />
        <Button variant="secondary" onClick={() => onNavigate("/discoveries")}>
          &larr; Back to Catalog
        </Button>
      </div>
    );
  }

  const isRightsController = user?.accountId && user.accountId === discovery.rights_controller_id;

  const handleOfferPrepared = (intent) => {
    setIntentExplanation(`Creates an on-chain licensing offer for discovery '${discoveryId}'.`);
    setPendingIntent(intent);
  };

  const handleRequestPrepared = (intent) => {
    setIntentExplanation(`Submits a license request for offer '${intent.args?.offer_id}'.`);
    setPendingIntent(intent);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Navigation & Actions */}
      <div className="flex-between">
        <button
          type="button"
          onClick={() => onNavigate("/discoveries")}
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
          &larr; Return to Discoveries Catalog
        </button>

        <div style={{ display: "flex", gap: "10px" }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate(`/discoveries/${encodeURIComponent(discoveryId)}/passport`)}
          >
            View On-Chain NFT Passport
          </Button>

          {isRightsController && (
            <Button variant="primary" size="sm" onClick={() => setShowCreateOffer(true)}>
              + Create Licensing Offer
            </Button>
          )}
        </div>
      </div>

      <LegalDisclaimer />

      {/* Main Discovery Overview */}
      <Card>
        <div className="flex-between" style={{ marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <Badge variant="blue" style={{ fontSize: "0.875rem" }}>
            {discovery.public_metadata?.category || "DISCOVERY"}
          </Badge>
          <span style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)" }}>
            Registered on NEAR: {formatDate(discovery.registered_at || discovery.created_at)}
          </span>
        </div>

        <h1 style={{ fontSize: "1.75rem", marginBottom: "16px", lineHeight: 1.25 }}>
          {discovery.public_metadata?.title || discovery.discovery_id}
        </h1>

        <p style={{ fontSize: "0.9375rem", lineHeight: 1.7, color: "var(--knovara-text-secondary)", marginBottom: "24px" }}>
          {discovery.public_metadata?.description || "No public summary provided."}
        </p>

        {/* Technical Registry Metadata Grid */}
        <div
          style={{
            backgroundColor: "var(--knovara-surface)",
            padding: "16px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--knovara-border)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Discovery Identifier
            </div>
            <code>{discovery.discovery_id}</code>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              NEP-171 Token ID
            </div>
            <code>{discovery.token_id}</code>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Custodian (Owner)
            </div>
            <code>{discovery.custodian_id}</code>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Rights Controller
            </div>
            <strong style={{ color: "var(--knovara-blue-primary)" }}>
              <code>{discovery.rights_controller_id}</code>
            </strong>
          </div>
        </div>
      </Card>

      {/* Cryptographic Hashes & Verification Row */}
      <div className="knovara-grid-2">
        {/* NEP-177 Public Metadata Reference Card */}
        <Card
          title="NEP-177 Public Metadata Descriptor"
          subtitle="Cryptographically verified immutable descriptor"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "4px" }}>
                Reference Hash (Base64 SHA-256)
              </div>
              <code style={{ display: "block", padding: "8px", wordBreak: "break-all" }}>
                {discovery.public_metadata?.reference_hash || "—"}
              </code>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "4px" }}>
                Canonical Endpoint URL
              </div>
              <a
                href={`/api/v1/metadata/${encodeURIComponent(discoveryId)}/1.0.0`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: "0.8125rem", wordBreak: "break-all" }}
              >
                /api/v1/metadata/{discoveryId}/1.0.0 &rarr;
              </a>
            </div>

            <p style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", marginTop: "4px" }}>
              Served strictly as canonical RFC 8785 UTF-8 bytes. Matches the on-chain NEP-177 reference_hash byte-for-byte.
            </p>
          </div>
        </Card>

        {/* Private Evidence Manifest Card */}
        <Card
          title="RFC 8785 Evidence Manifest"
          subtitle="Anchored SHA-256 hash of private evidence files"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)", marginBottom: "4px" }}>
                Evidence Manifest Hash (Hex SHA-256)
              </div>
              <code style={{ display: "block", padding: "8px", wordBreak: "break-all" }}>
                {discovery.evidence_manifest_hash || "—"}
              </code>
            </div>

            <div className="knovara-alert knovara-alert-info" style={{ margin: 0, fontSize: "0.8125rem" }}>
              🔒 <strong>Confidentiality Preserved: </strong> Private evidence files remain in encrypted Cloudflare R2
              storage. Access is strictly gated by the NEAR smart contract and granted only to verified licensees upon
              confirmed on-chain payment.
            </div>
          </div>
        </Card>
      </div>

      {/* Royalty Beneficiary Splits */}
      {discovery.beneficiary_splits && discovery.beneficiary_splits.length > 0 && (
        <Card title="Royalty Beneficiary Splits" subtitle="Enforced by smart contract solvency formula">
          <table className="knovara-table">
            <thead>
              <tr>
                <th>Beneficiary NEAR Account</th>
                <th>Basis Points</th>
                <th>Share Percentage</th>
              </tr>
            </thead>
            <tbody>
              {discovery.beneficiary_splits.map((split, idx) => (
                <tr key={idx}>
                  <td>
                    <code>{split.account_id}</code>
                  </td>
                  <td>{split.basis_points} bps</td>
                  <td>
                    <strong>{formatBasisPoints(split.basis_points)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* KNOVARA 2.0: Agent Computational API Products */}
      <Card
        title={`AI Agent API Products (${apiProducts.length})`}
        subtitle="OpenAPI 3.1 computational endpoints and 30-day fixed subscriptions"
        action={
          isRightsController && (
            <Button variant="primary" size="sm" onClick={() => onNavigate("/publisher")}>
              + Publish API Product
            </Button>
          )
        }
      >
        {apiProducts.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--knovara-text-muted)" }}>
            <p style={{ fontSize: "0.875rem" }}>No computational API products published for this discovery yet.</p>
            {isRightsController && (
              <Button
                variant="primary"
                size="sm"
                style={{ marginTop: "12px" }}
                onClick={() => onNavigate("/publisher")}
              >
                Publish First API Product for AI Agents &rarr;
              </Button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {apiProducts.map((prod) => (
              <div
                key={prod.api_product_id}
                className="flex-between"
                style={{
                  backgroundColor: "var(--knovara-surface)",
                  padding: "16px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(198, 244, 50, 0.25)",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                    <Badge variant="blue">OPENAPI {prod.version || "3.1"}</Badge>
                    <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--knovara-lime)" }}>
                      {prod.monthly_price_near || "1.0"} NEAR / 30 Days
                    </span>
                    <Badge variant="success">FIXED PERIOD</Badge>
                  </div>
                  <h4 style={{ fontSize: "1rem", margin: "4px 0" }}>{prod.title}</h4>
                  <p style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)", margin: "4px 0" }}>
                    {prod.description || "Verifiable computational research API."}
                  </p>
                  <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", marginTop: "4px" }}>
                    <span>Endpoints: </span>
                    <strong style={{ color: "var(--knovara-text-primary)" }}>{prod.endpoints?.length || 1} Verified Operations</strong>
                    {prod.offer_id && (
                      <span style={{ marginLeft: "12px" }}>
                        Offer ID: <code>{prod.offer_id}</code>
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onNavigate("/agent-workspace")}
                  >
                    Open in Agent Workspace &rarr;
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Active Licensing Offers */}
      <Card
        title={`Active Licensing Offers (${offers.length})`}
        subtitle="Standardized licenses available for procurement"
        action={
          isRightsController && (
            <Button variant="primary" size="sm" onClick={() => setShowCreateOffer(true)}>
              + New Offer
            </Button>
          )
        }
      >
        {offers.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--knovara-text-muted)" }}>
            <p style={{ fontSize: "0.875rem" }}>No active licensing offers currently created for this discovery.</p>
            {isRightsController && (
              <Button
                variant="primary"
                size="sm"
                style={{ marginTop: "12px" }}
                onClick={() => setShowCreateOffer(true)}
              >
                Create First Offer
              </Button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {offers.map((offer) => (
              <div
                key={offer.offer_id}
                className="flex-between"
                style={{
                  backgroundColor: "var(--knovara-surface)",
                  padding: "16px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--knovara-border)",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                    <Badge variant="blue">{offer.scope}</Badge>
                    <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--knovara-blue-primary)" }}>
                      {yoctoToNear(offer.price_yocto)} NEAR
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                      &middot; {offer.duration_days} Days Duration
                    </span>
                  </div>

                  <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-secondary)" }}>
                    Offer ID: <code>{offer.offer_id}</code> &middot; Terms Hash:{" "}
                    <code>{String(offer.terms_hash || offer.termsHash || "").slice(0, 10) || "N/A"}...</code>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setSelectedOfferForRequest(offer)}
                >
                  Request License
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modals */}
      <CreateOfferModal
        isOpen={showCreateOffer}
        onClose={() => setShowCreateOffer(false)}
        discoveryId={discoveryId}
        onOfferPrepared={handleOfferPrepared}
      />

      <RequestLicenseModal
        isOpen={Boolean(selectedOfferForRequest)}
        onClose={() => setSelectedOfferForRequest(null)}
        offer={selectedOfferForRequest}
        onRequestPrepared={handleRequestPrepared}
      />

      <TransactionReviewModal
        isOpen={Boolean(pendingIntent)}
        onClose={() => setPendingIntent(null)}
        intent={pendingIntent}
        explanation={intentExplanation}
        onReconcileSuccess={() => {
          loadData();
          setPendingIntent(null);
        }}
      />
    </div>
  );
}
