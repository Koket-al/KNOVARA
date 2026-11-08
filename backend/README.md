# KNOVARA Backend — Wallet-Native NEP-413 Authentication & API Service

Production-ready backend foundation for **KNOVARA**, providing passwordless Web3 authentication via **NEP-413** wallet signatures, on-chain key validation against the NEAR Testnet blockchain, secure HttpOnly cookie session management backed by MongoDB Atlas, private evidence ingestion to Cloudflare R2, cryptographic fingerprinting (RFC 8785 / SHA-256), smart contract integration, and real-time blockchain state synchronization.

---

## 1. Architecture & Locked Stack

- **Runtime:** Node.js 24 LTS
- **Module System:** JavaScript ES Modules (`"type": "module"`)
- **Web Framework:** Express 4.x
- **Database:** MongoDB Atlas (via Mongoose 8.x)
- **Session Storage:** MongoDB Atlas Session Store (`connect-mongo` 5.x)
- **Object Storage:** Cloudflare R2 via AWS SDK for JavaScript v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- **Cryptography & Serialization:**
  - `borsh` (v2.0.0): Strict NEP-413 canonical struct serialization
  - `tweetnacl`: Pure JavaScript Ed25519 detached signature verification
  - `bs58`: Base58 public key decoding for NEAR protocol keys
  - `json-canonicalize`: RFC 8785 JSON Canonicalization Scheme (JCS)
  - Node.js native `crypto`: SHA-256 streaming hashing and CSPRNG entropy generation
- **Security Middleware:** `helmet`, `cors`, `express-rate-limit`, `cookie-parser`
- **Smart Contract Target:** `koket-knovara-dev.testnet` on NEAR Testnet (`https://rpc.testnet.near.org`)

---

## 2. Smart Contract Integration & Blockchain State Synchronization (Stage 4.4)

### 2.1 Authoritative Principles
1. **Blockchain as Single Source of Truth:** NEAR Testnet state is authoritative for all ownership, custody, licensing terms, and financial amounts. MongoDB collections operate purely as materialized read projections.
2. **Exact Decimal Strings for yoctoNEAR:** All financial values (`price_yocto`, `claimable_balance_yocto`, `total_amount`, `attached_deposit`) are stored and transmitted strictly as unsigned decimal strings (`/^\d+$/`). Floating-point conversions are strictly forbidden.
3. **Zero Private-Key Custody:** The backend never custodies, accepts, handles, or signs transactions with user private keys or the contract deployer key. Wallets sign all transactions client-side.
4. **Stale Update Prevention:** Projections compare the transaction's block height against the stored document's `block_height`. Transactions with lower block heights are discarded to prevent out-of-order state corruption.
5. **Receipt-Level Failure Traps:** Asynchronous callback receipts (`receipts_outcome`) are inspected for execution panics even if the outer transaction succeeded.

### 2.2 Core Synchronization Services
- **`services/nearContract.js`:** Authoritative JSON-RPC 2.0 view client for all 19 KNOVARA smart contract methods and transaction status queries with exponential backoff and rate-limit handling.
- **`services/eventParser.js`:** Strict parser and validator for NEP-297 events across `transaction_outcome` and `receipts_outcome`, enforcing NEP-171 (`1.2.0`) and KNOVARA Licensing (`1.0.0`) standards.
- **`services/syncService.js`:** Transaction-driven state synchronizer coordinating contract queries, hash consistency checks, and evidence lifecycle transitions.
- **`services/transactionVerifier.js`:** Reconciles on-chain transaction outcomes, verifies session account signer match, validates receiver contract ID and method allowlist, and handles mempool lag (202 Accepted).
- **`services/transactionIntent.js`:** Prepares unsigned transaction intent payloads for frontend wallet signing, authoritatively deriving exact attached deposits from on-chain approved requests.

---

## 3. MongoDB Data Models & Projections

### 3.1 `User` (`users` collection)
Represents authenticated NEAR accounts. Zero passwords, emails, or private keys.

### 3.2 `AuthChallenge` (`auth_challenges` collection)
Single-use authentication challenges with automatic TTL cleanup and atomic consumption.

### 3.3 `EvidenceUpload` (`evidence_uploads` collection)
Private evidence files in Cloudflare R2 (`PENDING` -> `VERIFIED` -> `ATTACHED`).

### 3.4 `EvidenceManifest` & `PublicMetadataDescriptor`
RFC 8785 canonical evidence manifest and NEP-177 public metadata descriptors with immutable SHA-256 fingerprints.

### 3.5 `DiscoveryProjection` (`discovery_projections` collection)
Materialized projection of registered on-chain discoveries with text search indices.

| Field | Type | Description |
|---|---|---|
| `discovery_id` | String | Unique discovery identifier (unique index) |
| `token_id` | String | On-chain Passport NFT token ID (unique index) |
| `custodian_id` | String | NEAR account holding NFT custody |
| `rights_controller_id` | String | NEAR account controlling licensing rights |
| `public_metadata` | Object | Public title, description, category, tags |
| `evidence_manifest_hash` | String | 64-hex char SHA-256 manifest fingerprint |
| `reference` | String | URI to public metadata descriptor |
| `reference_hash` | String | Base64-encoded 32-byte SHA-256 descriptor hash |
| `beneficiary_splits` | Array | Beneficiary accounts and basis points |
| `sync_status` | String | `"SYNCED"` or `"RECONCILIATION_REQUIRED"` |
| `block_height` | Number | Block height of latest synced state |

### 3.6 `LicenseOfferProjection` (`license_offer_projections` collection)
Materialized projection of active and deactivated licensing offers.

| Field | Type | Description |
|---|---|---|
| `offer_id` | String | Unique offer identifier (unique index) |
| `discovery_id` | String | Target discovery ID |
| `rights_controller_id` | String | Rights controller account ID |
| `scope` | String | Commercial, academic, or custom scope |
| `price_yocto` | String | Price in yoctoNEAR decimal string |
| `terms_hash` | String | 64-hex char terms SHA-256 hash |
| `duration_days` | Number | License duration in days |
| `is_active` | Boolean | Offer activation flag |
| `block_height` | Number | Block height of latest state |

### 3.7 `LicenseRequestProjection` (`license_request_projections` collection)
Tracks license requests throughout the lifecycle (`Requested`, `Approved`, `Rejected`, `Active`, `Expired`).

### 3.8 `ChainTransaction` (`chain_transactions` collection)
Idempotent record of reconciled NEAR transactions with execution outcomes and parsed NEP-297 events.

### 3.9 `AccountRoyaltyProjection` (`account_royalty_projections` collection)
Tracks claimable balances and pending withdrawals in exact yoctoNEAR strings.

---

## 4. API Endpoints

### 4.1 Authentication & System
- `GET /health` / `GET /api/v1/health`: System health, NEAR network, and contract target.
- `POST /api/v1/auth/challenge`: Issues single-use 32-byte cryptographic nonce and CSRF state.
- `POST /api/v1/auth/verify`: Verifies NEP-413 Ed25519 signature and on-chain FullAccess key; issues session.
- `GET /api/v1/auth/session`: Returns current authenticated account details.
- `POST /api/v1/auth/logout`: Clears session cookie and destroys server session.

### 4.2 Discovery Browsing & Search
- `GET /api/v1/discoveries`: Search and browse public registered discoveries (supports `page`, `limit`, `q`, `category`, `sort`).
- `GET /api/v1/discoveries/:discoveryId`: Retrieves projection for a single discovery.
- `GET /api/v1/discoveries/:discoveryId/passport`: Retrieves live on-chain NEP-171 Passport NFT token metadata.
- `GET /api/v1/discoveries/:discoveryId/offers`: Retrieves active licensing offers for a discovery.

### 4.3 Licensing Offers & Requests
- `GET /api/v1/licenses/offers/:offerId`: Retrieves details for a specific offer.
- `GET /api/v1/licenses/offers/:offerId/requests`: Retrieves requests for an offer (Rights Controller sees all; buyer sees own).
- `GET /api/v1/licenses/requests/:requestId`: Retrieves request details (restricted to buyer and rights controller).
- `GET /api/v1/licenses/discoveries/:discoveryId/requests`: Retrieves all requests for a discovery (rights controller only).

### 4.4 Authenticated Account Portfolio & Balances
- `GET /api/v1/account/discoveries`: Discoveries where caller is custodian or rights controller.
- `GET /api/v1/account/offers`: Offers managed by caller.
- `GET /api/v1/account/requests`: Requests submitted by caller.
- `GET /api/v1/account/licenses`: Active licenses held by caller.
- `GET /api/v1/account/royalties`: Live query to contract `get_claimable_balance` and `get_pending_royalty_withdrawals`.
- `GET /api/v1/account/storage`: Live query to contract `storage_balance_of` and `storage_balance_bounds`.

### 4.5 Transaction Intent & Reconciliation
- `POST /api/v1/transactions/intents/:action`: Prepares validated unsigned transaction intent payload for wallet signing (`register-discovery`, `create-offer`, `deactivate-offer`, `request-license`, `approve-request`, `reject-request`, `pay-license`, `withdraw-earnings`, `expire-license`, `storage-deposit`).
- `POST /api/v1/transactions/reconcile`: Verifies on-chain transaction execution and synchronizes state to MongoDB projections.
- `GET /api/v1/transactions/:txHash`: Queries stored status for a reconciled transaction.

---

## 5. Automated Test Suite

Run the full automated test suite using Node.js native test runner:

```bash
cd backend
npm test
```

### Test Coverage (138 Automated Tests):
1. **`tests/app.test.js`** (5 tests): Server startup, health checks, Helmet security headers, CORS credentials, 404 handler.
2. **`tests/models.test.js`** (4 tests): User schema, AuthChallenge 32-byte nonces, atomic consumption, upsert idempotency.
3. **`tests/nep413.test.js`** (8 tests): NEP-413 Tag constant ($2^{31}+413$), Borsh serialization canonical byte structure, Ed25519 signature verification, tamper rejection.
4. **`tests/authFlow.test.js`** (12 tests): End-to-end challenge/verify lifecycle, nonce replay defense, TTL expiration, CSRF state mismatch, FullAccess key enforcement, 503 RPC failover.
5. **`tests/security.test.js`** (6 tests): `requireAuth` middleware, session fixation rotation, sanitized error responses, zero secret leakage.
6. **`tests/securityReview.test.js`** (10 tests): Nonce consumption order, concurrent replay defense, callback URL whitelist validation, reverse-proxy HTTPS cookie handling.
7. **`tests/rfc8785.test.js`** (10 tests): JCS canonicalization, sorting invariants, Unicode test vectors, SHA-256 fingerprinting.
8. **`tests/evidencePipeline.test.js`** (18 tests): Authenticated evidence upload lifecycle, R2 presigned PUTs, streaming SHA-256, NEP-177 descriptors, registration preparation.
9. **`tests/evidenceIntegrityAudit.test.js`** (6 tests): TOCTOU defense, immutable destination key path separation, file signature magic byte validation (PDF, PNG, CSV).
10. **`tests/nearContract.test.js`** (9 tests): NEAR JSON-RPC 2.0 view client encoding/decoding, method not found, account not found, panics, rate limits, timeouts.
11. **`tests/eventParser.test.js`** (18 tests): NEP-297 log parsing for NEP-171 (`1.2.0`) and all KNOVARA licensing (`1.0.0`) events across transaction and receipts outcomes.
12. **`tests/transactionReconciliation.test.js`** (16 tests): Transaction verification, signer mismatch defense, receiver contract validation, method allowlist, pending mempool lag (202), receipt failure detection, discovery registration sync, offer/request/payment sync, stale update prevention, idempotency.
13. **`tests/discoveryAndLicensingApis.test.js`** (14 tests): Discovery search/pagination/category filtering, passport NFT retrieval, offer/request privacy authorization, account royalties and storage balance queries, transaction intent generation.
