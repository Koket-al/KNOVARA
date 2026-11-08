import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  callViewMethod,
  getTransactionStatus,
  getAdminId,
  getStorageMinDeposit,
  getStorageBalanceBounds,
  getStorageBalanceOf,
  getAccountDependencyCounts,
  getNftMetadata,
  getNftToken,
  getNftTotalSupply,
  getDiscovery,
  getTokenIdForDiscovery,
  getClaimableBalance,
  getTotalRoyaltyLiabilities,
  getPendingRoyaltyWithdrawals,
  getLicenseOffer,
  getLicenseOffersForDiscovery,
  getLicenseRequest,
  getLicense,
  getLicenseRequestsForDiscovery,
  getLicenseRequestsForOffer,
  setMockRpcClient,
  resetMockRpcClient,
  NearContractPanicError,
  NearMethodNotFoundError,
  NearAccountNotFoundError,
  NearRpcTimeoutError,
  NearRpcRateLimitError,
  NearRpcError,
} from "../src/services/nearContract.js";

beforeEach(() => {
  resetMockRpcClient();
});

afterEach(() => {
  resetMockRpcClient();
});

test("1. callViewMethod correctly encodes JSON arguments into Base64 UTF-8 and decodes byte response", async () => {
  let capturedPayload = null;

  setMockRpcClient({
    execute: async (method, params) => {
      capturedPayload = { method, params };
      const returnObj = {
        discovery_id: "disc-101",
        token_id: "tok-101",
        custodian_id: "alice.testnet",
        rights_controller_id: "alice.testnet",
        evidence_manifest_hash: "a".repeat(64),
        beneficiary_splits: [{ account_id: "alice.testnet", basis_points: 10000 }],
        registered_at: "1700000000000000000",
        lineage_parents: [],
      };
      const bytes = Array.from(Buffer.from(JSON.stringify(returnObj), "utf8"));
      return { result: bytes };
    },
  });

  const res = await callViewMethod("get_discovery", { token_id: "tok-101" });

  assert.equal(capturedPayload.method, "query");
  assert.equal(capturedPayload.params.request_type, "call_function");
  assert.equal(capturedPayload.params.method_name, "get_discovery");

  // Verify Base64 argument encoding
  const decodedArgs = JSON.parse(Buffer.from(capturedPayload.params.args_base64, "base64").toString("utf8"));
  assert.deepEqual(decodedArgs, { token_id: "tok-101" });

  // Verify decoded return payload
  assert.equal(res.discovery_id, "disc-101");
  assert.equal(res.token_id, "tok-101");
});

test("2. callViewMethod handles empty/void response as null", async () => {
  setMockRpcClient({
    execute: async () => ({ result: [] }),
  });

  const res = await callViewMethod("get_discovery", { token_id: "nonexistent" });
  assert.equal(res, null);
});

test("3. Missing contract method throws NearMethodNotFoundError", async () => {
  setMockRpcClient({
    execute: async () => {
      const err = new Error("MethodNotFound: Method not found on contract");
      throw new NearMethodNotFoundError("ERR_NEAR_METHOD_NOT_FOUND: Method not found", "invalid_method");
    },
  });

  await assert.rejects(
    async () => callViewMethod("invalid_method"),
    (err) => {
      assert.ok(err instanceof NearMethodNotFoundError);
      assert.equal(err.name, "NearMethodNotFoundError");
      return true;
    }
  );
});

test("4. Unknown contract account throws NearAccountNotFoundError", async () => {
  setMockRpcClient({
    execute: async () => {
      throw new NearAccountNotFoundError("AccountDoesNotExist: Target contract account does not exist", "bad.testnet");
    },
  });

  await assert.rejects(
    async () => callViewMethod("get_admin_id", {}, { contractId: "bad.testnet" }),
    (err) => {
      assert.ok(err instanceof NearAccountNotFoundError);
      return true;
    }
  );
});

test("5. Contract panic throws NearContractPanicError with panic details", async () => {
  setMockRpcClient({
    execute: async () => {
      throw new NearContractPanicError(
        "Smart contract execution panicked",
        "GuestPanic: ERR_PASSPORT_NON_TRANSFERABLE"
      );
    },
  });

  await assert.rejects(
    async () => callViewMethod("nft_transfer"),
    (err) => {
      assert.ok(err instanceof NearContractPanicError);
      assert.ok(err.panicMessage.includes("ERR_PASSPORT_NON_TRANSFERABLE"));
      return true;
    }
  );
});

test("6. Network timeout throws NearRpcTimeoutError", async () => {
  setMockRpcClient({
    execute: async () => {
      throw new NearRpcTimeoutError("ERR_NEAR_RPC_TIMEOUT: Request timed out");
    },
  });

  await assert.rejects(
    async () => callViewMethod("get_admin_id"),
    (err) => {
      assert.ok(err instanceof NearRpcTimeoutError);
      assert.equal(err.status, 504);
      return true;
    }
  );
});

test("7. HTTP 429 rate limit throws NearRpcRateLimitError", async () => {
  setMockRpcClient({
    execute: async () => {
      throw new NearRpcRateLimitError("ERR_NEAR_RPC_RATE_LIMIT");
    },
  });

  await assert.rejects(
    async () => callViewMethod("get_admin_id"),
    (err) => {
      assert.ok(err instanceof NearRpcRateLimitError);
      assert.equal(err.status, 429);
      return true;
    }
  );
});

test("8. All contract view client methods correctly construct requests and decode values", async () => {
  const methodHandlers = {
    get_admin_id: "koket-knovara-dev.testnet",
    get_storage_min_deposit: "2700000000000000000000",
    storage_balance_bounds: { min: "2700000000000000000000", max: null },
    storage_balance_of: { total: "5000000000000000000000", available: "2300000000000000000000" },
    get_account_dependency_counts: {
      custodian_count: 1,
      rights_controller_count: 1,
      beneficiary_reference_count: 0,
      persistent_license_count: 0,
      active_license_count: 0,
    },
    nft_metadata: { spec: "nft-1.0.0", name: "KNOVARA", symbol: "KNOVARA" },
    nft_token: { token_id: "tok-1", owner_id: "alice.testnet" },
    nft_total_supply: "1",
    get_discovery: { discovery_id: "disc-1", token_id: "tok-1" },
    get_token_id_for_discovery: "tok-1",
    get_claimable_balance: "1000000000000000000000000",
    get_total_royalty_liabilities: "5000000000000000000000000",
    get_pending_royalty_withdrawals: "0",
    get_license_offer: { offer_id: "off-1", price_yocto: "1000000" },
    get_license_offers_for_discovery: [{ offer_id: "off-1" }],
    get_license_request: { request_id: "req-1", status: "Requested" },
    get_license: { request_id: "req-1", status: "Requested" },
    get_license_requests_for_discovery: [{ request_id: "req-1" }],
    get_license_requests_for_offer: [{ request_id: "req-1" }],
  };

  setMockRpcClient({
    execute: async (_method, params) => {
      const handler = methodHandlers[params.method_name];
      const bytes = Array.from(Buffer.from(JSON.stringify(handler), "utf8"));
      return { result: bytes };
    },
  });

  assert.equal(await getAdminId(), "koket-knovara-dev.testnet");
  assert.equal(await getStorageMinDeposit(), "2700000000000000000000");

  const bounds = await getStorageBalanceBounds();
  assert.equal(bounds.min, "2700000000000000000000");

  const balance = await getStorageBalanceOf("alice.testnet");
  assert.equal(balance.available, "2300000000000000000000");

  const deps = await getAccountDependencyCounts("alice.testnet");
  assert.equal(deps.custodian_count, 1);

  const nftMeta = await getNftMetadata();
  assert.equal(nftMeta.name, "KNOVARA");

  const token = await getNftToken("tok-1");
  assert.equal(token.token_id, "tok-1");

  const supply = await getNftTotalSupply();
  assert.equal(supply, "1");

  const disc = await getDiscovery("tok-1");
  assert.equal(disc.discovery_id, "disc-1");

  const tokenId = await getTokenIdForDiscovery("disc-1");
  assert.equal(tokenId, "tok-1");

  const royalties = await getClaimableBalance("alice.testnet");
  assert.equal(royalties, "1000000000000000000000000");

  const liabilities = await getTotalRoyaltyLiabilities();
  assert.equal(liabilities, "5000000000000000000000000");

  const pending = await getPendingRoyaltyWithdrawals();
  assert.equal(pending, "0");

  const offer = await getLicenseOffer("off-1");
  assert.equal(offer.offer_id, "off-1");

  const discOffers = await getLicenseOffersForDiscovery("disc-1");
  assert.equal(discOffers.length, 1);

  const req = await getLicenseRequest("req-1");
  assert.equal(req.request_id, "req-1");

  const lic = await getLicense("req-1");
  assert.equal(lic.request_id, "req-1");

  const discReqs = await getLicenseRequestsForDiscovery("disc-1");
  assert.equal(discReqs.length, 1);

  const offerReqs = await getLicenseRequestsForOffer("off-1");
  assert.equal(offerReqs.length, 1);
});

test("9. getTransactionStatus correctly formats [txHash, senderAccountId] params", async () => {
  let capturedMethod = null;
  let capturedParams = null;

  setMockRpcClient({
    execute: async (method, params) => {
      capturedMethod = method;
      capturedParams = params;
      return {
        status: { SuccessValue: "" },
        transaction: { hash: "8zYDQFA2PCgRmizHLxpJDrj2poSycyrgVUnyH5VwnXuk" },
      };
    },
  });

  const txHash = "8zYDQFA2PCgRmizHLxpJDrj2poSycyrgVUnyH5VwnXuk";
  const res = await getTransactionStatus(txHash, "alice.testnet");

  assert.equal(capturedMethod, "tx");
  assert.deepEqual(capturedParams, [txHash, "alice.testnet"]);
  assert.ok(res.status.SuccessValue !== undefined);
});

