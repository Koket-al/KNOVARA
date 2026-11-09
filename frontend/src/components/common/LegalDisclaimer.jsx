import React from "react";

export function LegalDisclaimer({ className = "" }) {
  return (
    <aside className={`knovara-legal-banner ${className}`} role="note" aria-label="Legal & Cryptographic Notice">
      <strong>CRITICAL LEGAL & CRYPTOGRAPHIC REGISTRY NOTICE:</strong> A KNOVARA Discovery Rights Passport is a
      cryptographic registry record that anchors priority on NEAR. It does not replace a government-granted patent or legal trademark.
    </aside>
  );
}
