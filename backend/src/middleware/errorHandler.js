import { KeyNotEligibleError, RpcCommunicationError } from "../services/nearRpc.js";

/**
 * Centralized error handler returning consistent, secure JSON responses.
 * Never leaks stack traces or cryptographic implementation internals to unauthenticated users.
 */
export function errorHandler(err, req, res, _next) {
  const rawCode = err.code || err.message || "ERR_INTERNAL_SERVER_ERROR";
  const code = rawCode.includes(":") ? rawCode.split(":")[0].trim() : rawCode;

  // Authorization / Signature rejections
  if (
    code.startsWith("ERR_AUTH_") ||
    code.startsWith("ERR_INVALID_") ||
    code.startsWith("ERR_MISSING_")
  ) {
    if (code === "ERR_AUTH_NONCE_INVALID_OR_ALREADY_USED" || code === "ERR_AUTH_CHALLENGE_EXPIRED") {
      return res.status(401).json({
        error: "Authentication challenge is invalid, already consumed, or expired",
        code,
      });
    }

    if (code === "ERR_INVALID_SIGNATURE" || code.startsWith("ERR_INVALID_SIGNATURE")) {
      return res.status(401).json({
        error: "Cryptographic signature verification failed",
        code: "ERR_INVALID_SIGNATURE",
      });
    }

    if (code === "ERR_AUTH_CSRF_STATE_MISMATCH") {
      return res.status(403).json({
        error: "CSRF state mismatch detected",
        code,
      });
    }

    if (code === "ERR_AUTH_ACCOUNT_MISMATCH") {
      return res.status(403).json({
        error: "Signer account does not match requested challenge account",
        code,
      });
    }

    return res.status(400).json({
      error: err.message,
      code,
    });
  }

  // Key eligibility on-chain rejection
  if (err instanceof KeyNotEligibleError || code.startsWith("ERR_KEY_")) {
    return res.status(403).json({
      error: "Wallet key is not eligible: FullAccess permission on NEAR is required",
      code,
    });
  }

  // RPC communication failures
  if (err instanceof RpcCommunicationError || code.startsWith("ERR_NEAR_RPC_")) {
    return res.status(503).json({
      error: "NEAR blockchain network service temporarily unavailable, please retry",
      code: "ERR_BLOCKCHAIN_UNAVAILABLE",
    });
  }

  // Default server error
  const status = err.status || 500;
  return res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
    code: status === 500 ? "ERR_INTERNAL_SERVER_ERROR" : code,
  });
}
