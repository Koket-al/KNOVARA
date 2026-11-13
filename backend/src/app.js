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
import transactionsRouter from "./routes/transactions.js";
import discoveriesRouter from "./routes/discoveries.js";
import licensesRouter from "./routes/licenses.js";
import accountRouter from "./routes/account.js";
import gatewayRouter from "./routes/gateway.js";
import apiProductsRouter from "./routes/apiProducts.js";
import agentRouter from "./routes/agent.js";
import subscriptionsRouter from "./routes/subscriptions.js";
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
  const allowedOrigins = [
    config.FRONTEND_ORIGIN,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ].filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:")
        ) {
          return callback(null, true);
        }
        return callback(new Error("CORS policy violation"), false);
      },
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

  // Discovery browse and search endpoints
  app.use("/api/discoveries", discoveriesRouter);
  app.use("/api/v1/discoveries", discoveriesRouter);

  // Transaction verification, reconciliation, and intent generation
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/v1/transactions", transactionsRouter);

  // Licensing offers and requests
  app.use("/api/licenses", licensesRouter);
  app.use("/api/v1/licenses", licensesRouter);

  // Current authenticated account management and live royalties
  app.use("/api/account", accountRouter);
  app.use("/api/v1/account", accountRouter);

  // Public NEP-177 Metadata descriptor endpoints
  app.use("/api", metadataRouter);
  app.use("/api/v1", metadataRouter);

  // KNOVARA API Gateway (Protected proxy with SSRF & credential enforcement)
  app.use("/api/gateway", gatewayRouter);
  app.use("/api/v1/gateway", gatewayRouter);

  // Publisher API Product and OpenAPI registration
  app.use("/api/api-products", apiProductsRouter);
  app.use("/api/v1/api-products", apiProductsRouter);

  // AI Agent Profiles, Recommendations & Purchase Intents
  app.use("/api/agent", agentRouter);
  app.use("/api/v1/agent", agentRouter);

  // Subscriptions and Credential Management
  app.use("/api/subscriptions", subscriptionsRouter);
  app.use("/api/v1/subscriptions", subscriptionsRouter);

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
