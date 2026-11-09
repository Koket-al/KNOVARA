/**
 * Frontend Environment Configuration
 *
 * Configurable via Vite environment variables with safe defaults for local development.
 * Never stores or exposes secrets.
 */
export const config = {
  // Backend API base URL: defaults to empty string so requests to /api/v1/...
  // are routed through Vite dev server proxy (or Vercel production rewrites)
  BACKEND_API_URL: import.meta.env?.VITE_BACKEND_API_URL || "",

  // Fallback direct backend base URL if running standalone
  DIRECT_API_URL: import.meta.env?.VITE_DIRECT_API_URL || "http://localhost:5000",

  // NEAR Network & Contract Settings
  NEAR_NETWORK: import.meta.env?.VITE_NEAR_NETWORK || "testnet",
  NEAR_CONTRACT_ID: import.meta.env?.VITE_NEAR_CONTRACT_ID || "koket-knovara-dev.testnet",
  NEAR_RPC_URL: import.meta.env?.VITE_NEAR_RPC_URL || "https://rpc.testnet.near.org",

  // Application Name and Version
  APP_NAME: "KNOVARA",
  APP_VERSION: "1.0.0",
};

