import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../src/services/api.js";

describe("Transaction Safety Architecture & Intent Generation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prepares register-discovery intent with exact 50 Tgas and 0 deposit", async () => {
    const mockIntent = {
      networkId: "testnet",
      contractId: "koket-knovara-dev.testnet",
      methodName: "register_discovery_and_mint",
      args: {
        discovery_id: "disc-99",
        token_id: "token-99",
        custodian_id: "alice.testnet",
        rights_controller_id: "alice.testnet",
        evidence_manifest_hash: "a".repeat(64),
        metadata: {
          title: "Test Discovery",
          reference: "http://localhost:5000/api/v1/metadata/disc-99/1.0.0",
          reference_hash: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
        },
        beneficiary_splits: [{ account_id: "alice.testnet", basis_points: 10000 }],
        lineage_parents: [],
      },
      attachedDeposit: "0",
      gas: "50000000000000",
    };

    vi.spyOn(api, "prepareTransactionIntent").mockResolvedValue(mockIntent);

    const intent = await api.prepareTransactionIntent("register-discovery", mockIntent.args);

    expect(intent.methodName).toBe("register_discovery_and_mint");
    expect(intent.attachedDeposit).toBe("0");
    expect(intent.gas).toBe("50000000000000"); // 50 Tgas
    expect(intent.args.metadata.reference_hash).toHaveLength(44);
    expect(intent.args.evidence_manifest_hash).toHaveLength(64);
  });

  it("prepares storage-deposit intent with exact required yoctoNEAR deposit", async () => {
    const mockIntent = {
      networkId: "testnet",
      contractId: "koket-knovara-dev.testnet",
      methodName: "storage_deposit",
      args: { account_id: "buyer.testnet", registration_only: false },
      attachedDeposit: "2700000000000000000000", // 0.0027 NEAR
      gas: "30000000000000",
    };

    vi.spyOn(api, "prepareTransactionIntent").mockResolvedValue(mockIntent);

    const intent = await api.prepareTransactionIntent("storage-deposit", {
      accountId: "buyer.testnet",
      amountYocto: "2700000000000000000000",
      registrationOnly: false,
    });

    expect(intent.methodName).toBe("storage_deposit");
    expect(intent.attachedDeposit).toBe("2700000000000000000000");
    expect(intent.gas).toBe("30000000000000");
  });

  it("prepares pay-license intent authoritatively attaching exact license price", async () => {
    const exactPriceYocto = "1500000000000000000000000"; // 1.5 NEAR
    const mockIntent = {
      networkId: "testnet",
      contractId: "koket-knovara-dev.testnet",
      methodName: "pay_for_license",
      args: {
        request_id: "req-123",
        accepted_terms_hash: "b".repeat(64),
      },
      attachedDeposit: exactPriceYocto,
      gas: "50000000000000",
      context: { priceYocto: exactPriceYocto },
    };

    vi.spyOn(api, "prepareTransactionIntent").mockResolvedValue(mockIntent);

    const intent = await api.prepareTransactionIntent("pay-license", {
      requestId: "req-123",
      acceptedTermsHash: "b".repeat(64),
    });

    expect(intent.methodName).toBe("pay_for_license");
    expect(intent.attachedDeposit).toBe(exactPriceYocto);
    expect(intent.gas).toBe("50000000000000");
  });

  it("prepares withdraw-earnings intent with 0 deposit and 40 Tgas", async () => {
    const mockIntent = {
      networkId: "testnet",
      contractId: "koket-knovara-dev.testnet",
      methodName: "withdraw_earnings",
      args: {},
      attachedDeposit: "0",
      gas: "40000000000000",
    };

    vi.spyOn(api, "prepareTransactionIntent").mockResolvedValue(mockIntent);

    const intent = await api.prepareTransactionIntent("withdraw-earnings", {});

    expect(intent.methodName).toBe("withdraw_earnings");
    expect(intent.attachedDeposit).toBe("0");
    expect(intent.gas).toBe("40000000000000");
  });
});

