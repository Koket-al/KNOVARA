# KNOVARA Smart Contract — Core Discovery, Passport NFT & Licensing Engine

Implementation of KNOVARA's unified smart contract on NEAR Protocol for the **NEAR Hackathon 2026**.

---

## 1. Standards Compliance & Classifications

The KNOVARA Discovery Rights Passport NFT and Licensing Engine strictly adhere to NEAR Enhancement Proposals:

| Interface Method | Standard | Classification & Scope |
| :--- | :--- | :--- |
| `nft_token` | **NEP-171** | Core view query returning `token_id`, `owner_id` (custodian), and `metadata`. |
| `nft_metadata` | **NEP-177** | Contract-level metadata specification (`spec: "nft-1.0.0"`, symbol `KNOVARA`). |
| `nft_total_supply` | **NEP-181** | Enumeration supply query returning total minted passports. |
| `nft_transfer` / `nft_transfer_call` | **NEP-171** | Permanently disabled for MVP. Reverts with `ERR_PASSPORT_NON_TRANSFERABLE` (soulbound). |
| `nft_approve` / `nft_revoke` / `nft_revoke_all` | **NEP-178** | Disabled for MVP. Reverts with `ERR_APPROVALS_NOT_SUPPORTED`. |
| `log_nft_mint` | **NEP-297** | Standard event log emitting `standard: "nep171"`, `version: "1.2.0"`, `event: "nft_mint"`. |
| Licensing Events | **NEP-297** | Structured events emitting `standard: "knovara_licensing"`, `version: "1.0.0"`. |

> [!NOTE]
> **NEP-181 Enumeration Deferral Justification:** Full NEP-181 enumeration methods (`nft_tokens`, `nft_tokens_for_owner`) are deliberately deferred as specified in Technical Architecture v1.0.4. Unbounded table iteration directly on-chain creates gas and storage hazards. Full catalog exploration and owner filtering are offloaded to off-chain indexer projections.

---

## 2. Licensing Lifecycle: Offers, Requests, Approvals & Payments

### 2.1 Canonical Licensing Scopes
KNOVARA implements the 7 canonical scopes defined in PRD v1.1.2:
- `AcademicResearch` (Research)
- `CommercialUse` (Commercial)
- `AiModelTraining` (AI training)
- `AiModelFineTuning` (AI fine-tuning)
- `AiKnowledgeRetrieval` (RAG / knowledge access)
- `ResearchEvaluation` (Evaluation)
- `CustomTerms` (Custom)

### 2.2 Licensing Offers
- **Creation (`create_license_offer`):** Only the discovery's designated `rights_controller_id` can create offers. NFT custody alone grants zero licensing authority.
- **Offer Parameters:** `offer_id`, `discovery_id`, `scope`, `price_yocto`, `terms_hash` (64 hex characters -> 32-byte SHA-256 digest), `duration_days` (1..=365).
- **Deactivation (`deactivate_license_offer`):** Rights Controller can deactivate offers (`is_active = false`). Deactivated offers reject all new requests while preserving existing requests.

### 2.3 License Requests
- **Submission (`request_license`):** A prospective buyer requests a license against an active offer.
- **Exact Terms Acceptance:** The request enforces `accepted_terms_hash == offer.terms_hash`, preventing terms mismatch.
- **Immutable Snapshot:** The contract creates an immutable snapshot of offer terms (`offer_id`, `discovery_id`, `buyer_id`, `scope`, `price_yocto`, `duration_days`, `license_terms_hash`).
- **Dependency Tracking:** Increments `persistent_license_count` for `buyer_id`, blocking unregistration while the record exists.

### 2.4 Approvals & Rejections
- **Approval (`approve_license_request`):** Only the Rights Controller can approve. Transitions status from `Requested` to `Approved { payment_deadline: now + 7 days }` using checked timestamp arithmetic. Measures serialized storage growth and charges the Rights Controller exactly once.
- **Rejection (`reject_license_request`):** Only the Rights Controller can reject. Validates rejection reason (non-empty, maximum 256 characters) and transitions status to `Rejected { reason }`. Measures variable-length storage growth and charges the Rights Controller exactly once. Reverts cleanly if the Rights Controller has insufficient available storage balance.
- **State Machine Invariant:** Only transitions from `Requested` are permitted. Conflicting or repeated transitions (`Approved -> Rejected`, `Rejected -> Approved`, `Approved -> Approved`) are strictly rejected.

### 2.5 Payments, Activation & Royalty Accounting (Stage 3.4)
- **Payment & Activation (`pay_for_license` / alias `pay_license`):**
  - Requires status `Approved { payment_deadline }`.
  - Enforces `predecessor == buyer_id`, `attached_deposit == record.price_yocto` (exact payment match; underpayment and overpayment strictly rejected).
  - Verifies `accepted_terms_hash == record.license_terms_hash` and `block_timestamp <= payment_deadline`.
  - Updates status to `Active { activated_at, expires_at }` where `expires_at = activated_at + (duration_days * 86,400 * 1,000,000,000)`.
  - Increments `active_license_count` for `buyer_id`. `persistent_license_count` remains unchanged.
  - Measures 8-byte status growth delta and bills buyer's available storage balance.
  - Emits NEP-297 `license_paid` and `license_activated` events.
- **Deterministic Royalty Distribution:**
  - 100% of license payment is distributed among immutable discovery `beneficiary_splits` by basis points.
  - Pre-allocated zero-balance slots in `claimable_balances` are updated in place with zero additional storage costs.
  - Integer division remainder (`price - sum(allocations)`) is deterministically allocated to `rights_controller_id`.
  - Updates `total_royalty_liabilities` aggregate tracking metric.
  - Emits NEP-297 `royalties_allocated` event.
- **Pull-Payment Royalty Withdrawal (`withdraw_earnings`):**
  - Follows Checks-Effects-Interactions pattern: zeroes beneficiary's `claimable_balances` locally before dispatching cross-contract transfer promise.
  - Private callback `on_withdraw_earnings_callback` verifies transfer success. On failure, restores balance without overwriting subsequent earnings.
  - Emits NEP-297 `royalty_withdrawal_initiated`, `royalty_withdrawn`, and `royalty_withdrawal_failed` events.
- **License Expiration (`expire_license` / `expire_license_request`):**
  - Permissionless methods callable by any account once timestamps lapse.
  - `expire_license`: requires status `Active`, `block_timestamp >= expires_at`. Decrements `active_license_count`. `persistent_license_count` remains intact. Emits `license_expired`. Claimable royalties remain withdrawable indefinitely.
  - `expire_license_request`: requires status `Approved`, `block_timestamp > payment_deadline`. Transitions status to `Expired`. Emits `license_request_expired`.

---

## 3. Storage Accounting & Double-Charging Prevention (NEP-145)

All persistent storage growth is dynamically measured and billed:
1. **Flushing & Baselines:** Collections are flushed before measuring `initial_storage` and again before `final_storage`.
2. **Exact-Once Storage Billing:**
   - Offer storage is billed to the Rights Controller.
   - Request storage is billed to the requesting Buyer.
   - Approval status transition storage is billed to the Rights Controller.
   - Rejection status transition and reason string storage is billed to the Rights Controller.
   - License activation status expansion is billed to the Buyer.
3. **Double Charging Prevention:** `internal_sponsor_or_increment_dependency` mutates dependency records without separately billing caller balance; the outer differential delta captures all persistent bytes once.
4. **Beneficiary Pre-Allocation:** Beneficiary 0-balance entries in `claimable_balances` are funded upfront by the registrant, guaranteeing zero storage failure during payment execution.

---

## 4. Build & Test Commands

All commands run inside `contracts/knovara`:

```bash
# 1. Format check
cargo fmt --check

# 2. Type & compile check
cargo check

# 3. Run complete automated test suite (172 Unit tests + 27 Workspaces Sandbox tests = 199 total)
cargo test

# 4. Build optimized release WebAssembly binary
cargo build --target wasm32-unknown-unknown --release
```

**Compiled Artifact:**
`target/wasm32-unknown-unknown/release/knovara.wasm` (594 KB)
