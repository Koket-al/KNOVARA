import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseEventLogLine,
  parseTransactionEvents,
  NEP171_STANDARD,
  NEP171_VERSION,
  KNOVARA_LICENSING_STANDARD,
  KNOVARA_LICENSING_VERSION,
} from "../src/services/eventParser.js";

describe("Event Parser (NEP-297)", () => {
  describe("parseEventLogLine", () => {
    it("parses valid NEP-171 nft_mint event", () => {
      const log = `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"alice.testnet","token_ids":["knovara-disc-101"],"memo":"Discovery Passport Minted"}]}`;
      const parsed = parseEventLogLine(log);

      assert.ok(parsed);
      assert.equal(parsed.standard, NEP171_STANDARD);
      assert.equal(parsed.version, NEP171_VERSION);
      assert.equal(parsed.event, "nft_mint");
      assert.equal(parsed.data.length, 1);
      assert.equal(parsed.data[0].owner_id, "alice.testnet");
      assert.deepEqual(parsed.data[0].token_ids, ["knovara-disc-101"]);
    });

    it("parses valid license_offer_created event", () => {
      const log = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_offer_created","data":[{"offer_id":"offer-1","discovery_id":"disc-1","rights_controller_id":"alice.testnet","scope":"commercial_exclusive","price_yocto":"1000000000000000000000000","terms_hash":"${"d".repeat(64)}","duration_days":365}]}`;
      const parsed = parseEventLogLine(log);

      assert.ok(parsed);
      assert.equal(parsed.standard, KNOVARA_LICENSING_STANDARD);
      assert.equal(parsed.version, KNOVARA_LICENSING_VERSION);
      assert.equal(parsed.event, "license_offer_created");
      assert.equal(parsed.data[0].offer_id, "offer-1");
      assert.equal(parsed.data[0].price_yocto, "1000000000000000000000000");
    });

    it("parses valid license_offer_deactivated event", () => {
      const log = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_offer_deactivated","data":[{"offer_id":"offer-1","discovery_id":"disc-1","rights_controller_id":"alice.testnet"}]}`;
      const parsed = parseEventLogLine(log);

      assert.ok(parsed);
      assert.equal(parsed.event, "license_offer_deactivated");
      assert.equal(parsed.data[0].offer_id, "offer-1");
    });

    it("parses valid license_requested event", () => {
      const log = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_requested","data":[{"request_id":"req-1","offer_id":"offer-1","discovery_id":"disc-1","buyer_id":"bob.testnet","scope":"commercial_exclusive","price_yocto":"1000000000000000000000000","accepted_terms_hash":"${"e".repeat(64)}"}]}`;
      const parsed = parseEventLogLine(log);

      assert.ok(parsed);
      assert.equal(parsed.event, "license_requested");
      assert.equal(parsed.data[0].request_id, "req-1");
      assert.equal(parsed.data[0].buyer_id, "bob.testnet");
    });

    it("parses valid license_approved event", () => {
      const log = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_approved","data":[{"request_id":"req-1","offer_id":"offer-1","discovery_id":"disc-1","buyer_id":"bob.testnet","rights_controller_id":"alice.testnet","payment_deadline":"1700000000000000000"}]}`;
      const parsed = parseEventLogLine(log);

      assert.ok(parsed);
      assert.equal(parsed.event, "license_approved");
      assert.equal(parsed.data[0].payment_deadline, "1700000000000000000");
    });

    it("parses valid license_rejected event", () => {
      const log = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_rejected","data":[{"request_id":"req-1","offer_id":"offer-1","discovery_id":"disc-1","buyer_id":"bob.testnet","rights_controller_id":"alice.testnet","reason":"Incompatible proposed scope"}]}`;
      const parsed = parseEventLogLine(log);

      assert.ok(parsed);
      assert.equal(parsed.event, "license_rejected");
      assert.equal(parsed.data[0].reason, "Incompatible proposed scope");
    });

    it("parses valid license_paid event", () => {
      const log = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_paid","data":[{"request_id":"req-1","discovery_id":"disc-1","buyer_id":"bob.testnet","price_yocto":"1000000000000000000000000"}]}`;
      const parsed = parseEventLogLine(log);

      assert.ok(parsed);
      assert.equal(parsed.event, "license_paid");
      assert.equal(parsed.data[0].price_yocto, "1000000000000000000000000");
    });

    it("parses valid license_activated event", () => {
      const log = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_activated","data":[{"request_id":"req-1","discovery_id":"disc-1","buyer_id":"bob.testnet","activated_at":"1690000000000000000","expires_at":"1721536000000000000"}]}`;
      const parsed = parseEventLogLine(log);

      assert.ok(parsed);
      assert.equal(parsed.event, "license_activated");
      assert.equal(parsed.data[0].activated_at, "1690000000000000000");
      assert.equal(parsed.data[0].expires_at, "1721536000000000000");
    });

    it("parses valid royalties_allocated event", () => {
      const log = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"royalties_allocated","data":[{"request_id":"req-1","discovery_id":"disc-1","total_amount":"1000000000000000000000000","allocations_count":3}]}`;
      const parsed = parseEventLogLine(log);

      assert.ok(parsed);
      assert.equal(parsed.event, "royalties_allocated");
      assert.equal(parsed.data[0].allocations_count, 3);
    });

    it("parses valid royalty_withdrawal_initiated, royalty_withdrawn, and royalty_withdrawal_failed events", () => {
      const logInit = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"royalty_withdrawal_initiated","data":[{"beneficiary_id":"carol.testnet","amount":"500000000000000000000000"}]}`;
      const parsedInit = parseEventLogLine(logInit);
      assert.ok(parsedInit);
      assert.equal(parsedInit.event, "royalty_withdrawal_initiated");
      assert.equal(parsedInit.data[0].amount, "500000000000000000000000");

      const logSuccess = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"royalty_withdrawn","data":[{"beneficiary_id":"carol.testnet","amount":"500000000000000000000000"}]}`;
      const parsedSuccess = parseEventLogLine(logSuccess);
      assert.ok(parsedSuccess);
      assert.equal(parsedSuccess.event, "royalty_withdrawn");

      const logFail = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"royalty_withdrawal_failed","data":[{"beneficiary_id":"carol.testnet","amount":"500000000000000000000000"}]}`;
      const parsedFail = parseEventLogLine(logFail);
      assert.ok(parsedFail);
      assert.equal(parsedFail.event, "royalty_withdrawal_failed");
    });

    it("parses valid license_expired and license_request_expired events", () => {
      const logExp = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_expired","data":[{"request_id":"req-1","discovery_id":"disc-1","buyer_id":"bob.testnet"}]}`;
      const parsedExp = parseEventLogLine(logExp);
      assert.ok(parsedExp);
      assert.equal(parsedExp.event, "license_expired");

      const logReqExp = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_request_expired","data":[{"request_id":"req-2","discovery_id":"disc-1","buyer_id":"bob.testnet"}]}`;
      const parsedReqExp = parseEventLogLine(logReqExp);
      assert.ok(parsedReqExp);
      assert.equal(parsedReqExp.event, "license_request_expired");
    });

    it("rejects non-EVENT_JSON logs", () => {
      assert.equal(parseEventLogLine("Standard info log line from smart contract"), null);
      assert.equal(parseEventLogLine("Panicked at 'assertion failed: false', src/lib.rs:42"), null);
      assert.equal(parseEventLogLine(""), null);
      assert.equal(parseEventLogLine(null), null);
    });

    it("rejects malformed JSON", () => {
      assert.equal(parseEventLogLine("EVENT_JSON:{not valid json}"), null);
      assert.equal(parseEventLogLine("EVENT_JSON:"), null);
    });

    it("rejects unsupported standards", () => {
      const log = `EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"a","new_owner_id":"b","amount":"10"}]}`;
      assert.equal(parseEventLogLine(log), null);
    });

    it("rejects standard version mismatch", () => {
      const logNep171Old = `EVENT_JSON:{"standard":"nep171","version":"1.0.0","event":"nft_mint","data":[{"owner_id":"alice.testnet","token_ids":["id-1"]}]}`;
      assert.equal(parseEventLogLine(logNep171Old), null);

      const logKnovaraOld = `EVENT_JSON:{"standard":"knovara_licensing","version":"2.0.0","event":"license_offer_created","data":[{"offer_id":"o-1","discovery_id":"d-1","rights_controller_id":"alice.testnet","price_yocto":"10"}]}`;
      assert.equal(parseEventLogLine(logKnovaraOld), null);
    });

    it("rejects invalid event names or missing required payload fields", () => {
      const unknownEvent = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"unknown_event_xyz","data":[{"foo":"bar"}]}`;
      assert.equal(parseEventLogLine(unknownEvent), null);

      const missingOfferId = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_offer_created","data":[{"discovery_id":"d-1"}]}`;
      assert.equal(parseEventLogLine(missingOfferId), null);

      const emptyData = `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"nft_mint","data":[]}`;
      assert.equal(parseEventLogLine(emptyData), null);
    });
  });

  describe("parseTransactionEvents", () => {
    it("extracts events from both transaction_outcome and receipts_outcome", () => {
      const mockTxResult = {
        transaction_outcome: {
          outcome: {
            logs: [
              "Standard debug log",
              `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"alice.testnet","token_ids":["disc-100"]}]}`,
            ],
          },
        },
        receipts_outcome: [
          {
            id: "receipt-1",
            outcome: {
              executor_id: "koket-knovara-dev.testnet",
              logs: [
                `EVENT_JSON:{"standard":"knovara_licensing","version":"1.0.0","event":"license_offer_created","data":[{"offer_id":"off-1","discovery_id":"disc-100","rights_controller_id":"alice.testnet","scope":"commercial_exclusive","price_yocto":"1000000000000000000000000","terms_hash":"${"c".repeat(64)}","duration_days":180}]}`,
              ],
            },
          },
          {
            id: "receipt-2",
            outcome: {
              executor_id: "koket-knovara-dev.testnet",
              logs: ["Unrelated log"],
            },
          },
        ],
      };

      const events = parseTransactionEvents(mockTxResult);
      assert.equal(events.length, 2);

      assert.equal(events[0].event, "nft_mint");
      assert.equal(events[0].source, "transaction_outcome");

      assert.equal(events[1].event, "license_offer_created");
      assert.equal(events[1].source, "receipt_outcome");
      assert.equal(events[1].receipt_id, "receipt-1");
      assert.equal(events[1].executor_id, "koket-knovara-dev.testnet");
    });

    it("returns empty array for invalid or empty inputs", () => {
      assert.deepEqual(parseTransactionEvents(null), []);
      assert.deepEqual(parseTransactionEvents({}), []);
      assert.deepEqual(parseTransactionEvents({ transaction_outcome: {}, receipts_outcome: [] }), []);
    });
  });
});
