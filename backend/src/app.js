import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import MongoStore from "connect-mongo";
import { config } from "./config/env.js";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import evidenceRouter from "./routes/evidence.js";
import metadataRouter from "./routes/metadata.js";
import { errorHandler } from "./middleware/errorHandler.js";

/**
 * Creates and configures the Express application.
 * Accepts optional options object to allow dependency injection during automated testing.
 *
 * @param {object} [options]
 * @param {object} [options.sessionStore] - Custom session store (e.g. MemoryStore in test)
 * @returns {express.Express}
 */
export function createApp(options = {}) {
  const app = express();

  // Trust reverse proxy (Vercel / Render / Cloudflare)
  const trustProxyVal = config.TRUST_PROXY;
  if (trustProxyVal === "true") {
    app.set("trust proxy", true);
  } else if (!isNaN(Number(trustProxyVal))) {
    app.set("trust proxy", Number(trustProxyVal));
  } else {
    app.set("trust proxy", trustProxyVal);
  }

  // Security headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: config.FRONTEND_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // JSON Body Parser with strict limits
  app.use(express.json({ limit: "1mb" }));

  // Cookie Parser
  app.use(cookieParser(config.SESSION_SECRET));

  // Determine session store: in test or when explicitly provided, use custom store; otherwise use MongoStore
  let store = options.sessionStore;
  const isTest = process.env.NODE_ENV === "test" || config.NODE_ENV === "test";
  if (!store && !isTest && config.MONGODB_URI) {
    store = MongoStore.create({
      mongoUrl: config.MONGODB_URI,
      collectionName: "sessions",
      ttl: Math.floor(config.SESSION_MAX_AGE_MS / 1000),
      autoRemove: "native",
    });
  }

  // Session middleware
  const sessionConfig = {
    name: "knovara.sid",
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: config.SESSION_MAX_AGE_MS,
    },
  };

  if (store) {
    sessionConfig.store = store;
  }

  app.use(session(sessionConfig));

  // Mount API endpoints
  app.use("/", healthRouter);
  app.use("/api", healthRouter);
  app.use("/api/v1", healthRouter);

  // Auth routes mounted on both /api/auth and /api/v1/auth for complete client compatibility
  app.use("/api/auth", authRouter);
  app.use("/api/v1/auth", authRouter);

  // Evidence and Discovery Registration endpoints
  app.use("/api/discoveries", evidenceRouter);
  app.use("/api/v1/discoveries", evidenceRouter);

  // Public NEP-177 Metadata descriptor endpoints
  app.use("/api", metadataRouter);
  app.use("/api/v1", metadataRouter);

  // Allow custom routes registration prior to 404 handler (e.g. for testing middleware)
  if (typeof options.configureRoutes === "function") {
    options.configureRoutes(app);
  }

  // 404 Handler for undefined routes
  app.use((req, res) => {
    res.status(404).json({
      error: `Cannot ${req.method} ${req.originalUrl}`,
      code: "ERR_NOT_FOUND",
    });
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}
