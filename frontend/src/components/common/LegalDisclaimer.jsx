import React from "react";

export function LegalDisclaimer({ className = "" }) {
  return (
    <aside className={`knovara-legal-banner ${className}`} role="note" aria-label="Legal & Cryptographic Notice">
      <strong>CRITICAL LEGAL & CRYPTOGRAPHIC REGISTRY NOTICE:</strong> A KNOVARA Discovery Rights Passport is a
      cryptographic registry record that anchors priority, evidence hashes, and licensing terms on NEAR Protocol. It
      does <em>not</em> constitute a government-granted patent, trademark, or proof of legal ownership, inventorship,
      or absolute patent validity.
    </aside>
  );
}

