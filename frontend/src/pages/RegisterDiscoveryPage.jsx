import React, { useState } from "react";
import { Card } from "../components/common/Card.jsx";
import { Button } from "../components/common/Button.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LegalDisclaimer } from "../components/common/LegalDisclaimer.jsx";
import { ErrorAlert } from "../components/common/ErrorAlert.jsx";
import { EvidenceUploader } from "../components/evidence/EvidenceUploader.jsx";
import { TransactionReviewModal } from "../components/transaction/TransactionReviewModal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";

const CATEGORIES = [
  "COMPUTER_SCIENCE",
  "IMMUNOLOGY",
  "BIOTECHNOLOGY",
  "PHYSICS",
  "CHEMISTRY",
  "ENGINEERING",
  "MEDICINE",
  "OTHER",
];

export function RegisterDiscoveryPage({ onNavigate }) {
  const { user, isAuthenticated, loginWithWallet } = useAuth();

  // Form State
  const [discoveryId, setDiscoveryId] = useState(`disc-${Date.now().toString(36)}`);
  const [tokenId, setTokenId] = useState(`token-${Date.now().toString(36)}`);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("BIOTECHNOLOGY");
  const [licenseTerms, setLicenseTerms] = useState("Standard KNOVARA Academic and Research Evaluation Terms");

  const [custodianId, setCustodianId] = useState("");
  const [rightsControllerId, setRightsControllerId] = useState("");

  // Auto-populate accounts once authenticated
  React.useEffect(() => {
    if (user?.accountId) {
      if (!custodianId) setCustodianId(user.accountId);
      if (!rightsControllerId) setRightsControllerId(user.accountId);
    }
  }, [user, custodianId, rightsControllerId]);

  // Beneficiary splits
  const [splits, setSplits] = useState([
    { account_id: user?.accountId || "", basis_points: 10000 },
  ]);

  // Verified evidence uploads
  const [verifiedUploads, setVerifiedUploads] = useState([]);

  // Preparation & Intent State
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepError, setPrepError] = useState(null);
  const [preparedPayload, setPreparedPayload] = useState(null);
  const [pendingIntent, setPendingIntent] = useState(null);

  const totalBps = splits.reduce((sum, s) => sum + (Number(s.basis_points) || 0), 0);

  const handleAddSplit = () => {
    setSplits([...splits, { account_id: "", basis_points: 0 }]);
  };

  const handleUpdateSplit = (idx, field, val) => {
    const updated = [...splits];
    updated[idx][field] = field === "basis_points" ? Number(val) : val;
    setSplits(updated);
  };

  const handleRemoveSplit = (idx) => {
    if (splits.length <= 1) return;
    setSplits(splits.filter((_, i) => i !== idx));
  };

  const handlePrepareRegistration = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      setPrepError("You must connect your NEAR wallet before preparing registration");
      return;
    }

    if (totalBps !== 10000) {
      setPrepError(`Beneficiary splits must sum to exactly 10,000 basis points (current sum: ${totalBps})`);
      return;
    }

    if (verifiedUploads.length === 0) {
      setPrepError("At least one verified supporting evidence file is required");
      return;
    }

    try {
      setIsPreparing(true);
      setPrepError(null);

      // Call backend prepare-registration
      const prepRes = await api.prepareDiscoveryRegistration({
        discoveryId: discoveryId.trim(),
        tokenId: tokenId.trim(),
        custodianId: (custodianId || user.accountId).trim(),
        rightsControllerId: (rightsControllerId || user.accountId).trim(),
        evidenceUploadIds: verifiedUploads.map((u) => u.uploadId),
        publicMetadata: {
          title: title.trim(),
          description: description.trim(),
          category,
          license_terms: licenseTerms.trim(),
        },
        beneficiarySplits: splits.map((s) => ({
          account_id: s.account_id.trim().toLowerCase(),
          basis_points: Number(s.basis_points),
        })),
      });

      setPreparedPayload(prepRes);

      // Prepare client transaction intent for register_discovery_and_mint
      const intent = await api.prepareTransactionIntent("register-discovery", {
        discoveryId: prepRes.discovery_id,
        tokenId: prepRes.token_id,
        custodianId: prepRes.custodian_id,
        rightsControllerId: prepRes.rights_controller_id,
        evidenceManifestHash: prepRes.evidence_manifest_hash,
        metadata: prepRes.metadata,
        beneficiarySplits: prepRes.beneficiary_splits,
      });

      setPendingIntent(intent);
    } catch (err) {
      setPrepError(err.message || "Failed to prepare discovery registration");
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "2rem" }}>Register New Discovery</h1>
        <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginTop: "4px" }}>
          Anchor technical discovery priority, establish non-transferable soulbound rights, and generate verified manifests.
        </p>
      </div>

      <LegalDisclaimer />

      {!isAuthenticated && (
        <div className="knovara-alert knovara-alert-warning flex-between">
          <span>You must connect an active NEAR Testnet wallet to register a discovery.</span>
          <Button variant="primary" size="sm" onClick={() => loginWithWallet()}>
            Connect Wallet
          </Button>
        </div>
      )}

      {prepError && <ErrorAlert message={prepError} onDismiss={() => setPrepError(null)} />}

      <form onSubmit={handlePrepareRegistration} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Step 1: Discovery Information */}
        <Card title="1. Discovery & Public Metadata" subtitle="Public information indexed in the cryptographic catalog">
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
                  Discovery Identifier
                </label>
                <input
                  type="text"
                  value={discoveryId}
                  onChange={(e) => setDiscoveryId(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
                  NFT Token Identifier
                </label>
                <input
                  type="text"
                  value={tokenId}
                  onChange={(e) => setTokenId(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
                Discovery Title
              </label>
              <input
                type="text"
                placeholder="e.g. mRNA Sequence Candidate for Respiratory Syncytial Virus"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
                  Category
                </label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
                  License Terms Description
                </label>
                <input
                  type="text"
                  value={licenseTerms}
                  onChange={(e) => setLicenseTerms(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
                Technical Abstract / Public Summary
              </label>
              <textarea
                rows={3}
                placeholder="Describe the scientific or technical achievement, experimental methodology, and potential applications..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
          </div>
        </Card>

        {/* Step 2: Role Separation */}
        <Card title="2. Ecosystem Roles" subtitle="Decoupling Custodianship from Licensing Authority">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
                Custodian (Passport NFT Holder)
              </label>
              <input
                type="text"
                placeholder="e.g. alice.testnet"
                value={custodianId}
                onChange={(e) => setCustodianId(e.target.value)}
                required
              />
              <span style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                The legal or academic entity holding the soulbound registry record.
              </span>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
                Rights Controller (Licensing Authority)
              </label>
              <input
                type="text"
                placeholder="e.g. alice.testnet"
                value={rightsControllerId}
                onChange={(e) => setRightsControllerId(e.target.value)}
                required
              />
              <span style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                The account empowered to create offers and approve or reject license requests.
              </span>
            </div>
          </div>
        </Card>

        {/* Step 3: Royalty Beneficiary Splits */}
        <Card
          title="3. Royalty Beneficiary Distribution"
          subtitle="Strictly 10,000 Basis Points (100.00%) required"
          action={
            <Button variant="secondary" size="sm" onClick={handleAddSplit}>
              + Add Beneficiary
            </Button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {splits.map((split, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "12px", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="NEAR Account ID (e.g. lab.testnet)"
                  value={split.account_id}
                  onChange={(e) => handleUpdateSplit(idx, "account_id", e.target.value)}
                  required
                />
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    placeholder="Basis Points (1-10000)"
                    value={split.basis_points}
                    onChange={(e) => handleUpdateSplit(idx, "basis_points", e.target.value)}
                    required
                  />
                  <span style={{ fontSize: "0.8125rem", minWidth: "60px", color: "var(--knovara-text-secondary)" }}>
                    ({(split.basis_points / 100).toFixed(2)}%)
                  </span>
                </div>
                {splits.length > 1 && (
                  <Button variant="outline" size="sm" onClick={() => handleRemoveSplit(idx)}>
                    &times;
                  </Button>
                )}
              </div>
            ))}

            <div
              className="flex-between"
              style={{
                marginTop: "8px",
                padding: "8px 12px",
                backgroundColor: totalBps === 10000 ? "var(--knovara-status-success-bg)" : "var(--knovara-status-warning-bg)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <span>Total Basis Points Sum: <strong>{totalBps} / 10,000</strong></span>
              <Badge variant={totalBps === 10000 ? "success" : "warning"}>
                {totalBps === 10000 ? "BALANCED (100.00%)" : "MISMATCH"}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Step 4: Supporting Evidence Uploads */}
        <Card title="4. Private Evidence Files" subtitle="Direct upload to encrypted R2 storage">
          <EvidenceUploader
            verifiedUploads={verifiedUploads}
            onEvidenceListChange={setVerifiedUploads}
          />
        </Card>

        {/* Action Button */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!isAuthenticated || totalBps !== 10000 || verifiedUploads.length === 0 || isPreparing}
            isLoading={isPreparing}
          >
            Review & Prepare On-Chain Registration &rarr;
          </Button>
        </div>
      </form>

      {/* Prepared Registration Review Modal */}
      <TransactionReviewModal
        isOpen={Boolean(pendingIntent)}
        onClose={() => setPendingIntent(null)}
        intent={pendingIntent}
        title="Confirm Discovery Registration Intent"
        explanation="Registers this discovery on NEAR Testnet and mints the non-transferable soulbound NEP-171 Passport NFT."
        onReconcileSuccess={(res) => {
          onNavigate(`/discoveries/${encodeURIComponent(discoveryId)}`);
        }}
      />
    </div>
  );
}
