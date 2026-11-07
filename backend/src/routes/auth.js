import { Router } from "express";
import { generateChallenge, verifyAndConsumeChallenge } from "../services/authVerifier.js";
import { User } from "../models/User.js";
import { challengeRateLimiter, verifyRateLimiter } from "../middleware/rateLimiter.js";

const router = Router();

/**
 * POST /challenge
 * Generates a single-use cryptographically secure 32-byte nonce & CSRF state.
 */
router.post("/challenge", challengeRateLimiter, async (req, res, next) => {
  try {
    const { accountId, callbackUrl } = req.body || {};

    if (!accountId || typeof accountId !== "string" || !accountId.trim()) {
      return res.status(400).json({
        error: "Missing or invalid accountId",
        code: "ERR_INVALID_ACCOUNT_ID",
      });
    }

    const challenge = await generateChallenge(accountId, { callbackUrl });

    return res.status(200).json(challenge);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /verify
 * Verifies NEP-413 Ed25519 signature, consumes nonce atomically, checks FullAccess on RPC,
 * and sets secure HttpOnly browser session.
 */
router.post("/verify", verifyRateLimiter, async (req, res, next) => {
  try {
    const { accountId, publicKey, signature, nonceHex, state } = req.body || {};

    if (!accountId || !publicKey || !signature || !nonceHex || !state) {
      return res.status(400).json({
        error: "Missing required authentication fields: accountId, publicKey, signature, nonceHex, and state are required",
        code: "ERR_MISSING_REQUIRED_AUTH_FIELDS",
      });
    }

    // Step 1: Verify NEP-413 signature and on-chain FullAccess key permissions
    const verification = await verifyAndConsumeChallenge({
      accountId,
      publicKey,
      signature,
      nonceHex,
      state,
    });

    // Step 2: Create or update User record in MongoDB
    const now = new Date();
    const user = await User.findOneAndUpdate(
      { account_id: verification.accountId },
      {
        $set: { last_login_at: now },
        $setOnInsert: { created_at: now, status: "active" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Step 3: Rotate session to defend against session fixation attacks
    req.session.regenerate((sessionErr) => {
      if (sessionErr) {
        return next(sessionErr);
      }

      req.session.accountId = user.account_id;

      return res.status(200).json({
        success: true,
        user: {
          accountId: user.account_id,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at,
          status: user.status,
        },
      });
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /session
 * Returns the current authenticated wallet session details, or unauthenticated state.
 */
router.get("/session", async (req, res, next) => {
  try {
    if (!req.session || !req.session.accountId) {
      return res.status(200).json({
        authenticated: false,
      });
    }

    const user = await User.findOne({ account_id: req.session.accountId });
    if (!user) {
      // Session exists for nonexistent user; clear it
      req.session.destroy(() => {});
      return res.status(200).json({
        authenticated: false,
      });
    }

    return res.status(200).json({
      authenticated: true,
      user: {
        accountId: user.account_id,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        status: user.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /logout
 * Destroys server-side session and clears the browser session cookie.
 */
router.post("/logout", (req, res, next) => {
  if (!req.session) {
    res.clearCookie("knovara.sid");
    return res.status(200).json({ success: true });
  }

  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }

    res.clearCookie("knovara.sid");
    return res.status(200).json({ success: true });
  });
});

export default router;

