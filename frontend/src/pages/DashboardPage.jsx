import React, { useState, useEffect } from "react";
import { Card } from "../components/common/Card.jsx";
import { Button } from "../components/common/Button.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LoadingSpinner } from "../components/common/LoadingSpinner.jsx";
import { ErrorAlert } from "../components/common/ErrorAlert.jsx";
import { yoctoToNear } from "../services/formatters.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";

export function DashboardPage({ onNavigate }) {
  const { user, isAuthenticated, loginWithWallet } = useAuth();

  const [stats, setStats] = useState({
    discoveriesCount: 0,
    offersCount: 0,
    requestsCount: 0,
    licensesCount: 0,
    claimableNear: "0",
    storageBalanceNear: "0",
    isRegisteredStorage: false,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadDashboard() {
      if (!isAuthenticated) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);

        const [discRes, offersRes, reqRes, licRes, royRes, storageRes] = await Promise.all([
          api.getAccountDiscoveries().catch(() => ({ discoveries: [] })),
          api.getAccountOffers().catch(() => ({ offers: [] })),
          api.getAccountRequests().catch(() => ({ requests: [] })),
          api.getAccountLicenses().catch(() => ({ licenses: [] })),
          api.getAccountRoyalties().catch(() => ({ claimableBalanceYocto: "0" })),
          api.getAccountStorage().catch(() => ({ storageBalance: null, isRegistered: false })),
        ]);

        const claimableNear = yoctoToNear(royRes.claimableBalanceYocto || "0", 4);
        const storageNear = storageRes.storageBalance
          ? yoctoToNear(storageRes.storageBalance.total || "0", 4)
          : "0";

        setStats({
          discoveriesCount: discRes.discoveries?.length || 0,
          offersCount: offersRes.offers?.length || 0,
          requestsCount: reqRes.requests?.length || 0,
          licensesCount: licRes.licenses?.length || 0,
          claimableNear,
          storageBalanceNear: storageNear,
          isRegisteredStorage: storageRes.isRegistered,
        });
      } catch (err) {
        setError(err.message || "Failed to load dashboard metrics");
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <Card style={{ padding: "48px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>Authentication Required</h2>
        <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginBottom: "20px" }}>
          Please connect your NEAR Testnet wallet using NEP-413 to access your personalized portfolio, discoveries,
          licensing requests, and royalties.
        </p>
        <Button variant="primary" onClick={() => loginWithWallet()}>
          Connect NEAR Wallet
        </Button>
      </Card>
    );
  }

  if (isLoading) {
    return <LoadingSpinner message="Aggregating account portfolio and live balances..." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Welcome Banner */}
      <div className="flex-between" style={{ flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)", textTransform: "uppercase" }}>
            CONNECTED ACCOUNT DASHBOARD
          </div>
          <h1 style={{ fontSize: "1.75rem", display: "flex", alignItems: "center", gap: "10px" }}>
            <span>{user.accountId}</span>
            <Badge variant="success">ACTIVE SESSION</Badge>
          </h1>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <Button variant="primary" onClick={() => onNavigate("/register")}>
            + Register Discovery
          </Button>
          <Button variant="secondary" onClick={() => onNavigate("/account")}>
            Manage Royalties & Storage
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Statistics Cards Grid */}
      <div className="knovara-grid-3">
        {/* Discoveries */}
        <Card interactive onClick={() => onNavigate("/my-discoveries")} style={{ cursor: "pointer" }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
            Registered Discoveries
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--knovara-blue-primary)", margin: "8px 0" }}>
            {stats.discoveriesCount}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)" }}>
            Discoveries as Custodian or Rights Controller &rarr;
          </div>
        </Card>

        {/* Claimable Royalties */}
        <Card interactive onClick={() => onNavigate("/account")} style={{ cursor: "pointer" }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
            Claimable Royalties
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--knovara-status-success)", margin: "8px 0" }}>
            {stats.claimableNear} NEAR
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)" }}>
            Live unwithdrawn balance on NEAR contract &rarr;
          </div>
        </Card>

        {/* Storage Balance */}
        <Card interactive onClick={() => onNavigate("/account")} style={{ cursor: "pointer" }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
            NEP-145 Storage Balance
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--knovara-text-primary)", margin: "8px 0" }}>
            {stats.storageBalanceNear} NEAR
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)" }}>
            Status: {stats.isRegisteredStorage ? "Registered" : "Deposit Required"} &rarr;
          </div>
        </Card>

        {/* Managed Offers */}
        <Card interactive onClick={() => onNavigate("/my-discoveries")} style={{ cursor: "pointer" }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
            Managed Licensing Offers
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, margin: "8px 0" }}>
            {stats.offersCount}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)" }}>
            Offers created across your discoveries &rarr;
          </div>
        </Card>

        {/* Licensing Requests */}
        <Card interactive onClick={() => onNavigate("/licenses")} style={{ cursor: "pointer" }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
            License Requests Submitted
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, margin: "8px 0" }}>
            {stats.requestsCount}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)" }}>
            Requests pending approval or payment &rarr;
          </div>
        </Card>

        {/* Active Licenses */}
        <Card interactive onClick={() => onNavigate("/licenses")} style={{ cursor: "pointer" }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
            Active / Historical Licenses
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--knovara-blue-primary)", margin: "8px 0" }}>
            {stats.licensesCount}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)" }}>
            Licensed technical data access &rarr;
          </div>
        </Card>
      </div>

      {/* Quick Navigation Hub */}
      <Card title="Quick Management Actions">
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Button variant="primary" onClick={() => onNavigate("/register")}>
            Register Discovery
          </Button>
          <Button variant="secondary" onClick={() => onNavigate("/my-discoveries")}>
            View My Discoveries
          </Button>
          <Button variant="secondary" onClick={() => onNavigate("/licenses")}>
            Manage License Requests
          </Button>
          <Button variant="secondary" onClick={() => onNavigate("/account")}>
            Withdraw Royalties & Deposit Storage
          </Button>
          <Button variant="outline" onClick={() => onNavigate("/marketplace")}>
            Explore Marketplace
          </Button>
        </div>
      </Card>
    </div>
  );
}
