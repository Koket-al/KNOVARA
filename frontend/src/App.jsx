import React, { useState, useEffect } from "react";
import { AuthProvider } from "./context/AuthContext.jsx";
import { Layout } from "./components/layout/Layout.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { DiscoveriesPage } from "./pages/DiscoveriesPage.jsx";
import { DiscoveryDetailPage } from "./pages/DiscoveryDetailPage.jsx";
import { PassportDetailPage } from "./pages/PassportDetailPage.jsx";
import { RegisterDiscoveryPage } from "./pages/RegisterDiscoveryPage.jsx";
import { MarketplacePage } from "./pages/MarketplacePage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { MyDiscoveriesPage } from "./pages/MyDiscoveriesPage.jsx";
import { LicensesPage } from "./pages/LicensesPage.jsx";
import { AccountPage } from "./pages/AccountPage.jsx";
import { ErrorBoundary } from "./components/common/ErrorBoundary.jsx";

export function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    return typeof window !== "undefined" ? window.location.pathname : "/";
  });

  // Listen to browser popstate (back/forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleNavigate = (path) => {
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", path);
      window.scrollTo(0, 0);
    }
    setCurrentPath(path);
  };

  // Route matcher
  const renderRoute = () => {
    const path = currentPath;

    if (path === "/" || path === "") {
      return <HomePage onNavigate={handleNavigate} />;
    }

    if (path === "/discoveries") {
      return <DiscoveriesPage onNavigate={handleNavigate} />;
    }

    // Match /discoveries/:discoveryId/passport
    const passportMatch = path.match(/^\/discoveries\/([^/]+)\/passport$/);
    if (passportMatch) {
      const discoveryId = decodeURIComponent(passportMatch[1]);
      return <PassportDetailPage discoveryId={discoveryId} onNavigate={handleNavigate} />;
    }

    // Match /discoveries/:discoveryId
    const discoveryDetailMatch = path.match(/^\/discoveries\/([^/]+)$/);
    if (discoveryDetailMatch) {
      const discoveryId = decodeURIComponent(discoveryDetailMatch[1]);
      return <DiscoveryDetailPage discoveryId={discoveryId} onNavigate={handleNavigate} />;
    }

    if (path === "/register") {
      return <RegisterDiscoveryPage onNavigate={handleNavigate} />;
    }

    if (path === "/marketplace") {
      return <MarketplacePage onNavigate={handleNavigate} />;
    }

    if (path === "/dashboard") {
      return <DashboardPage onNavigate={handleNavigate} />;
    }

    if (path === "/my-discoveries") {
      return <MyDiscoveriesPage onNavigate={handleNavigate} />;
    }

    if (path === "/licenses") {
      return <LicensesPage onNavigate={handleNavigate} />;
    }

    if (path === "/account") {
      return <AccountPage onNavigate={handleNavigate} />;
    }

    // 404 Fallback
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.75rem", marginBottom: "8px" }}>Page Not Found</h2>
        <p style={{ color: "var(--knovara-text-secondary)", marginBottom: "20px" }}>
          The requested page <code>{path}</code> does not exist.
        </p>
        <button
          type="button"
          className="knovara-btn knovara-btn-primary"
          onClick={() => handleNavigate("/")}
        >
          Return to Home
        </button>
      </div>
    );
  };

  return (
    <AuthProvider>
      <Layout currentPath={currentPath} onNavigate={handleNavigate}>
        <ErrorBoundary>
          {renderRoute()}
        </ErrorBoundary>
      </Layout>
    </AuthProvider>
  );
}

export default App;

