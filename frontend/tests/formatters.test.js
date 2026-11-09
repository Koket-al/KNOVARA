import { describe, it, expect } from "vitest";
import {
  yoctoToNear,
  nearToYocto,
  formatBasisPoints,
  truncateHash,
  formatDate,
  formatGasToTgas,
} from "../src/services/formatters.js";

describe("Formatters Service", () => {
  describe("yoctoToNear", () => {
    it("converts 0 or empty yocto to '0'", () => {
      expect(yoctoToNear("0")).toBe("0");
      expect(yoctoToNear("")).toBe("0");
      expect(yoctoToNear(null)).toBe("0");
    });

    it("converts exact 1 NEAR (10^24 yoctoNEAR)", () => {
      const oneNearYocto = "1000000000000000000000000";
      expect(yoctoToNear(oneNearYocto)).toBe("1");
    });

    it("converts 0.20 NEAR (2 * 10^23 yoctoNEAR)", () => {
      const pointTwoNear = "200000000000000000000000";
      expect(yoctoToNear(pointTwoNear, 4)).toBe("0.2");
    });

    it("converts storage deposit 0.0027 NEAR (2.7 * 10^21 yoctoNEAR)", () => {
      const storageYocto = "2700000000000000000000";
      expect(yoctoToNear(storageYocto, 6)).toBe("0.0027");
    });

    it("handles large values correctly without exponential notation", () => {
      const hundredNear = "100000000000000000000000000";
      expect(yoctoToNear(hundredNear)).toBe("100");
    });
  });

  describe("nearToYocto", () => {
    it("converts '1' NEAR to exactly 24 zeros", () => {
      expect(nearToYocto("1")).toBe("1000000000000000000000000");
    });

    it("converts '0.0027' NEAR to exact storage deposit in yocto", () => {
      expect(nearToYocto("0.0027")).toBe("2700000000000000000000");
    });

    it("converts '0.2' NEAR to 200000000000000000000000", () => {
      expect(nearToYocto("0.2")).toBe("200000000000000000000000");
    });

    it("handles '0' or empty safely", () => {
      expect(nearToYocto("0")).toBe("0");
      expect(nearToYocto("")).toBe("0");
    });
  });

  describe("formatBasisPoints", () => {
    it("formats 10,000 basis points as 100.00%", () => {
      expect(formatBasisPoints(10000)).toBe("100.00%");
    });

    it("formats 5,000 basis points as 50.00%", () => {
      expect(formatBasisPoints(5000)).toBe("50.00%");
    });

    it("formats 250 basis points as 2.50%", () => {
      expect(formatBasisPoints(250)).toBe("2.50%");
    });

    it("handles 0 or invalid inputs", () => {
      expect(formatBasisPoints(0)).toBe("0.00%");
      expect(formatBasisPoints("invalid")).toBe("0.00%");
    });
  });

  describe("truncateHash", () => {
    it("truncates 64-char hex hash correctly", () => {
      const hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const truncated = truncateHash(hash, 8, 6);
      expect(truncated).toBe("01234567...abcdef");
    });

    it("does not truncate short strings", () => {
      expect(truncateHash("abc")).toBe("abc");
      expect(truncateHash("")).toBe("");
    });
  });

  describe("formatGasToTgas", () => {
    it("converts 30 Tgas (3 * 10^13 gas)", () => {
      expect(formatGasToTgas("30000000000000")).toBe("30 Tgas");
    });

    it("converts 50 Tgas (5 * 10^13 gas)", () => {
      expect(formatGasToTgas("50000000000000")).toBe("50 Tgas");
    });

    it("handles 0 or invalid safely", () => {
      expect(formatGasToTgas("0")).toBe("0 Tgas");
      expect(formatGasToTgas(null)).toBe("0 Tgas");
    });
  });

  describe("formatDate", () => {
    it("formats ISO string to clean UTC format", () => {
      const iso = "2026-11-09T18:00:00.000Z";
      expect(formatDate(iso)).toBe("2026-11-09 18:00:00 UTC");
    });

    it("handles null or invalid date safely", () => {
      expect(formatDate(null)).toBe("—");
      expect(formatDate("invalid-date")).toBe("—");
    });
  });
});

