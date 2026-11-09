import { describe, it, expect } from "vitest";
import { calculateSha256Hex, calculateSha256Base64 } from "../src/services/cryptoUtils.js";

describe("CryptoUtils Service (Web Crypto API)", () => {
  it("computes exact known SHA-256 hex digest for empty input", async () => {
    const emptyBuffer = new Uint8Array(0);
    const hex = await calculateSha256Hex(emptyBuffer);
    expect(hex).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("computes exact known SHA-256 Base64 digest for empty input (NEP-177 format)", async () => {
    const emptyBuffer = new Uint8Array(0);
    const b64 = await calculateSha256Base64(emptyBuffer);
    expect(b64).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
    expect(b64.length).toBe(44);
  });

  it("computes deterministic SHA-256 hex and Base64 for string bytes", async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode("KNOVARA DECENTRALIZED DISCOVERY REGISTRY");

    const hex1 = await calculateSha256Hex(data);
    const hex2 = await calculateSha256Hex(data);
    expect(hex1).toBe(hex2);
    expect(hex1).toMatch(/^[a-f0-9]{64}$/);

    const b64 = await calculateSha256Base64(data);
    expect(b64.length).toBe(44);
  });
});

