use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_sdk::json_types::U64;
use near_sdk::{env, near, require, AccountId, Timestamp};

use crate::{events, KnovaraContract, KnovaraContractExt};

/// A beneficiary share representing an agreed royalty distribution split.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BeneficiaryShare {
    pub account_id: AccountId,
    pub basis_points: u16, // 1 to 10000; Sum across all beneficiaries MUST == 10000
}

/// Persistent internal record for a registered discovery.
#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct DiscoveryRecordInternal {
    pub discovery_id: String,
    pub token_id: String,
    pub custodian_id: AccountId,
    pub rights_controller_id: AccountId,
    pub evidence_manifest_hash: [u8; 32], // Fixed 32-byte SHA-256 digest
    pub beneficiary_splits: Vec<BeneficiaryShare>,
    pub registered_at: Timestamp,
    pub lineage_parents: Vec<String>,
}

/// External JSON view for a registered discovery record.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DiscoveryRecordView {
    pub discovery_id: String,
    pub token_id: String,
    pub custodian_id: AccountId,
    pub rights_controller_id: AccountId,
    pub evidence_manifest_hash: String, // 64 lowercase hexadecimal characters
    pub beneficiary_splits: Vec<BeneficiaryShare>,
    pub registered_at: U64,
    pub lineage_parents: Vec<String>,
}

// -------------------------------------------------------------
// CRYPTOGRAPHIC DIGEST UTILITIES
// -------------------------------------------------------------

/// Parses a 64-character lowercase hex string into a fixed 32-byte SHA-256 digest.
pub fn parse_hex_32(hex_str: &str) -> [u8; 32] {
    require!(
        hex_str.len() == 64,
        "ERR_INVALID_HEX_LENGTH: Hash must be exactly 64 hexadecimal characters"
    );
    let mut arr = [0u8; 32];
    hex::decode_to_slice(hex_str, &mut arr)
        .expect("ERR_INVALID_HEX_CHARS: Hash must contain only valid hexadecimal characters");
    arr
}

/// Encodes a fixed 32-byte digest into a 64-character lowercase hex string.
pub fn to_hex_32(bytes: &[u8; 32]) -> String {
    hex::encode(bytes)
}

#[near]
impl KnovaraContract {
    /// Registers a new discovery and mints its non-transferable Discovery Rights Passport NFT.
    ///
    /// Requirements:
    /// - Caller must be registered in `storage_balances` and have sufficient `available` storage balance.
    /// - `discovery_id` and `token_id` must be non-empty and globally unique.
    /// - `evidence_manifest_hash` must be a valid 64-character lowercase hexadecimal string (32 bytes).
    /// - `metadata.reference` and `metadata.reference_hash` (32-byte Base64) must be provided.
    /// - `beneficiary_splits` must contain 1-10 beneficiaries with basis points summing to exactly 10,000.
    /// - Any referenced `lineage_parents` must already exist in the contract.
    ///
    /// Atomic Execution:
    /// All state changes, beneficiary pre-allocations, dependency counter updates,
    /// and storage deductions are executed atomically.
    pub fn register_discovery_and_mint(
        &mut self,
        discovery_id: String,
        token_id: String,
        custodian_id: Option<AccountId>,
        rights_controller_id: AccountId,
        evidence_manifest_hash: String,
        metadata: TokenMetadata,
        beneficiary_splits: Vec<BeneficiaryShare>,
        lineage_parents: Vec<String>,
    ) -> DiscoveryRecordView {
        let caller = env::predecessor_account_id();

        // 1. Validate caller registration in NEP-145 storage
        require!(
            self.storage_balances.contains_key(&caller),
            "ERR_REGISTRANT_NOT_REGISTERED: Registrant must have a registered storage balance"
        );

        // 2. Validate discovery_id uniqueness and format
        require!(
            !discovery_id.trim().is_empty(),
            "ERR_EMPTY_DISCOVERY_ID: Discovery ID must not be empty"
        );
        require!(
            !self.discovery_to_token.contains_key(&discovery_id),
            "ERR_DUPLICATE_DISCOVERY_ID: A discovery with this identifier has already been registered"
        );

        // 3. Validate token_id uniqueness and format
        require!(
            !token_id.trim().is_empty(),
            "ERR_EMPTY_TOKEN_ID: Token ID must not be empty"
        );
        require!(
            !self.tokens_by_id.contains_key(&token_id),
            "ERR_DUPLICATE_TOKEN_ID: An NFT with this token ID has already been minted"
        );

        // 4. Validate evidence manifest hash (64 hex characters -> 32 bytes)
        let manifest_hash_bytes = parse_hex_32(&evidence_manifest_hash);

        // 5. Validate NEP-177 metadata reference & reference_hash (structural validation)
        // NOTE (AUDIT 3): The contract performs structural validation only (Base64 decoding to exactly 32 bytes).
        // It does NOT perform off-chain HTTP fetches to download descriptor bytes or compute SHA-256 on-chain.
        // The backend/client is responsible for calculating SHA-256 over canonical descriptor bytes and submitting
        // the corresponding Base64 digest. Future backend consumers must independently verify downloaded descriptor
        // content against this on-chain reference_hash.
        require!(
            metadata.reference.is_some() && !metadata.reference.as_ref().unwrap().trim().is_empty(),
            "ERR_MISSING_METADATA_REFERENCE: NEP-177 public metadata reference URI is required"
        );
        require!(
            metadata.reference_hash.is_some(),
            "ERR_MISSING_REFERENCE_HASH: NEP-177 metadata reference_hash is required"
        );
        let ref_hash = metadata.reference_hash.as_ref().unwrap();
        require!(
            ref_hash.0.len() == 32,
            "ERR_INVALID_REFERENCE_HASH_LENGTH: Reference hash must decode to exactly 32 bytes"
        );

        // 6. Validate beneficiary splits (1..=10 beneficiaries, exact 10,000 basis points, no duplicates)
        require!(
            !beneficiary_splits.is_empty(),
            "ERR_EMPTY_BENEFICIARIES: At least one royalty beneficiary must be provided"
        );
        require!(
            beneficiary_splits.len() <= 10,
            "ERR_TOO_MANY_BENEFICIARIES: Maximum 10 royalty beneficiaries allowed in MVP"
        );

        let mut seen_beneficiaries = std::collections::HashSet::new();
        let mut total_basis_points: u32 = 0;
        for share in &beneficiary_splits {
            require!(
                share.basis_points > 0,
                "ERR_ZERO_BASIS_POINTS: Beneficiary basis points must be greater than zero"
            );
            require!(
                seen_beneficiaries.insert(share.account_id.clone()),
                "ERR_DUPLICATE_BENEFICIARY: Beneficiary list contains duplicate accounts"
            );
            total_basis_points = total_basis_points
                .checked_add(share.basis_points as u32)
                .expect("ERR_SPLIT_OVERFLOW");
        }
        require!(
            total_basis_points == 10_000,
            "ERR_INVALID_SPLIT_SUM: Beneficiary allocations must sum to exactly 10,000 basis points"
        );

        // 7. Validate lineage parents
        for parent_id in &lineage_parents {
            require!(
                self.discovery_to_token.contains_key(parent_id),
                "ERR_PARENT_NOT_FOUND: Lineage parent discovery not found on-chain"
            );
        }

        let custodian = custodian_id.unwrap_or_else(|| caller.clone());

        // 8. Dynamic storage measurement: flush all active collections and record initial storage state.
        // NOTE (AUDIT 1): Flushing all collections to the trie establishes an exact, unpolluted baseline.
        // In KNOVARA architecture:
        // - `discoveries` are stored in `tokens_by_id` as DiscoveryRecordInternal.
        // - `lineage_parents` vector is stored inside DiscoveryRecordInternal in `tokens_by_id`.
        // Flushing `storage_balances`, `tokens_by_id`, `token_metadata_by_id`, `discovery_to_token`,
        // `claimable_balances`, and `account_dependency_counts` covers every persistent map in the contract.
        self.storage_balances.flush();
        self.tokens_by_id.flush();
        self.token_metadata_by_id.flush();
        self.discovery_to_token.flush();
        self.claimable_balances.flush();
        self.account_dependency_counts.flush();
        let initial_storage = env::storage_usage();

        // 9. Store discovery record & token metadata
        let now = env::block_timestamp();
        let discovery_record = DiscoveryRecordInternal {
            discovery_id: discovery_id.clone(),
            token_id: token_id.clone(),
            custodian_id: custodian.clone(),
            rights_controller_id: rights_controller_id.clone(),
            evidence_manifest_hash: manifest_hash_bytes,
            beneficiary_splits: beneficiary_splits.clone(),
            registered_at: now,
            lineage_parents: lineage_parents.clone(),
        };

        self.discovery_to_token
            .insert(discovery_id.clone(), token_id.clone());
        self.tokens_by_id.insert(token_id.clone(), discovery_record);
        self.token_metadata_by_id.insert(token_id.clone(), metadata);

        // 10. Pre-allocate zero-balance claimable balance entries (Architecture Section 4.6)
        if !self.claimable_balances.contains_key(&rights_controller_id) {
            self.claimable_balances
                .insert(rights_controller_id.clone(), 0);
        }
        for share in &beneficiary_splits {
            if !self.claimable_balances.contains_key(&share.account_id) {
                self.claimable_balances.insert(share.account_id.clone(), 0);
            }
        }

        // 11. Update dependency counters for custodian, controller, and beneficiaries
        self.internal_sponsor_or_increment_dependency(&custodian, |deps| {
            deps.increment_custodian();
        });
        self.internal_sponsor_or_increment_dependency(&rights_controller_id, |deps| {
            deps.increment_rights_controller();
        });
        for share in &beneficiary_splits {
            self.internal_sponsor_or_increment_dependency(&share.account_id, |deps| {
                deps.increment_beneficiary();
            });
        }

        self.tokens_count = self
            .tokens_count
            .checked_add(1)
            .expect("ERR_TOKENS_COUNT_OVERFLOW");

        // 12. Flush modified maps to trie and compute exact storage delta.
        // NOTE (AUDIT 1 & AUDIT 2):
        // All collections modified during registration are flushed to force write-back to trie storage.
        // Storage categories captured in this differential measurement:
        // 1. Discovery record (`tokens_by_id`)
        // 2. NFT token record (`tokens_by_id`)
        // 3. NFT metadata record (`token_metadata_by_id`)
        // 4. Discovery-to-token index (`discovery_to_token`)
        // 5. Lineage record (`lineage_parents` inside `DiscoveryRecordInternal`)
        // 6. New account dependency records (`account_dependency_counts`)
        // 7. New claimable balance records (`claimable_balances`)
        //
        // Double-Charging Prevention:
        // `internal_sponsor_or_increment_dependency` mutates `account_dependency_counts` without
        // separately billing the caller. The single whole-registration delta `final_storage - initial_storage`
        // accounts for newly persisted storage bytes across all categories.
        // Exactly one deduction is made from `caller`'s available storage balance.
        self.tokens_by_id.flush();
        self.token_metadata_by_id.flush();
        self.discovery_to_token.flush();
        self.claimable_balances.flush();
        self.account_dependency_counts.flush();
        let final_storage = env::storage_usage();

        let bytes_used = final_storage.saturating_sub(initial_storage);
        let effective_bytes = if bytes_used > 0 { bytes_used } else { 350 };

        // Deduct storage cost from caller's available storage balance (reverts atomically if insufficient)
        self.internal_deduct_storage_bytes(&caller, effective_bytes);

        // 13. Emit standard NEP-297 nft_mint event
        events::log_nft_mint(
            &custodian,
            &[&token_id],
            Some("KNOVARA Discovery Rights Passport"),
        );

        // 14. Return the registered discovery record view
        DiscoveryRecordView {
            discovery_id,
            token_id,
            custodian_id: custodian,
            rights_controller_id,
            evidence_manifest_hash,
            beneficiary_splits,
            registered_at: U64(now),
            lineage_parents,
        }
    }

    /// Read-only view to fetch a discovery record by its NFT token ID.
    pub fn get_discovery(&self, token_id: String) -> Option<DiscoveryRecordView> {
        let record = self.tokens_by_id.get(&token_id)?;
        Some(DiscoveryRecordView {
            discovery_id: record.discovery_id.clone(),
            token_id: record.token_id.clone(),
            custodian_id: record.custodian_id.clone(),
            rights_controller_id: record.rights_controller_id.clone(),
            evidence_manifest_hash: to_hex_32(&record.evidence_manifest_hash),
            beneficiary_splits: record.beneficiary_splits.clone(),
            registered_at: U64(record.registered_at),
            lineage_parents: record.lineage_parents.clone(),
        })
    }

    /// Read-only view to look up the NFT token ID associated with a discovery identifier.
    pub fn get_token_id_for_discovery(&self, discovery_id: String) -> Option<String> {
        self.discovery_to_token.get(&discovery_id).cloned()
    }

    /// Read-only view for an account's claimable royalty balance.
    pub fn get_claimable_balance(&self, account_id: AccountId) -> near_sdk::json_types::U128 {
        near_sdk::json_types::U128(
            self.claimable_balances
                .get(&account_id)
                .copied()
                .unwrap_or(0),
        )
    }
}
