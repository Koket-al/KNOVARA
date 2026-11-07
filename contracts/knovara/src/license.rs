use near_sdk::json_types::{U128, U64};
use near_sdk::{env, near, require, AccountId, Timestamp};

use crate::discovery::{parse_hex_32, to_hex_32};
use crate::{events, KnovaraContract, KnovaraContractExt};

/// Seven days in nanoseconds (7 * 86,400 * 1,000,000,000)
pub const SEVEN_DAYS_NANOS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;

/// Maximum allowed length in characters for a rejection reason.
pub const MAX_REJECTION_REASON_LEN: usize = 256;

/// Canonical licensing scopes supported by KNOVARA.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum LicenseScope {
    AcademicResearch,
    CommercialUse,
    AiModelTraining,
    AiModelFineTuning,
    AiKnowledgeRetrieval,
    ResearchEvaluation,
    CustomTerms,
}

impl LicenseScope {
    pub fn as_str(&self) -> &'static str {
        match self {
            LicenseScope::AcademicResearch => "AcademicResearch",
            LicenseScope::CommercialUse => "CommercialUse",
            LicenseScope::AiModelTraining => "AiModelTraining",
            LicenseScope::AiModelFineTuning => "AiModelFineTuning",
            LicenseScope::AiKnowledgeRetrieval => "AiKnowledgeRetrieval",
            LicenseScope::ResearchEvaluation => "ResearchEvaluation",
            LicenseScope::CustomTerms => "CustomTerms",
        }
    }
}

/// License lifecycle status state machine.
#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum LicenseStatus {
    Requested,
    Approved {
        payment_deadline: Timestamp,
    },
    Rejected {
        reason: String,
    },
    Active {
        activated_at: Timestamp,
        expires_at: Timestamp,
    },
    Expired,
}

/// Internal persistent representation of a licensing offer.
#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct LicenseOfferInternal {
    pub offer_id: String,
    pub discovery_id: String,
    pub token_id: String,
    pub rights_controller_id: AccountId,
    pub scope: LicenseScope,
    pub price_yocto: u128,
    pub terms_hash: [u8; 32], // Fixed 32-byte SHA-256 digest
    pub duration_days: u32,
    pub created_at: Timestamp,
    pub is_active: bool,
}

/// External JSON view for a licensing offer.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LicenseOfferView {
    pub offer_id: String,
    pub discovery_id: String,
    pub token_id: String,
    pub rights_controller_id: AccountId,
    pub scope: LicenseScope,
    pub price_yocto: U128,
    pub terms_hash: String, // 64 lowercase hexadecimal characters
    pub duration_days: u32,
    pub created_at: U64,
    pub is_active: bool,
}

/// Internal persistent representation of a license request / record.
#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct LicenseRecordInternal {
    pub request_id: String,
    pub offer_id: String,
    pub discovery_id: String,
    pub token_id: String,
    pub buyer_id: AccountId,
    pub scope: LicenseScope,
    pub price_yocto: u128,
    pub duration_days: u32,
    pub license_terms_hash: [u8; 32], // Snapshotted from offer.terms_hash
    pub accepted_terms_hash: [u8; 32], // Explicitly confirmed by buyer
    pub requested_at: Timestamp,
    pub status: LicenseStatus,
}

/// External JSON view for a license request / record.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LicenseRecordView {
    pub request_id: String,
    pub license_id: String, // Alias of request_id for backwards compatibility
    pub offer_id: String,
    pub discovery_id: String,
    pub token_id: String,
    pub buyer_id: AccountId,
    pub scope: LicenseScope,
    pub price_yocto: U128,
    pub duration_days: u32,
    pub license_terms_hash: String, // 64 lowercase hexadecimal characters
    pub accepted_terms_hash: String, // 64 lowercase hexadecimal characters
    pub requested_at: U64,
    pub status: LicenseStatus,
}

#[near]
impl KnovaraContract {
    /// Creates a new licensing offer for an existing registered discovery.
    ///
    /// Requirements:
    /// - Caller must be the designated `rights_controller_id` of the discovery.
    ///   NFT custody alone does NOT grant licensing authority.
    /// - `offer_id` must be non-empty and globally unique.
    /// - `discovery_id` must exist on-chain.
    /// - `terms_hash` must be a valid 64-character lowercase hexadecimal string (32 bytes).
    /// - `duration_days` must be between 1 and 365 days.
    /// - Caller must have sufficient available storage balance to fund the offer record.
    pub fn create_license_offer(
        &mut self,
        offer_id: String,
        discovery_id: String,
        scope: LicenseScope,
        price_yocto: U128,
        terms_hash: String,
        duration_days: u32,
    ) -> LicenseOfferView {
        let caller = env::predecessor_account_id();

        // 1. Validate caller is registered in NEP-145 storage
        require!(
            self.storage_balances.contains_key(&caller),
            "ERR_CONTROLLER_NOT_REGISTERED: Rights controller must have a registered storage balance"
        );

        // 2. Validate offer_id format and uniqueness
        require!(
            !offer_id.trim().is_empty(),
            "ERR_EMPTY_OFFER_ID: Offer ID must not be empty"
        );
        require!(
            offer_id.len() <= 64,
            "ERR_OFFER_ID_TOO_LONG: Offer ID must be at most 64 characters"
        );
        require!(
            !self.license_offers.contains_key(&offer_id),
            "ERR_DUPLICATE_OFFER_ID: An offer with this ID already exists"
        );

        // 3. Resolve discovery and verify caller is the designated Rights Controller
        let token_id = self
            .discovery_to_token
            .get(&discovery_id)
            .cloned()
            .expect("ERR_DISCOVERY_NOT_FOUND: The referenced discovery does not exist");

        let discovery = self
            .tokens_by_id
            .get(&token_id)
            .expect("ERR_DISCOVERY_RECORD_NOT_FOUND");

        require!(
            caller == discovery.rights_controller_id,
            "ERR_NOT_RIGHTS_CONTROLLER: Only the designated rights controller may create licensing offers"
        );

        // 4. Validate terms hash and duration
        let terms_hash_bytes = parse_hex_32(&terms_hash);
        let canonical_terms_hash = to_hex_32(&terms_hash_bytes);
        require!(
            duration_days > 0 && duration_days <= 365,
            "ERR_INVALID_DURATION: License duration must be between 1 and 365 days"
        );

        // 5. Dynamic storage measurement: flush baseline
        self.storage_balances.flush();
        self.license_offers.flush();
        self.discovery_to_offers.flush();
        let initial_storage = env::storage_usage();

        // 6. Persist offer record and update discovery-to-offers index
        let now = env::block_timestamp();
        let offer = LicenseOfferInternal {
            offer_id: offer_id.clone(),
            discovery_id: discovery_id.clone(),
            token_id: token_id.clone(),
            rights_controller_id: caller.clone(),
            scope,
            price_yocto: price_yocto.0,
            terms_hash: terms_hash_bytes,
            duration_days,
            created_at: now,
            is_active: true,
        };

        self.license_offers.insert(offer_id.clone(), offer);

        let mut offers_list = self
            .discovery_to_offers
            .get(&discovery_id)
            .cloned()
            .unwrap_or_default();
        offers_list.push(offer_id.clone());
        self.discovery_to_offers
            .insert(discovery_id.clone(), offers_list);

        // 7. Flush modified collections and deduct storage cost
        self.license_offers.flush();
        self.discovery_to_offers.flush();
        let final_storage = env::storage_usage();

        let bytes_used = final_storage.saturating_sub(initial_storage);
        let effective_bytes = if bytes_used > 0 { bytes_used } else { 150 };
        self.internal_deduct_storage_bytes(&caller, effective_bytes);

        // 8. Emit structured NEP-297 event
        events::log_license_offer_created(
            &offer_id,
            &discovery_id,
            &caller,
            scope.as_str(),
            price_yocto.0,
            &canonical_terms_hash,
            duration_days,
        );

        LicenseOfferView {
            offer_id,
            discovery_id,
            token_id,
            rights_controller_id: caller,
            scope,
            price_yocto,
            terms_hash: canonical_terms_hash,
            duration_days,
            created_at: U64(now),
            is_active: true,
        }
    }

    /// Deactivates an existing license offer. Deactivated offers reject all new requests.
    /// Previously submitted requests remain completely unaffected.
    pub fn deactivate_license_offer(&mut self, offer_id: String) -> bool {
        let caller = env::predecessor_account_id();

        let mut offer = self
            .license_offers
            .get(&offer_id)
            .cloned()
            .expect("ERR_OFFER_NOT_FOUND: The referenced license offer does not exist");

        require!(
            caller == offer.rights_controller_id,
            "ERR_NOT_RIGHTS_CONTROLLER: Only the designated rights controller may deactivate offers"
        );

        offer.is_active = false;
        self.license_offers.insert(offer_id.clone(), offer.clone());

        events::log_license_offer_deactivated(&offer_id, &offer.discovery_id, &caller);
        true
    }

    /// Submits a new license request referencing an active offer.
    ///
    /// Requirements:
    /// - Buyer identity is strictly derived from `env::predecessor_account_id()`.
    /// - `request_id` must be globally unique.
    /// - The referenced offer must exist and be currently active.
    /// - `accepted_terms_hash` must match the offer's `terms_hash` exactly.
    /// - Preserves an immutable snapshot of offer terms (price, scope, duration, terms hash).
    /// - Increments the buyer's `persistent_license_count` dependency counter.
    /// - Deducts storage costs from the buyer's available storage deposit.
    pub fn request_license(
        &mut self,
        request_id: String,
        offer_id: String,
        accepted_terms_hash: String,
    ) -> LicenseRecordView {
        let buyer = env::predecessor_account_id();

        // 1. Validate buyer has registered storage deposit
        require!(
            self.storage_balances.contains_key(&buyer),
            "ERR_BUYER_NOT_REGISTERED: Requesting buyer must have a registered storage balance"
        );

        // 2. Validate request_id format and uniqueness
        require!(
            !request_id.trim().is_empty(),
            "ERR_EMPTY_REQUEST_ID: Request ID must not be empty"
        );
        require!(
            request_id.len() <= 64,
            "ERR_REQUEST_ID_TOO_LONG: Request ID must be at most 64 characters"
        );
        require!(
            !self.license_records.contains_key(&request_id),
            "ERR_DUPLICATE_REQUEST_ID: A request with this ID already exists"
        );

        // 3. Resolve offer and verify it is active
        let offer = self
            .license_offers
            .get(&offer_id)
            .cloned()
            .expect("ERR_OFFER_NOT_FOUND: The referenced license offer does not exist");

        require!(
            offer.is_active,
            "ERR_OFFER_INACTIVE: This license offer is deactivated and cannot accept new requests"
        );

        // 4. Exact terms hash verification
        let accepted_hash_bytes = parse_hex_32(&accepted_terms_hash);
        let canonical_accepted_hash = to_hex_32(&accepted_hash_bytes);
        require!(
            accepted_hash_bytes == offer.terms_hash,
            "ERR_TERMS_HASH_MISMATCH: The accepted terms hash does not match the offer terms hash"
        );

        // 5. Dynamic storage measurement: flush baseline
        self.storage_balances.flush();
        self.license_records.flush();
        self.discovery_to_requests.flush();
        self.offer_to_requests.flush();
        self.account_dependency_counts.flush();
        let initial_storage = env::storage_usage();

        // 6. Construct immutable snapshot of offer terms in request record
        let now = env::block_timestamp();
        let record = LicenseRecordInternal {
            request_id: request_id.clone(),
            offer_id: offer.offer_id.clone(),
            discovery_id: offer.discovery_id.clone(),
            token_id: offer.token_id.clone(),
            buyer_id: buyer.clone(),
            scope: offer.scope,
            price_yocto: offer.price_yocto,
            duration_days: offer.duration_days,
            license_terms_hash: offer.terms_hash,
            accepted_terms_hash: accepted_hash_bytes,
            requested_at: now,
            status: LicenseStatus::Requested,
        };

        self.license_records.insert(request_id.clone(), record);

        // Index request by discovery
        let mut disc_reqs = self
            .discovery_to_requests
            .get(&offer.discovery_id)
            .cloned()
            .unwrap_or_default();
        disc_reqs.push(request_id.clone());
        self.discovery_to_requests
            .insert(offer.discovery_id.clone(), disc_reqs);

        // Index request by offer
        let mut offer_reqs = self
            .offer_to_requests
            .get(&offer.offer_id)
            .cloned()
            .unwrap_or_default();
        offer_reqs.push(request_id.clone());
        self.offer_to_requests
            .insert(offer.offer_id.clone(), offer_reqs);

        // Increment persistent_license_count for buyer
        self.internal_sponsor_or_increment_dependency(&buyer, |deps| {
            deps.increment_persistent_license();
        });

        // 7. Flush modified collections and deduct storage from buyer
        self.license_records.flush();
        self.discovery_to_requests.flush();
        self.offer_to_requests.flush();
        self.account_dependency_counts.flush();
        let final_storage = env::storage_usage();

        let bytes_used = final_storage.saturating_sub(initial_storage);
        let effective_bytes = if bytes_used > 0 { bytes_used } else { 200 };
        self.internal_deduct_storage_bytes(&buyer, effective_bytes);

        // 8. Emit structured NEP-297 event
        events::log_license_requested(
            &request_id,
            &offer.offer_id,
            &offer.discovery_id,
            &buyer,
            offer.scope.as_str(),
            offer.price_yocto,
            &canonical_accepted_hash,
        );

        LicenseRecordView {
            request_id: request_id.clone(),
            license_id: request_id,
            offer_id: offer.offer_id,
            discovery_id: offer.discovery_id,
            token_id: offer.token_id,
            buyer_id: buyer,
            scope: offer.scope,
            price_yocto: U128(offer.price_yocto),
            duration_days: offer.duration_days,
            license_terms_hash: to_hex_32(&offer.terms_hash),
            accepted_terms_hash: canonical_accepted_hash,
            requested_at: U64(now),
            status: LicenseStatus::Requested,
        }
    }

    /// Approves a license request.
    ///
    /// Requirements:
    /// - Only the designated `rights_controller_id` of the discovery may approve requests.
    /// - Rights Controller must be registered for NEP-145 storage.
    /// - Request must exist and be in `Requested` status.
    /// - Transitions status to `Approved { payment_deadline: now + 7 days }` with checked timestamp arithmetic.
    /// - Measures persistent storage growth delta and charges the Rights Controller exactly once.
    /// - Reverts cleanly if the Rights Controller has insufficient available storage balance.
    /// - Approval does NOT activate the license or process payment.
    pub fn approve_license_request(&mut self, request_id: String) -> LicenseRecordView {
        let caller = env::predecessor_account_id();

        let mut record = self
            .license_records
            .get(&request_id)
            .cloned()
            .expect("ERR_REQUEST_NOT_FOUND: The referenced license request does not exist");

        // Verify request is in Requested status
        require!(
            matches!(record.status, LicenseStatus::Requested),
            "ERR_INVALID_STATUS_FOR_APPROVAL: Request status must be Requested to be approved"
        );

        // Resolve discovery to check Rights Controller authorization
        let discovery = self
            .tokens_by_id
            .get(&record.token_id)
            .expect("ERR_DISCOVERY_RECORD_NOT_FOUND");

        require!(
            caller == discovery.rights_controller_id,
            "ERR_NOT_RIGHTS_CONTROLLER: Only the designated rights controller may approve license requests"
        );

        // Verify Rights Controller has a registered NEP-145 storage balance
        require!(
            self.storage_balances.contains_key(&caller),
            "ERR_CONTROLLER_NOT_REGISTERED: Rights controller must have a registered storage balance"
        );

        // Checked timestamp addition for 7-day payment deadline (nanoseconds)
        let now = env::block_timestamp();
        let payment_deadline = now
            .checked_add(SEVEN_DAYS_NANOS)
            .expect("ERR_TIMESTAMP_OVERFLOW: Block timestamp addition overflowed");

        // Dynamic storage measurement: flush baseline before mutating status
        self.storage_balances.flush();
        self.license_records.flush();
        let initial_storage = env::storage_usage();

        record.status = LicenseStatus::Approved { payment_deadline };
        self.license_records
            .insert(request_id.clone(), record.clone());

        // Flush modified collection to measure actual persistent storage delta
        self.license_records.flush();
        let final_storage = env::storage_usage();

        let bytes_used = final_storage.saturating_sub(initial_storage);
        let effective_bytes = if bytes_used > 0 {
            bytes_used
        } else {
            // In unit tests without trie emulation, fall back to exact Borsh delta:
            // LicenseStatus::Requested (1 byte) -> LicenseStatus::Approved { u64 } (9 bytes) = 8 bytes
            8
        };
        self.internal_deduct_storage_bytes(&caller, effective_bytes);

        events::log_license_approved(
            &request_id,
            &record.offer_id,
            &record.discovery_id,
            &record.buyer_id,
            &caller,
            payment_deadline,
        );

        LicenseRecordView {
            request_id: request_id.clone(),
            license_id: request_id,
            offer_id: record.offer_id,
            discovery_id: record.discovery_id,
            token_id: record.token_id,
            buyer_id: record.buyer_id,
            scope: record.scope,
            price_yocto: U128(record.price_yocto),
            duration_days: record.duration_days,
            license_terms_hash: to_hex_32(&record.license_terms_hash),
            accepted_terms_hash: to_hex_32(&record.accepted_terms_hash),
            requested_at: U64(record.requested_at),
            status: record.status,
        }
    }

    /// Rejects a license request with an explanatory reason.
    ///
    /// Requirements:
    /// - Only the designated `rights_controller_id` of the discovery may reject requests.
    /// - Rights Controller must be registered for NEP-145 storage.
    /// - Request must exist and be in `Requested` status.
    /// - Rejection reason must be non-empty and at most 256 characters.
    /// - Transitions status to `Rejected { reason }`.
    /// - Measures persistent storage growth delta and charges the Rights Controller exactly once.
    /// - Reverts cleanly if the Rights Controller has insufficient available storage balance.
    /// - A rejected request remains persistently accounted for in `persistent_license_count`.
    pub fn reject_license_request(
        &mut self,
        request_id: String,
        reason: Option<String>,
    ) -> LicenseRecordView {
        let caller = env::predecessor_account_id();

        let mut record = self
            .license_records
            .get(&request_id)
            .cloned()
            .expect("ERR_REQUEST_NOT_FOUND: The referenced license request does not exist");

        // Verify request is in Requested status
        require!(
            matches!(record.status, LicenseStatus::Requested),
            "ERR_INVALID_STATUS_FOR_REJECTION: Request status must be Requested to be rejected"
        );

        // Resolve discovery to check Rights Controller authorization
        let discovery = self
            .tokens_by_id
            .get(&record.token_id)
            .expect("ERR_DISCOVERY_RECORD_NOT_FOUND");

        require!(
            caller == discovery.rights_controller_id,
            "ERR_NOT_RIGHTS_CONTROLLER: Only the designated rights controller may reject license requests"
        );

        // Verify Rights Controller has a registered NEP-145 storage balance
        require!(
            self.storage_balances.contains_key(&caller),
            "ERR_CONTROLLER_NOT_REGISTERED: Rights controller must have a registered storage balance"
        );

        // Validate rejection reason length and content
        let rejection_reason =
            reason.unwrap_or_else(|| "Rejected by rights controller".to_string());
        require!(
            !rejection_reason.trim().is_empty(),
            "ERR_EMPTY_REJECTION_REASON: Rejection reason must not be empty"
        );
        require!(
            rejection_reason.len() <= MAX_REJECTION_REASON_LEN,
            "ERR_REJECTION_REASON_TOO_LONG: Rejection reason must be at most 256 characters"
        );

        // Dynamic storage measurement: flush baseline before mutating status
        self.storage_balances.flush();
        self.license_records.flush();
        let initial_storage = env::storage_usage();

        record.status = LicenseStatus::Rejected {
            reason: rejection_reason.clone(),
        };
        self.license_records
            .insert(request_id.clone(), record.clone());

        // Flush modified collection to measure actual persistent storage delta
        self.license_records.flush();
        let final_storage = env::storage_usage();

        let bytes_used = final_storage.saturating_sub(initial_storage);
        let effective_bytes = if bytes_used > 0 {
            bytes_used
        } else {
            // In unit tests without trie emulation, fall back to exact Borsh delta:
            // LicenseStatus::Requested (1 byte) -> LicenseStatus::Rejected { reason } (1 + 4 + len bytes)
            (4 + rejection_reason.len()) as u64
        };
        self.internal_deduct_storage_bytes(&caller, effective_bytes);

        events::log_license_rejected(
            &request_id,
            &record.offer_id,
            &record.discovery_id,
            &record.buyer_id,
            &caller,
            &rejection_reason,
        );

        LicenseRecordView {
            request_id: request_id.clone(),
            license_id: request_id,
            offer_id: record.offer_id,
            discovery_id: record.discovery_id,
            token_id: record.token_id,
            buyer_id: record.buyer_id,
            scope: record.scope,
            price_yocto: U128(record.price_yocto),
            duration_days: record.duration_days,
            license_terms_hash: to_hex_32(&record.license_terms_hash),
            accepted_terms_hash: to_hex_32(&record.accepted_terms_hash),
            requested_at: U64(record.requested_at),
            status: record.status,
        }
    }

    // -------------------------------------------------------------
    // READ-ONLY VIEW METHODS
    // -------------------------------------------------------------

    /// Read-only view for a licensing offer by its offer ID.
    pub fn get_license_offer(&self, offer_id: String) -> Option<LicenseOfferView> {
        let offer = self.license_offers.get(&offer_id)?;
        Some(LicenseOfferView {
            offer_id: offer.offer_id.clone(),
            discovery_id: offer.discovery_id.clone(),
            token_id: offer.token_id.clone(),
            rights_controller_id: offer.rights_controller_id.clone(),
            scope: offer.scope,
            price_yocto: U128(offer.price_yocto),
            terms_hash: to_hex_32(&offer.terms_hash),
            duration_days: offer.duration_days,
            created_at: U64(offer.created_at),
            is_active: offer.is_active,
        })
    }

    /// Read-only view for all licensing offers created for a discovery.
    pub fn get_license_offers_for_discovery(&self, discovery_id: String) -> Vec<LicenseOfferView> {
        let offer_ids = match self.discovery_to_offers.get(&discovery_id) {
            Some(ids) => ids,
            None => return vec![],
        };

        offer_ids
            .iter()
            .filter_map(|id| self.get_license_offer(id.clone()))
            .collect()
    }

    /// Read-only view for a license request by its request ID.
    pub fn get_license_request(&self, request_id: String) -> Option<LicenseRecordView> {
        let record = self.license_records.get(&request_id)?;
        Some(LicenseRecordView {
            request_id: record.request_id.clone(),
            license_id: record.request_id.clone(),
            offer_id: record.offer_id.clone(),
            discovery_id: record.discovery_id.clone(),
            token_id: record.token_id.clone(),
            buyer_id: record.buyer_id.clone(),
            scope: record.scope,
            price_yocto: U128(record.price_yocto),
            duration_days: record.duration_days,
            license_terms_hash: to_hex_32(&record.license_terms_hash),
            accepted_terms_hash: to_hex_32(&record.accepted_terms_hash),
            requested_at: U64(record.requested_at),
            status: record.status.clone(),
        })
    }

    /// Alias for `get_license_request` matching Architecture v1.0.4.
    pub fn get_license(&self, license_id: String) -> Option<LicenseRecordView> {
        self.get_license_request(license_id)
    }

    /// Read-only view for all requests associated with a discovery.
    pub fn get_license_requests_for_discovery(
        &self,
        discovery_id: String,
    ) -> Vec<LicenseRecordView> {
        let req_ids = match self.discovery_to_requests.get(&discovery_id) {
            Some(ids) => ids,
            None => return vec![],
        };

        req_ids
            .iter()
            .filter_map(|id| self.get_license_request(id.clone()))
            .collect()
    }

    /// Read-only view for all requests associated with an offer.
    pub fn get_license_requests_for_offer(&self, offer_id: String) -> Vec<LicenseRecordView> {
        let req_ids = match self.offer_to_requests.get(&offer_id) {
            Some(ids) => ids,
            None => return vec![],
        };

        req_ids
            .iter()
            .filter_map(|id| self.get_license_request(id.clone()))
            .collect()
    }
}
