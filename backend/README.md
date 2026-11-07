# KNOVARA Backend — Wallet-Native NEP-413 Authentication & API Service

Production-ready backend foundation for **KNOVARA**, providing passwordless Web3 authentication via **NEP-413** wallet signatures, on-chain key validation against the NEAR Testnet blockchain, and secure HttpOnly cookie session management backed by MongoDB Atlas.

---

## 1. Architecture & Locked Stack

- **Runtime:** Node.js 24 LTS
- **Module System:** JavaScript ES Modules (`"type": "module"`)
- **Web Framework:** Express 4.x
- **Database:** MongoDB Atlas (via Mongoose 8.x)
- **Session Storage:** MongoDB Atlas Session Store (`connect-mongo` 5.x)
- **Cryptography & Serialization:**
  - `borsh` (v2.0.0): Strict NEP-413 canonical struct serialization
  - `tweetnacl`: Pure JavaScript Ed25519 detached signature verification
  - `bs58`: Base58 public key decoding for NEAR protocol keys
  - Node.js native `crypto`: SHA-256 hashing and CSPRNG entropy generation
- **Security Middleware:** `helmet`, `cors`, `express-rate-limit`, `cookie-parser`
- **Smart Contract Target:** `koket-knovara-dev.testnet` on NEAR Testnet (`https://rpc.testnet.near.org`)

---

## 2. NEP-413 Wallet Authentication Specification

NEP-413 is the standard for off-chain message signing on NEAR Protocol without triggering blockchain transactions or consuming gas.

### 2.1 Canonical Payload Struct

The canonical Borsh struct defined by NEP-413:

```rust
struct Payload {
    tag: u32,                     // 2147484061 (2^31 + 413)
    message: String,              // Human-readable authentication statement
    nonce: [u8; 32],              // 32-byte cryptographically secure random entropy
    recipient: String,            // Target contract / app identifier ("koket-knovara-dev.testnet")
    callback_url: Option<String>, // Optional redirect callback URL
}
```

### 2.2 Borsh Serialization & Hashing Standard

1. **Tag Value:** $2^{31} + 413 = 2,147,484,061$ (`0x8000019d`, serialized in little-endian as `[0x9d, 0x01, 0x00, 0x80]`).
2. **String Serialization:** 4-byte little-endian length prefix followed by UTF-8 bytes.
3. **Nonce Serialization:** Exactly 32 raw bytes (no length prefix, fixed array `[u8; 32]`).
4. **Option Serialization:** `0x00` if `None`; `0x01` followed by 4-byte length prefix and string bytes if `Some(string)`.
5. **CSRF State Isolation:** The transport-level CSRF token `state` is strictly excluded from the Borsh serialized payload. It is validated separately against MongoDB before cryptographic operations.
6. **Message Digest:** The SHA-256 digest of the serialized Borsh bytes is computed:
   $$\text{Digest} = \text{SHA-256}(\text{Borsh}(\text{Payload}))$$
7. **Signature Verification:** The 64-byte Ed25519 signature is verified against the 32-byte public key and the SHA-256 digest using `nacl.sign.detached.verify()`.

### 2.3 On-Chain Key Permission Enforcement

Even if a cryptographic signature is mathematically valid, KNOVARA verifies that the public key is registered on the NEAR blockchain and holds **FullAccess** permissions:

- **RPC Method:** `view_access_key`
- **Params:** `account_id: <accountId>`, `public_key: ed25519:<base58_key>`, `finality: "optimistic"`
- **Rule:** Session authentication is permitted **only** if `result.permission === "FullAccess"`. FunctionCall (access-key restricted) credentials cannot establish admin or wallet sessions (`403 Forbidden`).
- **Resilience:** Unrecognized keys fail with `403 Forbidden` (`ERR_KEY_NOT_FOUND_ON_ACCOUNT`), while upstream RPC timeouts/500s return `503 Service Unavailable` (`ERR_BLOCKCHAIN_UNAVAILABLE`).

---

## 3. MongoDB Data Models

### 3.1 `User` (`users` collection)

Represents authenticated NEAR accounts. Zero passwords, emails, or private keys are ever stored or requested.

| Field | Type | Description |
|---|---|---|
| `account_id` | String | Primary NEAR account identifier (`lowercase`, `trim`, unique index) |
| `created_at` | Date | Initial user registration timestamp |
| `last_login_at` | Date | Timestamp of most recent successful NEP-413 verification |
| `status` | String | Account state (`"active"`, `"suspended"`, default `"active"`) |

### 3.2 `AuthChallenge` (`auth_challenges` collection)

Single-use authentication challenges with automatic TTL cleanup and atomic consumption.

| Field | Type | Description |
|---|---|---|
| `nonce` | String | 64-character hex string representing the 32-byte cryptographic nonce (unique index) |
| `account_id` | String | NEAR account requesting authentication |
| `state` | String | 32-character hex CSRF anti-tamper token |
| `message` | String | Plain-text authentication message displayed in wallet |
| `recipient` | String | KNOVARA contract ID (`koket-knovara-dev.testnet`) |
| `callback_url` | String (optional) | Optional application callback |
| `created_at` | Date | Challenge generation timestamp |
| `expires_at` | Date | Expiration timestamp (default 5 minutes from creation, TTL index) |
| `consumed` | Boolean | Consumption flag |

### 3.3 `EvidenceUpload` (`evidence_uploads` collection)

Tracks raw evidence files throughout the upload, verification, and registration lifecycle.

| Field | Type | Description |
|---|---|---|
| `upload_id` | String | Unique upload identifier UUID (unique index) |
| `owner_account_id` | String | Authenticated NEAR account ID of uploader |
| `original_filename` | String | Sanitized filename of evidence file |
| `declared_content_type` | String | MIME type declared in upload initiation |
| `verified_content_type` | String | MIME type verified from storage metadata |
| `expected_size` | Number | Expected size in bytes |
| `actual_size` | Number | Verified byte length measured during stream hashing |
| `r2_object_key` | String | Private R2 object key (never exposed in public APIs) |
| `sha256_digest` | String | 64-character lowercase hexadecimal hash of raw bytes |
| `classification` | String | Canonical classification (`TECHNICAL_DOCUMENTATION`, `EVALUATION_SAMPLE`, `FULL_DATASET`, `CAD_SCHEMATICS`, `OTHER`) |
| `status` | String | Lifecycle state: `PENDING_UPLOAD`, `VERIFIED`, `ATTACHED`, `DELETED`, `EXPIRED` |
| `created_at` | Date | Upload initiation timestamp |
| `expires_at` | Date | Expiration timestamp for presigned PUT URL |
| `verified_at` | Date | Completion and hash verification timestamp |
| `attached_discovery_id` | String | Bound discovery identifier once attached |

### 3.4 `EvidenceManifest` (`evidence_manifests` collection)

Canonical RFC 8785 evidence manifest for a discovery. Stored privately.

| Field | Type | Description |
|---|---|---|
| `manifest_id` | String | Unique manifest identifier (`manifest-<discovery_id>`) |
| `owner_account_id` | String | Discovery owner NEAR account |
| `discovery_id` | String | Unique discovery ID |
| `manifest_schema_version` | String | Manifest schema version ("1.0.0") |
| `evidence_item_ids` | [String] | Ordered list of attached evidence upload IDs |
| `canonical_manifest_json` | String | Exact UTF-8 canonical RFC 8785 JSON string |
| `evidence_manifest_hash` | String | 64-character hex SHA-256 digest submitted on-chain |
| `r2_manifest_object_key` | String | Private R2 key for stored manifest |
| `is_immutable` | Boolean | True (manifest cannot be altered post-generation) |

### 3.5 `PublicMetadataDescriptor` (`public_descriptors` collection)

Public-safe NEP-177 metadata descriptor served at a stable URL.

| Field | Type | Description |
|---|---|---|
| `discovery_id` | String | Discovery ID (compound unique index with `version`) |
| `version` | String | Semantic version ("1.0.0") |
| `canonical_descriptor_json` | String | Exact public-safe RFC 8785 canonical JSON bytes |
| `sha256_digest` | String | 64-character hex SHA-256 digest |
| `reference_hash` | String | Standard 44-character Base64 encoding of 32 SHA-256 bytes |
| `reference` | String | Stable absolute public URL (`/api/v1/metadata/:discoveryId/:version`) |
| `is_immutable` | Boolean | True (immutable cached metadata) |

---

## 4. REST API Reference

All authentication routes are mounted on both `/api/v1/auth` and `/api/auth`. Evidence and metadata routes are mounted on `/api/v1/discoveries` and `/api/v1/metadata`.

### 4.1 `GET /health` (and `/api/health`, `/api/v1/health`)
Returns service operational health and blockchain connectivity status.

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "knovara-backend",
  "version": "1.0.0",
  "network": "testnet",
  "contract": "koket-knovara-dev.testnet",
  "database": "connected",
  "timestamp": "2026-11-07T23:00:00.000Z"
}
```

### 4.2 `POST /api/v1/auth/challenge`
Generates a new single-use 32-byte cryptographic challenge and CSRF token. Rate-limited to 60 requests per 15 minutes per IP.

**Request Body:**
```json
{
  "accountId": "alice.testnet",
  "callbackUrl": "http://localhost:3000/auth/callback"
}
```

**Response (200 OK):**
```json
{
  "nonceHex": "4a2f8b9e...",
  "state": "8f3a1b0c...",
  "message": "Authenticate with KNOVARA at 2026-11-07T23:00:00.000Z",
  "recipient": "koket-knovara-dev.testnet",
  "callbackUrl": "http://localhost:3000/auth/callback",
  "expiresAt": "2026-11-07T23:05:00.000Z"
}
```

### 4.3 `POST /api/v1/auth/verify`
Verifies an Ed25519 signature over the canonical NEP-413 payload, consumes the nonce atomically via `findOneAndDelete`, validates FullAccess key permission on NEAR RPC, and establishes a secure browser session. Rate-limited to 30 requests per 15 minutes per IP.

**Request Body:**
```json
{
  "accountId": "alice.testnet",
  "publicKey": "ed25519:6E2Xp8mY4tKjN3...",
  "signature": "dGVzdC1zaWduYXR1cmUtYmFzZTY0...",
  "nonceHex": "4a2f8b9e...",
  "state": "8f3a1b0c..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "accountId": "alice.testnet",
    "createdAt": "2026-11-07T23:00:00.000Z",
    "lastLoginAt": "2026-11-07T23:00:00.000Z",
    "status": "active"
  }
}
```
**Headers Set:**
```http
Set-Cookie: knovara.sid=s%3A...; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400
```

### 4.4 `GET /api/v1/auth/session`
Queries the active authenticated wallet session.

**Response (Authenticated, 200 OK):**
```json
{
  "authenticated": true,
  "user": {
    "accountId": "alice.testnet",
    "createdAt": "2026-11-07T23:00:00.000Z",
    "lastLoginAt": "2026-11-07T23:00:00.000Z",
    "status": "active"
  }
}
```

**Response (Unauthenticated, 200 OK):**
```json
{
  "authenticated": false
}
```

### 4.5 `POST /api/v1/auth/logout`
Destroys the active server-side session and clears the client browser cookie.

**Response (200 OK):**
```json
{
  "success": true
}
```

### 4.6 `POST /api/v1/discoveries/evidence/uploads`
Requests a short-lived presigned PUT URL for browser-to-R2 raw evidence upload. Requires authenticated session (`requireAuth`).

**Request Body:**
```json
{
  "filename": "clinical_trial_report.pdf",
  "contentType": "application/pdf",
  "fileSize": 2048000,
  "classification": "TECHNICAL_DOCUMENTATION"
}
```

**Response (201 Created):**
```json
{
  "uploadId": "3b2f9a1e-...",
  "presignedUrl": "https://<account>.r2.cloudflarestorage.com/knovara-evidence/uploads/pending/...",
  "r2Key": "uploads/pending/alice.testnet/3b2f9a1e-.../clinical_trial_report.pdf",
  "expiresIn": 900,
  "requiredHeaders": {
    "Content-Type": "application/pdf"
  }
}
```

### 4.7 `POST /api/v1/discoveries/evidence/uploads/:uploadId/complete`
Independently verifies the uploaded object in R2, calculates streaming SHA-256 over raw bytes, and moves the object into an immutable evidence key. Idempotent. Requires upload owner session.

**Response (200 OK):**
```json
{
  "success": true,
  "upload": {
    "uploadId": "3b2f9a1e-...",
    "sha256Digest": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "actualSize": 2048000,
    "verifiedContentType": "application/pdf",
    "status": "VERIFIED",
    "verifiedAt": "2026-11-07T23:00:00.000Z"
  }
}
```

### 4.8 `POST /api/v1/discoveries/prepare-registration`
Validates researcher-owned verified evidence, generates the RFC 8785 canonical evidence manifest and public metadata descriptor, computes both hashes, and formats the exact payload for smart contract `register_discovery_and_mint`.

**Request Body:**
```json
{
  "discoveryId": "disc-covid-mrna-001",
  "tokenId": "tok-covid-mrna-001",
  "custodianId": "alice.testnet",
  "rightsControllerId": "alice.testnet",
  "evidenceUploadIds": ["3b2f9a1e-..."],
  "publicMetadata": {
    "title": "Novel Lipid Nanoparticle Formulation",
    "description": "Public research summary",
    "media": "https://example.com/cover.png",
    "category": "BIOTECHNOLOGY"
  },
  "beneficiarySplits": [
    { "account_id": "alice.testnet", "basis_points": 8000 },
    { "account_id": "bob.testnet", "basis_points": 2000 }
  ]
}
```

**Response (200 OK):**
```json
{
  "discovery_id": "disc-covid-mrna-001",
  "token_id": "tok-covid-mrna-001",
  "custodian_id": "alice.testnet",
  "rights_controller_id": "alice.testnet",
  "evidence_manifest_hash": "a4f5c6d7...",
  "metadata": {
    "title": "Novel Lipid Nanoparticle Formulation",
    "description": "Public research summary",
    "media": "https://example.com/cover.png",
    "reference": "http://localhost:5000/api/v1/metadata/disc-covid-mrna-001/1.0.0",
    "reference_hash": "dGVzdC1oYXNoLTMyLWJ5dGVzLWJhc2U2NC1leGFtcGxl"
  },
  "beneficiary_splits": [
    { "account_id": "alice.testnet", "basis_points": 8000 },
    { "account_id": "bob.testnet", "basis_points": 2000 }
  ]
}
```

### 4.9 `GET /api/v1/metadata/:discoveryId/:version`
Public unauthenticated read-only endpoint returning the exact immutable public metadata descriptor bytes used to compute the NEP-177 `reference_hash`. Sets `Cache-Control: public, max-age=31536000, immutable`.

---

## 5. Cloudflare R2 Configuration & Bucket Setup

### 5.1 Bucket Creation & CORS
1. In Cloudflare Dashboard, navigate to **R2 > Create Bucket** and name it `knovara-evidence`.
2. Configure **Bucket CORS Policy** (Settings > CORS Policy):
```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://knovara.vercel.app"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
3. Ensure the bucket is **Private** (Public Access disabled).

### 5.2 Scoped API Token Permissions
Create an API Token in Cloudflare R2 with minimum required privileges:
- **Permissions:** `Object Read & Write`
- **Bucket Scope:** Restrict to `knovara-evidence`
- Never grant Cloudflare account-wide Super Administrator tokens to the backend service.

---

## 6. Security Invariants

1. **Atomic Nonce Consumption & Anti-DoS Protection:**
   - Challenges follow an exact 8-step verification pipeline:
     1. Retrieve challenge by nonce.
     2. Application-level expiration check (`now > expires_at`).
     3. CSRF `state` equality check.
     4. Account ID equality check.
     5. Reconstruct canonical Borsh payload using server-stored values.
     6. Ed25519 detached signature verification.
     7. NEAR RPC on-chain `FullAccess` key validation.
     8. **Atomic conditional consumption:** `AuthChallenge.findOneAndDelete({ nonce, account_id, state, expires_at: { $gt: now } })`.
   - **Protection against DoS:** Forged or failed signature attempts fail at step 6 and **never** trigger step 8. The legitimate user's challenge is preserved intact.
   - **Concurrent Replay Defense:** If two verification requests arrive simultaneously with identical valid signatures, MongoDB's atomic `findOneAndDelete` matches and deletes the document for exactly one request; the second request returns `null` and is rejected with `401 Unauthorized` (`ERR_AUTH_NONCE_INVALID_OR_ALREADY_USED`).
2. **Callback URL Whitelist & Integrity:**
   - Callback URLs must strictly match pre-configured origins (`FRONTEND_ORIGIN`, `ALLOWED_CALLBACK_ORIGINS`).
   - Rejects malformed URLs, protocols other than `https:` (or `http:` on localhost), embedded credentials (`user:pass@`), and unauthorized domains.
   - The server-validated canonical URL is embedded in the NEP-413 Borsh payload; client-side tampering causes cryptographic verification failure.
3. **Session Fixation Prevention & Rotation:**
   - Upon successful verification, the Express session is regenerated (`req.session.regenerate`) before attaching user state, creating an entirely new session ID.
4. **Reverse Proxy & Cookie Hardening (Render / Vercel):**
   - Express trusts the upstream reverse proxy via `trust proxy: 1` (`config.TRUST_PROXY`).
   - Cookies (`knovara.sid`) are issued with `HttpOnly: true`, `SameSite: "Lax"`, and `Secure: true` in production (honoring Render's `X-Forwarded-Proto: https`).
   - Under the approved architecture's Vercel `/api/*` rewrite, requests are same-origin from the browser's perspective, permitting `SameSite=Lax` without cross-origin cookie exposure.
5. **Private Evidence Immutability & Decoupled Storage:**
   - Evidence files in R2 are private and never accessible publicly.
   - Upload keys are randomized (`uploads/pending/...`) and finalized to content-addressed keys (`evidence/${owner}/${sha256}/${filename}`).
   - Temporary upload keys are destroyed post-verification.
   - Streaming hash verification calculates SHA-256 over exact raw bytes; client-supplied hashes are never trusted.
6. **Data Privacy & Zero Custody:**
   - The backend never generates, accepts, handles, or stores wallet private keys, seed phrases, or master credentials.
7. **Sanitized Error Handling:**
   - Stack traces and internal database errors are sanitized in all HTTP responses, preventing information disclosure.

---

## 7. Installation & Testing

### 7.1 Prerequisites
- Node.js 24 LTS (`nvm use 24` or `.nvmrc`)
- npm >= 10.0.0

### 7.2 Setup
```bash
cd backend
cp .env.example .env
npm install
```

### 7.3 Run Automated Tests
The automated test suite runs via the native Node.js test runner:
```bash
npm test
```

The test suite executes 72 comprehensive tests across 8 test modules with zero external socket dependencies (using isolated in-memory test harnesses for MongoDB and R2):
- `tests/app.test.js`: Health routes, Helmet headers, CORS credentials, 404 handler.
- `tests/models.test.js`: User schema, AuthChallenge 32-byte nonces, atomic consumption, upsert idempotency.
- `tests/nep413.test.js`: NEP-413 Tag constant ($2^{31}+413$), Borsh serialization byte structure, Ed25519 verification, tamper detection.
- `tests/authFlow.test.js`: End-to-end challenge/verify lifecycle, replay defense, TTL expiration, CSRF protection, FullAccess key enforcement, 503 RPC failover.
- `tests/security.test.js`: `requireAuth` middleware, session fixation rotation, sanitized error responses, zero secret leakage.
- `tests/securityReview.test.js`: Nonce consumption order, protection against failed signature challenge burning, concurrent replay defense, callback URL whitelist validation, and reverse-proxy HTTPS cookie handling.
- `tests/rfc8785.test.js`: RFC 8785 canonical JSON sorting invariants, recursive key sorting, deterministic number representation, Unicode handling, and test vectors.
- `tests/evidencePipeline.test.js`: Authenticated evidence upload lifecycle, R2 direct presigned PUT URLs, streaming raw SHA-256 hashing, immutable finalization, stable public metadata descriptor retrieval, and `prepare-registration` payload generation for smart contract `register_discovery_and_mint`.

### 7.4 Start the Backend Server
```bash
# Production mode
npm start

# Development mode with auto-reload
npm run dev
```

