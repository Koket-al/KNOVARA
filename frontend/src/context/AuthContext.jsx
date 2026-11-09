import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../services/api.js";
import {
  connectNearWallet,
  disconnectNearWallet,
  signNep413Message,
} from "../services/nearWallet.js";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState(null);
  const [connectedWallet, setConnectedWallet] = useState(null);

  // Check existing session on mount
  const checkSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await api.getSession();
      if (res && res.authenticated && res.user) {
        setUser(res.user);
        setIsAuthenticated(true);
        setConnectedWallet({ accountId: res.user.accountId });
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (_err) {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  /**
   * Connects wallet and executes complete server-authoritative NEP-413 authentication.
   */
  const loginWithWallet = async (suggestedAccountId = null) => {
    try {
      setIsAuthenticating(true);
      setError(null);

        // Step 1: Ensure wallet is connected
      const walletInfo = await connectNearWallet({
        suggestedAccountId: suggestedAccountId?.trim() || undefined,
      });

      // Prefer explicitly entered account, otherwise use wallet's default account
      const accountId = suggestedAccountId?.trim() || walletInfo?.accountId;

      if (!accountId) {
        throw new Error("No NEAR account ID selected or returned from wallet");
      }

      setConnectedWallet({ accountId, walletName: walletInfo?.walletName });

      // Step 2: Request single-use 32B cryptographic challenge from backend
      const callbackUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const challenge = await api.getChallenge(accountId, callbackUrl);

      // Step 3: Sign NEP-413 authentication message using user's connected wallet
      const signedData = await signNep413Message({
        message: challenge.message,
        recipient: challenge.recipient,
        nonceHex: challenge.nonceHex,
        callbackUrl: challenge.callbackUrl,
        state: challenge.state,
        accountId,
      });

      // Step 4: Verify signature and FullAccess key permissions on backend
      const verifyRes = await api.verifyChallenge({
        accountId: signedData.accountId || accountId,
        publicKey: signedData.publicKey,
        signature: signedData.signature,
        nonceHex: challenge.nonceHex,
        state: challenge.state,
      });

      // Step 5: Establish session state
      if (verifyRes && verifyRes.success) {
        setUser(verifyRes.user);
        setIsAuthenticated(true);
        return verifyRes.user;
      } else {
        throw new Error("Authentication verification failed");
      }
    } catch (err) {
      console.error("[AUTH] Login error:", err);
      const msg = err.message || "Failed to authenticate with NEAR wallet";
      setError(msg);
      throw err;
    } finally {
      setIsAuthenticating(false);
    }
  };

  /**
   * Logs out from backend session and disconnects wallet.
   */
  const logout = async () => {
    try {
      await api.logout().catch(() => {});
      await disconnectNearWallet().catch(() => {});
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      setConnectedWallet(null);
      setError(null);
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    isAuthenticating,
    error,
    connectedWallet,
    loginWithWallet,
    logout,
    checkSession,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  return context || {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isAuthenticating: false,
    error: null,
    clearError: () => {},
    loginWithWallet: async () => {},
    logout: async () => {},
  };
}

