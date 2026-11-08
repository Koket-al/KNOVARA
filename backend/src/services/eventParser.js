export const NEP171_STANDARD = "nep171";
export const NEP171_VERSION = "1.2.0";

export const KNOVARA_LICENSING_STANDARD = "knovara_licensing";
export const KNOVARA_LICENSING_VERSION = "1.0.0";

export const SUPPORTED_STANDARDS = new Set([NEP171_STANDARD, KNOVARA_LICENSING_STANDARD]);

export const SUPPORTED_EVENT_NAMES = new Set([
  "nft_mint",
  "license_offer_created",
  "license_offer_deactivated",
  "license_requested",
  "license_approved",
  "license_rejected",
  "license_paid",
  "license_activated",
  "royalties_allocated",
  "royalty_withdrawal_initiated",
  "royalty_withdrawn",
  "royalty_withdrawal_failed",
  "license_expired",
  "license_request_expired",
]);

/**
 * Parses and validates a single log line according to NEP-297 event standards.
 *
 * @param {string} logLine - Raw log entry from contract execution
 * @returns {object|null} - Parsed and validated event object, or null if line is not a valid event
 */
export function parseEventLogLine(logLine) {
  if (!logLine || typeof logLine !== "string") {
    return null;
  }

  const prefix = "EVENT_JSON:";
  const idx = logLine.indexOf(prefix);
  if (idx === -1) {
    return null;
  }

  const jsonStr = logLine.substring(idx + prefix.length).trim();
  if (!jsonStr) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (_e) {
    return null; // Malformed JSON in log
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const { standard, version, event, data } = parsed;

  if (!standard || typeof standard !== "string" || !SUPPORTED_STANDARDS.has(standard)) {
    return null;
  }

  if (!event || typeof event !== "string" || !SUPPORTED_EVENT_NAMES.has(event)) {
    return null;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  // Version enforcement
  if (standard === NEP171_STANDARD && version !== NEP171_VERSION) {
    return null;
  }

  if (standard === KNOVARA_LICENSING_STANDARD && version !== KNOVARA_LICENSING_VERSION) {
    return null;
  }

  // Schema-level validation for data elements
  const validatedData = [];
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    if (event === "nft_mint") {
      if (!item.owner_id || !Array.isArray(item.token_ids) || item.token_ids.length === 0) {
        return null;
      }
    } else if (event === "license_offer_created") {
      if (!item.offer_id || !item.discovery_id || !item.rights_controller_id || !item.price_yocto) {
        return null;
      }
    } else if (event === "license_offer_deactivated") {
      if (!item.offer_id || !item.discovery_id || !item.rights_controller_id) {
        return null;
      }
    } else if (event === "license_requested") {
      if (!item.request_id || !item.offer_id || !item.discovery_id || !item.buyer_id) {
        return null;
      }
    } else if (event === "license_approved" || event === "license_rejected") {
      if (!item.request_id || !item.offer_id || !item.discovery_id || !item.buyer_id || !item.rights_controller_id) {
        return null;
      }
    } else if (event === "license_paid" || event === "license_activated") {
      if (!item.request_id || !item.discovery_id || !item.buyer_id) {
        return null;
      }
    } else if (event === "royalties_allocated") {
      if (!item.request_id || !item.discovery_id || item.total_amount === undefined) {
        return null;
      }
    } else if (
      event === "royalty_withdrawal_initiated" ||
      event === "royalty_withdrawn" ||
      event === "royalty_withdrawal_failed"
    ) {
      if (!item.beneficiary_id || item.amount === undefined) {
        return null;
      }
    } else if (event === "license_expired" || event === "license_request_expired") {
      if (!item.request_id || !item.discovery_id || !item.buyer_id) {
        return null;
      }
    }

    validatedData.push(item);
  }

  return {
    standard,
    version,
    event,
    data: validatedData,
  };
}

/**
 * Extracts and parses all valid NEP-297 events from a NEAR transaction execution result,
 * inspecting both initial transaction outcome and all receipt execution outcomes.
 *
 * @param {object} txResult - NEAR RPC transaction status response
 * @returns {Array<object>} - Array of parsed and validated event objects with receipt context
 */
export function parseTransactionEvents(txResult) {
  if (!txResult || typeof txResult !== "object") {
    return [];
  }

  const events = [];

  // 1. Transaction outcome logs
  const txLogs = txResult.transaction_outcome?.outcome?.logs || [];
  for (const log of txLogs) {
    const parsed = parseEventLogLine(log);
    if (parsed) {
      events.push({
        ...parsed,
        source: "transaction_outcome",
      });
    }
  }

  // 2. Receipt outcomes logs (where contract function call events are logged)
  const receipts = txResult.receipts_outcome || [];
  for (const r of receipts) {
    const receiptId = r.id;
    const executorId = r.outcome?.executor_id;
    const logs = r.outcome?.logs || [];

    for (const log of logs) {
      const parsed = parseEventLogLine(log);
      if (parsed) {
        events.push({
          ...parsed,
          receipt_id: receiptId,
          executor_id: executorId,
          source: "receipt_outcome",
        });
      }
    }
  }

  return events;
}

