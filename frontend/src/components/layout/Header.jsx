import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { Button } from "../common/Button.jsx";
import { Badge } from "../common/Badge.jsx";
import { Modal } from "../common/Modal.jsx";

export function Header({ currentPath = "/", onNavigate }) {
  const { user, isAuthenticated, isAuthenticating, loginWithWallet, logout, error, clearError } = useAuth();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [manualAccountId, setManualAccountId] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleConnectClick = () => {
    clearError();
    setShowConnectModal(true);
  };

  const handleExecuteLogin = async (e) => {
    e?.preventDefault();
    try {
      await loginWithWallet(manualAccountId.trim() || null);
      setShowConnectModal(false);
      setManualAccountId("");
    } catch (_err) {
      // Error handled in AuthContext
    }
  };

  const unauthNavLinks = [
    { label: "Discoveries", path: "/discoveries" },
    { label: "Marketplace", path: "/marketplace" },
    { label: "Register Discovery", path: "/register" },
  ];

  const authNavLinks = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Discoveries", path: "/discoveries" },
    { label: "Marketplace", path: "/marketplace" },
    { label: "My Discoveries", path: "/my-discoveries" },
    { label: "Register Discovery", path: "/register" },
    { label: "Licenses", path: "/licenses" },
    { label: "Account & Storage", path: "/account" },
  ];

  const activeNavLinks = isAuthenticated ? authNavLinks : unauthNavLinks;

  return (
    <header
      style={{
        backgroundColor: "var(--knovara-surface-card)",
        borderBottom: "1px solid var(--knovara-border-strong)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "var(--shadow-subtle)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1440px",
          margin: "0 auto",
          height: "var(--header-height)",
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate("/");
            }}
            style={{ textDecoration: "none" }}
          >
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "1.5rem",
                fontWeight: 900,
                color: "var(--knovara-blue-primary)",
                letterSpacing: "-0.03em",
                whiteSpace: "nowrap",
              }}
            >
              KNOVARA
            </span>
          </a>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--knovara-text-muted)",
              whiteSpace: "nowrap",
              borderLeft: "1px solid var(--knovara-border-strong)",
              paddingLeft: "10px",
              marginLeft: "4px",
            }}
            className="brand-subtitle"
          >
            DISCOVERY RIGHTS REGISTRY
          </span>
        </div>

        {/* Desktop Navigation Links */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
            flexShrink: 0,
          }}
          className="desktop-nav"
        >
          {activeNavLinks.map((link) => (
            <a
              key={link.path}
              href={link.path}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(link.path);
              }}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                whiteSpace: "nowrap",
                flexShrink: 0,
                color: currentPath === link.path ? "var(--knovara-blue-primary)" : "var(--knovara-text-secondary)",
                borderBottom: currentPath === link.path ? "2px solid var(--knovara-blue-primary)" : "2px solid transparent",
                padding: "8px 2px",
                textDecoration: "none",
                transition: "color 0.15s ease, border-color 0.15s ease",
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Authentication & Account CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          {isAuthenticated && user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Badge variant="blue" style={{ fontSize: "0.8125rem", padding: "6px 10px", whiteSpace: "nowrap", flexShrink: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--knovara-status-success)", display: "inline-block", flexShrink: 0 }} />
                <span style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }} title={user.accountId}>
                  {user.accountId}
                </span>
              </Badge>
              <Button variant="outline" size="sm" onClick={logout} style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleConnectClick}
              isLoading={isAuthenticating}
            >
              Connect NEAR Wallet
            </Button>
          )}

          {/* Mobile hamburger button */}
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            style={{
              display: "none",
              background: "none",
              border: "1px solid var(--knovara-border)",
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              fontSize: "1.2rem",
              cursor: "pointer",
            }}
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div
          style={{
            backgroundColor: "var(--knovara-surface-card)",
            borderTop: "1px solid var(--knovara-border)",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {activeNavLinks.map((link) => (
            <a
              key={link.path}
              href={link.path}
              onClick={(e) => {
                e.preventDefault();
                setMobileMenuOpen(false);
                onNavigate(link.path);
              }}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.875rem",
                color: currentPath === link.path ? "var(--knovara-blue-primary)" : "var(--knovara-text-primary)",
                padding: "8px 0",
                textDecoration: "none",
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}

      {/* Wallet Authentication Modal */}
      <Modal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        title="Connect & Authenticate NEAR Wallet"
        maxWidth="500px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--knovara-text-secondary)" }}>
            KNOVARA uses <strong>NEP-413 structured off-chain message signing</strong> for server-authoritative
            authentication. Your private keys are never requested or exposed.
          </p>

          <div className="knovara-alert knovara-alert-info" style={{ margin: 0 }}>
            <strong>Network: </strong> NEAR Testnet. Recommended wallets: <em>Meteor Wallet</em> or <em>MyNearWallet</em>.
          </div>

          {error && <div className="knovara-alert knovara-alert-danger">{error}</div>}

          <form onSubmit={handleExecuteLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
                Target Testnet Account ID (Optional / Auto-detect)
              </label>
              <input
                type="text"
                placeholder="e.g. alice.testnet"
                value={manualAccountId}
                onChange={(e) => setManualAccountId(e.target.value)}
                disabled={isAuthenticating}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                Leave blank to connect directly with your browser wallet provider, or specify an account to initiate challenge.
              </span>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isAuthenticating}
              style={{ marginTop: "8px" }}
            >
              Sign In with NEP-413
            </Button>
          </form>
        </div>
      </Modal>

      <style>{`
        .brand-subtitle { display: none; }
        @media (min-width: 1320px) {
          .brand-subtitle { display: inline-block !important; }
        }
        @media (max-width: 1080px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
        .desktop-nav a:hover {
          color: var(--knovara-blue-primary) !important;
        }
      `}</style>
    </header>
  );
}

