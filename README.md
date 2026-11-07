# KNOVARA — Protocol & Smart Contract Engine

**Knowledge + A New Era**  
*Decentralized Discovery Registration, Evidence Fingerprinting & Machine-Readable Licensing Infrastructure on NEAR Protocol.*

Developed for the **NEAR Hackathon 2026**.

---

## 1. Architectural Milestones (Stages 3.1 – 3.4)

The KNOVARA smart contract is implemented as a single, unified NEAR contract written in Rust (`near-sdk 5.30.1`, `near-contract-standards 5.30.1`, Rust 1.95 MSRV).

### Key Architectural Invariants
1. **Explicit Separation of Rights:**
   - **NFT Custodian (`owner_id`):** Holds custody of the on-chain Discovery Rights Passport NFT.
   - **Rights Controller (`rights_controller_id`):** The sole administrative authority authorized to configure license offers, approve requests, and manage terms. Stored separately and never inferred from NFT custody.
   - **Royalty Beneficiaries (`beneficiary_splits`):** Discrete recipients with exact basis-point splits summing to 10,000 (100.00%).
2. **Absolute Non-Transferability (Soulbound NFT):**
   - `nft_transfer` and `nft_transfer_call` require 1 yoctoNEAR and revert unconditionally with `ERR_PASSPORT_NON_TRANSFERABLE`.
   - NEP-178 approvals (`nft_approve`, `nft_revoke`, `nft_revoke_all`) revert with `ERR_APPROVALS_NOT_SUPPORTED`.
   - Token custody cannot be reallocated or expropriated.
3. **NFT Standards Compliance & Deferrals:**
   - **`nft_token`:** NEP-171 Core view query returning token custody and metadata.
   - **`nft_metadata`:** NEP-177 Contract Metadata returning specification details.
   - **`nft_total_supply`:** NEP-181 Enumeration supply query returning total minted passports. Full NEP-181 enumeration (`nft_tokens`, `nft_tokens_for_owner`) is deliberately deferred to off-chain indexer queries as per Architecture v1.0.4.
   - **`log_nft_mint`:** Emits NEP-297 compliant event (`standard: "nep171"`, `version: "1.2.0"`, `event: "nft_mint"`).
4. **Dual Cryptographic Fingerprinting & Reference Hash Responsibility:**
   - **Evidence Manifest Hash:** Fixed 32-byte SHA-256 digest of the RFC 8785 canonical manifest of private evidence files. Stored in contract state as `[u8; 32]` and exposed as 64 lowercase hex characters.
   - **Metadata Reference Hash (NEP-177):** Base64-encoded 32-byte SHA-256 digest of the public-safe metadata descriptor. The smart contract performs strict structural validation (Base64 decoding to 32 bytes) without HTTP fetching or network access. The backend calculates SHA-256 over exact canonical descriptor bytes and verifies downloaded descriptors against the on-chain hash.
5. **Dynamic Storage Accounting (NEP-145) with Exact-Once Billing:**
   - Registrants fund actual storage bytes consumed across all persistent storage categories in differential baselines (`final_storage - initial_storage`).
   - All collections are flushed to trie storage before initial measurement and before final measurement.
   - Prevents double-charging: `internal_sponsor_or_increment_dependency` mutates dependency records without separately billing caller storage balance.
   - Beneficiary accounts are pre-allocated with 0-balance entries in `claimable_balances` at registration time, guaranteeing subsequent licensing payments never revert due to storage expansion.
   - Accounts serving multiple roles (custodian, controller, beneficiary) allocate exactly one dependency record.
6. **$O(1)$ Dependency Tracking:**
   - `AccountDependencyCounts` tracks `custodian_count`, `rights_controller_count`, `beneficiary_reference_count`, `active_license_count`, and `persistent_license_count`.
   - Unregistration (`storage_unregister`) is strictly blocked as long as any dependency counter is $> 0$.
7. **End-to-End Licensing Lifecycle (Stages 3.3 & 3.4):**
   - **Offers & Requests:** 7 canonical scopes, exact 32-byte terms hash matching, immutable snapshot of commercial terms upon request.
   - **Approvals & Rejections:** Rights Controller authority enforced; status growth dynamically measured and billed to controller.
   - **Exact Payments & Activation:** Attached deposit must exactly equal `price_yocto`. Status transitions to `Active { activated_at, expires_at }`. Active license counter incremented.
   - **100% Royalty Distribution:** Royalties allocated strictly by basis points to pre-allocated beneficiary entries. Remainder deterministically allocated to Rights Controller.
   - **Asynchronous Pull Withdrawals:** Effects-before-interaction pattern with callback failure rollback.
   - **Permissionless Expiration:** Lapsed licenses transition to `Expired`, decrementing active license counters while preserving persistent audit records and claimable royalties.

---

## 2. Directory Structure

```text
knovara/
├── contracts/knovara/               # Smart contract engine (Stages 3.1 – 3.4)
│   ├── Cargo.toml                   # near-sdk 5.30.1, near-contract-standards 5.30.1, hex 0.4.3
│   ├── src/                         # lib.rs, discovery.rs, nft.rs, licensing.rs, payments.rs, etc.
│   ├── tests/                       # 27 NEAR Sandbox integration tests
│   └── target/wasm32-unknown-unknown/release/knovara.wasm
├── backend/                         # Express API, NEP-413 Auth & R2 Evidence Engine (Stages 4.2 – 4.3)
│   ├── package.json                 # Node.js 24 LTS, AWS SDK v3, json-canonicalize, borsh, tweetnacl
│   ├── .env.example                 # Configuration template for Testnet, MongoDB Atlas & Cloudflare R2
│   ├── src/
│   │   ├── server.js                # Server entry point & graceful shutdown
│   │   ├── app.js                   # Express application factory & middleware pipeline
│   │   ├── config/                  # env.js, database.js
│   │   ├── models/                  # User, AuthChallenge, EvidenceUpload, EvidenceManifest, PublicMetadataDescriptor
│   │   ├── routes/                  # health.js, auth.js, evidence.js, metadata.js
│   │   ├── services/                # authVerifier.js, nearRpc.js, r2Storage.js, manifestBuilder.js
│   │   └── middleware/              # auth.js (requireAuth), rateLimiter.js, errorHandler.js
│   └── tests/                       # 72 automated unit & integration tests
│       ├── app.test.js              # Health, headers, CORS, 404
│       ├── models.test.js           # User, AuthChallenge, atomic consumption, upsert
│       ├── nep413.test.js           # NEP-413 Borsh tag 2^31+413, Ed25519 signing/verifying
│       ├── authFlow.test.js         # Challenge -> Verify -> Session -> Logout lifecycle
│       ├── security.test.js         # requireAuth, session fixation rotation, secret safety
│       ├── securityReview.test.js   # Nonce consumption order, concurrent replay, proxy cookies, callback whitelist
│       ├── rfc8785.test.js          # JCS canonicalization, sorting invariants, Unicode test vectors
│       └── evidencePipeline.test.js # Evidence upload lifecycle, R2 presigned PUTs, streaming SHA-256, NEP-177 descriptor
```

---

## 3. Build & Test Commands

All commands run inside `contracts/knovara`:

```bash
cd contracts/knovara

# 1. Format check
cargo fmt --check

# 2. Type and lint check
cargo check

# 3. Run complete automated test suite (172 Unit Tests + 27 NEAR Sandbox Tests = 199 Total)
cargo test

# 4. Compile optimized release WebAssembly binary
cargo build --target wasm32-unknown-unknown --release
```

### Backend (Node.js 24 LTS & Express)
All commands run inside `backend`:

```bash
cd backend

# 1. Install dependencies
npm install

# 2. Run automated test suite (72 Unit & Integration Tests)
npm test

# 3. Run development server with watch mode
npm run dev

# 4. Start production server
npm start
```

---

## 4. Hackathon Demonstration Runbook

Judges can verify the contract execution directly via automated integration tests or NEAR Sandbox:

1. **Storage Deposit:** User deposits NEAR storage capital via `storage_deposit`.
2. **Discovery Registration:** Caller submits `discovery_id`, `token_id`, `custodian_id`, `rights_controller_id`, `evidence_manifest_hash` (64 hex characters), NEP-177 `metadata`, and `beneficiary_splits` totaling 10,000 bps.
3. **Passport NFT Mint:** Contract verifies inputs, deducts dynamic storage bytes from caller's storage balance, pre-allocates beneficiary keys, increments dependency counters, mints the passport NFT to the custodian, and emits a NEP-297 `nft_mint` event.
4. **Inspect Token (NEP-171 / NEP-177):** Query `nft_token(token_id)` to verify custodian ownership and public metadata references.
5. **Non-Transferability Guard:** Attempt `nft_transfer(token_id)` with 1 yoctoNEAR; verify transaction reverts with `ERR_PASSPORT_NON_TRANSFERABLE`.
6. **Query Discovery Record:** Query `get_discovery(token_id)` to inspect on-chain rights controller, evidence manifest hash, and royalty splits.
7. **Create Licensing Offer:** Rights Controller offers discovery for licensing (`create_license_offer`) across 7 canonical scopes, with exact 32-byte terms hash. Dynamic storage billed to Controller.
8. **Request License:** Prospective licensee requests license (`request_license`) accepting exact terms hash. Snapshots commercial terms, increments `persistent_license_count`, and deducts storage from Buyer.
9. **Review & Approval:** Rights Controller approves request (`approve_license_request`), transitioning status to `Approved` with 7-day payment deadline snapshot. Status storage growth billed to Controller. Rejection (`reject_license_request`) validates reason (max 256 chars) and bills storage to Controller.
10. **License Payment & Activation:** Buyer executes `pay_for_license(request_id, accepted_terms_hash)` attaching exact `price_yocto`. Contract validates buyer identity, terms hash, and deadline. Measures status expansion (8 bytes), increments `active_license_count`, transitions status to `Active { activated_at, expires_at }`, and emits `license_paid` and `license_activated`.
11. **100% Royalty Allocation:** Payment is distributed among immutable beneficiaries by basis points into pre-allocated `claimable_balances` slots. Division remainder is assigned deterministically to the Rights Controller. Aggregates `total_royalty_liabilities`. Emits `royalties_allocated`.
12. **Pull-Payment Royalty Withdrawal:** Beneficiaries call `withdraw_earnings()` to transfer accumulated balance. Uses Checks-Effects-Interactions (zeroed locally before promise) and private callback rollback on failure. Emits `royalty_withdrawal_initiated` and `royalty_withdrawn`.
13. **Permissionless Expiration:** Any user calls `expire_license(request_id)` after `expires_at`. Status transitions to `Expired`, `active_license_count` is decremented, `persistent_license_count` remains intact, and accumulated royalties remain withdrawable indefinitely. Emits `license_expired`.
