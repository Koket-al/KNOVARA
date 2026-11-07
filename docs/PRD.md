# Product Requirements Document (PRD)

**Product Name:** KNOVARA  
**Brand Meaning:** Knowledge + A New Era  
**Target Milestone:** NEAR Hackathon 2026 (9-Day MVP Delivery)  
**Document Version:** 1.1.2  
**Status:** Draft — Awaiting User Approval  
**Author:** Senior Product Manager & Business Analyst  

---

> [!NOTE]
> **Illustrative Test Data Notice:** All personas, organization names, account IDs (e.g., `erostova.testnet`, `pacific-tech.testnet`), discovery titles, DOIs, sample file hashes, and manifest digests appearing throughout this document are strictly illustrative test placeholders designed for prototyping and automated test scenarios. They do not represent real-world entities, commercial partnerships, or verified cryptographic digests of production assets.

---

## 1. Executive Summary & Product Vision

### 1.1 Brand Identity & Meaning
**KNOVARA** combines *Knowledge* with *A New Era* (Novara). It represents a fundamental shift in how human and institutional knowledge is authenticated, documented, licensed, and monetized in an era dominated by rapid scientific breakthroughs, proprietary technical advancements, and foundation AI models hungry for high-fidelity training data.

### 1.2 Vision Statement
To establish the decentralized economic infrastructure where discoveries and innovations across all disciplines can be immutably registered, documented with tamper-evident cryptographic integrity, transparently licensed, and generate contractual financial compensation for their legitimate creators and rights holders.

### 1.3 Core Value Proposition
Historically, monetization of intellectual creations has been bottlenecked by fragmented intellectual property registries, opaque technology transfer offices (TTOs), protracted bilateral legal negotiations, and the uncompensated scraping of published technical findings by AI developers. KNOVARA introduces an open, verifiable registry and transactional layer on the NEAR blockchain that bridges creators, rights-holding institutions, and enterprise consumers (such as frontier AI labs, biotech firms, and industrial developers) through standardized rights passports, granular license agreements, and programmatic royalty distribution.

### 1.4 Scope of Supported Innovations
KNOVARA is domain-agnostic. It is neither solely an academic publishing portal nor an artistic NFT marketplace. It is built to support any structured, documented intellectual asset, including:

1. **Scientific Discoveries:** Fundamental physics findings, experimental chemistry protocols, observational astrophysics corpora.
2. **Engineering Inventions:** Mechanical architectures, aerospace schematics, battery and energy storage topologies.
3. **Software & Algorithms:** Novel neural network architectures, optimization algorithms, consensus mechanisms, cryptographic primitives.
4. **New Materials:** Superconducting formulations, organic polymers, alloy compositions, nanostructured surfaces.
5. **Formulas & Technical Processes:** Industrial chemical synthesis methods, catalytic purification steps, semiconductor manufacturing lithography workflows.
6. **Biotechnology & Medical Innovations:** Genomic sequencing annotations, CRISPR target configurations, protein folding structures, cellular therapy assays.
7. **Research Datasets:** High-quality scientific benchmark data, domain-specific labeled corpora for LLM pre-training and fine-tuning.
8. **Industrial & Trade Innovations:** Precision agriculture sensor telemetry processing, robotics kinematics pipelines.

---

## 2. Problem Statement & Market Opportunity

### 2.1 The Problem for Creators and Rights Holders
1. **Opaque Authorship & Contribution Attribution:** Multi-party research teams (e.g., graduate students, lead PIs, university laboratories, industry sponsors) struggle to document exact proportional contributions in an immutable, auditable format before public disclosure.
2. **Protracted, Inflexible Licensing:** Traditional technology transfer processes require months of bilateral legal correspondence, prohibitive retainer fees, and bespoke licensing contracts, resulting in thousands of patented and unpatented discoveries sitting dormant ("patent thickets" and shelf-ware).
3. **Uncompensated Commercial & AI Exploitation:** AI enterprises routinely crawl publicly accessible research and documentation without explicit commercial licensing, rights-holder remuneration, or structured attribution.
4. **Complex Royalty Distribution:** When commercial licenses are executed, distributing proceeds among individual inventors, faculty members, university departments, and external research grants involves manual accounting, delays, and administrative overhead.
5. **Loss of Provenance & Lineage:** As downstream innovations build upon foundational breakthroughs, the lineage connecting the original discovery to derivative technologies becomes obscured, severing the original creator from downstream economic value.

### 2.2 The Problem for Enterprise Buyers & AI Developers
1. **Uncertain Rights & Legal Liability:** Enterprise buyers and AI labs face mounting copyright and trade-secret litigation risks when training foundation models or fine-tuning specialized models on scraped datasets without clear licensing provenance.
2. **Absence of Standardized Machine-Readable Licenses:** Enterprisewide automated procurement cannot easily parse heterogeneous PDF contracts or bespoke terms of service to confirm whether a dataset or technical paper permits commercial fine-tuning, retrieval-augmented generation (RAG), or derivative product manufacturing.
3. **Inefficient Sourcing Channels:** Discovering pre-commercial, cutting-edge innovations requires fragmented attendance at conferences, personal academic networks, or navigating incompatible proprietary university portals.

### 2.3 The KNOVARA Solution Matrix

| Friction Point | Traditional Status Quo | KNOVARA Solution |
| :--- | :--- | :--- |
| **Registration** | Years in national patent offices or academic journals with no economic rails | Fast on-chain registration with tamper-evident canonical manifest hashing on NEAR |
| **Identity & Rights** | Opaque institutional ownership; conflation of token custody with legal rights | NEP-171 Rights Passport with explicit separation of NFT Custodian, Rights Controller, and Royalty Beneficiaries |
| **Licensing Scopes** | All-or-nothing bilateral copyright / patent licenses | Standardized, machine-readable licensing categories bound to explicit on-chain terms hashes |
| **Settlement** | Manual invoices, 90-day Net payment terms, wire fees | On-chain settlement via NEAR smart contracts with exact payment checks and pull-payment claimable balances |
| **Machine Access** | Manual web portals, human sales representatives | Standardized Enterprise REST API with scoped API keys and autonomous KNOVARA AI Discovery Agent |

---

## 3. Target User Personas & Ecosystem Actors

```
+---------------------------------------------------------------------------------------------------+
|                                        KNOVARA ECOSYSTEM                                          |
+---------------------------------------------------------------------------------------------------+
|  CREATORS / INVENTORS           RIGHTS CONTROLLERS (TTOs)       ENTERPRISE / AI BUYERS            |
|  - Independent Researchers      - University Tech Transfer      - Frontier AI Labs (LLM Training) |
|  - Engineering Teams            - Research Institutes & Labs    - Pharmaceutical R&D              |
|  - Software Innovators          - Corporate IP Entities         - Material Science & Robotics     |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
+---------------------------------------------------------------------------------------------------+
|                                 KNOVARA PROTOCOL INTERACTION                                      |
|  [Wallet-Auth (HOT Connect)]  ──> [Passport NFT (NEP-171)]  ──> [Licensing & Split Contracts]     |
|  [Evidence Storage (R2/Hash)] ──> [Lineage Graph (DAG)]     ──> [Enterprise API & AI Agent]       |
+---------------------------------------------------------------------------------------------------+
```

### 3.1 Persona 1: Discovery Creators
- **Archetypes:** University professors, doctoral candidates, independent software architects, biotech laboratory technicians, private inventors.
- **Goals:** Document priority of discovery, register specific proportional contributions alongside collaborators, ensure exposure to industrial buyers, receive contractual share of licensing revenues.
- **Pain Points:** Lack of legal budget for formal international patenting; institutional bureaucracy obscuring their personal contribution; unauthorized data scraping by tech giants.
- **System Interactions:** Connects NEAR wallet via HOT Connect; submits discovery metadata, technical manuscripts, and evidence artifacts; configures co-contributors and agreed revenue percentages; mints or initiates minting of the Discovery Rights Passport NFT.

### 3.2 Persona 2: Legitimate Rights Controllers
- **Archetypes:** University Technology Transfer Offices (TTOs), corporate intellectual property departments, authorized laboratory directors, solo inventors holding legitimate authority.
- **Goals:** Manage KNOVARA licensing conditions, review and authorize license requests from third parties, configure institutional treasury payout addresses, audit licensing history based on declared and documented authority.
- **Pain Points:** Tracking compliance across thousands of research outputs; managing individual disbursements to departed staff; negotiating micro-licenses efficiently.
- **System Interactions:** Approves or rejects incoming license requests; validates beneficiary share allocations; administers authorized member wallets with assigned permissions.

### 3.3 Persona 3: Enterprise Buyers & AI Labs
- **Archetypes:** AI Data Procurement Leads (e.g., at organizations training frontier models), Corporate R&D Directors (Pharma, Automotive, CleanTech), Technology Licensing Officers.
- **Goals:** Rapidly locate verified high-value technical assets, datasets, and proprietary processes; obtain legally structured, machine-verifiable licenses (for AI pre-training, fine-tuning, RAG, or commercial development); secure authorized programmatic access to private documents.
- **Pain Points:** Legal uncertainty regarding training data copyright; slow procurement negotiations; risk of tainted IP pipelines.
- **System Interactions:** Browses the discovery registry via Web UI or Enterprise API; filters by license type and budget; submits binding license requests; executes exact payment in native NEAR testnet tokens; downloads authorized document bundles via short-lived signed URLs.

### 3.4 Persona 4: Autonomous AI Licensing Agents
- **Archetypes:** Algorithmic procurement bots, research discovery crawlers operating on behalf of enterprise subscribers.
- **Goals:** Autonomously search registered discovery passports using keyword and category filters; match licensing criteria against enterprise procurement budgets; prepare pending license request transactions for human executive approval.
- **Constraints:** Never holds direct custody of enterprise treasury funds without explicit multi-sig/human signature confirmation; cannot bypass rights-controller review workflows.
- **System Interactions:** Queries Enterprise API / KNOVARA Agent endpoints; parses machine-readable license conditions; generates structured license request payloads.

### 3.5 Persona 5: Platform Administrators & Operators
- **Archetypes:** KNOVARA core operations team, compliance reviewers, security auditors.
- **Goals:** Maintain smart contract health, handle abuse and takedown reports for plagiarized content, monitor NEAR testnet RPC connectivity, provide operational support.
- **Constraints:** Cannot unilaterally seize funds locked in smart contract escrow; cannot modify on-chain passport records without decentralized governance or emergency pause mechanisms explicitly circumscribed in contract code.

---

## 4. Mandatory Discovery Rights Passport NFT (NEP-171)

### 4.1 Foundational Concept & Critical Legal Boundaries
Every discovery successfully registered on KNOVARA is issued an immutable **Discovery Rights Passport NFT** governed by NEAR’s **NEP-171** standard (extended with NEP-177 metadata standards).

> [!IMPORTANT]
> **Definitive Legal & Protocol Distinctions:**  
> 1. **Proof of On-Chain Registration at a Point in Time:** A blockchain timestamp and evidence manifest hash demonstrate strictly that a particular cryptographic hash was recorded on-chain at a particular point in time on the NEAR blockchain.
> 2. **No Proof of Possession or Authorship:** They **do not** independently establish physical or digital file possession, original inventorship, statutory patent validity, copyright ownership, or enforceable legal IP ownership under national statutory laws.
> 3. **No Automatic Prior-Art Status:** Legal prior-art recognition remains subject to the statutory standards and evidentiary examinations of national patent offices and jurisdictions.
> 4. **No Universal Legal Magic:** Digital wallet approvals and on-chain records do not automatically constitute universally enforceable legal contracts across every worldwide jurisdiction; they record cryptographic consent and license terms within the KNOVARA platform protocol.
> 5. **No Proof of Offline AI Training:** The platform verifies on-chain payment and authorized issuance of download tokens; it **cannot** mathematically prove whether an external entity did or did not use downloaded files in offline AI model training.
> 6. **Contributor Attestation vs. Legal Consent:** A registrant’s attestation declares contributor claims but does not independently prove the statutory consent of every co-author. The MVP records declared contributor claims, notification audit logs, agreed revenue splits, and the rights controller's stated authority. Configured splits on-chain do not automatically establish legal entitlement without underlying binding legal agreements.

### 4.2 Separation of Roles: Custodian vs. Rights Controller vs. Beneficiaries
To prevent conflation of token possession with legal rights, KNOVARA strictly decouples three distinct entities:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  ROLE SEPARATION MODEL                                 │
├────────────────────────┬─────────────────────────────┬─────────────────────────────────┤
│ Role                   │ Smart Contract Field        │ Scope of Authority              │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ **NFT Custodian**      │ `owner_id`                  │ Holds custody of the token. In  │
│                        │                             │ MVP, tokens are non-transferable│
│                        │                             │ through every transfer path.    │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ **Rights Controller**  │ `rights_controller_id`      │ Sole account authorized to      │
│                        │                             │ manage KNOVARA license offers,  │
│                        │                             │ requests and approvals for the  │
│                        │                             │ discovery, based on declared    │
│                        │                             │ and documented authority.       │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ **Royalty Beneficiary**│ `beneficiary_splits[]`      │ Accounts entitled to receive    │
│                        │                             │ designated percentage shares of │
│                        │                             │ license revenues (sum = 100%).  │
└────────────────────────┴─────────────────────────────┴─────────────────────────────────┘
```

#### Strict Enforceability of Non-Transferability (Every Transfer Path)
To prevent circumvention of the non-transferable rule, the MVP smart contract blocks all custodial transfer vectors:
- **Block `nft_transfer`:** Invocations of standard `nft_transfer` are explicitly rejected, reverting with `ERR_PASSPORT_NON_TRANSFERABLE`.
- **Block `nft_transfer_call`:** Cross-contract transfer calls are explicitly rejected with `ERR_PASSPORT_NON_TRANSFERABLE`.
- **No Third-Party Approvals:** The smart contract does not implement, or strictly disables, `nft_approve`, `nft_revoke`, and `nft_revoke_all`. No external account can be granted transfer approvals over a Passport NFT. Acceptance tests must explicitly verify that approval methods cannot create an alternative NFT transfer route.
- **Verification Across All Interfaces:** Every exposed entrypoint that could alter `owner_id` is guarded. The NEP-171 interface compatibility is maintained by returning expected types while deliberately reverting transfer actions. Acceptance tests must verify that no exposed method can change NFT custody in the MVP.
- **Independence of Authority:** Even if a token custody transfer were executed in a future version, an ordinary transfer **never** changes the `rights_controller_id` or the `beneficiary_splits`. Modifying the rights controller requires a distinct, authenticated on-chain procedure executed explicitly by the incumbent rights controller.

### 4.3 On-Chain vs. Off-Chain Storage Architecture

To avoid blockchain bloat and preserve confidentiality, KNOVARA strictly partitions data between NEAR, MongoDB Atlas, and Cloudflare R2:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ON-CHAIN STATE (NEP-171)                        │
│  - Token ID (e.g., "knovara-disc-8f92a10b")                           │
│  - NFT Custodian Account ID (`owner_id`)                               │
│  - Authorized Rights Controller Account ID (`rights_controller_id`)    │
│  - Evidence Manifest Hash (`evidence_manifest_hash`: Hex SHA-256)      │
│  - Public-Safe Metadata URI & Hash (`reference`, `reference_hash`)     │
│  - Beneficiary Split Table (`account_id` + `basis_points`, Sum=10,000) │
│  - Active License Offers (Offer ID, Scope, Price, Active Flag)         │
│  - Approved & Paid License Records (License ID, Buyer, Terms Hash)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Resolves via Public-Safe URI
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      OFF-CHAIN STORE (MONGODB ATLAS)                   │
│  - Full Public Abstract, Technical Overview, Categories, Tags          │
│  - Contributor Profiles (Declared Names, ORCID, Institutional Affil.)  │
│  - Rights Controller Legal Entity Details & Contact Info               │
│  - Complete Canonical Evidence Manifest (Sorted File List & Hashes)    │
│  - License Requests, Negotiation Logs, and Application Audit Trails     │
│  - High-Speed Text & Keyword Search Indexes                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Controlled Presigned Access
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 SECURE PRIVATE STORAGE (CLOUDFLARE R2)                 │
│  - Raw Research Manuscripts (PDF, TeX)                                 │
│  - Engineering Schematics, CAD Models, Code Archives (ZIP, TAR)        │
│  - Proprietary Datasets (Parquet, JSONL, CSV)                          │
│  - Private Licensing Agreements & Counterpart Contracts                │
└────────────────────────────────────────────────────────────────────────┘
```

#### Metadata Hosting & Public-Safe Descriptors
- **On-Chain Fields:**
  - `metadata.reference`: A stable HTTPS URL pointing to the canonical public-safe JSON descriptor (hosted on Cloudflare R2 / KNOVARA metadata service, e.g., `https://metadata.knovara.org/passports/<token_id>/v1.json`).
  - `metadata.reference_hash`: The **Base64-encoded SHA-256 hash** of the exact bytes returned by `reference`, strictly adhering to NEP-177 metadata standards.
  - `evidence_manifest_hash`: Separately recorded as a **Hex-encoded SHA-256 hash** (64 lowercase hex characters in JSON, `[u8; 32]` in contract storage) representing the canonical evidence manifest bytes.
- **Immutability & Integrity:** The public-safe metadata descriptor is immutable and versioned. Existing descriptors are never overwritten silently. The backend verifies that the fetched descriptor bytes match `reference_hash`.
- **Confidentiality Boundary:** Public descriptors contain strictly public-safe information: title, primary category, tags, and brief non-confidential abstract. Private contributor contact info (emails, personal phone numbers), corporate legal entity contacts, unpublished research findings, raw datasets, and evidence files are strictly excluded from the public descriptor.
- **Zero Decentralized Storage Overhead:** No IPFS or Arweave dependencies for the MVP.

---

## 5. Discovery Registration System

### 5.1 Registration Flow (11-Step Lifecycle)

```
[1. Connect Wallet] ──> [2. Basic Metadata]  ──> [3. Category Selection]
                                                        │
[6. Identify Rights Controller] <── [5. Add Contributors] <── [4. Detailed Summary]
          │
          ▼
[7. Configure Royalty Splits (Must = 100%)] ──> [8. Upload Evidence Files to R2]
                                                        │
[11. Mint Passport NFT] <── [10. Client/Server Hash Verification] <── [9. Generate Canonical Manifest]
```

1. **Connect NEAR Wallet:** User authenticates via HOT Connect / NEP-413 signing, establishing verified NEAR account identity.
2. **Enter Discovery Identity:** Input public title, brief public abstract, category, and external non-confidential references (e.g., existing DOI or provisional patent application numbers).
3. **Choose Primary Category:** Select from predefined taxonomy (Materials Science, Biotechnology, AI & Algorithms, Engineering, etc.).
4. **Detailed Technical Summary:** Provide non-confidential technical overview, methodology, and field of application.
5. **Add Contributors:** Declare all contributing researchers and engineers, their roles (e.g., Experimental Design, Data Collection), and ORCID identifiers.
6. **Identify Authorized Rights Controller:** Explicitly specify the NEAR account holding licensing authority on KNOVARA (`rights_controller_id`) to manage offers and approvals based on declared authority, which may be an institutional TTO (e.g., `mit-tto.testnet`) or an independent inventor (`inventor.testnet`).
7. **Configure Royalty Splits:** Allocate basis points across all beneficiary accounts. The client and backend dynamically enforce that $\sum \text{basis\_points} = 10,000$ (100.00%).
8. **Upload Evidence Files to Cloudflare R2:** Upload technical papers, raw datasets, code archives, or CAD files via secure HTTPS direct upload to private Cloudflare R2 storage.
9. **Generate Canonical Evidence Manifest:** Assemble all file metadata, sort by file ID, and serialize using canonical JSON formatting (see Section 10).
10. **Client & Server Hash Verification:** Compute and cross-verify the canonical `evidence_manifest_hash` between browser and backend.
11. **Mint Discovery Rights Passport NFT:** Backend stages the public-safe metadata descriptor, and the user signs the transaction calling the NEAR smart contract to mint the NEP-171 token.

### 5.2 Illustrative Off-Chain Data Schema (MongoDB Atlas)

```json
{
  "discovery_id": "disc_8f92a10b4c7e492d",
  "title": "Room-Temperature Ambient-Pressure Conductive Polymer Composite",
  "category": "MATERIALS_SCIENCE",
  "subcategory": "CONDUCTIVE_POLYMERS",
  "abstract": "A novel synthesis of conjugated polyaniline blended with graphene platelets...",
  "lineage": {
    "parent_token_ids": ["knovara-disc-1029"],
    "derivation_type": "SYNTHESIS_METHOD_IMPROVEMENT"
  },
  "contributors": [
    {
      "name": "Dr. Elena Rostova (Test Persona)",
      "wallet_id": "erostova.testnet",
      "orcid": "0000-0002-1825-0097",
      "role": "Lead Principal Investigator",
      "contribution_description": "Formulated composite blend and directed spectroscopic analysis."
    },
    {
      "name": "Marcus Vance (Test Persona)",
      "wallet_id": "mvance.testnet",
      "role": "Laboratory Research Associate",
      "contribution_description": "Conducted 1,200 thermal cycling stress tests."
    }
  ],
  "rights_controller": {
    "entity_name": "Pacific Tech Innovations LLC (Test Org)",
    "wallet_id": "pacific-tech.testnet",
    "jurisdiction": "Delaware, USA",
    "authorization_basis": "DECLARED_IP_ASSIGNMENT"
  },
  "beneficiary_splits": [
    { "account_id": "erostova.testnet", "basis_points": 4500 },
    { "account_id": "mvance.testnet", "basis_points": 2500 },
    { "account_id": "pacific-tech.testnet", "basis_points": 3000 }
  ],
  "evidence_manifest": [
    {
      "file_id": "file_01",
      "filename": "synthesis_protocol_v2.pdf",
      "mime_type": "application/pdf",
      "byte_size": 4829104,
      "sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a"
    },
    {
      "file_id": "file_02",
      "filename": "thermal_stress_dataset.csv",
      "mime_type": "text/csv",
      "byte_size": 1204859,
      "sha256": "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d"
    }
  ],
  "evidence_manifest_hash": "a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
}
```

---

## 6. Granular Licensing System & Terms Binding

### 6.1 Standardized Licensing Scopes
KNOVARA establishes structured, machine-readable licensing categories designed for the emerging intellectual property and AI economy:

1. **Academic & Scientific Research:** Non-commercial exploration, classroom instruction, and peer reproduction. Commercial distribution strictly prohibited.
2. **Commercial Use:** Full rights to incorporate the discovery into physical products, industrial manufacturing, or commercial software distributions.
3. **AI Model Training:** Express permission to ingest documentation, datasets, and code into datasets used for foundational model pre-training.
4. **AI Model Fine-Tuning:** Authorization to utilize the dataset for parameter-efficient fine-tuning (PEFT), LoRA adapters, or task-specific supervised fine-tuning (SFT).
5. **AI Knowledge Access & Retrieval (RAG):** Authorization to index the discovery into vector databases, search indices, and inference-time retrieval-augmented generation pipelines.
6. **Research Evaluation & Benchmarking:** Limited license to test AI models or industrial pipelines against the discovery’s benchmarks without persisting the data in model weights.
7. **Custom Licensing Agreement:** Bespoke terms negotiated directly with the rights controller, attached as an off-chain countersigned legal rider.

### 6.2 Binding Exact License Terms On-Chain
To eliminate ambiguities regarding what terms were approved and accepted:
1. **Standard License Terms Document:** Each standardized scope is linked to a published, versioned standard terms document (e.g., `KNOVARA-SL-v1.0-COMMERCIAL`).
2. **Standardized Hash Representation:**
   - Contract Storage: `license_terms_hash` is stored as a fixed **32-byte SHA-256 digest (`[u8; 32]`)**.
   - Application JSON: Represented as a **64-character lowercase hexadecimal string** (e.g., `"f3a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f7a8b9c0d1e2f3a4b5c"`).
3. **Custom License Handling:** For custom agreements, the negotiated agreement is stored privately in Cloudflare R2, and its 32-byte SHA-256 digest is embedded as the `license_terms_hash`. Confidential contract clauses are **never** published directly to on-chain state.
4. **Rights Controller Approval:** When the rights controller approves a request, they approve the terms bound to that exact `license_terms_hash`.
5. **Buyer Acceptance via `pay_license`:** Before submitting payment, the buyer inspects the exact terms. The buyer's `pay_license` transaction must explicitly pass `accepted_terms_hash` as an argument.
6. **Contract Terms Match Enforcement:**
   - The contract verifies that the transaction signer (`env::predecessor_account_id()`) matches the recorded `buyer_id`. If not, it reverts with `ERR_CALLER_NOT_BUYER`.
   - The contract compares `accepted_terms_hash` against the approved `license_terms_hash`. If any mismatch exists, the contract reverts with `ERR_TERMS_HASH_MISMATCH`.
7. **Immutable On-Chain Grant Binding:** Upon successful exact payment, the resulting on-chain license grant irrevocably binds:
   $$\text{LicenseGrant} = \{\text{license\_id}, \text{buyer\_id}, \text{discovery\_id}, \text{scope}, \text{price}, \text{duration}, \text{license\_terms\_hash}, \text{active\_state}\}$$

### 6.3 License Procurement & Approval State Machine

```
      +--------------------+
      |  1. INITIATED /    |
      |     REQUESTED      |
      +---------+----------+
                │
     [Rights Controller Review: Confirms Terms & Scope]
                │
        +-------┴-------+
        ▼               ▼
+---------------+  +---------------+
|  2. REJECTED  |  |  3. APPROVED  |
+---------------+  +-------+-------+
                           │
                 [Buyer Passes accepted_terms_hash & Pays Exact Amount Within 7 Days]
                           │
                 +---------┴---------+
                 ▼                   ▼
         +---------------+   +---------------+
         |   4. ACTIVE   |   |  5. EXPIRED   |
         +-------+-------+   +---------------+
                 │
      [Term Expired / Revoked]
                 │
                 ▼
         +---------------+
         | 6. TERMINATED |
         +---------------+
```

1. **Discovery Inspection:** Buyer discovers the asset via Catalog Search, inspects the verified Passport on NEAR testnet, reviews active licensing scopes, base prices, and terms hash.
2. **Offer Selection & Request Submission:** Buyer selects desired scope (e.g., `AI_MODEL_FINE_TUNING`), specifies license duration or intended volume, and submits a binding License Request referencing the terms hash.
3. **Rights-Controller Review:** Only the authorized `rights_controller_id` can review, approve, or reject the request on KNOVARA.
4. **Approval & Payment Window:**
   - If **Rejected**, the state updates with a rejection reason code.
   - If **Approved**, the smart contract transitions the request to `APPROVED` state and records an immutable deadline timestamp ($\text{block\_timestamp} + 7\text{ days}$) along with the confirmed `license_terms_hash`.
5. **Payment Deadline & Expiration Enforcement:**
   - If the payment deadline passes without deposit, the request becomes ineligible for payment.
   - Any actor can trigger the contract method `expire_license_request(license_id)` to formally record the `EXPIRED` state and clean up storage.
6. **Exact Payment Settlement & Acceptance Verification:** Buyer calls `pay_license(license_id, accepted_terms_hash)` with the **exact** approved NEAR deposit. The contract verifies caller identity, confirms `accepted_terms_hash == license_terms_hash`, checks the deadline, and activates the license.
7. **Activation & Access Authorization:** The contract marks the license `ACTIVE`. The buyer is granted programmatic access to download authorized files via short-lived presigned URLs.

---

## 7. Payments and Royalty Distribution Architecture

### 7.1 NEAR Smart Contract Financial Workflow

```
[Buyer: Exactly 2.0 NEAR + accepted_terms_hash] 
        │
        ▼ (Calls: `pay_license(license_id, accepted_terms_hash)`)
[KNOVARA Core Smart Contract]
        │
        ├── 1. Validates: env::predecessor_account_id() == license.buyer_id (ERR_CALLER_NOT_BUYER)
        ├── 2. Validates: accepted_terms_hash == license.license_terms_hash (ERR_TERMS_HASH_MISMATCH)
        ├── 3. Validates: License status is APPROVED
        ├── 4. Validates: block_timestamp <= payment_deadline
        ├── 5. Validates: attached_deposit == exact license_price
        ├── 6. Prevents: Repeat payment on already ACTIVE license
        │
        ├── 7. Computes Integer yoctoNEAR Splits:
        │     - Lead PI (45.00% = 4,500 bps)           --> +0.90 NEAR to claimable_balance
        │     - Lab Tech (25.00% = 2,500 bps)          --> +0.50 NEAR to claimable_balance
        │     - Rights Controller (30.00% = 3,000 bps) --> +0.60 NEAR to claimable_balance
        │     - Indivisible remainder yoctoNEAR        --> Credited to rights_controller_id
        │
        └── 8. Transitions License status to ACTIVE
```

### 7.2 Strict Exact-Payment & Terms Handling
- **Caller Verification:** If caller $\ne \text{license.buyer\_id}$, reverts with `ERR_CALLER_NOT_BUYER`.
- **Terms Hash Verification:** If `accepted_terms_hash != license.license_terms_hash`, reverts with `ERR_TERMS_HASH_MISMATCH`.
- **No Underpayment:** If attached deposit $< \text{license\_price}$, transaction reverts with error `ERR_INSUFFICIENT_PAYMENT`.
- **No Overpayment:** If attached deposit $> \text{license\_price}$, transaction reverts with error `ERR_OVERPAYMENT_NOT_ACCEPTED`. (Eliminates fragile same-receipt refund logic).
- **Anti-Replay / Double-Payment Prevention:** Calling `pay_license` on a license that is already `ACTIVE` or `TERMINATED` immediately reverts with `ERR_LICENSE_ALREADY_PAID`.

### 7.3 Pull-Payment Pattern & Asynchronous Withdrawal Safety
To protect against gas limit denial-of-service and reentrancy exploits, KNOVARA utilizes the **Pull-Payment Pattern** with safe asynchronous promise rollback:

1. **Balance Accumulation:** Licensing payments strictly increment internal integer state:
   $$\text{claimable\_balance}[\text{account\_id}] \mathrel{+}= \text{share\_yocto}$$
2. **Independent Withdrawal:** Beneficiaries independently trigger `withdraw_earnings()` to transfer accrued funds to their wallet.
3. **Asynchronous Rollback Safety:**
   - Contract deducts the full claimable balance locally *before* dispatching the transfer:
     $$\text{amount\_to\_withdraw} = \text{claimable\_balance}[\text{beneficiary}]; \quad \text{claimable\_balance}[\text{beneficiary}] = 0$$
   - Dispatches native NEAR transfer promise: `Promise::new(beneficiary).transfer(amount_to_withdraw)`.
   - Attaches a private callback: `on_withdraw_callback(beneficiary, amount_to_withdraw)`.
   - **Rollback on Failure:** If the cross-account transfer promise fails or runs out of gas, the callback detects `PromiseResult::Failed` and restores the balance:
     $$\text{claimable\_balance}[\text{beneficiary}] \mathrel{+}= \text{amount\_to\_withdraw}$$

---

## 8. Discovery Lineage & Citation Graph

### 8.1 Directed Acyclic Graph (DAG) Structure
Innovations build on prior knowledge. KNOVARA models these relationships as an immutable Directed Acyclic Graph (DAG) on NEAR.

```
+------------------------------------------+
|  Discovery A: Original Battery Material   |
|  (Token ID: #1001)                       |
+--------------------+---------------------+
                     │
                     ├─────────────────────────────────────┐
                     ▼                                     ▼
+------------------------------------------+  +------------------------------------------+
|  Discovery B: Novel Cathode Coating      |  |  Discovery D: Fast-Discharge Telemetry   |
|  (Token ID: #1042)                       |  |  (Token ID: #1088)                       |
+--------------------+---------------------+  +--------------------+---------------------+
                     │                                     │
                     └──────────────────┬──────────────────┘
                                        ▼
             +---------------------------------------------------+
             |  Discovery C: High-Capacity Grid Storage Battery  |
             |  (Token ID: #1120)                                |
             +---------------------------------------------------+
```

### 8.2 Citation & Lineage Attributes
When registering a derivative discovery, the creator specifies:
- `parent_token_ids`: Array of upstream Passport Token IDs.
- `relationship_type`:
  - `DIRECT_DERIVATIVE`: Direct modification or synthesis enhancement.
  - `METHODOLOGICAL_APPLICATION`: Applying an established method to a new material or domain.
  - `BENCHMARK_EVALUATION`: Empirical testing of a prior model/material.
  - `DATASET_TRAINED`: Model trained or tuned on a registered dataset passport.

### 8.3 Legal & Economic Decoupling
> [!IMPORTANT]
> **Lineage Does Not Imply Automatic Royalties:**  
> Registering a parent lineage link provides **attribution and citation provenance**. It **does not** automatically divert royalties from child licenses to parent rights controllers unless an explicit, cross-referenced contractual agreement has been configured in the smart contract splits table.

---

## 9. Wallet-Native Identity & Access Management (IAM)

### 9.1 NEP-413 Structured Authentication Flow
KNOVARA strictly avoids traditional email/password and Web2 social logins. Identity is anchored directly to the user's NEAR Account ID via NEP-413.

```
[Browser Client]               [HOT Connect / Wallet]               [KNOVARA Backend]
       │                                 │                                  │
       │── 1. Request Auth Challenge ────┼─────────────────────────────────>│
       │                                 │                                  │
       │<── 2. Return 32B Nonce + CSRF State + optional callback_url ───────│
       │                                 │                                  │
       │── 3. Prompt NEP-413 Signature ──>                                  │
       │      Payload: {message, nonce (32B), recipient, callback_url}      │
       │                                 │                                  │
       │<── 4. Signed Borsh Payload ─────│                                  │
       │       Signature + Public Key    │                                  │
       │                                                                    │
       │── 5. Submit Account ID + Signature + Public Key + Nonce + State ──>│
       │                                                                    │
       │                                                      [1. Verify CSRF State]
       │                                                      [2. Check Nonce Registry (Burn)]
       │                                                      [3. Verify NEP-413 Borsh Sig]
       │                                                      [4. Match callback_url exactly]
       │                                                      [5. Verify Key Belongs to Account]
       │                                                                    │
       │<── 6. Issue Short-Lived JWT / HttpOnly Session Cookie ─────────────│
```

#### Detailed NEP-413 Verification Specification:
1. **Cryptographically Random 32-Byte Nonce:** Backend generates a high-entropy 32-byte nonce (represented as a 64-character hex string) with a 5-minute time-to-live (TTL) stored in an active nonce cache.
2. **CSRF State Parameter:** Client includes a cryptographically secure random `state` parameter to protect redirect-based wallet workflows against Cross-Site Request Forgery (CSRF).
3. **NEP-413 Payload Struct & Optional `callback_url`:**
   ```json
   {
     "message": "KNOVARA Authentication: Login session at 2026-11-06T00:22:00Z",
     "nonce": "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
     "recipient": "knovara.testnet",
     "callback_url": "https://knovara.org/auth/callback"
   }
   ```
4. **Borsh Serialization with Prefix Tag:** Payload is serialized according to the standard NEP-413 Borsh definition:
   $$\text{Tag} = (2^{31} + 413) = 2147484061$$
   Fields are serialized in order: `tag` (`u32`), `message` (`string`), `nonce` (`[u8; 32]`), `recipient` (`string`), and `callback_url` (`Option<string>`).
5. **Exact `callback_url` Verification:** When a wallet includes an optional `callback_url` in the signed payload (e.g., during web wallet redirect flows), the backend must verify the exact same `callback_url` value during Borsh serialization and signature verification. If omitted, it is verified as `None`; if present, it is verified as `Some(callback_url)` matching byte-for-byte. Any mismatch alters the Borsh serialization and invalidates the signature.
6. **Multi-Key Verification:** The backend verifies the signature against the SHA-256 digest of the Borsh bytes. The system **does not assume Ed25519-only**; it parses the NEAR public key prefix (`ed25519:...` or `secp256k1:...`) and uses the corresponding cryptographic verifier.
7. **On-Chain Key Ownership Verification:** The backend queries the NEAR RPC (`view_access_key`) for the stated `account_id` and confirms that the supplied public key is an active, registered key belonging to that account with full-access permissions.
8. **One-Time Nonce Burn:** Upon successful verification, the nonce is immediately burned from the cache to prevent replay attacks.
9. **Session Issuance:** Backend issues a signed, rotating JSON Web Token (JWT) stored in a secure `HttpOnly`, `SameSite=Strict` cookie.
10. **Step 2 Prerequisite:** In Step 2 (Technical Architecture), verify that the selected wallet adapter and client library support both NEP-413 message signing and standard NEAR transaction calls.

### 9.2 Enterprise Machine-to-Machine (M2M) Security
For external enterprise systems, automated procurement bots, and scheduled ingestion pipelines:
- **Scoped Organization API Keys:** Enterprise accounts generate machine-to-machine API keys (`knovara_live_...`).
- **Security Controls:** API keys are hashed at rest (SHA-256), bound to specific permission scopes (`read:discoveries`, `request:licenses`), configured with explicit expiration dates, and protected by strict IP rate limiting.

---

## 10. File Storage & Cryptographic Evidence Hashing

### 10.1 Deterministic Evidence Manifest Algorithm
To guarantee mathematical reproducibility without relying on experimental hash summations, KNOVARA enforces a standard deterministic manifest hashing algorithm:

```
[File 1: raw bytes] ──> SHA-256 ──> Hash 1
[File 2: raw bytes] ──> SHA-256 ──> Hash 2
                              │
                              ▼
  [Assemble Evidence Manifest Objects: {file_id, filename, mime_type, byte_size, sha256}]
                              │
                              ▼
  [Sort Manifest Array Lexicographically by `file_id`]
                              │
                              ▼
  [Serialize to Canonical JSON (RFC 8785 JCS, Sorted Keys, No Whitespace)]
                              │
                              ▼
  [Compute SHA-256 of Canonical JSON Bytes] ──> `evidence_manifest_hash` (Hex)
                              │
                              ▼
  [Record `evidence_manifest_hash` into NEP-171 Passport on NEAR]
```

#### Step-by-Step Procedure:
1. **Per-File Digest Computation:** Compute raw SHA-256 for each uploaded file:
   $$\text{file\_hash}_k = \text{SHA-256}(\text{FileBytes}_k)$$
2. **Assemble Manifest Entries:** Construct a structured entry for each file containing:
   - `file_id`: Stable identifier (e.g., `file_01`, `file_02`).
   - `filename`: Original sanitized filename.
   - `mime_type`: Standard MIME type string.
   - `byte_size`: Integer byte size.
   - `sha256`: Hex-encoded SHA-256 digest of the file bytes.
3. **Deterministic Sorting:** Sort the array lexicographically by `file_id`.
4. **Canonical JSON Serialization:** Serialize the manifest array using **RFC 8785 JSON Canonicalization Scheme (JCS)** (keys sorted alphabetically, no insignificant whitespace, UTF-8 encoded).
5. **Manifest Root Hash Calculation:** Compute SHA-256 over the exact canonical serialized bytes:
   $$\text{evidence\_manifest\_hash} = \text{SHA-256}(\text{CanonicalJSONBytes})$$
6. **On-Chain Recording:** Store `evidence_manifest_hash` in the NEP-171 passport contract (stored as `[u8; 32]`, formatted as a 64-character lowercase hexadecimal string in application JSON).

### 10.2 Client-Side and Server-Side Verification
- **Client-Side:** The web browser hashes each file locally using the Web Cryptography API (`window.crypto.subtle.digest('SHA-256', buffer)`) prior to upload, assembling the local manifest.
- **Server-Side:** Upon receiving the upload in Cloudflare R2, the backend independently streams the stored file, verifies the file SHA-256, generates the canonical JSON, and validates that its computed `evidence_manifest_hash` matches the client’s submission before allowing passport minting.

### 10.3 Presigned URL Authorization & Bearer Link Security
Before generating a presigned download URL for evidence files, the backend strictly verifies:
1. **Buyer Authenticity:** The authenticated session wallet matches the `buyer_id` recorded on the active license.
2. **License Status:** The license is confirmed paid and `ACTIVE` on-chain (and not expired or terminated).
3. **Authorized Scope:** The requested file is explicitly authorized under the purchased license scope.
4. **Short Expiration Time:** Presigned URLs are generated with short lifespans (maximum 15 minutes).

> [!WARNING]
> **Presigned URL Bearer Token Security:**  
> A presigned URL is a temporary bearer link. Anyone possessing the URL can download the file before it expires. The client application must treat presigned URLs as confidential session credentials, must never log them in public client-side telemetry, and must download files directly into memory or secure storage.

---

## 11. KNOVARA AI Licensing Agent

### 11.1 Agent Purpose & MVP Scope
The **KNOVARA Agent** provides enterprise buyers and researchers with an interactive assistant to query the innovation catalog, evaluate licensing terms, and prepare license request payloads.

```
[Buyer Query: "Find battery cathode innovations under 5 NEAR for commercial use"]
                                │
                                ▼
                     [KNOVARA AI Agent Loop]
                                │
   ├── 1. Parse Parameters: Category="MATERIALS_SCIENCE", Scope="COMMERCIAL", MaxPrice=5 NEAR
   ├── 2. Query MongoDB Discovery Catalog (Deterministic Keyword + Metadata Filter)
   ├── 3. Filter Passports with Active Commercial Offers <= 5 NEAR
   └── 4. Synthesize Comparison Card & Format License Request Payload
                                │
                                ▼
          [Display Request Proposal Card to User in Web UI]
                                │
          [Human User Inspects & Signs via NEAR Wallet]
```

### 11.2 Decoupled, Deterministic MVP Architecture
- **Zero LLM Dependency for Core Workflows:** The primary registration, search, licensing, payment, and file delivery workflows **do not depend on an external LLM**. All core features operate deterministically.
- **Pragmatic Discovery Assistant:** The assistant is implemented as a lightweight conversational helper that translates user requests into structured catalog queries using deterministic keyword and category search.
- **Strict Non-Custodial Rule:** The agent **never** holds buyer private keys, cannot sign transactions, and cannot trigger NEAR token transfers. It generates pre-filled transaction parameters that the human buyer must explicitly sign using their connected NEAR wallet.

---

## 12. Enterprise & External Developer API

### 12.1 Streamlined P0 RESTful Endpoint Specification
To prevent unnecessary scope pressure, only endpoints required for the primary vertical workflow are included in P0:

#### Public Endpoints (Unauthenticated)
- `GET /api/v1/discoveries`: Query catalog with deterministic keyword, category, and tag filters.
- `GET /api/v1/discoveries/:id`: Retrieve public discovery overview and public-safe metadata manifest.
- `GET /api/v1/discoveries/:id/passport`: Retrieve real-time on-chain NEP-171 passport status from NEAR testnet.
- `GET /api/v1/discoveries/:id/offers`: Retrieve active licensing scopes, base prices, and terms hashes.

#### Authenticated Enterprise Endpoints (Scoped API Key or Session JWT)
- `POST /api/v1/licenses/request`: Submit a new license request for a discovery.
  - *Request Body:* `{ "discovery_id": string, "scope": string, "use_case_description": string, "duration_days": number }`
- `GET /api/v1/licenses/:license_id/status`: Check license approval status, payment deadline, terms hash, and on-chain receipt.
- `POST /api/v1/licenses/:license_id/access-token`: Request short-lived presigned download URLs for authorized files.
  - *Response:* `{ "files": [ { "filename": string, "presigned_url": string, "expires_in": 900, "sha256": string } ] }`

#### Rights Controller Endpoints (Authenticated Session)
- `POST /api/v1/rights-controller/requests/:id/review`: Approve or reject a pending request.
  - *Request Body:* `{ "action": "APPROVE" | "REJECT", "rejection_reason"?: string }`

### 12.2 Verification Test Script
A lightweight Node.js test script (`scripts/test_enterprise_flow.mjs`) matching the project's JavaScript/TypeScript stack will be provided to verify the end-to-end programmatic license request and file retrieval against the running deployment. This script serves as a supporting integration test rather than a critical-path demonstration blocker.

---

## 13. MVP Scope & 9-Day Hackathon Prioritization Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│             P0: CRITICAL PATH — 12-STEP VERTICAL WORKFLOW              │
├────────────────────────────────────────────────────────────────────────┤
│  1. Connect NEAR wallet via HOT Connect (NEP-413 with 32-byte nonce).  │
│  2. Register one discovery with title, category, and explanation.      │
│  3. Upload evidence file to private Cloudflare R2 storage.             │
│  4. Calculate canonical manifest and verify SHA-256 hashes.            │
│  5. Mint NEP-171 Passport NFT on NEAR testnet (all transfers blocked). │
│  6. Create an active license offer on-chain bound to terms hash.       │
│  7. Submit a license request as a buyer.                               │
│  8. Authorize request through the rights controller account.           │
│  9. Complete exact testnet NEAR payment passing accepted_terms_hash.   │
│ 10. Automatically credit contributor royalty balances on-chain.       │
│ 11. Withdraw accrued earnings as a beneficiary (safe rollback).        │
│ 12. Display active license and download authorized evidence files.     │
├────────────────────────────────────────────────────────────────────────┤
│  + Deterministic Keyword and Category Catalog Search                   │
│  + Essential P0 REST Endpoints & Supporting Node.js Test Script        │
│  + Lightweight Discovery & Request-Preparation Assistant (Post-Core)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────┴────────────────────────────────────┐
│                  P1: IMPORTANT HACKATHON ENHANCEMENTS                  │
│  - Interactive Visual Lineage Graph (DAG rendering in React)           │
│  - Multi-File Batch Upload with parallel hashing progress bars         │
│  - Exportable PDF License Summary Cards                                │
│  - Scoped Enterprise Organization API Key Management UI                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────┴────────────────────────────────────┐
│                  P2: POST-HACKATHON FUTURE ROADMAP                     │
│  - Advanced Semantic Vector Search via external vector database        │
│  - Multi-Currency Stablecoin Payments (USDC on NEAR via NEP-141)       │
│  - Decentralized Zero-Knowledge Proofs for private dataset validation  │
│  - Formal Legal Dispute Arbitration DAO & Staking Mechanism            │
│  - Autonomous AI-Agent Streaming Micropayments for RAG queries         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Detailed End-to-End User Journeys

### Journey 1: Independent Inventor Registering an Invention
1. **Context:** Dr. Aris Thorne (Test Persona) has developed a novel microfluidic cooling architecture for high-performance computing.
2. **Authentication:** Thorne opens KNOVARA, connects his NEAR wallet (`thorne.testnet`) via HOT Connect, and signs the 32-byte nonce NEP-413 challenge.
3. **Registration:** Enters discovery details, selects `ENGINEERING_HARDWARE`, designates `thorne.testnet` as the authorized `rights_controller_id`, and assigns 100% (10,000 bps) royalty share to himself.
4. **Evidence Upload & Hashing:** Uploads a technical report (`cooling_spec.pdf`). The browser computes SHA-256 (`4b2277...`), builds the canonical manifest, and uploads the file to Cloudflare R2. Backend verifies the file hash.
5. **Minting:** Thorne confirms. NEAR testnet smart contract mints NEP-171 Passport `#1021`, recording the `evidence_manifest_hash` and public-safe metadata reference hash.
6. **Result:** The discovery is cataloged with an immutable on-chain passport with transfer restrictions active.

### Journey 2: Research Institution Registering a Multi-Contributor Discovery
1. **Context:** Kyoto BioLabs (Test Org) has developed an engineered enzyme that degrades industrial plastics.
2. **Access:** The institutional licensing manager connects the Kyoto TTO wallet (`kyoto-tto.testnet`).
3. **Declaration:** Enters technical summary, adds Dr. Yuki Tanaka (`tanaka.testnet`) and Kenji Sato (`sato.testnet`) as declared contributors.
4. **Rights & Splits Configuration:**
   - Designates `kyoto-tto.testnet` as the sole authorized `rights_controller_id`.
   - Configures agreed royalty splits:
     - `kyoto-tto.testnet`: 50.00% (5,000 bps)
     - `tanaka.testnet`: 35.00% (3,500 bps)
     - `sato.testnet`: 15.00% (1,500 bps)
     - *System validates sum = 10,000 bps.*
5. **Minting:** The contract executes `nft_mint`, issuing Passport `#1022` with on-chain rights controller and beneficiary split mappings.

### Journey 3: Multiple Beneficiaries Sharing Agreed Earnings
1. **Context:** A commercial license for Token `#1022` is executed for **10.0 NEAR**.
2. **Exact Payment:** Buyer calls `pay_license(license_id, accepted_terms_hash)` depositing exactly 10.0 NEAR.
3. **Internal Accounting:** The smart contract validates payment and credits internal claimable balances:
   - `kyoto-tto.testnet`: $+5.0\text{ NEAR}$
   - `tanaka.testnet`: $+3.5\text{ NEAR}$
   - `sato.testnet`: $+1.5\text{ NEAR}$
4. **Notification:** Beneficiaries observe their updated claimable balances in the dashboard.

### Journey 4: Enterprise AI Company Finding and Licensing a Discovery
1. **Context:** Synthetica AI (Test Buyer) seeks proprietary material science data to fine-tune a foundation model.
2. **Discovery:** Procurement lead searches KNOVARA for *"conductive polymers"*, finds Token `#1001`.
3. **Inspection:** Inspects the NEP-171 passport on NEAR Explorer, reviews active offers and terms hash, and selects `AI_MODEL_FINE_TUNING` priced at **4.0 NEAR**.
4. **Request Submission:** Submits request with use case description: *"Supervised fine-tuning of 7B parameter physics model; dataset will remain private."*
5. **State:** Request enters `PENDING_APPROVAL` status.

### Journey 5: Rights Controller Approving a License Request
1. **Context:** Pacific Tech Innovations (`pacific-tech.testnet`) receives a license request notification for Token `#1001`.
2. **Review:** Licensing officer logs in, inspects Synthetica AI's request, verifies the terms hash, and clicks "Approve License".
3. **On-Chain Approval:** Contract transitions request to `APPROVED` and records the 7-day payment deadline timestamp and `license_terms_hash`.

### Journey 6: Beneficiary Balance Withdrawal
1. **Context:** Kenji Sato (`sato.testnet`) wishes to withdraw accrued earnings of 1.5 NEAR.
2. **Withdrawal Call:** Sato clicks "Withdraw Earnings" in his dashboard, prompting a wallet signature for `withdraw_earnings()`.
3. **Asynchronous Execution:** Contract zeroes Sato's claimable balance and initiates `Promise::new("sato.testnet").transfer(1.5 NEAR)`.
4. **Confirmation:** The transfer succeeds; the contract emits `EarningsWithdrawn("sato.testnet", 1.5 NEAR)`. Sato's wallet reflects the new balance.

### Journey 7: AI Agent Searching and Preparing a License Request
1. **Context:** An AI developer asks the KNOVARA Agent: *"Find innovations related to high-efficiency microfluidic cooling under 3 NEAR for research evaluation."*
2. **Agent Execution:** The agent parses search filters, queries the catalog via deterministic keyword matching, matches Token `#1021` (Dr. Thorne's cooling spec), and verifies an active `RESEARCH_EVALUATION` offer at **1.5 NEAR**.
3. **Proposal Presentation:** Agent displays a structured proposal card confirming price, scope, terms hash, and token status.
4. **Human Confirmation:** The developer clicks "Sign and Submit Request", triggering their NEAR wallet to sign the request transaction.

---

## 15. Security, Trust, Legal Boundaries & Risk Management

### 15.1 Legal IP vs. Cryptographic Registration Disclaimer
- **No Statutory Endorsement:** Registration on KNOVARA does not constitute a government patent, trademark, or copyright grant.
- **Evidentiary Function:** Cryptographic timestamps and canonical manifest hashes provide tamper-evident proof that a specific hash was recorded on-chain at a particular point in time. They do not independently prove physical possession, originality, patentability, or copyright ownership.
- **Contractual Scope:** Digital approvals and license records establish platform-level contractual permissions and cryptographic access, subject to applicable local commercial contract laws.

### 15.2 Contributor Consent & Fraudulent Submission Mitigation
- **Attestation Signature:** Registrants must sign a cryptographic attestation of authority under penalty of account suspension and legal liability.
- **Notice & Takedown:** Legitimate rights holders can file takedown notices. Platform operators can flag disputed discoveries as `DISPUTED` in the application index.
- **Consent Distinction:** Contributor declarations reflect registrant assertions and notification logs; they do not replace formal IP assignments under employment agreements or national law.

### 15.3 File Confidentiality Safeguards
- All evidence uploads to Cloudflare R2 are encrypted at rest using AES-256.
- Direct public bucket access is blocked; download URLs are generated exclusively via short-lived (15-minute) presigned URLs after verifying an active on-chain license grant.

### 15.4 Reentrancy and Pull-Payment Safety
- Smart contract adheres strictly to the Checks-Effects-Interactions pattern.
- Pull-payment architecture prevents external call failures from blocking license activation.
- Asynchronous transfer callbacks restore claimable balances if cross-account transfers fail.

---

## 16. Product Success Criteria & Hackathon Demo Script

### 16.1 Measurable Acceptance Criteria
1. **Passport Minting:** 100% of valid discovery registrations result in a successfully minted NEP-171 NFT on NEAR testnet within $< 15$ seconds.
2. **Complete Custodial Transfer Vector Blocking:** Explicitly test and verify that:
   - `nft_transfer` reverts with `ERR_PASSPORT_NON_TRANSFERABLE`.
   - `nft_transfer_call` reverts with `ERR_PASSPORT_NON_TRANSFERABLE`.
   - Approval methods (`nft_approve`, `nft_revoke`, `nft_revoke_all`) cannot be used to create an alternative transfer route (methods either omitted or panic with `ERR_APPROVALS_NOT_SUPPORTED`).
   - No exposed contract entrypoint can alter the `owner_id` (custodian) of an existing Passport NFT under any circumstances in the MVP.
3. **Exact Terms & Caller Enforcement on Payment:**
   - Calling `pay_license` with `accepted_terms_hash` mismatched from `license.license_terms_hash` reverts with `ERR_TERMS_HASH_MISMATCH`.
   - Calling `pay_license` from an account other than `license.buyer_id` reverts with `ERR_CALLER_NOT_BUYER`.
4. **Evidence Integrity:** Client-side computed `evidence_manifest_hash` matches backend-computed hash with 100% precision across diverse file formats.
5. **Exact Split Validation:** Contract accepts split configurations summing to exactly 10,000 basis points and rejects configurations summing to $\ne 10,000$.
6. **Payment Precision:** Exact license payment distributes 100% of funds into beneficiary claimable balances with zero lost yoctoNEAR.
7. **Unauthorized Access Blocked:** Unauthenticated or unlicensed wallet addresses receive an HTTP `403 Forbidden` when requesting file download URLs.
8. **Deterministic Search:** Keyword and category catalog search returns accurate matching discovery records without requiring external LLM uptime.

### 16.2 Live Hackathon Demonstration Script (Step-by-Step)

```
┌────────────────────────────────────────────────────────────────────────┐
│                      LIVE HACKATHON DEMO RUNBOOK                       │
├──────┬──────────────────────┬──────────────────────────────────────────┤
│ Step │ Action               │ Verifiable Proof                         │
├──────┼──────────────────────┼──────────────────────────────────────────┤
│ 1    │ Wallet Login         │ User connects HOT Connect; signs NEP-413 │
│ 2    │ Register Discovery   │ Inputs "Solid-State Graphene Electrolyte"│
│ 3    │ Split Configuration  │ Sets 70% PI / 30% Co-Inventor (10,000 bps)│
│ 4    │ File Upload          │ Uploads PDF & CSV; displays SHA-256 hash │
│ 5    │ Mint Passport NFT    │ Shows NEAR Explorer link for NEP-171 mint│
│ 6    │ Discovery & Search   │ Buyer queries: "solid-state materials"   │
│ 7    │ License Request      │ Buyer requests AI Fine-Tuning License    │
│ 8    │ Rights Review        │ Rights controller approves request in UI │
│ 9    │ Exact Payment        │ Buyer pays exact 2.0 NEAR + terms hash   │
│ 10   │ Royalty Verification │ Inventor sees +1.4 NEAR claimable balance│
│ 11   │ Balance Withdrawal   │ Inventor withdraws 1.4 NEAR to wallet    │
│ 12   │ Secure File Access   │ Buyer unlocks & downloads authorized file│
└──────┴──────────────────────┴──────────────────────────────────────────┘
```

---

## 17. Confirmed Requirements vs. Assumptions & Unresolved Decisions

### 17.1 Confirmed Product Requirements
- Primary blockchain: **NEAR Protocol Testnet**.
- Token standard: **NEP-171 (NFT) with NEP-177 Metadata**.
- Storage: **MongoDB Atlas** (application state) + **Cloudflare R2** (private files).
- Authentication: **Passwordless NEAR Wallet (HOT Connect) with NEP-413 cryptographic payload signing (32-byte nonce, exact callback_url matching)**.
- Revenue Splits: **Exact 10,000 basis points check on-chain; Pull-payment model with asynchronous rollback**.
- Interface: **Web Application + RESTful Enterprise API + KNOVARA AI Agent**.

### 17.2 Assumptions
- **NEAR Testnet RPC Availability:** Assumes NEAR testnet RPCs remain accessible and funded via faucets during hackathon judging.
- **File Upload Bounds:** Assumes hackathon demo files remain under 100 MB per file, permitting direct presigned uploads to Cloudflare R2 without chunked multipart orchestrators.
- **Single Currency:** Native NEAR tokens are used for all MVP transactions; multi-currency stablecoin (USDC) support deferred to post-hackathon.

### 17.3 Remaining Unresolved Decisions (Pending Step 2 Technical Architecture Alignment)

| Decision ID | Topic | Options Under Consideration | Recommended Path | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **DEC-01** | **Smart Contract Language** | Rust (`near-sdk-rs`) vs. TypeScript (NEAR JS SDK) | **Rust (`near-sdk-rs`)** | Rust is the industry standard for NEAR smart contracts, providing deterministic gas calculation, compile-time memory safety, and native NEP-171 macro libraries. |
| **DEC-02** | **AI Agent Integration** | Direct Gemini API vs. Deterministic Rule Assistant | **Hybrid:** Deterministic Rule Engine for Core Queries + Direct Gemini API for Natural Language | Guarantees 100% core uptime without external AI dependency, while providing natural language capabilities when available. |
| **DEC-03** | **Contract Topology** | Single Unified Contract vs. Two Independent Contracts | **Single Unified Contract** | Cross-contract calls on NEAR introduce asynchronous callback complexity. A unified contract reduces failure modes within a 9-day hackathon timeline. |

---

## 18. Step 1 Sign-Off & Review Checklist

Before proceeding to **Step 2 (Technical Architecture & System Design)**, the following sign-off criteria must be formally confirmed:

- [ ] **NEP-413 Authentication:** 32-byte nonce, Borsh serialization, multi-key verification (Ed25519 & Secp256k1), exact `callback_url` matching, RPC key validation, one-time nonce burn, and CSRF state parameters specified.
- [ ] **Transfer Vector Blocking & Acceptance Tests:** Non-transferability enforced across `nft_transfer`, `nft_transfer_call`, and approval mechanisms; tests verify no exposed method can alter NFT custody.
- [ ] **Metadata Hosting & Hash Standards:** Consistent `reference_hash` (Base64 SHA-256), `evidence_manifest_hash` (Hex SHA-256 / `[u8; 32]`), and `license_terms_hash` (Hex in JSON / `[u8; 32]` in contract); public-safe descriptor hosted on stable endpoint with strict confidentiality boundaries.
- [ ] **License Terms & Caller Enforcement:** On-chain `license_terms_hash` binds exact approved terms; buyer passes `accepted_terms_hash` in `pay_license`; contract enforces exact terms match and caller identity.
- [ ] **Presigned URL Security:** Multi-point authorization checks (buyer wallet, active license, scope, short expiry) and bearer token security disclaimers documented; wording maintained as "download authorized evidence files".
- [ ] **Rights Controller Authority Wording:** Accurately scoped to managing KNOVARA license offers, requests, and approvals for the discovery, based on declared and documented authority.
- [ ] **Evidentiary Realism:** Blockchain timestamps and hashes state proof of recorded hash at a point in time, avoiding unfounded claims of legal possession, patent validity, or offline AI training proof.
- [ ] **Scope Pressure Relief:** Core 12-step vertical workflow prioritized; deterministic keyword/category search; zero LLM dependency on core flow; Node.js test script for enterprise API.
- [ ] **Illustrative Test Data:** All sample names, organizations, wallet IDs, and file hashes clearly marked as illustrative test data.

---
*End of Product Requirements Document (PRD v1.1.2). Awaiting user review and sign-off before commencing Step 2: Technical Architecture.*
