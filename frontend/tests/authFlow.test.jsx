import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/context/AuthContext.jsx";
import {
  setMockWallet,
  clearMockWallet,
  hexToUint8Array,
  connectNearWallet,
  signNep413Message,
} from "../src/services/nearWallet.js";
import { api } from "../src/services/api.js";

// Test component consuming AuthContext
function TestAuthConsumer() {
  const { user, isAuthenticated, isLoading, isAuthenticating, loginWithWallet, logout, error } = useAuth();

  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? "AUTHENTICATED" : "UNAUTHENTICATED"}</div>
      <div data-testid="user-account">{user?.accountId || "NONE"}</div>
      {error && <div data-testid="auth-error">{error}</div>}
      {isLoading && <div data-testid="auth-loading">LOADING</div>}
      <button onClick={() => loginWithWallet("bob.testnet")}>Login Bob</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe("Wallet Authentication & NEP-413 Flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearMockWallet();
  });

  it("hexToUint8Array correctly converts 64 hex characters to 32 bytes", () => {
    const hex = "0123456789abcdef".repeat(4);
    const bytes = hexToUint8Array(hex);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(0x01);
    expect(bytes[1]).toBe(0x23);
  });

  it("hexToUint8Array rejects invalid lengths", () => {
    expect(() => hexToUint8Array("abcd")).toThrow(/Invalid nonce hex length/);
  });

  it("Mock wallet adapter signs NEP-413 message with 32-byte nonce", async () => {
    const mockWallet = {
      name: "Mock Meteor Wallet",
      accountId: "alice.testnet",
      connect: vi.fn().mockResolvedValue({ accountId: "alice.testnet" }),
      signMessage: vi.fn().mockImplementation(({ message, recipient, nonce, state }) => {
        expect(nonce.length).toBe(32);
        return {
          accountId: "alice.testnet",
          publicKey: "ed25519:6EArrS69DCiN2BCBPqiofwvL8RDPCLUMGghGA42oT7dE",
          signature: "mockBase64Signature==",
          state,
        };
      }),
    };

    setMockWallet(mockWallet);

    const connection = await connectNearWallet();
    expect(connection.accountId).toBe("alice.testnet");

    const signResult = await signNep413Message({
      message: "Sign in to KNOVARA",
      recipient: "koket-knovara-dev.testnet",
      nonceHex: "ab".repeat(32),
      state: "csrf-state-123",
    });

    expect(signResult.signature).toBe("mockBase64Signature==");
    expect(signResult.accountId).toBe("alice.testnet");
  });

  it("AuthProvider executes complete 4-step NEP-413 login flow", async () => {
    const mockNonceHex = "44".repeat(32);
    const mockState = "secure-csrf-state-999";

    // Mock API responses
    vi.spyOn(api, "getSession").mockResolvedValue({ authenticated: false });
    vi.spyOn(api, "getChallenge").mockResolvedValue({
      nonceHex: mockNonceHex,
      state: mockState,
      recipient: "koket-knovara-dev.testnet",
      callbackUrl: "http://localhost:3000",
      message: "Authenticate wallet bob.testnet",
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    });

    vi.spyOn(api, "verifyChallenge").mockResolvedValue({
      success: true,
      user: {
        accountId: "bob.testnet",
        status: "active",
        lastLoginAt: new Date().toISOString(),
      },
    });

    // Mock wallet
    const mockWallet = {
      name: "Mock Wallet",
      connect: vi.fn().mockResolvedValue({ accountId: "bob.testnet" }),
      signMessage: vi.fn().mockResolvedValue({
        accountId: "bob.testnet",
        publicKey: "ed25519:mockPublicKey",
        signature: "mockSignature",
        state: mockState,
      }),
    };
    setMockWallet(mockWallet);

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("auth-status")).toHaveTextContent("UNAUTHENTICATED");

    // Click Login
    await act(async () => {
      screen.getByText("Login Bob").click();
    });

    expect(api.getChallenge).toHaveBeenCalledWith("bob.testnet", expect.any(String));
    expect(api.verifyChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "bob.testnet",
        nonceHex: mockNonceHex,
        state: mockState,
      })
    );

    expect(screen.getByTestId("auth-status")).toHaveTextContent("AUTHENTICATED");
    expect(screen.getByTestId("user-account")).toHaveTextContent("bob.testnet");

    // Logout
    vi.spyOn(api, "logout").mockResolvedValue({ success: true });
    await act(async () => {
      screen.getByText("Logout").click();
    });

    expect(screen.getByTestId("auth-status")).toHaveTextContent("UNAUTHENTICATED");
    expect(screen.getByTestId("user-account")).toHaveTextContent("NONE");
  });
});
