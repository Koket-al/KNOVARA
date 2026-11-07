import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  canonicalizeJsonRfc8785,
  buildCanonicalEvidenceManifest,
  buildPublicMetadataDescriptor,
} from "../src/services/manifestBuilder.js";

// =========================================================================
// RFC 8785 CANONICALIZATION & EVIDENCE MANIFEST TESTS
// =========================================================================

test("21. Evidence array is deterministically sorted by stable evidence_id", () => {
  const itemA = {
    evidence_id: "ev-alpha",
    file_hash: "a".repeat(64),
    file_size: 100,
    media_type: "application/pdf",
  };
  const itemB = {
    evidence_id: "ev-beta",
    file_hash: "b".repeat(64),
    file_size: 200,
    media_type: "application/pdf",
  };
  const itemC = {
    evidence_id: "ev-gamma",
    file_hash: "c".repeat(64),
    file_size: 300,
    media_type: "application/pdf",
  };

  // Pass in reverse order: C, B, A
  const { manifest } = buildCanonicalEvidenceManifest({
    discoveryId: "disc-test-01",
    ownerAccountId: "alice.testnet",
    evidenceItems: [itemC, itemB, itemA],
  });

  // Must be sorted strictly: ev-alpha, ev-beta, ev-gamma
  assert.equal(manifest.items[0].evidence_id, "ev-alpha");
  assert.equal(manifest.items[1].evidence_id, "ev-beta");
  assert.equal(manifest.items[2].evidence_id, "ev-gamma");
});

test("22. Object keys are canonicalized recursively in lexicographical order", () => {
  const unordered = {
    z: 1,
    a: {
      d: "deep",
      b: "nested",
    },
    m: [3, 2, 1],
  };

  const { canonicalJson } = canonicalizeJsonRfc8785(unordered);
  // Expected: {"a":{"b":"nested","d":"deep"},"m":[3,2,1],"z":1}
  assert.equal(canonicalJson, '{"a":{"b":"nested","d":"deep"},"m":[3,2,1],"z":1}');
});

test("23. Property order changes produce byte-for-byte identical canonical representations", () => {
  const obj1 = { title: "Research Paper", author: "Dr. Alice", year: 2026 };
  const obj2 = { year: 2026, title: "Research Paper", author: "Dr. Alice" };
  const obj3 = { author: "Dr. Alice", year: 2026, title: "Research Paper" };

  const res1 = canonicalizeJsonRfc8785(obj1);
  const res2 = canonicalizeJsonRfc8785(obj2);
  const res3 = canonicalizeJsonRfc8785(obj3);

  assert.equal(res1.canonicalJson, res2.canonicalJson);
  assert.equal(res2.canonicalJson, res3.canonicalJson);
  assert.equal(res1.sha256Hex, res2.sha256Hex);
  assert.equal(res2.sha256Hex, res3.sha256Hex);
});

test("24. Array input order normalization: manifests with shuffled evidence produce identical hashes", () => {
  const items = [
    { evidence_id: "ev-01", file_hash: "1".repeat(64), file_size: 10, media_type: "text/plain" },
    { evidence_id: "ev-02", file_hash: "2".repeat(64), file_size: 20, media_type: "text/plain" },
    { evidence_id: "ev-03", file_hash: "3".repeat(64), file_size: 30, media_type: "text/plain" },
  ];

  const timestamp = "2026-11-07T23:00:00.000Z";

  // Order 1: 01, 02, 03
  const manifest1 = buildCanonicalEvidenceManifest({
    discoveryId: "disc-norm-01",
    ownerAccountId: "alice.testnet",
    evidenceItems: [items[0], items[1], items[2]],
    createdAt: timestamp,
  });

  // Order 2: 03, 01, 02 (shuffled)
  const manifest2 = buildCanonicalEvidenceManifest({
    discoveryId: "disc-norm-01",
    ownerAccountId: "alice.testnet",
    evidenceItems: [items[2], items[0], items[1]],
    createdAt: timestamp,
  });

  assert.equal(manifest1.canonicalJson, manifest2.canonicalJson);
  assert.equal(manifest1.evidenceManifestHash, manifest2.evidenceManifestHash);
});

test("25. RFC 8785 Unicode handling (UTF-8 escape preservation and normalization)", () => {
  const unicodeObj = {
    title: "Quantum Computation in España & 日本",
    symbols: "λ × π = ∞ ⚛",
  };

  const { canonicalJson, canonicalBytes } = canonicalizeJsonRfc8785(unicodeObj);
  // Must preserve raw UTF-8 characters without artificial \uXXXX escaping
  assert.ok(canonicalJson.includes("España & 日本"));
  assert.ok(canonicalJson.includes("λ × π = ∞ ⚛"));

  // Verify byte length matches raw UTF-8 string encoding
  assert.equal(canonicalBytes.length, Buffer.from(canonicalJson, "utf8").length);
});

test("26. Invalid JCS input (circular structure / non-object) is rejected safely", () => {
  const circular = {};
  circular.self = circular;

  assert.throws(() => {
    canonicalizeJsonRfc8785(circular);
  }, /ERR_RFC8785_CANONICALIZATION_FAILED/);

  assert.throws(() => {
    canonicalizeJsonRfc8785(null);
  }, /ERR_INVALID_JCS_INPUT/);
});

test("27. Duplicate evidence IDs in the same manifest are strictly rejected", () => {
  const duplicateItems = [
    { evidence_id: "ev-duplicate", file_hash: "a".repeat(64), file_size: 100 },
    { evidence_id: "ev-duplicate", file_hash: "b".repeat(64), file_size: 200 },
  ];

  assert.throws(() => {
    buildCanonicalEvidenceManifest({
      discoveryId: "disc-dup",
      ownerAccountId: "alice.testnet",
      evidenceItems: duplicateItems,
    });
  }, /ERR_DUPLICATE_EVIDENCE_ID/);
});

test("28. Invalid evidence item fields (empty list, bad hash, negative size) are rejected", () => {
  assert.throws(() => {
    buildCanonicalEvidenceManifest({
      discoveryId: "disc-bad",
      ownerAccountId: "alice.testnet",
      evidenceItems: [],
    });
  }, /ERR_EMPTY_EVIDENCE_LIST/);

  assert.throws(() => {
    buildCanonicalEvidenceManifest({
      discoveryId: "disc-bad",
      ownerAccountId: "alice.testnet",
      evidenceItems: [{ evidence_id: "ev-1", file_hash: "bad_short_hash", file_size: 10 }],
    });
  }, /ERR_INVALID_EVIDENCE_HASH/);

  assert.throws(() => {
    buildCanonicalEvidenceManifest({
      discoveryId: "disc-bad",
      ownerAccountId: "alice.testnet",
      evidenceItems: [{ evidence_id: "ev-1", file_hash: "a".repeat(64), file_size: -50 }],
    });
  }, /ERR_INVALID_FILE_SIZE/);
});

test("29. Known RFC 8785 test vectors produce canonical output", () => {
  // RFC 8785 section 3.2.3: numbers and whitespace
  const vector1 = {
    numbers: [333333333.3333333, 1e30, 4.5],
    string: "Hello\nWorld\t!",
    empty: {},
  };

  const { canonicalJson } = canonicalizeJsonRfc8785(vector1);
  // Numbers must be rendered without extraneous zeros or scientific notation when integer/standard
  assert.ok(canonicalJson.includes("4.5"));
  assert.ok(canonicalJson.includes('"empty":{}'));
  assert.ok(canonicalJson.includes('"string":"Hello\\nWorld\\t!"'));
});

test("30. Canonical byte sequence produces expected 64-character lowercase hexadecimal hash", () => {
  const items = [
    { evidence_id: "ev-001", file_hash: "4".repeat(64), file_size: 1024, media_type: "application/pdf" },
  ];

  const { canonicalBytes, evidenceManifestHash } = buildCanonicalEvidenceManifest({
    discoveryId: "disc-hash-verify",
    ownerAccountId: "alice.testnet",
    evidenceItems: items,
    createdAt: "2026-11-07T23:00:00.000Z",
  });

  const expectedSha256 = crypto.createHash("sha256").update(canonicalBytes).digest("hex").toLowerCase();

  assert.equal(evidenceManifestHash, expectedSha256);
  assert.equal(evidenceManifestHash.length, 64);
  assert.match(evidenceManifestHash, /^[a-f0-9]{64}$/);
});

