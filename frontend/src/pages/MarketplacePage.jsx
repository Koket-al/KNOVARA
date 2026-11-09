import React, { useState, useEffect } from "react";
import { Card } from "../components/common/Card.jsx";
import { Button } from "../components/common/Button.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LoadingSpinner } from "../components/common/LoadingSpinner.jsx";
import { ErrorAlert } from "../components/common/ErrorAlert.jsx";
import { RequestLicenseModal } from "../components/licensing/RequestLicenseModal.jsx";
import { TransactionReviewModal } from "../components/transaction/TransactionReviewModal.jsx";
import { yoctoToNear, truncateHash } from "../services/formatters.js";
import { api } from "../services/api.js";

const SCOPES = [
  { value: "", label: "All Licensing Scopes" },
  { value: "AiModelTraining", label: "AI Model Training" },
  { value: "AiModelFineTuning", label: "AI Model Fine-Tuning" },
  { value: "AiKnowledgeRetrieval", label: "AI Knowledge Retrieval (RAG)" },
  { value: "AcademicResearch", label: "Academic & Research Evaluation" },
  { value: "CommercialUse", label: "Commercial Production Use" },
  { value: "ResearchEvaluation", label: "Evaluation & Feasibility Sample" },
  { value: "CustomTerms", label: "Custom Negotiated Terms" },
];

export function MarketplacePage({ onNavigate }) {
  const [discoveries, setDiscoveries] = useState([]);
  const [allOffers, setAllOffers] = useState([]);
  const [selectedScope, setSelectedScope] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedOfferForRequest, setSelectedOfferForRequest] = useState(null);
  const [pendingIntent, setPendingIntent] = useState(null);

  useEffect(() => {
    async function loadMarketplace() {
      try {
        setIsLoading(true);
        setError(null);
        // Query discoveries and their offers
        const discRes = await api.getDiscoveries({ limit: 50 });
        const discList = discRes.discoveries || [];
        setDiscoveries(discList);

        const offersNested = await Promise.all(
          discList.map(async (d) => {
            try {
              const res = await api.getDiscoveryOffers(d.discovery_id);
              return (res.offers || []).map((o) => ({
                ...o,
                discoveryTitle: d.public_metadata?.title || d.discovery_id,
                category: d.public_metadata?.category,
              }));
            } catch (_e) {
              return [];
            }
          })
        );

        setAllOffers(offersNested.flat());
      } catch (err) {
        setError(err.message || "Failed to load marketplace offers");
      } finally {
        setIsLoading(false);
      }
    }
    loadMarketplace();
  }, []);

  const filteredOffers = allOffers.filter((o) => {
    if (selectedScope) {
      const match =
        o.scope === selectedScope ||
        (selectedScope === "AcademicResearch" && o.scope === "RESEARCH_ONLY") ||
        (selectedScope === "CommercialUse" && (o.scope === "COMMERCIAL_USE" || o.scope === "EXCLUSIVE" || o.scope === "PERPETUAL")) ||
        (selectedScope === "AiModelTraining" && o.scope === "AI_TRAINING") ||
        (selectedScope === "ResearchEvaluation" && o.scope === "EVALUATION_SAMPLE");
      if (!match) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        o.offer_id.toLowerCase().includes(q) ||
        o.discovery_id.toLowerCase().includes(q) ||
        (o.discoveryTitle && o.discoveryTitle.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleRequestPrepared = (intent) => {
    setPendingIntent(intent);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "2rem" }}>Licensing Marketplace</h1>
        <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginTop: "4px" }}>
          Explore standardized, cryptographically bound licensing offers across registered discoveries.
        </p>
      </div>

      {/* Filter Row */}
      <div
        className="knovara-card"
        style={{
          padding: "16px",
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "12px",
          alignItems: "center",
        }}
      >
        <input
          type="search"
          placeholder="Filter by discovery title, offer ID, or terms..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select value={selectedScope} onChange={(e) => setSelectedScope(e.target.value)}>
          {SCOPES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {isLoading ? (
        <LoadingSpinner message="Scanning active licensing offers on NEAR Testnet..." />
      ) : filteredOffers.length === 0 ? (
        <div className="knovara-card" style={{ padding: "48px 24px", textAlign: "center", color: "var(--knovara-text-muted)" }}>
          <h3 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>No Active Licensing Offers Available</h3>
          <p style={{ fontSize: "0.875rem", maxWidth: "480px", margin: "0 auto" }}>
            Currently there are no public licensing offers matching your filter. Browse registered discoveries to request
            custom licensing terms.
          </p>
        </div>
      ) : (
        <div className="knovara-grid-3">
          {filteredOffers.map((offer) => (
            <Card
              key={offer.offer_id}
              interactive
              style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
            >
              <div>
                <div className="flex-between" style={{ marginBottom: "8px" }}>
                  <Badge variant="blue">{offer.scope}</Badge>
                  <strong style={{ fontSize: "1.1rem", color: "var(--knovara-blue-primary)" }}>
                    {yoctoToNear(offer.price_yocto)} NEAR
                  </strong>
                </div>

                <h3 style={{ fontSize: "1.05rem", marginBottom: "8px", lineHeight: 1.3 }}>
                  {offer.discoveryTitle}
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.75rem", marginBottom: "16px" }}>
                  <div>
                    <span style={{ color: "var(--knovara-text-muted)" }}>Discovery: </span>
                    <code>{truncateHash(offer.discovery_id, 10, 6)}</code>
                  </div>
                  <div>
                    <span style={{ color: "var(--knovara-text-muted)" }}>Offer ID: </span>
                    <code>{offer.offer_id}</code>
                  </div>
                  <div>
                    <span style={{ color: "var(--knovara-text-muted)" }}>Duration: </span>
                    <span>{offer.duration_days} Days</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--knovara-text-muted)" }}>Terms Hash: </span>
                    <code>{truncateHash(offer.terms_hash, 8, 6)}</code>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", borderTop: "1px solid var(--knovara-border)", paddingTop: "12px" }}>
                <Button
                  variant="primary"
                  size="sm"
                  style={{ flex: 1 }}
                  onClick={() => setSelectedOfferForRequest(offer)}
                >
                  Request License
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigate(`/discoveries/${encodeURIComponent(offer.discovery_id)}`)}
                >
                  Discovery
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Request Modal */}
      <RequestLicenseModal
        isOpen={Boolean(selectedOfferForRequest)}
        onClose={() => setSelectedOfferForRequest(null)}
        offer={selectedOfferForRequest}
        onRequestPrepared={handleRequestPrepared}
      />

      {/* Transaction Intent Review */}
      <TransactionReviewModal
        isOpen={Boolean(pendingIntent)}
        onClose={() => setPendingIntent(null)}
        intent={pendingIntent}
        title="Review License Request Intent"
        explanation="Prepares the on-chain license request for approval by the Rights Controller."
        onReconcileSuccess={() => {
          setPendingIntent(null);
          onNavigate("/licenses");
        }}
      />
    </div>
  );
}
