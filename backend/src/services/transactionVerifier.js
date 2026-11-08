import { config } from "../config/env.js";
import { ChainTransaction } from "../models/ChainTransaction.js";
import * as nearContract from "./nearContract.js";
import { parseTransactionEvents } from "./eventParser.js";
import { synchronizeState } from "./syncService.js";

/**
 * Approved contract methods permitted for frontend transaction reconciliation.
 */
export const ALLOWED_CONTRACT_METHODS = new Set([
  "register_discovery_and_mint",
  "create_license_offer",
  "deactivate_license_offer",
  "request_license",
  "approve_license_request",
  "reject_license_request",
  "pay_for_license",
  "pay_license",
  "withdraw_earnings",
  "expire_license",
  "expire_license_request",
  "storage_deposit",
  "storage_withdraw",
  "storage_unregister",
]);

/**
 * Validates a base58 NEAR transaction hash.
 * @param {string} hash
 * @returns {boolean}
 */
export function isValidNearTxHash(hash) {
  if (!hash || typeof hash !== "string") return false;
  const clean = hash.trim();
  // NEAR transaction hashes are base58 strings typically 43 to 44 characters
  return /^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(clean);
}

/**
 * Verifies transaction execution on NEAR Testnet and reconciles authoritative on-chain state into MongoDB.
 *
 * @param {string} txHash - Base58 transaction hash
 * @param {string} sessionAccountId - Authenticated user account ID from session
 * @returns {Promise<object>} - Reconciliation summary
 */
export async function verifyAndReconcileTransaction(txHash, sessionAccountId) {
  if (!isValidNearTxHash(txHash)) {
    const err = new Error(`ERR_INVALID_TX_HASH: '${txHash}' is not a valid base58 NEAR transaction hash`);
    err.status = 400;
    err.code = "ERR_INVALID_TX_HASH";
    throw err;
  }

  const cleanTxHash = txHash.trim();
  const contractId = config.NEAR_CONTRACT_ID || "koket-knovara-dev.testnet";

  // 1. Check existing transaction record for idempotency
  let txDoc = await ChainTransaction.findOne({ transaction_hash: cleanTxHash });
  if (txDoc && txDoc.status === "CONFIRMED") {
    // Enforce account ownership
    if (txDoc.signer_account_id !== sessionAccountId) {
      const err = new Error("ERR_FORBIDDEN_TX_OWNERSHIP: You are not authorized to view transactions for another account");
      err.status = 403;
      err.code = "ERR_FORBIDDEN_TX_OWNERSHIP";
      throw err;
    }

    return {
      success: true,
      transactionHash: cleanTxHash,
      status: txDoc.status,
      functionMethod: txDoc.function_method,
      blockHeight: txDoc.block_height,
      events: txDoc.event_summaries,
      cached: true,
    };
  }

  // 2. Query transaction status from NEAR RPC with wait_until: FINAL
  let txResult;
  try {
    txResult = await nearContract.getTransactionStatus(cleanTxHash, sessionAccountId, { waitUntil: "FINAL" });
  } catch (rpcErr) {
    const errStr = String(rpcErr.message || "").toLowerCase();
    // If the transaction is unknown or still in mempool (indexing lag), persist as PENDING
    if (
      errStr.includes("not found") ||
      errStr.includes("unknown_transaction") ||
      errStr.includes("does not exist") ||
      errStr.includes("doesn't exist") ||
      errStr.includes("pending")
    ) {
      await ChainTransaction.findOneAndUpdate(
        { transaction_hash: cleanTxHash },
        {
          $setOnInsert: {
            transaction_hash: cleanTxHash,
            signer_account_id: sessionAccountId,
            receiver_contract_id: contractId,
            function_method: "UNKNOWN",
            status: "PENDING",
            created_at: new Date(),
            synced_at: new Date(),
          },
        },
        { upsert: true }
      );

      return {
        success: false,
        transactionHash: cleanTxHash,
        status: "PENDING",
        message: "Transaction is pending or awaiting indexing on NEAR Testnet RPC",
      };
    }

    throw rpcErr;
  }

  // 3. Verify transaction signer matches authenticated session
  const actualSigner = txResult.transaction?.signer_id;
  if (actualSigner !== sessionAccountId) {
    const err = new Error(`ERR_FORBIDDEN_TX_SIGNER_MISMATCH: Transaction signer '${actualSigner}' does not match session account '${sessionAccountId}'`);
    err.status = 403;
    err.code = "ERR_FORBIDDEN_TX_SIGNER_MISMATCH";
    throw err;
  }

  // 4. Verify transaction receiver is the deployed KNOVARA contract
  const actualReceiver = txResult.transaction?.receiver_id;
  if (actualReceiver !== contractId) {
    const err = new Error(`ERR_INVALID_CONTRACT_RECEIVER: Transaction receiver '${actualReceiver}' does not match KNOVARA contract '${contractId}'`);
    err.status = 400;
    err.code = "ERR_INVALID_CONTRACT_RECEIVER";
    throw err;
  }

  // 5. Verify transaction actions: exactly one FunctionCall action allowed
  const actions = txResult.transaction?.actions;
  if (!Array.isArray(actions) || actions.length !== 1) {
    const count = Array.isArray(actions) ? actions.length : 0;
    const err = new Error(`ERR_INVALID_TRANSACTION_ACTIONS: Transaction must contain exactly one action, found ${count}`);
    err.status = 400;
    err.code = "ERR_INVALID_TRANSACTION_ACTIONS";
    throw err;
  }

  const soleAction = actions[0];
  if (!soleAction || typeof soleAction !== "object" || !soleAction.FunctionCall) {
    const err = new Error("ERR_NO_FUNCTION_CALL_ACTION: Transaction sole action must be a FunctionCall action");
    err.status = 400;
    err.code = "ERR_NO_FUNCTION_CALL_ACTION";
    throw err;
  }

  const functionCallAction = soleAction.FunctionCall;
  const methodName = functionCallAction.method_name;
  if (!ALLOWED_CONTRACT_METHODS.has(methodName)) {
    const err = new Error(`ERR_UNSUPPORTED_CONTRACT_METHOD: Method '${methodName}' is not permitted for reconciliation`);
    err.status = 400;
    err.code = "ERR_UNSUPPORTED_CONTRACT_METHOD";
    throw err;
  }

  // Defense-in-depth: Validate attached deposit against method requirements
  const depositVal = functionCallAction.deposit ?? "0";
  let depositBig;
  try {
    depositBig = BigInt(depositVal);
    if (depositBig < 0n) throw new Error();
  } catch (_e) {
    const err = new Error("ERR_INVALID_ATTACHED_DEPOSIT: Attached deposit is not a valid non-negative integer");
    err.status = 400;
    err.code = "ERR_INVALID_ATTACHED_DEPOSIT";
    throw err;
  }

  if (methodName === "pay_for_license" || methodName === "pay_license") {
    if (depositBig <= 0n) {
      const err = new Error(`ERR_PAYMENT_DEPOSIT_REQUIRED: Method '${methodName}' requires positive attached deposit`);
      err.status = 400;
      err.code = "ERR_PAYMENT_DEPOSIT_REQUIRED";
      throw err;
    }
  } else if (methodName === "storage_deposit") {
    if (depositBig <= 0n) {
      const err = new Error("ERR_STORAGE_DEPOSIT_REQUIRED: Storage deposit requires positive attached deposit");
      err.status = 400;
      err.code = "ERR_STORAGE_DEPOSIT_REQUIRED";
      throw err;
    }
  } else if (methodName === "storage_withdraw" || methodName === "storage_unregister") {
    if (depositBig !== 1n) {
      const err = new Error(`ERR_ONE_YOCTO_REQUIRED: '${methodName}' requires exactly 1 yoctoNEAR attached deposit`);
      err.status = 400;
      err.code = "ERR_ONE_YOCTO_REQUIRED";
      throw err;
    }
  } else if (
    methodName === "create_license_offer" ||
    methodName === "deactivate_license_offer" ||
    methodName === "request_license" ||
    methodName === "approve_license_request" ||
    methodName === "reject_license_request" ||
    methodName === "withdraw_earnings" ||
    methodName === "expire_license" ||
    methodName === "expire_license_request"
  ) {
    if (depositBig !== 0n) {
      const err = new Error(`ERR_NON_PAYABLE_METHOD: Method '${methodName}' does not accept attached deposits`);
      err.status = 400;
      err.code = "ERR_NON_PAYABLE_METHOD";
      throw err;
    }
  }

  // 6. Inspect overall execution outcome and asynchronous receipt outcomes
  let isFailed = false;
  let failureReason = null;

  if (txResult.status && "Failure" in txResult.status) {
    isFailed = true;
    failureReason = JSON.stringify(txResult.status.Failure);
  }

  // Crucial: inspect receipts_outcome for asynchronous promises and callbacks
  const receipts = txResult.receipts_outcome || [];
  for (const r of receipts) {
    if (r.outcome?.status && "Failure" in r.outcome.status) {
      isFailed = true;
      failureReason = JSON.stringify(r.outcome.status.Failure);
      break;
    }
  }

  const blockHeight = txResult.transaction_outcome?.block_height || receipts[0]?.block_height || 0;
  const blockHash = txResult.transaction_outcome?.block_hash || receipts[0]?.block_hash || "";

  // 7. Parse emitted NEP-297 events
  const parsedEvents = parseTransactionEvents(txResult);

  // If transaction or receipts failed: record FAILED immediately and NEVER call synchronizeState
  if (isFailed) {
    await ChainTransaction.findOneAndUpdate(
      { transaction_hash: cleanTxHash },
      {
        $set: {
          transaction_hash: cleanTxHash,
          signer_account_id: sessionAccountId,
          receiver_contract_id: contractId,
          function_method: methodName,
          status: "FAILED",
          error_message: failureReason,
          block_height: blockHeight,
          block_hash: blockHash,
          event_summaries: parsedEvents,
          execution_outcome: txResult.transaction_outcome?.outcome || null,
          receipt_outcomes: receipts,
          synced_at: new Date(),
        },
      },
      { upsert: true }
    );

    return {
      success: false,
      transactionHash: cleanTxHash,
      status: "FAILED",
      functionMethod: methodName,
      error: failureReason,
    };
  }

  // 8. Verify finality execution milestone: require txResult.final_execution_status === "FINAL"
  const finalExecutionStatus = txResult.final_execution_status;
  if (!finalExecutionStatus || finalExecutionStatus !== "FINAL") {
    // Transaction execution is incomplete or pending milestone finality
    await ChainTransaction.findOneAndUpdate(
      { transaction_hash: cleanTxHash },
      {
        $set: {
          transaction_hash: cleanTxHash,
          signer_account_id: sessionAccountId,
          receiver_contract_id: contractId,
          function_method: methodName,
          status: "PENDING",
          block_height: blockHeight,
          block_hash: blockHash,
          execution_outcome: txResult.transaction_outcome?.outcome || null,
          receipt_outcomes: receipts,
          synced_at: new Date(),
        },
      },
      { upsert: true }
    );

    return {
      success: false,
      transactionHash: cleanTxHash,
      status: "PENDING",
      milestone: finalExecutionStatus || "UNKNOWN",
      message: `Transaction execution has not reached FINAL milestone (current: '${finalExecutionStatus || "UNKNOWN"}')`,
    };
  }

  // 9. Synchronize authoritative state to MongoDB projections (ONLY when FINAL and NOT isFailed)
  const syncResult = await synchronizeState({
    methodName,
    txResult,
    events: parsedEvents,
    signerAccountId: sessionAccountId,
  });

  const finalStatus = syncResult.syncStatus === "RECONCILIATION_REQUIRED" ? "RECONCILIATION_REQUIRED" : "CONFIRMED";

  await ChainTransaction.findOneAndUpdate(
    { transaction_hash: cleanTxHash },
    {
      $set: {
        transaction_hash: cleanTxHash,
        signer_account_id: sessionAccountId,
        receiver_contract_id: contractId,
        function_method: methodName,
        status: finalStatus,
        block_height: blockHeight,
        block_hash: blockHash,
        event_summaries: parsedEvents,
        execution_outcome: txResult.transaction_outcome?.outcome || null,
        receipt_outcomes: receipts,
        synced_at: new Date(),
      },
    },
    { upsert: true }
  );

  return {
    success: finalStatus === "CONFIRMED",
    transactionHash: cleanTxHash,
    status: finalStatus,
    functionMethod: methodName,
    blockHeight,
    events: parsedEvents,
    details: syncResult.details,
  };
}
