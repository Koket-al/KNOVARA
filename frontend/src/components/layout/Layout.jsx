import React from "react";
import { Header } from "./Header.jsx";
import { Footer } from "./Footer.jsx";

export function Layout({ currentPath, onNavigate, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header currentPath={currentPath} onNavigate={onNavigate} />
      <main className="knovara-container" style={{ flex: 1, padding: "32px 20px" }}>
        {children}
      </main>
      <Footer />
    </div>
  );
}

