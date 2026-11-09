import React, { useState, useEffect, useCallback } from "react";
import { Card } from "../components/common/Card.jsx";
import { Button } from "../components/common/Button.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LoadingSpinner } from "../components/common/LoadingSpinner.jsx";
import { ErrorAlert } from "../components/common/ErrorAlert.jsx";
import { TransactionReviewModal } from "../components/transaction/TransactionReviewModal.jsx";
import { yoctoToNear, nearToYocto, formatDate } from "../services/formatters.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";

export function AccountPage({ onNavigate }) {
  const { user, isAuthenticated, loginWithWallet } = useAuth();

  const [storageData, setStorageData] = useState(null);
  const [royaltyData, setRoyaltyData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Storage deposit form
  const [depositNearInput, setDepositNearInput] = useState("0.0027");

  // Transaction Lookup
  const [lookupTxHash, setLookupTxHash] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState(null);

  // Intent modal
  const [pendingIntent, setPendingIntent] = useState(null);
  const [intentExplanation, setIntentExplanation] = useState("");

  const fetchAccountData = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const [storageRes, royaltyRes] = await Promise.all([
        api.getAccountStorage(),
        api.getAccountRoyalties(),
      ]);
      setStorageData(storageRes);
      setRoyaltyData(royaltyRes);
    } catch (err) {
      setError(err.message || "Failed to load account balances");
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchAccountData();
  }, [fetchAccountData]);

  if (!isAuthenticated) {
    return (
      <Card style={{ padding: "48px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>Authentication Required</h2>
        <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginBottom: "20px" }}>
          Please connect your NEAR Testnet wallet to manage account storage and claimable royalty balances.
        </p>
        <Button variant="primary" onClick={() => loginWithWallet()}>
          Connect NEAR Wallet
        </Button>
      </Card>
    );
  }

  // Handle Storage Deposit Intent
  const handlePrepareStorageDeposit = async (e) => {
    e?.preventDefault();
    try {
      setError(null);
      const amountYocto = nearToYocto(depositNearInput);
      const intent = await api.prepareTransactionIntent("storage-deposit", {
        accountId: user.accountId,
        amountYocto,
        registrationOnly: false,
      });
      setIntentExplanation(`Deposits ${depositNearInput} NEAR to cover account on-chain storage requirements.`);
      setPendingIntent(intent);
    } catch (err) {
      setError(err.message || "Failed to prepare storage deposit intent");
    }
  };

  // Handle Withdraw Earnings Intent
  const handlePrepareWithdrawEarnings = async () => {
    try {
      setError(null);
      const intent = await api.prepareTransactionIntent("withdraw-earnings", {
        context: { accountId: user.accountId },
      });
      setIntentExplanation(
        `Withdraws claimable earnings (${yoctoToNear(royaltyData?.claimableBalanceYocto || "0")} NEAR) to your wallet via pull-payment pattern.`
      );
      setPendingIntent(intent);
    } catch (err) {
      setError(err.message || "Failed to prepare earnings withdrawal intent");
    }
  };

  // Handle Transaction Status Lookup
  const handleLookupTx = async (e) => {
    e.preventDefault();
    if (!lookupTxHash.trim()) return;
    try {
      setIsLookingUp(true);
      setLookupError(null);
      const res = await api.getTransactionStatus(lookupTxHash.trim());
      setLookupResult(res);
    } catch (err) {
      setLookupError(err.message || "Transaction reconciliation record not found");
      setLookupResult(null);
    } finally {
      setIsLookingUp(false);
    }
  };

  const claimableNear = yoctoToNear(royaltyData?.claimableBalanceYocto || "0", 6);
  const pendingNear = yoctoToNear(royaltyData?.pendingWithdrawalsYocto || "0", 6);

  const totalStorageNear = storageData?.storageBalance
    ? yoctoToNear(storageData.storageBalance.total, 6)
    : "0";
  const availableStorageNear = storageData?.storageBalance
    ? yoctoToNear(storageData.storageBalance.available, 6)
    : "0";
  const minStorageNear = storageData?.bounds?.min
    ? yoctoToNear(storageData.bounds.min, 6)
    : "0.0027";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="flex-between" style={{ flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "2rem" }}>Account & Financial Management</h1>
          <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginTop: "4px" }}>
            Authoritative NEAR Testnet storage balances, royalty claimables, and transaction reconciliation.
          </p>
        </div>

        <Badge variant="blue" style={{ fontSize: "0.875rem", padding: "6px 12px" }}>
          {user.accountId}
        </Badge>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {isLoading ? (
        <LoadingSpinner message="Querying live contract storage and royalty balances..." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Top Balances Grid */}
          <div className="knovara-grid-2">
            {/* NEP-145 Storage Balance Card */}
            <Card
              title="NEP-145 Storage Accounting"
              subtitle="Required for dependency counters, roles, and licensing records"
              action={
                <Badge variant={storageData?.isRegistered ? "success" : "warning"}>
                  {storageData?.isRegistered ? "REGISTERED" : "UNREGISTERED"}
                </Badge>
              }
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
                      Total Storage Balance
                    </div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{totalStorageNear} NEAR</div>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
                      Available (Unreserved)
                    </div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--knovara-blue-primary)" }}>
                      {availableStorageNear} NEAR
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)" }}>
                  Protocol minimum storage deposit: <code>{minStorageNear} NEAR</code>. Unused available storage is fully
                  refundable upon unregistration when dependency counters reach zero.
                </div>

                {/* Storage Deposit Form */}
                <form
                  onSubmit={handlePrepareStorageDeposit}
                  style={{
                    backgroundColor: "var(--knovara-surface)",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--knovara-border)",
                    display: "flex",
                    gap: "10px",
                    alignItems: "center",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "2px" }}>
                      Deposit Amount (NEAR)
                    </label>
                    <input
                      type="text"
                      value={depositNearInput}
                      onChange={(e) => setDepositNearInput(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" variant="primary" size="sm" style={{ alignSelf: "flex-end" }}>
                    Prepare Deposit
                  </Button>
                </form>
              </div>
            </Card>

            {/* Claimable Royalties Card */}
            <Card
              title="Royalty Earnings (Pull-Payment)"
              subtitle="Guaranteed solvency & asynchronous withdrawal architecture"
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
                      Claimable Balance
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--knovara-status-success)" }}>
                      {claimableNear} NEAR
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
                      Pending Transfers
                    </div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--knovara-text-muted)" }}>
                      {pendingNear} NEAR
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)" }}>
                  Earnings from approved and paid licensing agreements allocated to your account. Withdrawn directly to
                  your NEAR wallet.
                </div>

                <Button
                  variant="primary"
                  onClick={handlePrepareWithdrawEarnings}
                  disabled={!royaltyData || royaltyData.claimableBalanceYocto === "0"}
                >
                  Withdraw Claimable Earnings ({claimableNear} NEAR) &rarr;
                </Button>
              </div>
            </Card>
          </div>

          {/* Transaction Reconciliation & Verification Lookup */}
          <Card
            title="Transaction Status & Reconciliation Inspector"
            subtitle="Verify and inspect on-chain execution status for any KNOVARA transaction"
          >
            <form onSubmit={handleLookupTx} style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <input
                type="text"
                placeholder="Enter Base58 transaction hash (e.g. 7Nxk...)"
                value={lookupTxHash}
                onChange={(e) => setLookupTxHash(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button type="submit" variant="secondary" isLoading={isLookingUp} disabled={!lookupTxHash.trim()}>
                Inspect Transaction
              </Button>
            </form>

            {lookupError && <ErrorAlert message={lookupError} onDismiss={() => setLookupError(null)} />}

            {lookupResult && (
              <div
                style={{
                  backgroundColor: "var(--knovara-surface)",
                  padding: "16px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--knovara-border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  fontSize: "0.8125rem",
                }}
              >
                <div className="flex-between">
                  <span style={{ fontWeight: 700 }}>Transaction Hash: {lookupResult.transactionHash}</span>
                  <Badge variant={lookupResult.status === "CONFIRMED" ? "success" : "warning"}>
                    {lookupResult.status}
                  </Badge>
                </div>

                <div>Method Called: <code>{lookupResult.functionMethod}</code></div>
                <div>Block Height: <strong>{lookupResult.blockHeight || "—"}</strong></div>
                <div>Receiver: <code>{lookupResult.receiverContractId}</code></div>
                <div>Signer: <code>{lookupResult.signerAccountId}</code></div>
                {lookupResult.syncedAt && <div>Synchronized At: {formatDate(lookupResult.syncedAt)}</div>}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Transaction Intent Modal */}
      <TransactionReviewModal
        isOpen={Boolean(pendingIntent)}
        onClose={() => setPendingIntent(null)}
        intent={pendingIntent}
        explanation={intentExplanation}
        onReconcileSuccess={() => {
          setPendingIntent(null);
          fetchAccountData();
        }}
      />
    </div>
  );
}
