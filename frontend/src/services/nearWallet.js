/**
 * NEAR Wallet Integration Service
 *
 * Integrates @hot-labs/near-connect for NEP-413 off-chain message signing
 * and NEAR Testnet transactions.
 * Provides safe mock adapter support for unit tests and local headless environments.
 */
import { config } from "../config/env.js";

let connectorInstance = null;
let activeMockWallet = null;
let activeWalletInstance = null;

/**
 * Converts a 64-character hexadecimal string to a 32-byte Uint8Array.
 *
 * @param {string} hexStr
 * @returns {Uint8Array}
 */
export function hexToUint8Array(hexStr) {
  const cleanHex = hexStr.replace(/^0x/, "").trim();
  if (cleanHex.length !== 64) {
    throw new Error(`Invalid nonce hex length: expected 64 characters, received ${cleanHex.length}`);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Helper to normalize signature into Base64 string if returned as bytes.
 */
function normalizeSignature(sig) {
  if (typeof sig === "string") return sig;
  if (sig instanceof Uint8Array || Array.isArray(sig)) {
    const bytes = new Uint8Array(sig);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return String(sig || "");
}

/**
 * Initializes or returns the existing NearConnector instance.
 */
export async function getNearConnector() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!connectorInstance) {
    try {
      const { NearConnector } = await import("@hot-labs/near-connect");
      connectorInstance = new NearConnector({
        network: config.NEAR_NETWORK || "testnet",
        features: {
          signMessage: true,           // NEP-413 off-chain message signing
          testnet: config.NEAR_NETWORK === "testnet",
          signAndSendTransaction: true // On-chain contract transactions
        }
      });
      // Await remote manifest resolution
      await connectorInstance.whenManifestLoaded.catch(() => {});
    } catch (err) {
      console.warn("[WARN] Could not initialize NearConnector:", err.message);
      return null;
    }
  }

  return connectorInstance;
}

/**
 * Sets a mock wallet adapter for testing and headless verification.
 *
 * @param {object|null} mockAdapter
 */
export function setMockWallet(mockAdapter) {
  activeMockWallet = mockAdapter;
}

/**
 * Clears any active mock wallet adapter.
 */
export function clearMockWallet() {
  activeMockWallet = null;
}

/**
 * Checks whether mock wallet adapter is currently active.
 *
 * @returns {boolean}
 */
export function isMockWalletActive() {
  return Boolean(activeMockWallet);
}

/**
 * Retrieves the currently active connected wallet instance, if available.
 */
export async function getConnectedWalletInstance() {
  if (activeWalletInstance) {
    return activeWalletInstance;
  }

  const connector = await getNearConnector();
  if (!connector) return null;

  try {
    const res = await connector.getConnectedWallet();
    if (res && res.wallet) {
      activeWalletInstance = res.wallet;
      return res.wallet;
    }
  } catch (_e) {
    // No wallet selected in storage
  }

  try {
    const w = await connector.wallet();
    if (w) {
      activeWalletInstance = w;
      return w;
    }
  } catch (_e) {
    // No active wallet
  }

  return null;
}

/**
 * Connects to a NEAR wallet.
 *
 * @param {object} [options]
 * @returns {Promise<{ accountId: string, walletName?: string }>}
 */
export async function connectNearWallet(options = {}) {
  if (activeMockWallet) {
    const account = await activeMockWallet.connect(options);
    return {
      accountId: account.accountId,
      walletName: activeMockWallet.name || "Mock Testnet Wallet",
    };
  }

  const connector = await getNearConnector();
  if (!connector) {
    throw new Error("NearConnector is unavailable in this environment. Please ensure you are in a modern browser.");
  }

  let wallet = await getConnectedWalletInstance();
  if (!wallet) {
    // Trigger wallet selection popup
    wallet = await connector.connect(options);
    activeWalletInstance = wallet;
  }

  if (!wallet) {
    throw new Error("Failed to connect to NEAR wallet");
  }

  const accounts = await wallet.getAccounts();
  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts found in selected NEAR wallet");
  }

  return {
    accountId: accounts[0].accountId,
    walletName: wallet.manifest?.name || "Connected NEAR Wallet",
  };
}

/**
 * Disconnects the active wallet.
 */
export async function disconnectNearWallet() {
  activeWalletInstance = null;

  if (activeMockWallet) {
    if (typeof activeMockWallet.disconnect === "function") {
      await activeMockWallet.disconnect();
    }
    return;
  }

  const connector = await getNearConnector();
  if (connector) {
    try {
      await connector.disconnect();
    } catch (_err) {
      // Non-fatal
    }
  }
}

/**
 * Gets currently connected wallet account, if any.
 *
 * @returns {Promise<string|null>}
 */
export async function getConnectedAccountId() {
  if (activeMockWallet) {
    return activeMockWallet.getAccountId ? activeMockWallet.getAccountId() : activeMockWallet.accountId;
  }

  const connector = await getNearConnector();
  if (!connector) return null;

  try {
    const res = await connector.getConnectedWallet();
    return res?.accounts?.[0]?.accountId || null;
  } catch (_e) {
    return null;
  }
}

/**
 * Signs a NEP-413 off-chain authentication message using the connected wallet.
 *
 * @param {object} params
 * @param {string} params.message
 * @param {string} params.recipient
 * @param {string} params.nonceHex - 64-char hex string from backend
 * @param {string} [params.callbackUrl]
 * @param {string} params.state - CSRF state token
 * @param {string} [params.accountId]
 * @returns {Promise<{ accountId: string, publicKey: string, signature: string, nonceHex: string, state: string }>}
 */
export async function signNep413Message({ message, recipient, nonceHex, callbackUrl, state, accountId }) {
  const nonceBytes = hexToUint8Array(nonceHex);

  if (activeMockWallet) {
    return activeMockWallet.signMessage({
      message,
      recipient,
      nonce: nonceBytes,
      nonceHex,
      callbackUrl,
      state,
      accountId,
    });
  }

  const connector = await getNearConnector();
  if (!connector) {
    throw new Error("NEAR wallet connector unavailable");
  }

  // Retrieve or connect active wallet
  let wallet = await getConnectedWalletInstance();

  const isSignMessageSupported = (w) => {
    if (!w || typeof w.signMessage !== "function") return false;
    if (w.wallet && typeof w.wallet.signMessage !== "function") return false;
    return true;
  };

  if (!isSignMessageSupported(wallet)) {
    try {
      if (connector?.storage) {
        await connector.storage.remove("selected-wallet");
      }
    } catch (_e) {}
    activeWalletInstance = null;
    wallet = await connector.connect();
    activeWalletInstance = wallet;
  }

  if (!isSignMessageSupported(wallet)) {
    throw new Error(
      "The selected NEAR wallet does not support NEP-413 off-chain message signing. Please connect using Meteor Wallet or MyNearWallet."
    );
  }

  // Request standard NEP-413 signature from wallet
  let signResult;
  try {
    signResult = await wallet.signMessage({
      message,
      recipient,
      nonce: nonceBytes,
      callbackUrl,
      state,
      signerId: accountId,
    });
  } catch (signErr) {
    if (signErr?.message?.includes("is not a function")) {
      throw new Error(
        "The connected wallet does not implement NEP-413 off-chain message signing. Please switch to Meteor Wallet or MyNearWallet."
      );
    }
    throw signErr;
  }

  if (!signResult || !signResult.signature) {
    throw new Error("Wallet did not return a valid signed message payload");
  }

  return {
    accountId: signResult.accountId || accountId,
    publicKey: String(signResult.publicKey || ""),
    signature: normalizeSignature(signResult.signature),
    nonceHex,
    state: signResult.state || state,
  };
}

/**
 * Signs and broadcasts an on-chain transaction intent using the connected NEAR wallet.
 *
 * @param {object} intent
 * @param {string} intent.contractId - Target smart contract account ID
 * @param {string} intent.methodName - Contract method name
 * @param {object} intent.args - JSON serializable method arguments
 * @param {string} [intent.gas] - Attached gas in yoctogas (default: 30 Tgas)
 * @param {string} [intent.attachedDeposit] - Attached deposit in yoctoNEAR (default: 0)
 * @returns {Promise<{ txHash: string, rawResult: any }>}
 */
export async function executeTransactionIntent(intent) {
  if (activeMockWallet && typeof activeMockWallet.signAndSendTransaction === "function") {
    return activeMockWallet.signAndSendTransaction(intent);
  }

  const connector = await getNearConnector();
  if (!connector) {
    throw new Error("NEAR wallet connector unavailable");
  }

  let wallet = await getConnectedWalletInstance();
  if (!wallet) {
    wallet = await connector.connect();
    activeWalletInstance = wallet;
  }

  if (!wallet || typeof wallet.signAndSendTransaction !== "function") {
    throw new Error("Connected wallet does not support signAndSendTransaction");
  }

  const result = await wallet.signAndSendTransaction({
    receiverId: intent.contractId,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: intent.methodName,
          args: intent.args || {},
          gas: String(intent.gas || "30000000000000"),
          deposit: String(intent.attachedDeposit || "0"),
        },
      },
    ],
  });

  const txHash =
    result?.transaction?.hash ||
    result?.transaction_outcome?.id ||
    result?.txHash ||
    result?.hash ||
    (typeof result === "string" ? result : null);

  if (!txHash) {
    throw new Error("Transaction completed but no transaction hash was returned by wallet");
  }

  return { txHash, rawResult: result };
}

