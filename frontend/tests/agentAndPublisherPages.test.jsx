import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { PublisherPortalPage } from "../src/pages/PublisherPortalPage.jsx";
import { AgentWorkspacePage } from "../src/pages/AgentWorkspacePage.jsx";
import { AuthProvider } from "../src/context/AuthContext.jsx";
import { api } from "../src/services/api.js";

function renderWithAuth(ui) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("KNOVARA 2.0: Publisher & Agent Frontend Pages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("PublisherPortalPage", () => {
    it("renders discovery linking, OpenAPI specification editor, and encrypted upstream form", async () => {
      vi.spyOn(api, "getSession").mockResolvedValue({
        authenticated: true,
        user: { accountId: "publisher.testnet" },
      });

      vi.spyOn(api, "getDiscoveries").mockResolvedValue({
        discoveries: [
          { discovery_id: "disc-mat-001", token_id: "token-mat-001", title: "Aerospace Metallurgy" },
        ],
      });

      await act(async () => {
        renderWithAuth(<PublisherPortalPage onNavigate={vi.fn()} />);
      });

      expect(screen.getByText(/Publisher Portal/i)).toBeInTheDocument();
      expect(screen.getByText(/1. Link Discovery Rights Passport/i)).toBeInTheDocument();
      expect(screen.getByText(/2. OpenAPI 3.0 \/ 3.1 Specification/i)).toBeInTheDocument();
      expect(screen.getByText(/3. Secure Upstream Provider Configuration/i)).toBeInTheDocument();
      expect(screen.getByText(/Register API Product & Encrypt Credentials/i)).toBeInTheDocument();
    });
  });

  describe("AgentWorkspacePage", () => {
    it("renders agent identity management, engineering task presets, and recommendation trigger", async () => {
      vi.spyOn(api, "getSession").mockResolvedValue({
        authenticated: true,
        user: { accountId: "owner.testnet" },
      });

      globalThis.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes("/api/v1/agent/profiles")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              agents: [
                {
                  agent_id: "agent-01",
                  name: "Research Bot 01",
                  agent_account_id: "agent-01.testnet",
                  owner_account_id: "owner.testnet",
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      });

      await act(async () => {
        renderWithAuth(<AgentWorkspacePage onNavigate={vi.fn()} />);
      });

      expect(screen.getByText(/AI Agent Task Workspace/i)).toBeInTheDocument();
      expect(screen.getByText(/1. Dedicated Agent Identity & Signing Authority/i)).toBeInTheDocument();
      expect(screen.getByText(/2. Engineering Task Formulation/i)).toBeInTheDocument();
      expect(screen.getByText(/Drone Bracket Material Selection/i)).toBeInTheDocument();
      expect(screen.getByText(/Evaluate Catalog & Recommend APIs/i)).toBeInTheDocument();
    });
  });
});

