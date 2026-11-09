import React, { useState, useEffect, useCallback } from "react";
import { Card } from "../components/common/Card.jsx";
import { Button } from "../components/common/Button.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LoadingSpinner } from "../components/common/LoadingSpinner.jsx";
import { ErrorAlert } from "../components/common/ErrorAlert.jsx";
import { CreateOfferModal } from "../components/licensing/CreateOfferModal.jsx";
import { TransactionReviewModal } from "../components/transaction/TransactionReviewModal.jsx";
import { formatDate } from "../services/formatters.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";

export function MyDiscoveriesPage({ onNavigate }) {
  const { user, isAuthenticated, loginWithWallet } = useAuth();
  const [discoveries, setDiscoveries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedDiscoveryForOffer, setSelectedDiscoveryForOffer] = useState(null);
  const [pendingIntent, setPendingIntent] = useState(null);

  const fetchMyDiscoveries = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.getAccountDiscoveries();
      setDiscoveries(res.discoveries || []);
    } catch (err) {
      setError(err.message || "Failed to load discoveries");
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchMyDiscoveries();
  }, [fetchMyDiscoveries]);

  if (!isAuthenticated) {
    return (
      <Card style={{ padding: "48px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>Authentication Required</h2>
        <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginBottom: "20px" }}>
          Please connect your NEAR Testnet wallet to view and manage your discoveries.
        </p>
        <Button variant="primary" onClick={() => loginWithWallet()}>
          Connect NEAR Wallet
        </Button>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="flex-between" style={{ flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "2rem" }}>My Discoveries</h1>
          <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginTop: "4px" }}>
            Technical innovations where <code>{user.accountId}</code> is Custodian or Rights Controller.
          </p>
        </div>

        <Button variant="primary" onClick={() => onNavigate("/register")}>
          + Register Discovery
        </Button>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {isLoading ? (
        <LoadingSpinner message="Querying your registered discoveries..." />
      ) : discoveries.length === 0 ? (
        <Card style={{ padding: "48px 24px", textAlign: "center", color: "var(--knovara-text-muted)" }}>
          <h3 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>No Discoveries Found</h3>
          <p style={{ fontSize: "0.875rem", maxWidth: "480px", margin: "0 auto 16px auto" }}>
            You have not registered or been designated as controller of any discoveries yet.
          </p>
          <Button variant="primary" size="sm" onClick={() => onNavigate("/register")}>
            Register Your First Discovery
          </Button>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {discoveries.map((disc) => {
            const isController = disc.rights_controller_id === user.accountId;
            const isCustodian = disc.custodian_id === user.accountId;

            return (
              <Card key={disc.discovery_id}>
                <div className="flex-between" style={{ marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Badge variant="blue">{disc.public_metadata?.category || "DISCOVERY"}</Badge>
                    {isCustodian && <Badge variant="sky">CUSTODIAN</Badge>}
                    {isController && <Badge variant="success">RIGHTS CONTROLLER</Badge>}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                    Registered: {formatDate(disc.registered_at || disc.created_at)}
                  </span>
                </div>

                <h3 style={{ fontSize: "1.2rem", marginBottom: "8px" }}>
                  {disc.public_metadata?.title || disc.discovery_id}
                </h3>

                <p style={{ fontSize: "0.875rem", color: "var(--knovara-text-secondary)", marginBottom: "16px", lineHeight: 1.6 }}>
                  {disc.public_metadata?.description || "No public summary provided."}
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "12px",
                    backgroundColor: "var(--knovara-surface)",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.75rem",
                    marginBottom: "16px",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--knovara-text-muted)" }}>Discovery ID: </span>
                    <code>{disc.discovery_id}</code>
                  </div>
                  <div>
                    <span style={{ color: "var(--knovara-text-muted)" }}>Token ID: </span>
                    <code>{disc.token_id}</code>
                  </div>
                  <div>
                    <span style={{ color: "var(--knovara-text-muted)" }}>Custodian: </span>
                    <code>{disc.custodian_id}</code>
                  </div>
                  <div>
                    <span style={{ color: "var(--knovara-text-muted)" }}>Rights Controller: </span>
                    <code>{disc.rights_controller_id}</code>
                  </div>
                </div>

                <div className="flex-between" style={{ borderTop: "1px solid var(--knovara-border)", paddingTop: "12px" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onNavigate(`/discoveries/${encodeURIComponent(disc.discovery_id)}`)}
                    >
                      View Details & Offers
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onNavigate(`/discoveries/${encodeURIComponent(disc.discovery_id)}/passport`)}
                    >
                      NFT Passport
                    </Button>
                  </div>

                  {isController && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedDiscoveryForOffer(disc.discovery_id)}
                    >
                      + Create Licensing Offer
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Offer Modal */}
      <CreateOfferModal
        isOpen={Boolean(selectedDiscoveryForOffer)}
        onClose={() => setSelectedDiscoveryForOffer(null)}
        discoveryId={selectedDiscoveryForOffer || ""}
        onOfferPrepared={(intent) => {
          setPendingIntent(intent);
        }}
      />

      {/* Transaction Review */}
      <TransactionReviewModal
        isOpen={Boolean(pendingIntent)}
        onClose={() => setPendingIntent(null)}
        intent={pendingIntent}
        title="Confirm Create Offer Intent"
        explanation="Registers a new standardized licensing offer on-chain for your discovery."
        onReconcileSuccess={() => {
          setPendingIntent(null);
          fetchMyDiscoveries();
        }}
      />
    </div>
  );
}
