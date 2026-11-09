import React from "react";

export function LoadingSpinner({ message = "Loading cryptographic records...", className = "" }) {
  return (
    <div className={`flex-center ${className}`} style={{ padding: "48px 24px", flexDirection: "column", gap: "16px" }}>
      <div
        style={{
          width: "36px",
          height: "36px",
          border: "3px solid var(--knovara-border)",
          borderTopColor: "var(--knovara-blue-primary)",
          borderRadius: "50%",
          animation: "knovara-spin 0.8s linear infinite",
        }}
      />
      {message && <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem" }}>{message}</p>}
      <style>{`
        @keyframes knovara-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

