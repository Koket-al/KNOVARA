import rateLimit from "express-rate-limit";

export const challengeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "test" ? 1000 : 60, // Limit each IP to 60 challenge requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication challenge requests from this IP, please try again later",
    code: "ERR_RATE_LIMIT_EXCEEDED",
  },
});

export const verifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "test" ? 1000 : 30, // Limit each IP to 30 verification attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication verification attempts from this IP, please try again later",
    code: "ERR_RATE_LIMIT_EXCEEDED",
  },
});

