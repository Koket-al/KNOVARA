import "@testing-library/jest-dom";
import { webcrypto } from "crypto";

// Ensure Web Crypto API is available in test environment
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
} else if (!globalThis.crypto.subtle) {
  globalThis.crypto.subtle = webcrypto.subtle;
}

// Window scrollTo mock
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}

