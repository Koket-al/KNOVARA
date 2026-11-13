# KNOVARA 2.0 Product Requirements Document (PRD)

**Product Name:** KNOVARA 2.0  
**Brand Meaning:** Knowledge + A New Era (Novara)  
**Document Version:** 2.1.0  
**Status:** Approved Architecture Baseline (Refined per Prompt 01.1)  
**Target Milestone:** Agent-Native Discovery & API Licensing Protocol (Production MVP)  
**Author:** Principal Software Architect & Product Architect  

---

> [!IMPORTANT]
> **Illustrative Test Data Notice:** All personas, organization names (e.g., `Advanced Materials Research`, `Pacific Biomaterials`), account IDs (`freshkilt9593.testnet`, `vastuni3101.testnet`), discovery titles, API specifications, and sample file digests appearing throughout this document are test placeholders designed for prototyping and automated verification. They do not represent real-world commercial partnerships or certified scientific measurements.

---

## 1. Executive Summary & Product Vision

### 1.1 Brand Identity & Evolution
**KNOVARA** combines *Knowledge* with *A New Era* (Novara). In version 1.0, KNOVARA established an immutable cryptographic registry on the NEAR Protocol for documenting discovery priority, evidence manifests (RFC 8785), and licensing states.

In **KNOVARA 2.0**, KNOVARA evolves into an:
> **Agent-Native Marketplace and Infrastructure for Discovering, Licensing, Paying for, and Using Proprietary Knowledge and Technology.**

Modern technological organizations—corporations, research laboratories, algorithmic developers, materials scientists, and biotechnology innovators—own valuable intellectual property, specialized computational algorithms, proprietary datasets, and analytical models. They want to monetize these assets without exposing their underlying intellectual property or source code to the public.

Concurrently, autonomous and semi-autonomous AI agents increasingly require access to specialized real-world technologies, verified analytical tools, scientific calculation engines, and proprietary domain databases to accomplish complex tasks for their users.

KNOVARA connects these two parties through a standardized protocol:
$$\mathbf{REGISTER} \longrightarrow \mathbf{DISCOVER} \longrightarrow \mathbf{APPROVE} \longrightarrow \mathbf{SUBSCRIBE} \longrightarrow \mathbf{ACCESS} \longrightarrow \mathbf{USE}$$

```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                                  KNOVARA 2.0 CORE PRODUCT LOOP                                    |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                                                                                                   |
|    1. PUBLISHER                  2. KNOVARA PROTOCOL                    3. AI AGENT & OWNER       |
|   ┌────────────────────────┐    ┌─────────────────────────┐            ┌──────────────────────┐   |
|   │ Operates Proprietary   │    │ • Discovery Passport NFT│  Discover  │ • Discovers Tool     │   |
|   │ Technology on Its Own  │───>│ • Immutable OpenAPI Spec│<───────────│ • Inspects Docs      │   |
|   │ Cloud API Infrastructure│    │ • 30-Day Sub Offer      │            │ • Prepares Intent    │   |
|   └────────────────────────┘    └─────────────────────────┘            └──────────┬───────────┘   |
|               ▲                              │                                    │               |
|               │ Validated Request            │ On-Chain Settlement (NEAR)         │ Owner Signs   |
|               │ Forwarding via Gateway       ▼                                    ▼               |
|               │                 ┌─────────────────────────┐            ┌──────────────────────┐   |
|               │                 │ • Exact yoctoNEAR Escrow│            │ Human Owner Approves │   |
|               └─────────────────│ • Split Royalty Payout  │<───────────│ Payment in NEAR      │   |
|                                 │ • Scoped API Credential │            │ Testnet Wallet       │   |
|                                 └─────────────────────────┘            └──────────────────────┘   |
|                                                                                                   |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
```

### 1.2 Fundamental Architectural Principle: KNOVARA Does Not Host Publisher Technology
A core, non-negotiable architectural tenet of KNOVARA 2.0 is:
**KNOVARA NEVER HOSTS, EXECUTES, OR OPERATES THE PUBLISHER'S PROPRIETARY ALGORITHM OR ARBITRARY CODE.**

Publishers operate their own specialized infrastructure, cloud servers, development pipelines, and API endpoints. KNOVARA does not run Docker containers for external code, does not execute Python or C++ binaries uploaded by creators, and is not a general-purpose cloud computing provider.

Instead, KNOVARA provides the trust, discovery, licensing, on-chain billing, credential mediation, and access control gateway. When an authorized agent calls a tool:
1. The agent dispatches the call to the **KNOVARA API Gateway** presenting a KNOVARA-issued credential.
2. The Gateway authenticates the credential and cryptographically verifies active on-chain subscription status against strict cache freshness boundaries.
3. The Gateway validates the request against the publisher's registered OpenAPI specification.
4. The Gateway securely applies the publisher's upstream authentication headers (stored encrypted at rest with AES-256-GCM).
5. The Gateway proxies the authorized request to the publisher's actual upstream endpoint.
6. The publisher's infrastructure executes its algorithm and returns the result.
7. The Gateway sanitizes headers and passes the result back to the AI agent.

### 1.3 Approved Frontend Visual Identity & Design System
The visual presentation of KNOVARA reflects a refined, minimal, editorial, and technical aesthetic. It is explicitly **not** a conventional dark neon site, nor a generic brown-themed portal:

- **Color Palette:**
  - **Warm beige (`#DFD1B7`):** Primary structural surface and secondary containers.
  - **Light cream (`#E9E1CD`):** Clean, expansive application canvas background.
  - **Muted taupe (`#948878`):** Restrained dividers, subtle borders, and structural framing.
  - **Royal blue (`#1363DE`):** Distinctive primary brand color used for key actions, interactive states, and focal highlights.
  - **Sky blue (`#47B5FF`):** Secondary interactive accents, active badges, and focus rings.
- **Typography:**
  - **Headings:** Bold, clean sans-serif typography (`Inter` / `Plus Jakarta Sans`) establishing clear, authoritative hierarchy.
  - **Technical / Metadata:** Monospaced, typewriter-style typography (`JetBrains Mono`) for contract IDs, terms hashes, yoctoNEAR amounts, and OpenAPI schemas.
- **Design Principles:**
  - Generous whitespace, editorial restraint, and crisp layout geometry.
  - Subtle borders (`rgba(148, 136, 120, 0.4)`) and soft elevations.
  - High contrast for readability across both technical and administrative views.

---

## 2. Three Distinct Core Objects

KNOVARA 2.0 strictly decouples three fundamental domain entities across contracts, databases, gateways, and interfaces. Under no circumstances may these objects be conflated.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 THREE SEPARATE CORE OBJECTS                                      │
├────────────────────────────────┬────────────────────────────────┬───────────────────────────────┤
│  OBJECT A: PASSPORT NFT        │  OBJECT B: SUBSCRIPTION        │  OBJECT C: API CREDENTIAL     │
├────────────────────────────────┼────────────────────────────────┼───────────────────────────────┤
│ • NEP-171 Non-Transferable NFT │ • 30-Day On-Chain License      │ • Scoped Cryptographic Secret │
│ • Permanent Registry Anchor    │ • Bound to 1 Specific Asset    │ • Issued by KNOVARA Gateway   │
│ • Separate Custodian & Royalty │ • Exact yoctoNEAR Payment      │ • Bound to 1 Subscription     │
│ • Canonical Manifest Hash      │ • Active / Expired State       │ • Rotatable & Revocable       │
│ • Identifies the Technology    │ • Contract-Enforced Validity   │ • Validates Gateway Traffic   │
└────────────────────────────────┴────────────────────────────────┴───────────────────────────────┘
```

### 2.1 Object A: Discovery Rights Passport NFT (NEP-171 / NEP-177)
Every independently registered intellectual asset receives its own unique NEAR NFT.
- **Identity:** Represents the registered technology, discovery, or analytical asset.
- **Custody vs. Authority:** Decouples the **NFT Custodian** (the holding wallet), the **Rights Controller** (the authorized licensing manager), and the **Royalty Beneficiaries** (the accounts receiving revenue shares).
- **Non-Transferability:** Passports are soulbound/non-transferable in the MVP to guarantee provenance and prevent secondary market speculation from corrupting licensing authoritativeness.
- **Boundary:** The NFT is *not* the algorithm, *not* the API implementation, *not* a subscription, and does *not* grant execution access to third parties.

### 2.2 Object B: Subscription / License Agreement
A Subscription is an on-chain transactional agreement granting an identified AI agent permission to access **one specific asset's API** for a defined 30-day period.
- **Strict 1-to-1 Isolation:** A subscription to Asset A grants access to Asset A **only**. It never grants access to Asset B, even if Asset A and Asset B are registered by the exact same publisher organization.
- **Immutability of Terms:** Every subscription binds an immutable `terms_hash` matching the SHA-256 digest of the API Product Specification and licensing conditions.
- **Key Attributes:**
  - `subscription_id`: Globally unique identifier (e.g., `sub-mat-9x4k21`).
  - `discovery_id` / `token_id`: Identifies the exact Discovery Passport NFT.
  - `api_product_id`: Identifies the specific API product and version.
  - `agent_id`: Identifies the subscribing AI agent.
  - `buyer_wallet`: NEAR account ID recorded on-chain as the licensee.
  - `price_yocto`: Exact integer yoctoNEAR price paid.
  - `duration_days`: Exactly 30 days in MVP.
  - `start_timestamp` & `expiration_timestamp`: Chain-recorded timestamps.
  - `status`: `Requested`, `Approved`, `Active`, or `Expired`.

### 2.3 Object C: KNOVARA API Credential
The API Credential is the technical authorization bearer token issued by KNOVARA to the agent once on-chain subscription payment is verified.
- **Technical Scope:** Format `knov_live_<random_bytes>`. The plain-text token is displayed to the agent/owner exactly once. KNOVARA stores only the SHA-256 hash.
- **Enforcement:** Sent in HTTP `Authorization: Bearer knov_live_...` on gateway requests.
- **Lifecycle:** Valid only while the associated on-chain subscription is `Active`. Automatically rejected upon expiration, manual revocation, or rotation.
- **Separation:** The credential is not the NFT and not the subscription. It is the derived access mechanism.

---

## 3. Product Positioning & Non-Goals

### 3.1 What KNOVARA Is
1. **An Agent-Native Licensing & API Gateway:** A programmatic protocol allowing AI agents to discover proprietary tools, obtain verified commercial access, and interact with live upstream APIs.
2. **An On-Chain Monetization Rail:** A transparent settlement mechanism using NEAR Protocol for exact payments, multi-party beneficiary revenue splits, and pull-payment royalty accounting.
3. **An Intellectual Priority Registry:** A tamper-evident cryptographic system anchoring discovery priority and evidence manifests via RFC 8785 byte-level digests.

### 3.2 What KNOVARA Is NOT (Explicit Non-Goals)
1. **NOT a Cloud Computing or Code Hosting Platform:** KNOVARA will not accept arbitrary ZIP/tarball uploads of Python/Node code to execute on KNOVARA servers.
2. **NOT a General AI Chatbot:** KNOVARA is infrastructure, not an end-user LLM chat interface.
3. **NOT a Patent Office or Legal Ownership Arbitrator:** Registration on KNOVARA proves cryptographic timestamp priority and terms agreement; it does not constitute a government patent, trademark, or legal inventorship validation.
4. **NOT a Speculative NFT Trading Market:** Passports cannot be traded, flipped, or auctioned on secondary NFT exchanges in the MVP.
5. **NOT an Autonomous Unbounded Spending Engine:** Agents cannot autonomously spend funds without explicit human owner wallet approval.
6. **NOT a Per-Token or Metered Billing System (in MVP):** Per-request micropayments and per-token billing are strictly out of scope for MVP to avoid high off-chain accounting complexity.

---

## 4. Business & Payment Model

### 4.1 Fixed 30-Day Monthly Subscriptions
In the MVP, all agent API access is governed by **fixed 30-day subscription terms**.
- **Publisher Control:** The publisher sets the subscription price in NEAR (e.g., 5 NEAR, 10 NEAR, 0.5 NEAR).
- **Exact Duration:** Access duration is exactly 30 days ($30 \times 86,400 = 2,592,000$ seconds).
- **No Metered Complexity:** No per-request, per-token, per-millisecond, or dynamic tier billing in MVP.
- **No Silent Auto-Debits:** Credit card-style automatic recurring debits are forbidden. Every renewal requires explicit owner-approved on-chain signing.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      MVP PRICING & SUBSCRIPTION RULES                           │
├────────────────────────┬───────────────────┬────────────────────────────────────┤
│ PARAMETER              │ MVP SPECIFICATION │ RATIONALE                          │
├────────────────────────┼───────────────────┼────────────────────────────────────┤
│ Billing Period         │ Exactly 30 Days   │ Predictable duration & cashflow.   │
│ Settlement Asset       │ Native NEAR       │ Exact on-chain yoctoNEAR escrow.   │
│ Pricing Authority      │ Rights Controller │ Publisher retains total pricing.   │
│ Payment Distribution   │ Beneficiary Splits│ Automatic split among co-creators. │
│ Renewal Mechanism      │ Owner-Approved Tx │ Zero unauthorized agent spending.  │
│ Metering / Overage     │ Out of Scope      │ Avoids complex off-chain metering. │
└────────────────────────┴───────────────────┴────────────────────────────────────┘
```

### 4.2 Exact-Payment & Solvency Protection
Every subscription payment requires:
1. `attached_deposit == offer.price_yocto` down to the single yoctoNEAR ($10^{-24}$ NEAR). Overpayment or underpayment causes the smart contract to immediately panic and revert.
2. 100% of the price is apportioned across the discovery's `beneficiary_splits` based on basis points summing strictly to 10,000 (100.00%).
3. Division remainders (fractional yoctoNEAR) are allocated deterministically to the Rights Controller.
4. Royalties are credited to `claimable_balances` using the pull-payment pattern to prevent denial-of-service or transfer griefing.

---

## 5. Agent Identity, Wallet Ownership, and On-Chain Payer Separation

To eliminate ambiguity between autonomous software and legal financial responsibility, the architecture establishes strict identity separation:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 WALLET & IDENTITY HIERARCHY                                      │
├────────────────────────┬─────────────────────────────────────────────────────────────────────────┤
│ ENTITY                 │ DEFINITION & FUNCTIONAL RESPONSIBILITIES                                │
├────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
│ **Human Owner**        │ Legal individual or organization controlling the NEAR account.           │
│                        │ Holds private keys. Approves all initial payments and renewals.         │
├────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
│ **AI Agent**           │ Software entity with a registered `agent_id` (e.g. `agent-drone-01`).   │
│                        │ Discovers tools, queries OpenAPI specs, and prepares purchase intents.   │
│                        │ **Cannot** sign transactions, hold private keys, or spend NEAR.        │
├────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
│ **Connected Signer**   │ The human owner's NEAR account connected via wallet (e.g. `alice.testnet`).│
│                        │ Authorizes NEP-413 challenges and signs blockchain transaction intents. │
├────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
│ **On-Chain Subscriber**│ The transaction predecessor account (`env::predecessor_account_id()`).  │
│                        │ Recorded on-chain as `record.buyer_id` in the contract state.           │
├────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
│ **Payer Account**      │ The account attaching the yoctoNEAR deposit. In MVP, identical to the   │
│                        │ Connected Signer / On-Chain Subscriber (`alice.testnet`).               │
└────────────────────────┴─────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Resolving the Six Identity & Authorization Rules
1. **On-Chain Subscriber:** In the smart contract, `pay_for_license` (and the direct subscription method) records `record.buyer_id = env::predecessor_account_id()`. The on-chain subscriber is therefore the connected signing account (e.g., `alice.testnet` or an owner-controlled subaccount `agent.alice.testnet`).
2. **Transaction Signer:** Exclusively the human owner via their connected wallet (Meteor, HOT Connect, or CLI). The AI agent never holds private keys.
3. **Payer Account:** The connected signing account attaching the exact yoctoNEAR deposit.
4. **Binding Agent to Subscription:** The agent's `agent_id` is encoded into the `PurchaseIntent` in MongoDB. When the confirmed on-chain transaction receipt is reconciled by `syncService`, the backend links `SubscriptionProjection.agent_id = intent.agent_id`. The issued `ApiCredential` is strictly bound to both `agent_id` and `subscription_id`.
5. **Authorization Verification:** In MongoDB, an `AgentProfile` records `owner_account_id`. When an intent is submitted or reconciled, KNOVARA verifies `intent.agent.owner_account_id === transaction.signer_id`. Unauthorized third-party accounts cannot claim credentials for an agent they do not own.
6. **Zero Key Exposure Approval:** The agent operates in read-only/discovery mode. When it recommends a subscription, it calls KNOVARA backend to build an **unsigned Transaction Intent**. The human owner reviews the exact target contract, method, and deposit amount in their wallet and signs externally. The agent never sees the private key, seed phrase, or wallet session tokens.

---

## 6. Publisher Auto-Approval Resolution

### 6.1 The Architectural Conflict
Under the current contract implementation:
1. `request_license` transitions status to `Requested`.
2. `approve_license_request` transitions status to `Approved { payment_deadline }`.
3. `pay_for_license` verifies `Approved` and transitions status to `Active`.

In `contracts/knovara/src/license.rs`, `approve_license_request` strictly enforces:
```rust
require!(
    caller == discovery.rights_controller_id,
    "ERR_NOT_RIGHTS_CONTROLLER: Only the designated rights controller may approve requests"
);
```

### 6.2 Evaluation of Architectural Options

| Option | Description | Security & Key Custody | User Experience | Contract Changes Required |
| :--- | :--- | :--- | :--- | :--- |
| **A. Publisher Restricted Key Delegation** | Publisher adds a `FunctionCall` access key restricted to `approve_license_request` and delegates it to a KNOVARA daemon. | **POOR:** KNOVARA backend stores third-party private keys. High liability; vulnerable to key extraction if server compromised. | Moderate: Buyer still must wait for 2 transactions in sequence. | Zero contract changes. |
| **B. Contract-Level Offer Pre-Authorization** | Publisher sets an `auto_approve: bool` flag at offer creation. `request_license` automatically transitions to `Approved`. | **CLEAN:** No key custody. Publisher authorizes at offer publication. | Moderate: Buyer still submits 2 separate transactions (`request` then `pay`). | Small contract modification to `request_license`. Requires contract redeployment. |
| **C. Direct Subscription Method (`subscribe_to_offer`)** | Buyer calls a single payable method with attached deposit. Atomically creates, verifies, escrows, and activates license. | **SUPERIOR:** 100% atomic on-chain execution. Zero key custody. Zero race conditions. Zero pending states. | **OPTIMAL:** True 1-click subscription purchase for agent owner. | Adds 1 payable method to `payments.rs`. Requires contract redeployment. |
| **D. Retain Manual Publisher Approval** | Publisher must manually log into KNOVARA and sign `approve_license_request` for every purchase. | Standard, but completely breaks autonomous agent workflows (hours/days latency). | **UNACCEPTABLE:** Agents stall waiting for human publishers to approve fixed public offers. | Zero contract changes. |

### 6.3 Approved Architectural Resolution
The approved business rule—that once an open offer is published, ordinary agent purchases should not require manual publisher intervention—**CANNOT be safely, securely, and seamlessly implemented without a contract addition.**

A backend relayer that holds publisher private keys violates zero-trust security and creates unacceptable custody liabilities.

Therefore, the canonical architecture specifies:
- **Phase 1 (Pre-Upgrade MVP Compatibility):** For testing on the currently deployed contract `koket-knovara-dev.testnet`, Option D (manual publisher approval via UI) or Option A (publisher running an isolated local script with their own restricted key) is used for initial integration testing.
- **Phase 2 (Canonical Production Architecture):** Implement **Option C (`subscribe_to_offer`)** in `contracts/knovara/src/payments.rs`. When a publisher publishes an offer, they pre-authorize direct purchases under those terms. The buyer attaches the exact deposit in a single transaction, achieving instant, atomic activation.

---

## 7. Model Context Protocol (MCP) Credential Security

### 7.1 Redesigned MCP Tool Signature & Architecture
Exposing raw API credentials as tool arguments in model context windows (e.g. `knovara_call_asset_api(credential, ...)`) is strictly forbidden. It risks leaking secrets into LLM prompts, conversation histories, fine-tuning datasets, and logging pipelines.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 SECURE MCP CREDENTIAL INJECTION                                  │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│  1. LLM CONTEXT WINDOW                                                                           │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Calls: `knovara_call_asset_api(asset_id="disc-mat-001", path="/v1/recommendations", ...)` │  │
│  │ *NO RAW CREDENTIAL EVER APPEARS IN THE MODEL'S PROMPT OR OUTPUT*                          │  │
│  └────────────────────────────────────────────────────────────┬───────────────────────────────┘  │
│                                                               │ (stdio / local IPC)              │
│  2. LOCAL MCP SERVER ADAPTER (Trusted Host Process)           ▼                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ • Receives Tool Call from LLM                                                              │  │
│  │ • Securely reads credential for `disc-mat-001` from local secure storage:                  │  │
│  │   `~/.knovara/credentials.json` or environment `KNOVARA_CREDENTIAL_DISC_MAT_001`          │  │
│  │ • Injects HTTP Header: `Authorization: Bearer knov_live_7a8b...`                          │  │
│  └────────────────────────────────────────────────────────────┬───────────────────────────────┘  │
│                                                               │ (HTTPS with Bearer Token)        │
│  3. KNOVARA GATEWAY                                           ▼                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ • Validates SHA-256 Hash of Credential against Database                                    │  │
│  │ • Verifies On-Chain Subscription Active on NEAR                                            │  │
│  │ • Forwards to Publisher Upstream API                                                       │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 MCP Tool Interface Definitions
```json
{
  "name": "knovara_call_asset_api",
  "description": "Calls an authorized technical API endpoint through KNOVARA Gateway. Authentication is injected securely by the local MCP server without exposing credentials to the model.",
  "parameters": {
    "type": "object",
    "properties": {
      "asset_id": { "type": "string", "description": "The target KNOVARA Discovery Asset ID" },
      "path": { "type": "string", "description": "The subpath defined in the asset's OpenAPI spec (e.g. /v1/materials/recommendations)" },
      "method": { "type": "string", "enum": ["GET", "POST", "PUT", "DELETE"], "default": "POST" },
      "params": { "type": "object", "description": "URL query parameters" },
      "body": { "type": "object", "description": "JSON request body payload matching the OpenAPI request schema" }
    },
    "required": ["asset_id", "path"]
  }
}
```

---

## 8. Sourced Demonstration Data & Engineering Disclaimers

### 8.1 Sourced Reference Data Provenance
The **Advanced Materials Research** demonstration provider (`demo/advanced-materials-provider/`) evaluates real engineering materials against documented technical literature:
1. **Titanium Ti-6Al-4V (Grade 5):** Sourced from *MMPDS-01 (Metallic Materials Properties Development and Standardization)*, Section 5.3. Density: $4.43\text{ g/cm}^3$, Yield Strength: $880\text{ MPa}$, Ultimate Tensile Strength: $950\text{ MPa}$, Corrosion Resistance: High.
2. **Aluminum 7075-T6:** Sourced from *ASM Handbook, Volume 2: Properties and Selection: Nonferrous Alloys*. Density: $2.81\text{ g/cm}^3$, Yield Strength: $503\text{ MPa}$, Ultimate Tensile Strength: $572\text{ MPa}$, Corrosion Resistance: Medium.
3. **Inconel 718 (Nickel Superalloy):** Sourced from *Special Metals Corporation Technical Bulletin (SMC-045)*. Density: $8.19\text{ g/cm}^3$, Yield Strength: $1100\text{ MPa}$, Ultimate Tensile Strength: $1375\text{ MPa}$, Corrosion Resistance: High.
4. **Carbon Fiber PEEK Composite:** Labeled as an **illustrative benchmark formulation** for demonstration purposes. Density: $1.45\text{ g/cm}^3$, Yield Strength: $380\text{ MPa}$, Tensile Strength: $450\text{ MPa}$, Corrosion Resistance: Extreme.

### 8.2 Mandatory Agent Engineering Disclaimer
All demonstration responses generated by the sample AI agent must include the following explicit label:
> *"Demonstration Calculation Notice: These material recommendations are computed by the sample provider against demonstration reference datasets for illustrative verification of KNOVARA 2.0. They do not constitute certified, experimentally stamped, or licensed professional engineering advice."*

### 8.3 Local Development Secret Configuration
All provider secrets for the sample service are configured via local environment variables (`DEMO_PROVIDER_API_KEY=demo_dev_secret_materials_99`), never hardcoded in production source files.
