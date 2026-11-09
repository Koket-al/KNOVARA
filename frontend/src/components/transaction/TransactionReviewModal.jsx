import React, { useState } from "react";
import { Modal } from "../common/Modal.jsx";
import { Button } from "../common/Button.jsx";
import { Badge } from "../common/Badge.jsx";
import { yoctoToNear, formatGasToTgas } from "../../services/formatters.js";
import { api } from "../../services/api.js";
import { executeTransactionIntent } from "../../services/nearWallet.js";

/**
 * TransactionReviewModal
 *
 * Implements strict transaction safety architecture:
 * Displays explanation, exact contract method, exact arguments, exact attached deposit,
 * and exact gas limit. Requires explicit user confirmation.
 * Prompts user wallet for signature, captures transaction hash, and executes server reconciliation.
 */
export function TransactionReviewModal({
  isOpen,
  onClose,
  intent,
  title = "Review Transaction Intent",
  explanation,
  onReconcileSuccess,
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [txHashInput, setTxHashInput] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [reconcileError, setReconcileError] = useState(null);
  const [showRawArgs, setShowRawArgs] = useState(false);

  if (!intent) return null;

  const depositNear = yoctoToNear(intent.attachedDeposit || "0", 6);
  const gasTgas = formatGasToTgas(intent.gas || "30000000000000");

  const handleSignAndBroadcast = async () => {
    try {
      setIsBroadcasting(true);
      setReconcileError(null);
      const { txHash } = await executeTransactionIntent(intent);
      setTxHashInput(txHash);

      setIsBroadcasting(false);
      setIsReconciling(true);
      const res = await api.reconcileTransaction(txHash);
      setReconcileResult(res);
      if (onReconcileSuccess) {
        onReconcileSuccess(res);
      }
    } catch (err) {
      setReconcileError(err.message || "Transaction broadcast or reconciliation failed");
    } finally {
      setIsBroadcasting(false);
      setIsReconciling(false);
    }
  };

  const handleReconcile = async (hashToUse = null) => {
    const hash = typeof hashToUse === "string" ? hashToUse : txHashInput.trim();
    if (!hash) return;
    try {
      setIsReconciling(true);
      setReconcileError(null);
      const res = await api.reconcileTransaction(hash);
      setReconcileResult(res);
      if (onReconcileSuccess) {
        onReconcileSuccess(res);
      }
    } catch (err) {
      setReconcileError(err.message || "Reconciliation failed");
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="680px"
      footer={
        <div style={{ display: "flex", gap: "10px", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)" }}>
            Transactions require manual wallet confirmation
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {explanation && (
          <div className="knovara-alert knovara-alert-info" style={{ margin: 0 }}>
            <strong>Action Purpose: </strong>
            <span>{explanation}</span>
          </div>
        )}

        {/* Transaction Summary Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "12px",
            backgroundColor: "var(--knovara-surface)",
            padding: "16px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--knovara-border)",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Target Contract
            </div>
            <code style={{ fontSize: "0.875rem", fontWeight: 600 }}>{intent.contractId}</code>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Method Name
            </div>
            <Badge variant="blue">{intent.methodName}</Badge>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Attached Deposit
            </div>
            <div style={{ fontWeight: 700, color: "var(--knovara-blue-primary)" }}>
              {depositNear} NEAR
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", fontFamily: "var(--font-mono)" }}>
              ({intent.attachedDeposit || "0"} yoctoNEAR)
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--knovara-text-muted)" }}>
              Attached Gas Limit
            </div>
            <div style={{ fontWeight: 700 }}>{gasTgas}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)", fontFamily: "var(--font-mono)" }}>
              ({intent.gas || "30000000000000"} gas units)
            </div>
          </div>
        </div>

        {/* Arguments Accordion */}
        <div>
          <button
            type="button"
            onClick={() => setShowRawArgs(!showRawArgs)}
            style={{
              background: "none",
              border: "none",
              color: "var(--knovara-blue-primary)",
              cursor: "pointer",
              fontSize: "0.8125rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {showRawArgs ? "▼ Hide Exact JSON Payload" : "▶ View Exact JSON Payload"}
          </button>

          {showRawArgs && (
            <pre
              style={{
                marginTop: "8px",
                padding: "12px",
                backgroundColor: "#1C1917",
                color: "#E9E1CD",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.75rem",
                overflowX: "auto",
                maxHeight: "200px",
              }}
            >
              {JSON.stringify(intent.args, null, 2)}
            </pre>
          )}
        </div>

        {/* User Confirmation Step */}
        <div
          style={{
            backgroundColor: "var(--knovara-surface-card)",
            padding: "14px",
            border: "1px solid var(--knovara-border-strong)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ width: "18px", height: "18px", marginTop: "2px" }}
            />
            <span style={{ fontSize: "0.8125rem", color: "var(--knovara-text-primary)" }}>
              <strong>Verification Confirmation: </strong> I have inspected the contract method, exact arguments,
              attached deposit, and gas parameters. Transactions must be reviewed before wallet signing.
            </span>
          </label>
        </div>

        {/* 1-Click Wallet Sign & Broadcast Action */}
        <div>
          <Button
            variant="primary"
            size="lg"
            disabled={!confirmed || isBroadcasting || isReconciling}
            isLoading={isBroadcasting || isReconciling}
            onClick={handleSignAndBroadcast}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {isBroadcasting
              ? "Awaiting Wallet Signature..."
              : isReconciling
              ? "Synchronizing On-Chain State..."
              : "Sign & Broadcast with Connected NEAR Wallet"}
          </Button>
          <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--knovara-text-muted)", marginTop: "6px" }}>
            Prompts your connected wallet (Meteor, MyNearWallet, etc.) to approve the transaction.
          </div>
        </div>

        {/* Manual Reconciliation Section (Fallback) */}
        <div style={{ borderTop: "1px solid var(--knovara-border)", paddingTop: "16px" }}>
          <h4 style={{ fontSize: "0.875rem", marginBottom: "6px", color: "var(--knovara-text-secondary)" }}>
            Manual Transaction Hash Reconciliation (Optional Fallback)
          </h4>
          <p style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)", marginBottom: "12px" }}>
            If you already signed and broadcast this transaction externally (or via NEAR CLI), paste the resulting
            Base58 transaction hash below to synchronize state:
          </p>

          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              placeholder="e.g. 7Nxk... (Base58 NEAR Transaction Hash)"
              value={txHashInput}
              onChange={(e) => setTxHashInput(e.target.value)}
              disabled={isReconciling || isBroadcasting}
              style={{ flex: 1 }}
            />
            <Button
              variant="secondary"
              disabled={!txHashInput.trim() || isReconciling || isBroadcasting}
              isLoading={isReconciling}
              onClick={() => handleReconcile()}
            >
              Reconcile
            </Button>
          </div>

          {reconcileError && (
            <div className="knovara-alert knovara-alert-danger" style={{ marginTop: "12px", marginBottom: 0 }}>
              {reconcileError}
            </div>
          )}

          {reconcileResult && (
            <div className="knovara-alert knovara-alert-success" style={{ marginTop: "12px", marginBottom: 0 }}>
              <strong>Status: </strong>
              <span>{reconcileResult.status}</span>
              {reconcileResult.blockHeight && (
                <div>Block Height: {reconcileResult.blockHeight}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

