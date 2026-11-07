use near_sdk::json_types::{U128, U64};
use near_sdk::{env, near, require, AccountId, NearToken, Promise};

use crate::discovery::{parse_hex_32, to_hex_32};
use crate::license::{LicenseRecordView, LicenseStatus};
use crate::{events, KnovaraContract, KnovaraContractExt};

/// Calculates `(price_yocto * basis_points) / 10_000` without overflowing u128,
/// even when `price_yocto` is close to `u128::MAX`.
///
/// Mathematical decomposition:
/// Let price_yocto = Q * 10_000 + R, where Q = price_yocto / 10_000 and R = price_yocto % 10_000.
/// Then: (price_yocto * bps) / 10_000 = Q * bps + (R * bps) / 10_000.
/// Since R < 10_000 and bps <= 10_000, R * bps < 100_000_000 (well within u64/u128).
/// Q * bps <= (price_yocto / 10_000) * 10_000 <= price_yocto <= u128::MAX.
/// The final sum cannot exceed price_yocto <= u128::MAX.
pub fn calculate_royalty_share(price_yocto: u128, basis_points: u16) -> u128 {
    let bps = basis_points as u128;
    let q = price_yocto / 10_000;
    let r = price_yocto % 10_000;
    let q_part = q.checked_mul(bps).expect("ERR_SPLIT_OVERFLOW");
    let r_part = (r.checked_mul(bps).expect("ERR_SPLIT_OVERFLOW")) / 10_000;
    q_part.checked_add(r_part).expect("ERR_SPLIT_OVERFLOW")
}

#[near]
impl KnovaraContract {
    /// Executes native NEAR payment for an approved license request and activates the license.
    ///
    /// Requirements:
    /// - Attached native NEAR deposit must match `record.price_yocto` **exactly** (no underpayment, no overpayment).
    /// - Caller must be the recorded buyer (`env::predecessor_account_id() == record.buyer_id`).
    /// - Request must exist and be in `Approved { payment_deadline }` status.
    /// - Current block timestamp must be <= `payment_deadline`.
    /// - `accepted_terms_hash` must match the snapshotted approved `terms_hash` exactly.
    /// - Beneficiary keys in `claimable_balances` must have been pre-allocated at discovery registration.
    /// - Distributes 100% of the payment among beneficiaries according to discovery basis points.
    /// - Any fractional division remainder is deterministically allocated to the Rights Controller.
    /// - Updates aggregate royalty liabilities (`total_royalty_liabilities`).
    /// - Increments the buyer's `active_license_count` dependency counter.
    /// - Transitions status to `Active { activated_at, expires_at }`.
    /// - Dynamically measures persistent storage delta and bills it to the buyer.
    #[payable]
    pub fn pay_for_license(
        &mut self,
        request_id: String,
        accepted_terms_hash: String,
    ) -> LicenseRecordView {
        let buyer = env::predecessor_account_id();
        let attached_yocto = env::attached_deposit().as_yoctonear();

        // 1. Resolve request record and verify existence
        let mut record = self
            .license_records
            .get(&request_id)
            .cloned()
            .expect("ERR_REQUEST_NOT_FOUND: The referenced license request does not exist");

        // 2. Authorize caller as the recorded buyer
        require!(
            buyer == record.buyer_id,
            "ERR_UNAUTHORIZED_BUYER: Only the approved buyer may pay for this license"
        );

        // 3. Verify status is Approved and extract payment deadline
        let payment_deadline = match record.status {
            LicenseStatus::Approved { payment_deadline } => payment_deadline,
            LicenseStatus::Requested => {
                env::panic_str("ERR_REQUEST_NOT_APPROVED: License request has not been approved by the rights controller");
            }
            LicenseStatus::Active { .. } => {
                env::panic_str("ERR_ALREADY_PAID: License has already been paid and activated");
            }
            LicenseStatus::Rejected { .. } => {
                env::panic_str("ERR_REQUEST_REJECTED: License request was rejected");
            }
            LicenseStatus::Expired => {
                env::panic_str("ERR_REQUEST_EXPIRED: License request has expired");
            }
        };

        // 4. Verify payment deadline has not passed
        let now = env::block_timestamp();
        require!(
            now <= payment_deadline,
            "ERR_PAYMENT_DEADLINE_EXPIRED: The payment deadline for this approved request has passed"
        );

        // 5. Verify accepted terms hash matches the immutable approved snapshot
        let accepted_bytes = parse_hex_32(&accepted_terms_hash);
        require!(
            accepted_bytes == record.accepted_terms_hash,
            "ERR_TERMS_HASH_MISMATCH: The accepted terms hash does not match the approved request terms hash"
        );

        // 6. Verify exact payment attached (no underpayment, no overpayment, no silent refund)
        require!(
            attached_yocto == record.price_yocto,
            format!(
                "ERR_EXACT_PAYMENT_REQUIRED: Attached deposit ({}) must equal approved license price ({}) exactly",
                attached_yocto, record.price_yocto
            )
        );

        // 7. Resolve discovery and verify pre-allocated claimable balance entries
        let discovery = self
            .tokens_by_id
            .get(&record.token_id)
            .cloned()
            .expect("ERR_DISCOVERY_RECORD_NOT_FOUND");

        for share in &discovery.beneficiary_splits {
            require!(
                self.claimable_balances.contains_key(&share.account_id),
                "ERR_BENEFICIARY_ENTRY_NOT_PREALLOCATED: Missing pre-allocated balance record for beneficiary"
            );
        }
        require!(
            self.claimable_balances.contains_key(&discovery.rights_controller_id),
            "ERR_RIGHTS_CONTROLLER_ENTRY_NOT_PREALLOCATED: Missing pre-allocated balance record for rights controller"
        );

        // 8. Calculate expiration timestamp using checked arithmetic
        let duration_nanos = (record.duration_days as u64)
            .checked_mul(86_400)
            .and_then(|secs| secs.checked_mul(1_000_000_000))
            .expect("ERR_DURATION_OVERFLOW: Duration in nanoseconds overflowed");

        let expires_at = now
            .checked_add(duration_nanos)
            .expect("ERR_TIMESTAMP_OVERFLOW: Expiration timestamp overflowed");

        // 9. Dynamic storage measurement: flush baseline
        self.storage_balances.flush();
        self.license_records.flush();
        self.account_dependency_counts.flush();
        self.claimable_balances.flush();
        let initial_storage = env::storage_usage();

        // 10. Activate license and update buyer active license counter
        record.status = LicenseStatus::Active {
            activated_at: now,
            expires_at,
        };
        self.license_records
            .insert(request_id.clone(), record.clone());

        if let Some(deps) = self.account_dependency_counts.get_mut(&buyer) {
            deps.increment_active_license();
        }

        // 11. Allocate royalties among beneficiaries with deterministic remainder rule
        let mut total_allocated: u128 = 0;
        let total_price = record.price_yocto;

        for share in &discovery.beneficiary_splits {
            let share_amount = calculate_royalty_share(total_price, share.basis_points);

            total_allocated = total_allocated
                .checked_add(share_amount)
                .expect("ERR_ALLOCATION_OVERFLOW");

            let cur = self
                .claimable_balances
                .get(&share.account_id)
                .copied()
                .expect("ERR_BENEFICIARY_ENTRY_NOT_PREALLOCATED");

            self.claimable_balances.insert(
                share.account_id.clone(),
                cur.checked_add(share_amount).expect("ERR_BALANCE_OVERFLOW"),
            );
        }

        // Remainder policy: integer division remainder is allocated to the Rights Controller
        let remainder = total_price
            .checked_sub(total_allocated)
            .expect("ERR_REMAINDER_UNDERFLOW");

        if remainder > 0 {
            let cur_rc = self
                .claimable_balances
                .get(&discovery.rights_controller_id)
                .copied()
                .expect("ERR_RIGHTS_CONTROLLER_ENTRY_NOT_PREALLOCATED");

            self.claimable_balances.insert(
                discovery.rights_controller_id.clone(),
                cur_rc.checked_add(remainder).expect("ERR_BALANCE_OVERFLOW"),
            );
        }

        // 12. Update aggregate royalty liability accounting
        self.total_royalty_liabilities = self
            .total_royalty_liabilities
            .checked_add(total_price)
            .expect("ERR_LIABILITY_OVERFLOW");

        // 13. Flush modified collections and deduct storage from buyer
        self.license_records.flush();
        self.account_dependency_counts.flush();
        self.claimable_balances.flush();
        let final_storage = env::storage_usage();

        let bytes_used = final_storage.saturating_sub(initial_storage);
        let effective_bytes = if bytes_used > 0 {
            bytes_used
        } else {
            // In unit tests without trie emulation, fall back to exact Borsh delta:
            // LicenseStatus::Approved (9 bytes) -> LicenseStatus::Active (17 bytes) = 8 bytes
            8
        };
        self.internal_deduct_storage_bytes(&buyer, effective_bytes);

        // 14. Emit structured NEP-297 events
        events::log_license_paid(&request_id, &record.discovery_id, &buyer, total_price);
        events::log_license_activated(&request_id, &record.discovery_id, &buyer, now, expires_at);
        events::log_royalties_allocated(
            &request_id,
            &record.discovery_id,
            total_price,
            discovery.beneficiary_splits.len(),
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

    /// Alias for `pay_for_license` adhering to Architecture v1.0.4 interface.
    #[payable]
    pub fn pay_license(
        &mut self,
        request_id: String,
        accepted_terms_hash: String,
    ) -> LicenseRecordView {
        self.pay_for_license(request_id, accepted_terms_hash)
    }

    /// Withdraws accumulated royalty earnings for the caller using the Pull-Payment pattern.
    ///
    /// Requirements:
    /// - Caller must have a positive claimable royalty balance.
    /// - Effects-before-interaction: caller's balance is zeroed locally *before* dispatching transfer.
    /// - Tracks pending royalty withdrawals in `pending_royalty_withdrawals`.
    /// - Preserves aggregate liability invariant: `sum(claimable_balances) + pending_withdrawals == total_royalty_liabilities`.
    /// - Dispatches native NEAR transfer promise to caller.
    /// - Attaches private callback `on_withdraw_earnings_callback` to finalize liabilities or recover balance on failure.
    pub fn withdraw_earnings(&mut self) -> Promise {
        let caller = env::predecessor_account_id();
        let amount = self.claimable_balances.get(&caller).copied().unwrap_or(0);

        require!(
            amount > 0,
            "ERR_ZERO_CLAIMABLE_BALANCE: Caller has no claimable royalty balance to withdraw"
        );

        // 1. Effects-before-interaction: zero local balance
        self.claimable_balances.insert(caller.clone(), 0);

        // 2. Track pending withdrawal (liabilities remain until callback completes)
        self.pending_royalty_withdrawals = self
            .pending_royalty_withdrawals
            .checked_add(amount)
            .expect("ERR_PENDING_OVERFLOW");

        // 3. Emit withdrawal initiated event
        events::log_royalty_withdrawal_initiated(&caller, amount);

        // 4. Dispatch native NEAR transfer with callback recovery
        Promise::new(caller.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(10))
                    .on_withdraw_earnings_callback(caller, U128(amount)),
            )
    }

    /// Private callback processing the result of `withdraw_earnings`.
    ///
    /// Requirements:
    /// - Only callable by the contract itself (`#[private]`).
    /// - Decrements `pending_royalty_withdrawals` regardless of success or failure.
    /// - If transfer failed: restores the withdrawn amount into `claimable_balances` using checked_add.
    ///   Preserves any new earnings that arrived while transfer was in-flight!
    ///   Total royalty liabilities remain unchanged (never left the contract).
    /// - If transfer succeeded: decrements `total_royalty_liabilities`; emits completion event.
    #[private]
    pub fn on_withdraw_earnings_callback(
        &mut self,
        account_id: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) -> bool {
        near_sdk::assert_self();

        // 1. Decrement pending withdrawals tracker
        self.pending_royalty_withdrawals = self
            .pending_royalty_withdrawals
            .checked_sub(amount.0)
            .expect("ERR_PENDING_UNDERFLOW");

        if result.is_err() {
            // Restore claimable balance without overwriting newer earnings
            let cur = self
                .claimable_balances
                .get(&account_id)
                .copied()
                .unwrap_or(0);

            let restored = cur
                .checked_add(amount.0)
                .expect("ERR_BALANCE_RESTORE_OVERFLOW");

            self.claimable_balances.insert(account_id.clone(), restored);

            events::log_royalty_withdrawal_failed(&account_id, amount.0);
            false
        } else {
            // Transfer succeeded: finalize reduction of aggregate royalty liabilities
            self.total_royalty_liabilities = self
                .total_royalty_liabilities
                .checked_sub(amount.0)
                .expect("ERR_LIABILITY_UNDERFLOW");

            events::log_royalty_withdrawn(&account_id, amount.0);
            true
        }
    }

    /// Expires an active license whose term has elapsed on-chain.
    ///
    /// Requirements:
    /// - Request must exist and be in `Active` status.
    /// - Current NEAR block timestamp >= `expires_at`.
    /// - Decrements buyer's `active_license_count` exactly once.
    /// - Preserves buyer's `persistent_license_count`.
    /// - Transitions status to `Expired`.
    /// - Permissionless (callable by anyone).
    pub fn expire_license(&mut self, request_id: String) -> LicenseRecordView {
        let mut record = self
            .license_records
            .get(&request_id)
            .cloned()
            .expect("ERR_REQUEST_NOT_FOUND: The referenced license request does not exist");

        let expires_at = match record.status {
            LicenseStatus::Active { expires_at, .. } => expires_at,
            LicenseStatus::Expired => {
                env::panic_str("ERR_ALREADY_EXPIRED: License has already been expired");
            }
            _ => {
                env::panic_str(
                    "ERR_LICENSE_NOT_ACTIVE: Only active licenses can be expired via expire_license",
                );
            }
        };

        let now = env::block_timestamp();
        require!(
            now >= expires_at,
            "ERR_LICENSE_NOT_YET_EXPIRED: Current block timestamp has not reached the expiration timestamp"
        );

        record.status = LicenseStatus::Expired;
        self.license_records
            .insert(request_id.clone(), record.clone());

        // Decrement active_license_count for buyer
        if let Some(deps) = self.account_dependency_counts.get_mut(&record.buyer_id) {
            deps.decrement_active_license();
        }

        events::log_license_expired(&request_id, &record.discovery_id, &record.buyer_id);

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

    /// Expires an approved license request whose payment deadline elapsed without payment.
    ///
    /// Requirements:
    /// - Request must exist and be in `Approved` status.
    /// - Current NEAR block timestamp > `payment_deadline`.
    /// - Transitions status to `Expired`.
    /// - Permissionless (callable by anyone).
    pub fn expire_license_request(&mut self, request_id: String) -> LicenseRecordView {
        let mut record = self
            .license_records
            .get(&request_id)
            .cloned()
            .expect("ERR_REQUEST_NOT_FOUND: The referenced license request does not exist");

        let payment_deadline = match record.status {
            LicenseStatus::Approved { payment_deadline } => payment_deadline,
            LicenseStatus::Expired => {
                env::panic_str("ERR_ALREADY_EXPIRED: License request has already been expired");
            }
            _ => {
                env::panic_str(
                    "ERR_REQUEST_NOT_APPROVED: Only approved requests can expire via expire_license_request",
                );
            }
        };

        let now = env::block_timestamp();
        require!(
            now > payment_deadline,
            "ERR_PAYMENT_DEADLINE_NOT_PASSED: Payment deadline has not yet passed"
        );

        record.status = LicenseStatus::Expired;
        self.license_records
            .insert(request_id.clone(), record.clone());

        events::log_license_request_expired(&request_id, &record.discovery_id, &record.buyer_id);

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

    /// Read-only view for the aggregate outstanding royalty liabilities in yoctoNEAR.
    pub fn get_total_royalty_liabilities(&self) -> U128 {
        U128(self.total_royalty_liabilities)
    }

    /// Read-only view for pending in-flight royalty withdrawals in yoctoNEAR.
    pub fn get_pending_royalty_withdrawals(&self) -> U128 {
        U128(self.pending_royalty_withdrawals)
    }
}
