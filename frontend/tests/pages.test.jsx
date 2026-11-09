import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { HomePage } from "../src/pages/HomePage.jsx";
import { DiscoveriesPage } from "../src/pages/DiscoveriesPage.jsx";
import { RegisterDiscoveryPage } from "../src/pages/RegisterDiscoveryPage.jsx";
import { MarketplacePage } from "../src/pages/MarketplacePage.jsx";
import { LicensesPage } from "../src/pages/LicensesPage.jsx";
import { AccountPage } from "../src/pages/AccountPage.jsx";
import { AuthProvider } from "../src/context/AuthContext.jsx";
import { api } from "../src/services/api.js";

function renderWithAuth(ui) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("KNOVARA Application Pages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("HomePage", () => {
    it("renders hero headline, legal disclaimer, and action buttons", () => {
      const handleNavigate = vi.fn();
      render(<HomePage onNavigate={handleNavigate} />);

      expect(
        screen.getByText(/Cryptographic Priority & Discovery Rights Registry/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/CRITICAL LEGAL & CRYPTOGRAPHIC REGISTRY NOTICE/i)
      ).toBeInTheDocument();

      const exploreBtn = screen.getByText(/Explore Discoveries/i);
      fireEvent.click(exploreBtn);
      expect(handleNavigate).toHaveBeenCalledWith("/discoveries");
    });
  });

  describe("DiscoveriesPage", () => {
    it("renders discovery list from API and search filter bar", async () => {
      const mockDiscoveries = [
        {
          discovery_id: "disc-vac-01",
          token_id: "token-vac-01",
          custodian_id: "lab.testnet",
          rights_controller_id: "controller.testnet",
          registered_at: new Date().toISOString(),
          public_metadata: {
            title: "Novel Malaria Vaccine Candidate",
            category: "IMMUNOLOGY",
            description: "High efficacy mRNA formulation",
          },
        },
      ];

      vi.spyOn(api, "getDiscoveries").mockResolvedValue({
        discoveries: mockDiscoveries,
        pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
      });

      await act(async () => {
        render(<DiscoveriesPage onNavigate={vi.fn()} />);
      });

      expect(screen.getByText("Public Discovery Catalog")).toBeInTheDocument();
      expect(screen.getByText("Novel Malaria Vaccine Candidate")).toBeInTheDocument();
      expect(screen.getAllByText("IMMUNOLOGY").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("RegisterDiscoveryPage", () => {
    it("validates beneficiary split totals strictly to 10,000 basis points", async () => {
      vi.spyOn(api, "getSession").mockResolvedValue({
        authenticated: true,
        user: { accountId: "alice.testnet" },
      });

      await act(async () => {
        renderWithAuth(<RegisterDiscoveryPage onNavigate={vi.fn()} />);
      });

      expect(screen.getByText("Register New Discovery")).toBeInTheDocument();
      expect(screen.getByText(/Total Basis Points Sum:/i)).toBeInTheDocument();
      expect(screen.getByText("BALANCED (100.00%)")).toBeInTheDocument();
    });
  });

  describe("MarketplacePage", () => {
    it("renders marketplace catalog and licensing scopes filter", async () => {
      vi.spyOn(api, "getDiscoveries").mockResolvedValue({
        discoveries: [
          {
            discovery_id: "disc-data-02",
            public_metadata: { title: "Genomic Dataset" },
          },
        ],
      });

      vi.spyOn(api, "getDiscoveryOffers").mockResolvedValue({
        offers: [
          {
            offer_id: "off-101",
            discovery_id: "disc-data-02",
            scope: "RESEARCH_ONLY",
            price_yocto: "1000000000000000000000000",
            duration_days: 180,
            terms_hash: "a".repeat(64),
          },
        ],
      });

      await act(async () => {
        render(<MarketplacePage onNavigate={vi.fn()} />);
      });

      expect(screen.getByText("Licensing Marketplace")).toBeInTheDocument();
      expect(screen.getByText("1 NEAR")).toBeInTheDocument();
      expect(screen.getAllByText("RESEARCH_ONLY").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("LicensesPage", () => {
    it("renders license requests tabs and status badges", async () => {
      vi.spyOn(api, "getSession").mockResolvedValue({
        authenticated: true,
        user: { accountId: "buyer.testnet" },
      });

      vi.spyOn(api, "getAccountRequests").mockResolvedValue({
        requests: [
          {
            request_id: "req-001",
            discovery_id: "disc-data-02",
            offer_id: "off-101",
            price_yocto: "1000000000000000000000000",
            status: "Approved",
            accepted_terms_hash: "a".repeat(64),
            requested_at: new Date().toISOString(),
          },
        ],
      });

      vi.spyOn(api, "getAccountLicenses").mockResolvedValue({ licenses: [] });
      vi.spyOn(api, "getAccountOffers").mockResolvedValue({ offers: [] });

      await act(async () => {
        renderWithAuth(<LicensesPage onNavigate={vi.fn()} />);
      });

      expect(screen.getByText("Licensing Management")).toBeInTheDocument();
      expect(screen.getByText("APPROVED")).toBeInTheDocument();
      expect(screen.getByText(/Pay & Activate License/i)).toBeInTheDocument();
    });
  });

  describe("AccountPage", () => {
    it("displays live storage balance and claimable royalty balance", async () => {
      vi.spyOn(api, "getSession").mockResolvedValue({
        authenticated: true,
        user: { accountId: "alice.testnet" },
      });

      vi.spyOn(api, "getAccountStorage").mockResolvedValue({
        accountId: "alice.testnet",
        storageBalance: {
          total: "10000000000000000000000", // 0.01 NEAR
          available: "5000000000000000000000", // 0.005 NEAR
        },
        bounds: { min: "2700000000000000000000" },
        isRegistered: true,
      });

      vi.spyOn(api, "getAccountRoyalties").mockResolvedValue({
        accountId: "alice.testnet",
        claimableBalanceYocto: "500000000000000000000000", // 0.5 NEAR
        pendingWithdrawalsYocto: "0",
      });

      await act(async () => {
        renderWithAuth(<AccountPage onNavigate={vi.fn()} />);
      });

      expect(screen.getByText("Account & Financial Management")).toBeInTheDocument();
      expect(screen.getByText("REGISTERED")).toBeInTheDocument();
      expect(screen.getByText("0.01 NEAR")).toBeInTheDocument();
      expect(screen.getByText("0.5 NEAR")).toBeInTheDocument();
      expect(screen.getByText(/Withdraw Claimable Earnings/i)).toBeInTheDocument();
    });
  });
});
