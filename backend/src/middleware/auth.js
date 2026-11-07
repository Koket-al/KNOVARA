/**
 * Middleware ensuring that the incoming request carries an active, valid wallet session.
 */
export function requireAuth(req, res, next) {
  if (!req.session || !req.session.accountId) {
    return res.status(401).json({
      error: "Authentication required",
      code: "ERR_UNAUTHENTICATED",
    });
  }

  req.user = {
    accountId: req.session.accountId,
  };

  next();
}

