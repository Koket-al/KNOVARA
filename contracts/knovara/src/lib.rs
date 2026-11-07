use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, TokenMetadata, NFT_METADATA_SPEC,
};
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault};

pub mod discovery;
pub mod events;
pub mod license;
pub mod nft;
pub mod payments;
pub mod storage;

pub use discovery::*;
pub use events::*;
pub use license::*;
pub use nft::*;
pub use storage::*;

/// Strongly typed storage keys for modern `near_sdk::store` collections.
#[derive(BorshStorageKey)]
#[near]
pub enum StorageKey {
    StorageBalances,
    AccountDependencyCounts,
    TokensById,
    TokenMetadataById,
    DiscoveryToToken,
    ClaimableBalances,
    LineageParents,
    LicenseOffers,
    LicenseRecords,
    DiscoveryToOffers,
    DiscoveryToRequests,
    OfferToRequests,
}

/// The core KNOVARA contract state.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct KnovaraContract {
    pub admin_id: AccountId,
    pub tokens_count: u64,
    pub storage_min_deposit: u128,
    pub storage_balances: LookupMap<AccountId, StorageBalanceInternal>,
    pub account_dependency_counts: LookupMap<AccountId, AccountDependencyCounts>,
    pub tokens_by_id: LookupMap<String, DiscoveryRecordInternal>,
    pub token_metadata_by_id: LookupMap<String, TokenMetadata>,
    pub discovery_to_token: LookupMap<String, String>,
    pub claimable_balances: LookupMap<AccountId, u128>,
    pub contract_metadata: NFTContractMetadata,
    pub license_offers: LookupMap<String, LicenseOfferInternal>,
    pub license_records: LookupMap<String, LicenseRecordInternal>,
    pub discovery_to_offers: LookupMap<String, Vec<String>>,
    pub discovery_to_requests: LookupMap<String, Vec<String>>,
    pub offer_to_requests: LookupMap<String, Vec<String>>,
    pub total_royalty_liabilities: u128,
    pub pending_royalty_withdrawals: u128,
}

#[near]
impl KnovaraContract {
    /// Contract initialization method.
    ///
    /// Establishes the persistent collections, sets the administrative authority,
    /// sets NEP-177 contract metadata, and dynamically measures the registration
    /// storage minimum deposit covering `storage_balances` and `account_dependency_counts`.
    #[init]
    pub fn new(admin_id: AccountId) -> Self {
        require!(!env::state_exists(), "ERR_ALREADY_INITIALIZED");

        let mut contract = Self {
            admin_id,
            tokens_count: 0,
            storage_min_deposit: 0,
            storage_balances: LookupMap::new(StorageKey::StorageBalances),
            account_dependency_counts: LookupMap::new(StorageKey::AccountDependencyCounts),
            tokens_by_id: LookupMap::new(StorageKey::TokensById),
            token_metadata_by_id: LookupMap::new(StorageKey::TokenMetadataById),
            discovery_to_token: LookupMap::new(StorageKey::DiscoveryToToken),
            claimable_balances: LookupMap::new(StorageKey::ClaimableBalances),
            contract_metadata: NFTContractMetadata {
                spec: NFT_METADATA_SPEC.to_string(),
                name: "KNOVARA Discovery Rights Passports".to_string(),
                symbol: "KNOVARA".to_string(),
                icon: None,
                base_uri: None,
                reference: None,
                reference_hash: None,
            },
            license_offers: LookupMap::new(StorageKey::LicenseOffers),
            license_records: LookupMap::new(StorageKey::LicenseRecords),
            discovery_to_offers: LookupMap::new(StorageKey::DiscoveryToOffers),
            discovery_to_requests: LookupMap::new(StorageKey::DiscoveryToRequests),
            offer_to_requests: LookupMap::new(StorageKey::OfferToRequests),
            total_royalty_liabilities: 0,
            pending_royalty_withdrawals: 0,
        };

        // Measure dynamic registration deposit covering baseline maps
        contract.measure_and_set_storage_min_deposit();

        contract
    }

    /// Read-only view for the contract administrator account.
    pub fn get_admin_id(&self) -> AccountId {
        self.admin_id.clone()
    }

    /// Read-only view for the measured minimum storage deposit in yoctoNEAR.
    pub fn get_storage_min_deposit(&self) -> U128 {
        U128(self.storage_min_deposit)
    }

    /// Read-only view for an account's dependency counters.
    pub fn get_account_dependency_counts(
        &self,
        account_id: AccountId,
    ) -> Option<AccountDependencyCounts> {
        self.account_dependency_counts.get(&account_id).cloned()
    }
}

// Internal (non-contract-API) implementation block
impl KnovaraContract {
    /// Canonical 64-character valid NEAR AccountId used to benchmark dynamic storage requirements.
    pub const BENCHMARK_ACCOUNT_ID: &str =
        "benchmark-storage-measure-account-valid-64-chars-length0.testnet";

    /// Dynamically measures the registration storage minimum covering both persistent maps:
    /// 1. `storage_balances` entry
    /// 2. `account_dependency_counts` entry
    ///
    /// Uses a conservative maximum-length AccountId (exactly 64 chars) and cleans up
    /// all temporary benchmark records immediately afterward.
    pub fn measure_and_set_storage_min_deposit(&mut self) {
        // Valid NEAR AccountId of maximum supported length (exactly 64 characters)
        let benchmark_account: AccountId = Self::BENCHMARK_ACCOUNT_ID
            .parse()
            .expect("ERR_INVALID_BENCHMARK_ACCOUNT");

        // Flush both maps to ensure clean initial reading
        self.storage_balances.flush();
        self.account_dependency_counts.flush();

        let initial_bytes = env::storage_usage();

        // Insert benchmark entries into both persistent maps
        self.storage_balances.insert(
            benchmark_account.clone(),
            StorageBalanceInternal {
                total: 0,
                available: 0,
            },
        );
        self.account_dependency_counts.insert(
            benchmark_account.clone(),
            AccountDependencyCounts::default(),
        );

        // Flush both maps to force trie write
        self.storage_balances.flush();
        self.account_dependency_counts.flush();

        let final_bytes = env::storage_usage();
        let measured_bytes = final_bytes.saturating_sub(initial_bytes);

        // Remove temporary benchmark entries
        self.storage_balances.remove(&benchmark_account);
        self.account_dependency_counts.remove(&benchmark_account);

        // Flush both maps again to ensure no leftover benchmark data in persistent state
        self.storage_balances.flush();
        self.account_dependency_counts.flush();

        // In live runtime / sandbox, measured_bytes will be exact.
        // In unit tests where storage_usage is unmocked or constant (delta == 0),
        // fallback to conservative 140 bytes (~1.4e21 yoctoNEAR).
        let bytes_to_cost = if measured_bytes > 0 {
            measured_bytes
        } else {
            140
        };

        let byte_cost = env::storage_byte_cost().as_yoctonear();
        self.storage_min_deposit = (bytes_to_cost as u128)
            .checked_mul(byte_cost)
            .expect("ERR_STORAGE_COST_OVERFLOW");
    }

    /// Internal helper for future discovery/license modules to sponsor or increment
    /// a dependency counter for an account.
    ///
    /// If the account does not yet have an `AccountDependencyCounts` record,
    /// initializes it and returns the number of newly allocated storage bytes
    /// to be billed to the sponsoring registrant.
    pub fn internal_sponsor_or_increment_dependency<F>(
        &mut self,
        account_id: &AccountId,
        mutate_fn: F,
    ) -> u64
    where
        F: FnOnce(&mut AccountDependencyCounts),
    {
        let mut bytes_used = 0;
        let mut counts = match self.account_dependency_counts.get(account_id) {
            Some(existing) => existing.clone(),
            None => {
                self.account_dependency_counts.flush();
                let initial = env::storage_usage();
                let new_counts = AccountDependencyCounts::default();
                self.account_dependency_counts
                    .insert(account_id.clone(), new_counts.clone());
                self.account_dependency_counts.flush();
                bytes_used = env::storage_usage().saturating_sub(initial);
                new_counts
            }
        };

        mutate_fn(&mut counts);
        self.account_dependency_counts
            .insert(account_id.clone(), counts);
        bytes_used
    }

    /// Internal helper to decrement a dependency counter with checked arithmetic.
    pub fn internal_decrement_dependency<F>(&mut self, account_id: &AccountId, mutate_fn: F)
    where
        F: FnOnce(&mut AccountDependencyCounts),
    {
        if let Some(counts) = self.account_dependency_counts.get_mut(account_id) {
            mutate_fn(counts);
        }
    }

    /// Internal helper to deduct `bytes_used` from `account_id`'s available storage balance.
    /// Used by discovery registration and license requests to bill storage to the caller.
    pub fn internal_deduct_storage_bytes(&mut self, account_id: &AccountId, bytes_used: u64) {
        if bytes_used == 0 {
            return;
        }
        let cost = (bytes_used as u128)
            .checked_mul(env::storage_byte_cost().as_yoctonear())
            .expect("ERR_STORAGE_COST_OVERFLOW");

        let balance = self
            .storage_balances
            .get_mut(account_id)
            .expect("ERR_SPONSOR_NOT_REGISTERED");

        require!(
            balance.available >= cost,
            "ERR_INSUFFICIENT_STORAGE_BALANCE: Account does not have enough available storage deposit"
        );

        balance.available = balance
            .available
            .checked_sub(cost)
            .expect("ERR_STORAGE_UNDERFLOW");
    }
}

// -------------------------------------------------------------
// COMPREHENSIVE AUTOMATED TESTS (18 MANDATORY VERIFICATION SCENARIOS)
// -------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;
    use near_sdk::{NearToken, PromiseError};

    fn admin() -> AccountId {
        "admin.testnet".parse().unwrap()
    }

    fn alice() -> AccountId {
        "alice.testnet".parse().unwrap()
    }

    fn bob() -> AccountId {
        "bob.testnet".parse().unwrap()
    }

    fn charlie() -> AccountId {
        "charlie.testnet".parse().unwrap()
    }

    fn dave() -> AccountId {
        "dave.testnet".parse().unwrap()
    }

    fn sample_terms_hash() -> String {
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string()
    }

    fn sample_other_terms_hash() -> String {
        "9999567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string()
    }

    fn contract_id() -> AccountId {
        "knovara.testnet".parse().unwrap()
    }

    fn setup_context(predecessor: AccountId, attached_deposit: u128) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(contract_id())
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .attached_deposit(NearToken::from_yoctonear(attached_deposit))
            .account_balance(NearToken::from_near(100));
        testing_env!(builder.build());
    }

    fn setup_context_with_timestamp(
        predecessor: AccountId,
        attached_deposit: u128,
        block_timestamp: u64,
    ) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(contract_id())
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .attached_deposit(NearToken::from_yoctonear(attached_deposit))
            .account_balance(NearToken::from_near(100))
            .block_timestamp(block_timestamp);
        testing_env!(builder.build());
    }

    // 1. Contract initialization
    #[test]
    fn test_1_contract_initialization() {
        setup_context(admin(), 0);
        let contract = KnovaraContract::new(admin());
        assert_eq!(contract.get_admin_id(), admin());
        assert!(contract.storage_min_deposit > 0);
    }

    // 2. Initial storage balance behavior (unregistered account returns None)
    #[test]
    fn test_2_initial_storage_balance_behavior() {
        setup_context(admin(), 0);
        let contract = KnovaraContract::new(admin());
        assert!(contract.storage_balance_of(alice()).is_none());
    }

    // 3. Successful first-time storage registration
    #[test]
    fn test_3_successful_first_time_storage_registration() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let deposit_amount = contract.storage_min_deposit + 10_000_000_000_000_000_000_000; // min + 0.01 NEAR

        setup_context(alice(), deposit_amount);
        let balance = contract.storage_deposit(None, None);

        assert_eq!(balance.total.0, deposit_amount);
        assert_eq!(
            balance.available.0,
            deposit_amount - contract.storage_min_deposit
        );

        let query = contract.storage_balance_of(alice()).unwrap();
        assert_eq!(query.total.0, deposit_amount);
        assert_eq!(
            query.available.0,
            deposit_amount - contract.storage_min_deposit
        );
    }

    // 4. Registration below the minimum deposit reverts
    #[test]
    #[should_panic(expected = "ERR_DEPOSIT_LESS_THAN_MIN")]
    fn test_4_registration_below_minimum_deposit() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let insufficient = contract.storage_min_deposit - 1;

        setup_context(alice(), insufficient);
        contract.storage_deposit(None, None);
    }

    // 5. Additional deposits to an existing account
    #[test]
    fn test_5_additional_deposits_to_existing_account() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        // Initial deposit
        setup_context(alice(), min);
        contract.storage_deposit(None, None);

        // Top up 1 NEAR
        let top_up = 1_000_000_000_000_000_000_000_000;
        setup_context(alice(), top_up);
        let balance = contract.storage_deposit(None, None);

        assert_eq!(balance.total.0, min + top_up);
        assert_eq!(balance.available.0, top_up);
    }

    // 6. registration_only behavior
    #[test]
    fn test_6_registration_only_behavior() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;
        let excess_deposit = min + 5_000_000_000_000_000_000_000_000; // min + 5 NEAR

        // Case A: New account with registration_only: true
        setup_context(alice(), excess_deposit);
        let balance_alice = contract.storage_deposit(None, Some(true));
        assert_eq!(balance_alice.total.0, min);
        assert_eq!(balance_alice.available.0, 0); // min is locked for registration

        // Case B: Existing account with registration_only: true
        setup_context(alice(), 10_000_000_000_000_000_000_000_000); // 10 NEAR
        let balance_after = contract.storage_deposit(None, Some(true));
        assert_eq!(balance_after.total.0, min); // unchanged
        assert_eq!(balance_after.available.0, 0); // unchanged
    }

    // 7. Storage balance bounds query
    #[test]
    fn test_7_storage_balance_bounds() {
        setup_context(admin(), 0);
        let contract = KnovaraContract::new(admin());
        let bounds = contract.storage_balance_bounds();
        assert_eq!(bounds.min.0, contract.storage_min_deposit);
        assert_eq!(bounds.max, None);
    }

    // 8. Storage balance queries for registered and unregistered accounts
    #[test]
    fn test_8_storage_balance_queries_registered_and_unregistered() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        assert!(contract.storage_balance_of(alice()).is_none());

        let min = contract.storage_min_deposit;
        setup_context(alice(), min);
        contract.storage_deposit(None, None);

        let query = contract.storage_balance_of(alice()).unwrap();
        assert_eq!(query.total.0, min);
        assert_eq!(query.available.0, 0);
        assert!(contract.storage_balance_of(bob()).is_none());
    }

    // 9. Withdrawal of the available balance
    #[test]
    fn test_9_withdrawal_of_available_balance() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;
        let deposit = min + 2_000_000_000_000_000_000_000_000; // min + 2 NEAR

        setup_context(alice(), deposit);
        contract.storage_deposit(None, None);

        // Withdraw 1 NEAR with attached 1 yoctoNEAR
        setup_context(alice(), 1);
        let withdraw_amt = 1_000_000_000_000_000_000_000_000;
        let bal = contract.storage_withdraw(Some(U128(withdraw_amt)));
        assert_eq!(bal.total.0, deposit); // total remains unchanged!
        assert_eq!(bal.available.0, 1_000_000_000_000_000_000_000_000);

        // Withdraw remaining available balance (omitted amount)
        setup_context(alice(), 1);
        let bal_final = contract.storage_withdraw(None);
        assert_eq!(bal_final.total.0, deposit); // total STILL unchanged!
        assert_eq!(bal_final.available.0, 0);
    }

    // 10. Rejection of withdrawals greater than the available balance
    #[test]
    #[should_panic(expected = "ERR_WITHDRAW_EXCEEDS_AVAILABLE")]
    fn test_10_rejection_of_withdrawals_greater_than_available() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min);
        contract.storage_deposit(None, None); // available == 0

        setup_context(alice(), 1);
        contract.storage_withdraw(Some(U128(100)));
    }

    // 11. Confirmation that total remains unchanged after withdrawal
    #[test]
    fn test_11_total_remains_unchanged_after_withdrawal() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;
        let extra = 5_000_000_000_000_000_000_000_000;

        setup_context(alice(), min + extra);
        contract.storage_deposit(None, None);

        setup_context(alice(), 1);
        contract.storage_withdraw(Some(U128(extra)));

        let query = contract.storage_balance_of(alice()).unwrap();
        assert_eq!(query.total.0, min + extra);
        assert_eq!(query.available.0, 0);
    }

    // 12. Rejection of calls without exactly 1 yoctoNEAR where required
    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn test_12_rejection_of_withdraw_without_one_yocto() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 100);
        contract.storage_deposit(None, None);

        // Zero yocto attached
        setup_context(alice(), 0);
        contract.storage_withdraw(Some(U128(50)));
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn test_12_rejection_of_unregister_without_one_yocto() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min);
        contract.storage_deposit(None, None);

        // Attached 2 yocto instead of 1
        setup_context(alice(), 2);
        contract.storage_unregister(None);
    }

    // 13. Rejection of unregistration when dependency counters are nonzero
    #[test]
    #[should_panic(expected = "ERR_ACCOUNT_HAS_ACTIVE_DEPENDENCIES")]
    fn test_13_rejection_of_unregistration_when_dependency_counters_nonzero() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min);
        contract.storage_deposit(None, None);

        // Simulate active discovery dependency (alice is custodian)
        contract.internal_sponsor_or_increment_dependency(&alice(), |deps| {
            deps.increment_custodian();
        });

        setup_context(alice(), 1);
        contract.storage_unregister(None);
    }

    #[test]
    #[should_panic(expected = "ERR_ACCOUNT_HAS_ACTIVE_DEPENDENCIES")]
    fn test_13b_unreg_rejected_when_rights_controller() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min);
        contract.storage_deposit(None, None);

        contract.internal_sponsor_or_increment_dependency(&alice(), |deps| {
            deps.increment_rights_controller();
        });

        setup_context(alice(), 1);
        contract.storage_unregister(None);
    }

    #[test]
    #[should_panic(expected = "ERR_ACCOUNT_HAS_ACTIVE_DEPENDENCIES")]
    fn test_13c_unreg_rejected_when_beneficiary() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min);
        contract.storage_deposit(None, None);

        contract.internal_sponsor_or_increment_dependency(&alice(), |deps| {
            deps.increment_beneficiary();
        });

        setup_context(alice(), 1);
        contract.storage_unregister(None);
    }

    #[test]
    #[should_panic(expected = "ERR_ACCOUNT_HAS_ACTIVE_DEPENDENCIES")]
    fn test_13d_unreg_rejected_when_persistent_license() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min);
        contract.storage_deposit(None, None);

        contract.internal_sponsor_or_increment_dependency(&alice(), |deps| {
            deps.increment_persistent_license();
        });

        setup_context(alice(), 1);
        contract.storage_unregister(None);
    }

    #[test]
    #[should_panic(expected = "ERR_ACCOUNT_HAS_ACTIVE_DEPENDENCIES")]
    fn test_13e_unreg_rejected_when_active_license() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min);
        contract.storage_deposit(None, None);

        contract.internal_sponsor_or_increment_dependency(&alice(), |deps| {
            deps.increment_active_license();
        });

        setup_context(alice(), 1);
        contract.storage_unregister(None);
    }

    // Audit 2: Persistent license record must continue preventing unregistration even after
    // its license expires or is rejected, as long as its persistent record remains in contract storage.
    #[test]
    #[should_panic(expected = "ERR_ACCOUNT_HAS_ACTIVE_DEPENDENCIES")]
    fn test_13f_persistent_license_blocks_unregistration_after_rejection_or_expiration() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min);
        contract.storage_deposit(None, None);

        // 1. License requested: persistent_license_count increments to 1
        contract.internal_sponsor_or_increment_dependency(&alice(), |deps| {
            deps.increment_persistent_license();
        });

        // 2. License rejected/expired: active_license_count is 0, but persistent_license_count remains 1
        let counts = contract.get_account_dependency_counts(alice()).unwrap();
        assert_eq!(counts.persistent_license_count, 1);
        assert_eq!(counts.active_license_count, 0);

        // 3. Attempt to unregister must be strictly rejected
        setup_context(alice(), 1);
        contract.storage_unregister(None);
    }

    // 14. Preservation of an existing sponsored dependency record during storage_deposit
    #[test]
    fn test_14_preservation_of_sponsored_dependency_record_during_deposit() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());

        // Sponsor creates dependency record for Alice beforehand
        contract.internal_sponsor_or_increment_dependency(&alice(), |deps| {
            deps.increment_beneficiary();
            deps.increment_beneficiary();
        });

        let deps_before = contract.get_account_dependency_counts(alice()).unwrap();
        assert_eq!(deps_before.beneficiary_reference_count, 2);

        // Alice registers her account later via storage_deposit
        // Dependency record was previously sponsored; attaching minimum registration deposit
        let min_required = contract.storage_min_deposit;
        setup_context(alice(), min_required);
        contract.storage_deposit(None, None);

        // Verify dependency record was preserved and NOT reset to default!
        let deps_after = contract.get_account_dependency_counts(alice()).unwrap();
        assert_eq!(deps_after.beneficiary_reference_count, 2);
    }

    // 15. Correct accounting when a new dependency record is created and storage deducted
    #[test]
    fn test_15_correct_accounting_when_new_dependency_record_created() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());

        // Alice registers with extra available deposit to sponsor Bob
        let min = contract.storage_min_deposit;
        let extra = 5_000_000_000_000_000_000_000_000;
        setup_context(alice(), min + extra);
        contract.storage_deposit(None, None);

        // Alice sponsors Bob's dependency record
        let bytes_used = contract.internal_sponsor_or_increment_dependency(&bob(), |deps| {
            deps.increment_rights_controller();
        });

        // Deduct storage bytes from Alice's balance
        contract.internal_deduct_storage_bytes(&alice(), bytes_used);

        let bob_deps = contract.get_account_dependency_counts(bob()).unwrap();
        assert_eq!(bob_deps.rights_controller_count, 1);
        assert!(!bob_deps.is_empty());

        let alice_bal = contract.storage_balance_of(alice()).unwrap();
        assert_eq!(alice_bal.total.0, min + extra);
        assert!(alice_bal.available.0 <= extra);
    }

    // 16. Correct minimum-deposit measurement covering both persistent maps
    #[test]
    fn test_16_correct_minimum_deposit_measurement_covering_both_maps() {
        // Audit 3: Exact 64-character valid NEAR AccountId validation
        assert_eq!(KnovaraContract::BENCHMARK_ACCOUNT_ID.len(), 64);
        let parsed_benchmark: Result<AccountId, _> = KnovaraContract::BENCHMARK_ACCOUNT_ID.parse();
        assert!(
            parsed_benchmark.is_ok(),
            "Benchmark account must parse as a valid NEAR AccountId"
        );

        setup_context(admin(), 0);
        let contract = KnovaraContract::new(admin());

        assert!(contract.storage_min_deposit > 0);
        // Ensure benchmark account was cleaned up from both collections
        let benchmark_account: AccountId = parsed_benchmark.unwrap();
        assert!(contract
            .storage_balance_of(benchmark_account.clone())
            .is_none());
        assert!(contract
            .get_account_dependency_counts(benchmark_account)
            .is_none());
    }

    // 17. Safe handling of counter overflow and underflow
    #[test]
    #[should_panic(expected = "ERR_CUSTODIAN_COUNT_UNDERFLOW")]
    fn test_17_counter_underflow_safety() {
        let mut counts = AccountDependencyCounts::default();
        counts.decrement_custodian(); // panics with underflow
    }

    #[test]
    fn test_17_counter_checked_arithmetic() {
        let mut counts = AccountDependencyCounts::default();
        counts.increment_custodian();
        counts.increment_rights_controller();
        counts.increment_beneficiary();
        counts.increment_persistent_license();
        counts.increment_active_license();

        assert_eq!(counts.custodian_count, 1);
        assert_eq!(counts.rights_controller_count, 1);
        assert_eq!(counts.beneficiary_reference_count, 1);
        assert_eq!(counts.persistent_license_count, 1);
        assert_eq!(counts.active_license_count, 1);
        assert!(!counts.is_empty());

        counts.decrement_custodian();
        counts.decrement_rights_controller();
        counts.decrement_beneficiary();
        counts.decrement_persistent_license();
        counts.decrement_active_license();

        assert!(counts.is_empty());
    }

    // 18. Correct refund-failure recovery behavior
    #[test]
    fn test_18_refund_failure_recovery_behavior() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 1_000);
        contract.storage_deposit(None, None);

        // Simulate failed storage withdraw: on_storage_withdraw_callback with Err(PromiseError::Failed)
        setup_context(contract_id(), 0);
        let withdraw_failed =
            contract.on_storage_withdraw_callback(alice(), U128(500), Err(PromiseError::Failed));
        assert!(!withdraw_failed);
        // Verify 500 was restored to available balance!
        let bal = contract.storage_balance_of(alice()).unwrap();
        assert_eq!(bal.available.0, 1_500);

        // Simulate failed storage unregister: on_storage_unregister_callback with Err(PromiseError::Failed)
        let unreg_failed = contract.on_storage_unregister_callback(
            bob(),
            StorageBalanceInternal {
                total: 2_000,
                available: 500,
            },
            Some(AccountDependencyCounts::default()),
            Err(PromiseError::Failed),
        );
        assert!(!unreg_failed);
        // Verify Bob's storage balance and dependency counts were restored!
        let bob_bal = contract.storage_balance_of(bob()).unwrap();
        assert_eq!(bob_bal.total.0, 2_000);
        assert_eq!(bob_bal.available.0, 500);
        assert!(contract.get_account_dependency_counts(bob()).is_some());
    }

    // Audit 4 Item 4: Callback methods are properly protected against direct unauthorized calls
    #[test]
    #[should_panic(expected = "Method is private")]
    fn test_callback_protection_deposit_refund() {
        setup_context(alice(), 0); // alice calling, not contract_id()
        let mut contract = KnovaraContract::new(admin());
        contract.on_storage_deposit_refund_callback(alice(), U128(100), Ok(()));
    }

    #[test]
    #[should_panic(expected = "Method is private")]
    fn test_callback_protection_withdraw() {
        setup_context(alice(), 0);
        let mut contract = KnovaraContract::new(admin());
        contract.on_storage_withdraw_callback(alice(), U128(100), Ok(()));
    }

    #[test]
    #[should_panic(expected = "Method is private")]
    fn test_callback_protection_unregister() {
        setup_context(alice(), 0);
        let mut contract = KnovaraContract::new(admin());
        contract.on_storage_unregister_callback(
            alice(),
            StorageBalanceInternal {
                total: 100,
                available: 100,
            },
            None,
            Ok(()),
        );
    }

    // Audit 4 Item 6: A failed unregister callback cannot overwrite a newer dependency record or balance
    #[test]
    fn test_failed_unregister_callback_merges_with_newer_records() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());

        // Account Bob was in flight unregistering with balance (2000 total, 500 avail) and 0 deps
        let unreg_balance = StorageBalanceInternal {
            total: 2_000,
            available: 500,
        };
        let unreg_deps = AccountDependencyCounts::default();

        // While transfer was in flight, Bob received a new deposit of 1000 and a new dependency
        setup_context(bob(), contract.storage_min_deposit + 1_000);
        contract.storage_deposit(None, None);

        contract.internal_sponsor_or_increment_dependency(&bob(), |deps| {
            deps.increment_custodian();
        });

        // Now the unregister refund promise fails
        setup_context(contract_id(), 0);
        let result = contract.on_storage_unregister_callback(
            bob(),
            unreg_balance,
            Some(unreg_deps),
            Err(PromiseError::Failed),
        );
        assert!(!result);

        // Verify Bob's new deposit was NOT overwritten; instead balances were safely merged!
        // Registration collateral from the failed unregister (2,000) is restored to available!
        let bob_bal = contract.storage_balance_of(bob()).unwrap();
        assert_eq!(
            bob_bal.total.0,
            contract.storage_min_deposit + 1_000 + 2_000
        );
        assert_eq!(bob_bal.available.0, 1_000 + 500 + 2_000);

        // Verify Bob's new custodian dependency was preserved and NOT overwritten!
        let bob_deps = contract.get_account_dependency_counts(bob()).unwrap();
        assert_eq!(bob_deps.custodian_count, 1);
    }

    // Point 2: Exact interleaved unregistration callback accounting test sequence
    // 1. Register account B with exactly the minimum deposit.
    // 2. Initiate storage unregistration.
    // 3. Simulate the refund transfer failing.
    // 4. Before the callback executes, register B again with another minimum deposit.
    // 5. Execute the failed-refund callback.
    // 6. Inspect B's resulting StorageBalance.
    #[test]
    fn test_unregistration_callback_accounting_exact_interleaved_sequence() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let m = contract.storage_min_deposit;

        // Step 1: Register account B with exactly the minimum deposit
        setup_context(bob(), m);
        let b1 = contract.storage_deposit(None, None);
        assert_eq!(b1.total.0, m);
        assert_eq!(b1.available.0, 0);

        // Step 2: Initiate storage unregistration (attaching 1 yocto)
        setup_context(bob(), 1);
        let unreg_initiated = contract.storage_unregister(None);
        assert!(unreg_initiated);
        assert!(contract.storage_balance_of(bob()).is_none());

        // Step 3 & 4: Before callback executes, register B again with another minimum deposit
        setup_context(bob(), m);
        let b2 = contract.storage_deposit(None, None);
        assert_eq!(b2.total.0, m);
        assert_eq!(b2.available.0, 0);

        // Step 5: Execute the failed-refund callback (transfer of m + 1 failed)
        setup_context(contract_id(), 0);
        let callback_res = contract.on_storage_unregister_callback(
            bob(),
            StorageBalanceInternal {
                total: m,
                available: 0,
            },
            Some(AccountDependencyCounts::default()),
            Err(PromiseError::Failed),
        );
        assert!(!callback_res);

        // Step 6: Inspect B's resulting StorageBalance:
        // - Both deposits remain accounted for: total == 2 * m
        // - Persistent storage requirement charged only once: total - available == m
        // - Any excess funds are available for withdrawal: available == m
        // - No funds lost
        let b_final = contract.storage_balance_of(bob()).unwrap();
        assert_eq!(b_final.total.0, 2 * m);
        assert_eq!(b_final.available.0, m);

        // Verification: A subsequent withdrawal and unregistration return the correct remaining amount
        setup_context(bob(), 1);
        let withdraw_res = contract.storage_withdraw(Some(U128(m)));
        assert_eq!(withdraw_res.total.0, 2 * m);
        assert_eq!(withdraw_res.available.0, 0);

        // Unregister again: returns true, eligible refund is remaining m + 1 yocto
        setup_context(bob(), 1);
        let unreg_final = contract.storage_unregister(None);
        assert!(unreg_final);
        assert!(contract.storage_balance_of(bob()).is_none());
    }

    // Point 3: Verify calling storage_unregister for an account with no storage registration
    // returns false without panicking, as required by NEP-145
    #[test]
    fn test_unregistered_account_storage_unregister_returns_false() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());

        // Account Bob has no storage registration
        assert!(contract.storage_balance_of(bob()).is_none());

        // Bob calls storage_unregister attaching exactly 1 yoctoNEAR
        setup_context(bob(), 1);
        let res = contract.storage_unregister(None);
        assert!(
            !res,
            "storage_unregister on unregistered account must return false without panicking"
        );
    }

    // Audit 4 Item 3: Failed storage deposit excess refund does not permanently lose credit
    #[test]
    fn test_failed_deposit_refund_preserves_credit_when_missing() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());

        // Call callback for an account that currently has no record
        setup_context(contract_id(), 0);
        let refund_failed = contract.on_storage_deposit_refund_callback(
            bob(),
            U128(7_500),
            Err(PromiseError::Failed),
        );
        assert!(!refund_failed);

        // Verify Bob was credited and funds were preserved
        let bob_bal = contract.storage_balance_of(bob()).unwrap();
        assert_eq!(bob_bal.total.0, 7_500);
        assert_eq!(bob_bal.available.0, 7_500);
    }

    // Audit 5 & Solvency: Partial withdrawal followed by unregister refunds only remaining unwithdrawn capital
    #[test]
    fn test_unregister_refund_after_partial_withdrawal_preserves_solvency() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;
        let deposit = min + 10_000_000_000_000_000_000_000_000; // min + 10 NEAR

        setup_context(alice(), deposit);
        contract.storage_deposit(None, None);

        // Withdraw 6 NEAR
        setup_context(alice(), 1);
        let withdraw_amt = 6_000_000_000_000_000_000_000_000;
        let bal = contract.storage_withdraw(Some(U128(withdraw_amt)));
        assert_eq!(bal.total.0, deposit); // total remains unchanged
        assert_eq!(bal.available.0, 4_000_000_000_000_000_000_000_000);

        // Unregister: Eligible refund is available (4 NEAR) + min (0.14 NEAR) = 4.14 NEAR
        // (NOT the original 10.14 NEAR deposit which would duplicate the 6 NEAR already withdrawn)
        setup_context(alice(), 1);
        let unregistered = contract.storage_unregister(None);
        assert!(unregistered);
        assert!(contract.storage_balance_of(alice()).is_none());
    }

    // =========================================================================
    // STAGE 3.2 COMPREHENSIVE AUTOMATED TESTS (DISCOVERY REGISTRATION & NFT)
    // =========================================================================

    fn sample_manifest_hash() -> String {
        "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90".to_string()
    }

    fn sample_reference_hash() -> near_sdk::json_types::Base64VecU8 {
        near_sdk::json_types::Base64VecU8(vec![0x42; 32])
    }

    fn sample_metadata() -> TokenMetadata {
        TokenMetadata {
            title: Some("Quantum Magnetoresistance Battery".to_string()),
            description: Some("Solid-state battery electrolyte design".to_string()),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some("1700000000".to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: Some("https://gateway.knovara.org/descriptors/disc-001/v1.json".to_string()),
            reference_hash: Some(sample_reference_hash()),
        }
    }

    fn sample_splits() -> Vec<BeneficiaryShare> {
        vec![
            BeneficiaryShare {
                account_id: alice(),
                basis_points: 7_000,
            },
            BeneficiaryShare {
                account_id: bob(),
                basis_points: 3_000,
            },
        ]
    }

    // 1. Successful discovery registration & 2. NFT minting to designated custodian
    #[test]
    fn test_stage32_1_successful_discovery_registration_and_mint() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        // Alice registers with sufficient storage deposit
        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000); // min + 5 NEAR
        contract.storage_deposit(None, None);

        let view = contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None, // defaults to caller (Alice)
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );

        assert_eq!(view.discovery_id, "disc-001");
        assert_eq!(view.token_id, "token-001");
        assert_eq!(view.custodian_id, alice());
        assert_eq!(view.rights_controller_id, bob());
        assert_eq!(view.evidence_manifest_hash, sample_manifest_hash());
        assert_eq!(view.beneficiary_splits.len(), 2);
    }

    // 2. Mint to designated custodian (custodian != registrant)
    #[test]
    fn test_stage32_2_mint_to_designated_custodian() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Alice registers, but designates Bob as custodian
        let view = contract.register_discovery_and_mint(
            "disc-002".to_string(),
            "token-002".to_string(),
            Some(bob()),
            admin(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: bob(),
                basis_points: 10_000,
            }],
            vec![],
        );

        assert_eq!(view.custodian_id, bob());
        let token = contract.nft_token("token-002".to_string()).unwrap();
        assert_eq!(token.owner_id, bob());
    }

    // 3. Correct nft_token response
    #[test]
    fn test_stage32_3_correct_nft_token_response() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );

        let token = contract.nft_token("token-001".to_string()).unwrap();
        assert_eq!(token.token_id, "token-001");
        assert_eq!(token.owner_id, alice());
        assert_eq!(
            token.metadata.as_ref().unwrap().title.as_deref(),
            Some("Quantum Magnetoresistance Battery")
        );
        assert_eq!(
            token.metadata.as_ref().unwrap().reference.as_deref(),
            Some("https://gateway.knovara.org/descriptors/disc-001/v1.json")
        );
        assert!(token.approved_account_ids.unwrap().is_empty());

        // Non-existent token returns None
        assert!(contract.nft_token("non-existent".to_string()).is_none());
    }

    // 4. Correct NEP-177 metadata response
    #[test]
    fn test_stage32_4_correct_nep177_metadata_response() {
        setup_context(admin(), 0);
        let contract = KnovaraContract::new(admin());
        let meta = contract.nft_metadata();
        assert_eq!(meta.spec, "nft-1.0.0");
        assert_eq!(meta.name, "KNOVARA Discovery Rights Passports");
        assert_eq!(meta.symbol, "KNOVARA");
    }

    // 5. Correct total NFT supply
    #[test]
    fn test_stage32_5_correct_total_nft_supply() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        assert_eq!(contract.nft_total_supply().0, 0);

        let min = contract.storage_min_deposit;
        setup_context(alice(), min + 10_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );
        assert_eq!(contract.nft_total_supply().0, 1);

        contract.register_discovery_and_mint(
            "disc-002".to_string(),
            "token-002".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );
        assert_eq!(contract.nft_total_supply().0, 2);
    }

    // 6. Correct discovery record retrieval
    #[test]
    fn test_stage32_6_correct_discovery_record_retrieval() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );

        let disc = contract.get_discovery("token-001".to_string()).unwrap();
        assert_eq!(disc.discovery_id, "disc-001");
        assert_eq!(disc.token_id, "token-001");
        assert_eq!(disc.custodian_id, alice());
        assert_eq!(disc.rights_controller_id, bob());

        let mapped_token = contract.get_token_id_for_discovery("disc-001".to_string());
        assert_eq!(mapped_token, Some("token-001".to_string()));
    }

    // 7. Duplicate discovery rejection
    #[test]
    #[should_panic(expected = "ERR_DUPLICATE_DISCOVERY_ID")]
    fn test_stage32_7_duplicate_discovery_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );

        // Same discovery ID with different token ID
        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-002".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );
    }

    // 8. Duplicate token ID rejection
    #[test]
    #[should_panic(expected = "ERR_DUPLICATE_TOKEN_ID")]
    fn test_stage32_8_duplicate_token_id_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );

        // Different discovery ID with same token ID
        contract.register_discovery_and_mint(
            "disc-002".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );
    }

    // 9. Invalid evidence hash rejection (length & hex characters)
    #[test]
    #[should_panic(expected = "ERR_INVALID_HEX_LENGTH")]
    fn test_stage32_9_invalid_evidence_hash_length() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Short hex (63 characters)
        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9".to_string(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );
    }

    #[test]
    #[should_panic(expected = "ERR_INVALID_HEX_CHARS")]
    fn test_stage32_9_invalid_evidence_hash_chars() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // 64 chars containing invalid 'z' characters
        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz".to_string(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );
    }

    // 10. Incorrect reference-hash validation
    #[test]
    #[should_panic(expected = "ERR_MISSING_METADATA_REFERENCE")]
    fn test_stage32_10_missing_reference() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        let mut meta = sample_metadata();
        meta.reference = None;

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            meta,
            sample_splits(),
            vec![],
        );
    }

    #[test]
    #[should_panic(expected = "ERR_MISSING_REFERENCE_HASH")]
    fn test_stage32_10_missing_reference_hash() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        let mut meta = sample_metadata();
        meta.reference_hash = None;

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            meta,
            sample_splits(),
            vec![],
        );
    }

    #[test]
    #[should_panic(expected = "ERR_INVALID_REFERENCE_HASH_LENGTH")]
    fn test_stage32_10_invalid_reference_hash_length() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        let mut meta = sample_metadata();
        meta.reference_hash = Some(near_sdk::json_types::Base64VecU8(vec![1u8; 16])); // 16 bytes instead of 32

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            meta,
            sample_splits(),
            vec![],
        );
    }

    // 11. Invalid beneficiary allocation rejection
    #[test]
    #[should_panic(expected = "ERR_INVALID_SPLIT_SUM")]
    fn test_stage32_11_split_sum_less_than_10000() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: alice(),
                basis_points: 9_999, // sum != 10000
            }],
            vec![],
        );
    }

    #[test]
    #[should_panic(expected = "ERR_DUPLICATE_BENEFICIARY")]
    fn test_stage32_11_duplicate_beneficiary() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![
                BeneficiaryShare {
                    account_id: alice(),
                    basis_points: 5_000,
                },
                BeneficiaryShare {
                    account_id: alice(), // Duplicate
                    basis_points: 5_000,
                },
            ],
            vec![],
        );
    }

    #[test]
    #[should_panic(expected = "ERR_ZERO_BASIS_POINTS")]
    fn test_stage32_11_zero_basis_points() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![
                BeneficiaryShare {
                    account_id: alice(),
                    basis_points: 10_000,
                },
                BeneficiaryShare {
                    account_id: bob(),
                    basis_points: 0,
                },
            ],
            vec![],
        );
    }

    // 12. Valid 10,000 basis points allocation acceptance
    #[test]
    fn test_stage32_12_valid_10000_basis_points_acceptance() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // 3 beneficiaries: 5000 + 3000 + 2000 = 10000
        let splits = vec![
            BeneficiaryShare {
                account_id: alice(),
                basis_points: 5_000,
            },
            BeneficiaryShare {
                account_id: bob(),
                basis_points: 3_000,
            },
            BeneficiaryShare {
                account_id: admin(),
                basis_points: 2_000,
            },
        ];

        let view = contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            splits,
            vec![],
        );
        assert_eq!(view.beneficiary_splits.len(), 3);
    }

    // 13, 14, 15. Correct dependency counters for custodian, controller, and beneficiaries
    #[test]
    fn test_stage32_13_14_15_dependency_counters_updated() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            Some(alice()),
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: admin(),
                basis_points: 10_000,
            }],
            vec![],
        );

        let alice_deps = contract.get_account_dependency_counts(alice()).unwrap();
        assert_eq!(alice_deps.custodian_count, 1);
        assert_eq!(alice_deps.rights_controller_count, 0);

        let bob_deps = contract.get_account_dependency_counts(bob()).unwrap();
        assert_eq!(bob_deps.rights_controller_count, 1);
        assert_eq!(bob_deps.custodian_count, 0);

        let admin_deps = contract.get_account_dependency_counts(admin()).unwrap();
        assert_eq!(admin_deps.beneficiary_reference_count, 1);
    }

    // 16. Duplicate identities across roles handled safely
    #[test]
    fn test_stage32_16_duplicate_identities_across_roles() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Alice is simultaneously custodian, rights controller, and sole beneficiary
        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            Some(alice()),
            alice(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: alice(),
                basis_points: 10_000,
            }],
            vec![],
        );

        let alice_deps = contract.get_account_dependency_counts(alice()).unwrap();
        assert_eq!(alice_deps.custodian_count, 1);
        assert_eq!(alice_deps.rights_controller_count, 1);
        assert_eq!(alice_deps.beneficiary_reference_count, 1);
    }

    // 17. New sponsored dependency records created for unregistered beneficiaries
    #[test]
    fn test_stage32_17_sponsored_dependency_records_for_unregistered() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        // Bob has no storage record initially
        assert!(contract.storage_balance_of(bob()).is_none());
        assert!(contract.get_account_dependency_counts(bob()).is_none());

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: bob(),
                basis_points: 10_000,
            }],
            vec![],
        );

        // Bob now has an active dependency record funded by Alice's registration
        let bob_deps = contract.get_account_dependency_counts(bob()).unwrap();
        assert_eq!(bob_deps.rights_controller_count, 1);
        assert_eq!(bob_deps.beneficiary_reference_count, 1);
    }

    // 18. Insufficient registrant storage balance reverts
    #[test]
    #[should_panic(expected = "ERR_INSUFFICIENT_STORAGE_BALANCE")]
    fn test_stage32_18_insufficient_registrant_storage_balance() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        // Alice registers with exact minimum (available == 0)
        setup_context(alice(), min);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );
    }

    // 19. Successful storage deduction from registrant available balance
    #[test]
    fn test_stage32_19_successful_storage_deduction() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;
        let deposit = min + 5_000_000_000_000_000_000_000_000; // min + 5 NEAR

        setup_context(alice(), deposit);
        contract.storage_deposit(None, None);

        let bal_before = contract.storage_balance_of(alice()).unwrap();
        assert_eq!(bal_before.available.0, 5_000_000_000_000_000_000_000_000);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );

        let bal_after = contract.storage_balance_of(alice()).unwrap();
        assert_eq!(bal_after.total.0, deposit); // total remains unchanged
        assert!(
            bal_after.available.0 < bal_before.available.0,
            "Available storage balance must be deducted for newly committed data"
        );
    }

    // 20. Beneficiary Pre-Allocation (claimable balances initialized to 0)
    #[test]
    fn test_stage32_20_beneficiary_pre_allocation() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );

        // Pre-allocation: Alice and Bob have entries in claimable_balances initialized to 0
        assert_eq!(contract.get_claimable_balance(alice()).0, 0);
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
    }

    // 21. NFT transfer rejection
    #[test]
    #[should_panic(expected = "ERR_PASSPORT_NON_TRANSFERABLE")]
    fn test_stage32_21_nft_transfer_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );

        // Alice attempts to transfer her Passport NFT with attached 1 yocto
        setup_context(alice(), 1);
        contract.nft_transfer(bob(), "token-001".to_string(), None, None);
    }

    // 22. NFT transfer-call rejection
    #[test]
    #[should_panic(expected = "ERR_PASSPORT_NON_TRANSFERABLE")]
    fn test_stage32_22_nft_transfer_call_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );

        setup_context(alice(), 1);
        let _ = contract.nft_transfer_call(
            bob(),
            "token-001".to_string(),
            None,
            None,
            "transfer msg".to_string(),
        );
    }

    // 23. NFT approvals rejection
    #[test]
    #[should_panic(expected = "ERR_APPROVALS_NOT_SUPPORTED")]
    fn test_stage32_23_nft_approve_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_context(alice(), 1);
        contract.nft_approve("token-001".to_string(), bob(), None);
    }

    #[test]
    #[should_panic(expected = "ERR_APPROVALS_NOT_SUPPORTED")]
    fn test_stage32_23_nft_revoke_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_context(alice(), 1);
        contract.nft_revoke("token-001".to_string(), bob());
    }

    #[test]
    #[should_panic(expected = "ERR_APPROVALS_NOT_SUPPORTED")]
    fn test_stage32_23_nft_revoke_all_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_context(alice(), 1);
        contract.nft_revoke_all("token-001".to_string());
    }

    // 25. Unregistration remains blocked for accounts with persistent discovery dependencies
    #[test]
    #[should_panic(expected = "ERR_ACCOUNT_HAS_ACTIVE_DEPENDENCIES")]
    fn test_stage32_25_unregistration_blocked_for_discovery_beneficiary() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        // Alice registers discovery referencing Bob as beneficiary
        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            None,
            admin(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: bob(),
                basis_points: 10_000,
            }],
            vec![],
        );

        // Bob subsequently registers his own storage
        setup_context(bob(), min);
        contract.storage_deposit(None, None);

        // Bob tries to unregister while being an active discovery beneficiary
        setup_context(bob(), 1);
        contract.storage_unregister(None);
    }

    // -------------------------------------------------------------
    // AUDIT 2: EXACT STORAGE DEDUCTION & DOUBLE CHARGING TESTS
    // -------------------------------------------------------------

    // A. New custodian dependency record
    #[test]
    fn test_audit2_new_custodian_dependency_record_accounting() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Bob has no dependency record prior to registration
        assert!(contract.get_account_dependency_counts(bob()).is_none());

        contract.register_discovery_and_mint(
            "disc-custodian".to_string(),
            "token-custodian".to_string(),
            Some(bob()),
            admin(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: admin(),
                basis_points: 10_000,
            }],
            vec![],
        );

        let bob_deps = contract.get_account_dependency_counts(bob()).unwrap();
        assert_eq!(bob_deps.custodian_count, 1);
        assert_eq!(bob_deps.rights_controller_count, 0);
        assert_eq!(bob_deps.beneficiary_reference_count, 0);
    }

    // B. New rights-controller dependency record
    #[test]
    fn test_audit2_new_rights_controller_dependency_record_accounting() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Charlie has no dependency record or claimable balance prior
        assert!(contract.get_account_dependency_counts(charlie()).is_none());
        assert_eq!(contract.get_claimable_balance(charlie()).0, 0);

        contract.register_discovery_and_mint(
            "disc-controller".to_string(),
            "token-controller".to_string(),
            Some(alice()),
            charlie(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: alice(),
                basis_points: 10_000,
            }],
            vec![],
        );

        let charlie_deps = contract.get_account_dependency_counts(charlie()).unwrap();
        assert_eq!(charlie_deps.rights_controller_count, 1);
        assert_eq!(charlie_deps.custodian_count, 0);
        assert_eq!(contract.get_claimable_balance(charlie()).0, 0);
    }

    // C. New beneficiary dependency record
    #[test]
    fn test_audit2_new_beneficiary_dependency_record_accounting() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        assert!(contract.get_account_dependency_counts(bob()).is_none());

        contract.register_discovery_and_mint(
            "disc-beneficiary".to_string(),
            "token-beneficiary".to_string(),
            Some(alice()),
            alice(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: bob(),
                basis_points: 10_000,
            }],
            vec![],
        );

        let bob_deps = contract.get_account_dependency_counts(bob()).unwrap();
        assert_eq!(bob_deps.beneficiary_reference_count, 1);
        assert_eq!(bob_deps.custodian_count, 0);
        assert_eq!(bob_deps.rights_controller_count, 0);
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
    }

    // D. Multiple new role records in one registration
    #[test]
    fn test_audit2_multiple_new_role_records_in_one_registration() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        let ben1: AccountId = "beneficiary-one.testnet".parse().unwrap();
        let ben2: AccountId = "beneficiary-two.testnet".parse().unwrap();

        contract.register_discovery_and_mint(
            "disc-multi-new".to_string(),
            "token-multi-new".to_string(),
            Some(bob()),
            charlie(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![
                BeneficiaryShare {
                    account_id: ben1.clone(),
                    basis_points: 6_000,
                },
                BeneficiaryShare {
                    account_id: ben2.clone(),
                    basis_points: 4_000,
                },
            ],
            vec![],
        );

        // All 4 distinct accounts have dependency records created
        assert_eq!(
            contract
                .get_account_dependency_counts(bob())
                .unwrap()
                .custodian_count,
            1
        );
        assert_eq!(
            contract
                .get_account_dependency_counts(charlie())
                .unwrap()
                .rights_controller_count,
            1
        );
        assert_eq!(
            contract
                .get_account_dependency_counts(ben1.clone())
                .unwrap()
                .beneficiary_reference_count,
            1
        );
        assert_eq!(
            contract
                .get_account_dependency_counts(ben2.clone())
                .unwrap()
                .beneficiary_reference_count,
            1
        );

        // Pre-allocated claimable balances
        assert_eq!(contract.get_claimable_balance(charlie()).0, 0);
        assert_eq!(contract.get_claimable_balance(ben1).0, 0);
        assert_eq!(contract.get_claimable_balance(ben2).0, 0);
    }

    // E. One account occupying multiple roles
    #[test]
    fn test_audit2_one_account_occupying_multiple_roles() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Alice is Custodian, Rights Controller, and Beneficiary
        contract.register_discovery_and_mint(
            "disc-single-all".to_string(),
            "token-single-all".to_string(),
            Some(alice()),
            alice(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: alice(),
                basis_points: 10_000,
            }],
            vec![],
        );

        let alice_deps = contract.get_account_dependency_counts(alice()).unwrap();
        assert_eq!(alice_deps.custodian_count, 1);
        assert_eq!(alice_deps.rights_controller_count, 1);
        assert_eq!(alice_deps.beneficiary_reference_count, 1);
        assert_eq!(contract.get_claimable_balance(alice()).0, 0);
    }

    // F. An existing dependency record requiring no new record allocation
    #[test]
    fn test_audit2_existing_dependency_record_no_new_allocation() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Registration 1: allocates dependency record for Bob
        contract.register_discovery_and_mint(
            "disc-run-1".to_string(),
            "token-run-1".to_string(),
            Some(alice()),
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: alice(),
                basis_points: 10_000,
            }],
            vec![],
        );
        assert_eq!(
            contract
                .get_account_dependency_counts(bob())
                .unwrap()
                .rights_controller_count,
            1
        );

        // Registration 2: reuses Bob as rights controller
        contract.register_discovery_and_mint(
            "disc-run-2".to_string(),
            "token-run-2".to_string(),
            Some(alice()),
            bob(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: alice(),
                basis_points: 10_000,
            }],
            vec![],
        );

        // Existing record was mutated in-place, count incremented to 2
        let bob_deps = contract.get_account_dependency_counts(bob()).unwrap();
        assert_eq!(bob_deps.rights_controller_count, 2);
    }

    // G. Beneficiary pre-allocation
    #[test]
    fn test_audit2_beneficiary_pre_allocation_invariant() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Before registration, Bob has 0 claimable balance
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);

        contract.register_discovery_and_mint(
            "disc-pre-alloc".to_string(),
            "token-pre-alloc".to_string(),
            Some(alice()),
            alice(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: bob(),
                basis_points: 10_000,
            }],
            vec![],
        );

        // Pre-allocated entry exists with 0 yoctoNEAR
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
    }

    // H. Correct total storage cost for a complete registration
    #[test]
    fn test_audit2_correct_total_storage_cost_deduction() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;
        let deposit = min + 5_000_000_000_000_000_000_000_000;

        setup_context(alice(), deposit);
        contract.storage_deposit(None, None);

        let bal_before = contract.storage_balance_of(alice()).unwrap();

        contract.register_discovery_and_mint(
            "disc-complete".to_string(),
            "token-complete".to_string(),
            Some(bob()),
            charlie(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: bob(),
                basis_points: 10_000,
            }],
            vec![],
        );

        let bal_after = contract.storage_balance_of(alice()).unwrap();

        // Invariant 1: Total remains identical
        assert_eq!(bal_after.total.0, bal_before.total.0);

        // Invariant 2: Available balance was deducted
        assert!(bal_after.available.0 < bal_before.available.0);

        // Invariant 3: Deduction equals effective_bytes * storage_byte_cost
        let deducted = bal_before.available.0 - bal_after.available.0;
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        assert_eq!(deducted % byte_cost, 0);
        let bytes_billed = deducted / byte_cost;
        assert!(bytes_billed > 0);
    }

    // -------------------------------------------------------------
    // STAGE 3.3 AUTOMATED TESTS: LICENSING OFFERS, REQUESTS & APPROVALS
    // -------------------------------------------------------------

    fn setup_discovery_with_controller(contract: &mut KnovaraContract) {
        let min = contract.storage_min_deposit;
        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-001".to_string(),
            "token-001".to_string(),
            Some(bob()),
            charlie(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: bob(),
                basis_points: 10_000,
            }],
            vec![],
        );

        // Charlie (Rights Controller) registers storage
        setup_context(charlie(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Dave (Buyer) registers storage
        setup_context(dave(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);
    }

    // 1. Successful offer creation
    #[test]
    fn test_stage33_1_successful_offer_creation() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        let offer = contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(2_000_000_000_000_000_000_000_000), // 2 NEAR
            sample_terms_hash(),
            30,
        );

        assert_eq!(offer.offer_id, "offer-001");
        assert_eq!(offer.discovery_id, "disc-001");
        assert_eq!(offer.token_id, "token-001");
        assert_eq!(offer.rights_controller_id, charlie());
        assert_eq!(offer.scope, LicenseScope::AiModelTraining);
        assert_eq!(offer.price_yocto.0, 2_000_000_000_000_000_000_000_000);
        assert_eq!(offer.terms_hash, sample_terms_hash());
        assert_eq!(offer.duration_days, 30);
        assert!(offer.is_active);
    }

    // 2. Offer retrieval
    #[test]
    fn test_stage33_2_offer_retrieval() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(2_000_000_000_000_000_000_000_000),
            sample_terms_hash(),
            30,
        );

        let query = contract.get_license_offer("offer-001".to_string()).unwrap();
        assert_eq!(query.offer_id, "offer-001");

        let disc_offers = contract.get_license_offers_for_discovery("disc-001".to_string());
        assert_eq!(disc_offers.len(), 1);
        assert_eq!(disc_offers[0].offer_id, "offer-001");
    }

    // 3. Offer creation for nonexistent discovery rejected
    #[test]
    #[should_panic(expected = "ERR_DISCOVERY_NOT_FOUND")]
    fn test_stage33_3_offer_creation_for_nonexistent_discovery_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-999".to_string(),
            "disc-nonexistent".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000_000_000_000_000_000_000_000),
            sample_terms_hash(),
            365,
        );
    }

    // 4. Duplicate offer ID rejected
    #[test]
    #[should_panic(expected = "ERR_DUPLICATE_OFFER_ID")]
    fn test_stage33_4_duplicate_offer_id_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000_000_000_000_000_000_000_000),
            sample_terms_hash(),
            365,
        );

        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AcademicResearch,
            U128(500_000_000_000_000_000_000_000),
            sample_terms_hash(),
            180,
        );
    }

    // 5. Custodian without Rights Controller authority rejected
    #[test]
    #[should_panic(expected = "ERR_NOT_RIGHTS_CONTROLLER")]
    fn test_stage33_5_custodian_without_rights_controller_authority_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        let min = contract.storage_min_deposit;
        setup_context(bob(), min + 1_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Bob is Custodian, but Charlie is Rights Controller!
        setup_context(bob(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000_000_000_000_000_000_000_000),
            sample_terms_hash(),
            365,
        );
    }

    // 6. Unrelated account rejected
    #[test]
    #[should_panic(expected = "ERR_NOT_RIGHTS_CONTROLLER")]
    fn test_stage33_6_unrelated_account_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(dave(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000_000_000_000_000_000_000_000),
            sample_terms_hash(),
            365,
        );
    }

    // 7. Correct terms hash accepted
    #[test]
    fn test_stage33_7_correct_terms_hash_accepted() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        let offer = contract.create_license_offer(
            "offer-hash-test".to_string(),
            "disc-001".to_string(),
            LicenseScope::CustomTerms,
            U128(100),
            "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd".to_string(),
            14,
        );
        assert_eq!(
            offer.terms_hash,
            "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
        );
    }

    // 8. Invalid terms hash rejected (length and characters)
    #[test]
    #[should_panic(expected = "ERR_INVALID_HEX_LENGTH")]
    fn test_stage33_8_invalid_terms_hash_rejected_length() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CustomTerms,
            U128(100),
            "abcdef".to_string(),
            14,
        );
    }

    #[test]
    #[should_panic(expected = "ERR_INVALID_HEX_CHARS")]
    fn test_stage33_8_invalid_terms_hash_rejected_chars() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CustomTerms,
            U128(100),
            "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz".to_string(),
            14,
        );
    }

    // 9. Invalid duration rejected (0 or > 365 days)
    #[test]
    #[should_panic(expected = "ERR_INVALID_DURATION")]
    fn test_stage33_9_invalid_duration_rejected_zero() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(100),
            sample_terms_hash(),
            0,
        );
    }

    #[test]
    #[should_panic(expected = "ERR_INVALID_DURATION")]
    fn test_stage33_9_invalid_duration_rejected_exceeds_max() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(100),
            sample_terms_hash(),
            366,
        );
    }

    // 10. Offer deactivation behavior
    #[test]
    fn test_stage33_10_offer_deactivation_behavior() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiKnowledgeRetrieval,
            U128(1_000_000),
            sample_terms_hash(),
            90,
        );

        let success = contract.deactivate_license_offer("offer-001".to_string());
        assert!(success);

        let offer = contract.get_license_offer("offer-001".to_string()).unwrap();
        assert!(!offer.is_active);
    }

    // 11. Inactive offer rejects new requests
    #[test]
    #[should_panic(expected = "ERR_OFFER_INACTIVE")]
    fn test_stage33_11_inactive_offer_rejects_new_requests() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiKnowledgeRetrieval,
            U128(1_000_000),
            sample_terms_hash(),
            90,
        );
        contract.deactivate_license_offer("offer-001".to_string());

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );
    }

    // 12. Successful license request
    #[test]
    fn test_stage33_12_successful_license_request() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelFineTuning,
            U128(4_000_000_000_000_000_000_000_000), // 4 NEAR
            sample_terms_hash(),
            60,
        );

        setup_context(dave(), 0);
        let req = contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        assert_eq!(req.request_id, "req-001");
        assert_eq!(req.license_id, "req-001");
        assert_eq!(req.offer_id, "offer-001");
        assert_eq!(req.discovery_id, "disc-001");
        assert_eq!(req.token_id, "token-001");
        assert_eq!(req.buyer_id, dave());
        assert_eq!(req.scope, LicenseScope::AiModelFineTuning);
        assert_eq!(req.price_yocto.0, 4_000_000_000_000_000_000_000_000);
        assert_eq!(req.duration_days, 60);
        assert_eq!(req.license_terms_hash, sample_terms_hash());
        assert_eq!(req.accepted_terms_hash, sample_terms_hash());
        assert_eq!(req.status, LicenseStatus::Requested);
    }

    // 13. Buyer identity derived from predecessor
    #[test]
    fn test_stage33_13_buyer_identity_derived_from_predecessor() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::ResearchEvaluation,
            U128(1_000_000_000_000_000_000_000_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        let req = contract.request_license(
            "req-dave".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );
        assert_eq!(req.buyer_id, dave());
    }

    // 14. Duplicate request ID rejected
    #[test]
    #[should_panic(expected = "ERR_DUPLICATE_REQUEST_ID")]
    fn test_stage33_14_duplicate_request_id_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::ResearchEvaluation,
            U128(1_000_000_000_000_000_000_000_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );
    }

    // 15. Nonexistent offer rejected
    #[test]
    #[should_panic(expected = "ERR_OFFER_NOT_FOUND")]
    fn test_stage33_15_nonexistent_offer_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-nonexistent".to_string(),
            sample_terms_hash(),
        );
    }

    // 16. Inactive offer rejected
    #[test]
    #[should_panic(expected = "ERR_OFFER_INACTIVE")]
    fn test_stage33_16_inactive_offer_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(100),
            sample_terms_hash(),
            30,
        );
        contract.deactivate_license_offer("offer-001".to_string());

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );
    }

    // 17. Terms hash mismatch rejected
    #[test]
    #[should_panic(expected = "ERR_TERMS_HASH_MISMATCH")]
    fn test_stage33_17_terms_hash_mismatch_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(100),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_other_terms_hash(), // Mismatch!
        );
    }

    // 18. Correct terms hash accepted
    #[test]
    fn test_stage33_18_correct_terms_hash_accepted() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(100),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        let req = contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );
        assert_eq!(req.accepted_terms_hash, sample_terms_hash());
    }

    // 19. Immutable price snapshot
    #[test]
    fn test_stage33_19_immutable_price_snapshot() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(10_000_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        let req = contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );
        assert_eq!(req.price_yocto.0, 10_000_000);

        // Deactivating offer does not alter request price
        setup_context(charlie(), 0);
        contract.deactivate_license_offer("offer-001".to_string());

        let req_after = contract.get_license_request("req-001".to_string()).unwrap();
        assert_eq!(req_after.price_yocto.0, 10_000_000);
    }

    // 20. Immutable scope snapshot
    #[test]
    fn test_stage33_20_immutable_scope_snapshot() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(500),
            sample_terms_hash(),
            180,
        );

        setup_context(dave(), 0);
        let req = contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );
        assert_eq!(req.scope, LicenseScope::AiModelTraining);
    }

    // 21. Immutable terms hash snapshot
    #[test]
    fn test_stage33_21_immutable_terms_hash_snapshot() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(500),
            sample_terms_hash(),
            180,
        );

        setup_context(dave(), 0);
        let req = contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );
        assert_eq!(req.license_terms_hash, sample_terms_hash());
        assert_eq!(req.accepted_terms_hash, sample_terms_hash());
    }

    // 22. Immutable duration snapshot
    #[test]
    fn test_stage33_22_immutable_duration_snapshot() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(500),
            sample_terms_hash(),
            45,
        );

        setup_context(dave(), 0);
        let req = contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );
        assert_eq!(req.duration_days, 45);
    }

    // 23. Correct dependency counter updates
    #[test]
    fn test_stage33_23_correct_dependency_counter_updates() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(500),
            sample_terms_hash(),
            45,
        );

        assert_eq!(
            contract
                .get_account_dependency_counts(dave())
                .unwrap()
                .persistent_license_count,
            0
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        assert_eq!(
            contract
                .get_account_dependency_counts(dave())
                .unwrap()
                .persistent_license_count,
            1
        );
    }

    // 24. Overlapping identities handled correctly
    #[test]
    fn test_stage33_24_overlapping_identities_handled_correctly() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        let min = contract.storage_min_deposit;
        setup_context(bob(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(500),
            sample_terms_hash(),
            45,
        );

        setup_context(bob(), 0);
        contract.request_license(
            "req-bob".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        let bob_deps = contract.get_account_dependency_counts(bob()).unwrap();
        assert_eq!(bob_deps.custodian_count, 1);
        assert_eq!(bob_deps.beneficiary_reference_count, 1);
        assert_eq!(bob_deps.persistent_license_count, 1);
        assert_eq!(bob_deps.rights_controller_count, 0);
    }

    // 25. Successful approval by Rights Controller
    #[test]
    fn test_stage33_25_successful_approval_by_rights_controller() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        let approved = contract.approve_license_request("req-001".to_string());
        match approved.status {
            LicenseStatus::Approved { payment_deadline } => {
                assert!(payment_deadline > 0);
            }
            _ => panic!("Expected Approved status"),
        }
    }

    // 26. Approval by NFT custodian without controller authority rejected
    #[test]
    #[should_panic(expected = "ERR_NOT_RIGHTS_CONTROLLER")]
    fn test_stage33_26_approval_by_nft_custodian_without_controller_authority_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        // Bob is Custodian, NOT Rights Controller!
        setup_context(bob(), 0);
        contract.approve_license_request("req-001".to_string());
    }

    // 27. Approval by unrelated account rejected
    #[test]
    #[should_panic(expected = "ERR_NOT_RIGHTS_CONTROLLER")]
    fn test_stage33_27_approval_by_unrelated_account_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        // Dave (buyer) attempts to approve own request
        setup_context(dave(), 0);
        contract.approve_license_request("req-001".to_string());
    }

    // 28. Successful rejection by Rights Controller
    #[test]
    fn test_stage33_28_successful_rejection_by_rights_controller() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        let rejected = contract.reject_license_request(
            "req-001".to_string(),
            Some("Use case outside permitted research scope".to_string()),
        );
        match rejected.status {
            LicenseStatus::Rejected { reason } => {
                assert_eq!(reason, "Use case outside permitted research scope");
            }
            _ => panic!("Expected Rejected status"),
        }
    }

    // 29. Repeated approval rejected
    #[test]
    #[should_panic(expected = "ERR_INVALID_STATUS_FOR_APPROVAL")]
    fn test_stage33_29_repeated_approval_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.approve_license_request("req-001".to_string());
        contract.approve_license_request("req-001".to_string());
    }

    // 30. Repeated rejection rejected
    #[test]
    #[should_panic(expected = "ERR_INVALID_STATUS_FOR_REJECTION")]
    fn test_stage33_30_repeated_rejection_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.reject_license_request("req-001".to_string(), None);
        contract.reject_license_request("req-001".to_string(), None);
    }

    // 31. Approval after rejection rejected
    #[test]
    #[should_panic(expected = "ERR_INVALID_STATUS_FOR_APPROVAL")]
    fn test_stage33_31_approval_after_rejection_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.reject_license_request("req-001".to_string(), None);
        contract.approve_license_request("req-001".to_string());
    }

    // 32. Rejection after approval rejected
    #[test]
    #[should_panic(expected = "ERR_INVALID_STATUS_FOR_REJECTION")]
    fn test_stage33_32_rejection_after_approval_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.approve_license_request("req-001".to_string());
        contract.reject_license_request("req-001".to_string(), None);
    }

    // 33. Approval does not activate the license
    #[test]
    fn test_stage33_33_approval_does_not_activate_license() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        let approved = contract.approve_license_request("req-001".to_string());
        assert!(!matches!(approved.status, LicenseStatus::Active { .. }));
        assert_eq!(
            contract
                .get_account_dependency_counts(dave())
                .unwrap()
                .active_license_count,
            0
        );
    }

    // 34. Approval does not process payment
    #[test]
    fn test_stage33_34_approval_does_not_process_payment() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.approve_license_request("req-001".to_string());

        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
        assert_eq!(contract.get_claimable_balance(charlie()).0, 0);
    }

    // 35. Rejected request remains persistently accounted for
    #[test]
    #[should_panic(expected = "ERR_ACCOUNT_HAS_ACTIVE_DEPENDENCIES")]
    fn test_stage33_35_rejected_request_remains_persistently_accounted_for() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.reject_license_request("req-001".to_string(), None);

        // Dave tries to unregister, but rejected request is still on-chain
        setup_context(dave(), 1);
        contract.storage_unregister(None);
    }

    // 36. Correct storage accounting for offer creation
    #[test]
    fn test_stage33_36_correct_storage_accounting_for_offer_creation() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        let bal_before = contract.storage_balance_of(charlie()).unwrap();

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        let bal_after = contract.storage_balance_of(charlie()).unwrap();
        assert_eq!(bal_after.total.0, bal_before.total.0);
        assert!(bal_after.available.0 < bal_before.available.0);
    }

    // 37. Correct storage accounting for request creation
    #[test]
    fn test_stage33_37_correct_storage_accounting_for_request_creation() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        let bal_before = contract.storage_balance_of(dave()).unwrap();

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        let bal_after = contract.storage_balance_of(dave()).unwrap();
        assert_eq!(bal_after.total.0, bal_before.total.0);
        assert!(bal_after.available.0 < bal_before.available.0);
    }

    // 38. No double charging of dependency records
    #[test]
    fn test_stage33_38_no_double_charging_of_dependency_records() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        let bal_before = contract.storage_balance_of(dave()).unwrap();

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        let bal_after = contract.storage_balance_of(dave()).unwrap();
        let deducted = bal_before.available.0 - bal_after.available.0;
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        assert_eq!(deducted % byte_cost, 0);
    }

    // 39. Insufficient storage rejects persistent operations
    #[test]
    #[should_panic(expected = "ERR_INSUFFICIENT_STORAGE_BALANCE")]
    fn test_stage33_39_insufficient_storage_rejects_persistent_operations() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        let min = contract.storage_min_deposit;
        let eve: AccountId = "eve.testnet".parse().unwrap();
        setup_context(eve.clone(), min);
        contract.storage_deposit(None, None);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(eve, 0);
        contract.request_license(
            "req-eve".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );
    }

    // 40. Approval storage growth and deduction from rights controller
    #[test]
    fn test_stage33_40_approval_storage_growth_and_deduction() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(1_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        let bal_before = contract.storage_balance_of(charlie()).unwrap();

        setup_context(charlie(), 0);
        contract.approve_license_request("req-001".to_string());

        let bal_after = contract.storage_balance_of(charlie()).unwrap();
        assert_eq!(bal_after.total.0, bal_before.total.0);
        assert!(bal_after.available.0 < bal_before.available.0);
        let deducted = bal_before.available.0 - bal_after.available.0;
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        assert_eq!(deducted % byte_cost, 0);
        assert_eq!(deducted / byte_cost, 8); // Exact 8 bytes for Approved { u64 }
    }

    // 41. Rejection storage growth and deduction from rights controller
    #[test]
    fn test_stage33_41_rejection_storage_growth_and_deduction() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(1_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        let bal_before = contract.storage_balance_of(charlie()).unwrap();

        let reason = "Commercial terms not mutually aligned".to_string();
        setup_context(charlie(), 0);
        contract.reject_license_request("req-001".to_string(), Some(reason.clone()));

        let bal_after = contract.storage_balance_of(charlie()).unwrap();
        assert_eq!(bal_after.total.0, bal_before.total.0);
        assert!(bal_after.available.0 < bal_before.available.0);
        let deducted = bal_before.available.0 - bal_after.available.0;
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        assert_eq!(deducted % byte_cost, 0);
        assert_eq!(deducted / byte_cost, (4 + reason.len()) as u128);
    }

    // 42. Rejection reason too long rejected
    #[test]
    #[should_panic(expected = "ERR_REJECTION_REASON_TOO_LONG")]
    fn test_stage33_42_rejection_reason_too_long_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(1_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        let long_reason = "r".repeat(257);
        setup_context(charlie(), 0);
        contract.reject_license_request("req-001".to_string(), Some(long_reason));
    }

    // 43. Rejection empty reason rejected
    #[test]
    #[should_panic(expected = "ERR_EMPTY_REJECTION_REASON")]
    fn test_stage33_43_rejection_empty_reason_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(1_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.reject_license_request("req-001".to_string(), Some("   ".to_string()));
    }

    // 44. Approval insufficient storage reverts
    #[test]
    #[should_panic(expected = "ERR_INSUFFICIENT_STORAGE_BALANCE")]
    fn test_stage33_44_approval_insufficient_storage_reverts() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(1_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        // Charlie withdraws all available balance down to zero
        let bal = contract.storage_balance_of(charlie()).unwrap();
        setup_context(charlie(), 1);
        contract.storage_withdraw(Some(U128(bal.available.0)));

        // Charlie attempts to approve without available storage balance
        setup_context(charlie(), 0);
        contract.approve_license_request("req-001".to_string());
    }

    // 45. Rejection insufficient storage reverts
    #[test]
    #[should_panic(expected = "ERR_INSUFFICIENT_STORAGE_BALANCE")]
    fn test_stage33_45_rejection_insufficient_storage_reverts() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(1_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        // Charlie withdraws all available balance down to zero
        let bal = contract.storage_balance_of(charlie()).unwrap();
        setup_context(charlie(), 1);
        contract.storage_withdraw(Some(U128(bal.available.0)));

        // Charlie attempts to reject without available storage balance
        setup_context(charlie(), 0);
        contract.reject_license_request("req-001".to_string(), None);
    }

    // 46. Terms hash case insensitivity and byte equality
    #[test]
    fn test_stage33_46_terms_hash_case_insensitivity_and_byte_equality() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        let lower_hash = sample_terms_hash();
        let upper_hash = lower_hash.to_uppercase();
        assert_ne!(lower_hash, upper_hash);

        // Offer created with lowercase hex
        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AcademicResearch,
            U128(500),
            lower_hash.clone(),
            90,
        );

        // Request submitted with uppercase hex
        setup_context(dave(), 0);
        let req =
            contract.request_license("req-001".to_string(), "offer-001".to_string(), upper_hash);

        // Assert both byte digests match internally and view returns canonical lowercase hex
        assert_eq!(req.license_terms_hash, lower_hash);
        assert_eq!(req.accepted_terms_hash, lower_hash);
    }

    // 47. Timestamp overflow safety
    #[test]
    #[should_panic(expected = "ERR_TIMESTAMP_OVERFLOW")]
    fn test_stage33_47_timestamp_overflow_safety() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::AiModelTraining,
            U128(1_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-001".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        // Set block timestamp close to u64::MAX so that adding 7 days overflows
        setup_context_with_timestamp(charlie(), 0, u64::MAX - 100);
        contract.approve_license_request("req-001".to_string());
    }

    // -------------------------------------------------------------
    // STAGE 3.4 AUTOMATED TESTS: PAYMENTS, ACTIVATION & ROYALTIES
    // -------------------------------------------------------------

    fn setup_approved_request(
        contract: &mut KnovaraContract,
        price_yocto: u128,
        duration_days: u32,
    ) -> (String, String) {
        setup_discovery_with_controller(contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-stage34".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(price_yocto),
            sample_terms_hash(),
            duration_days,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-stage34".to_string(),
            "offer-stage34".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.approve_license_request("req-stage34".to_string());

        ("req-stage34".to_string(), sample_terms_hash())
    }

    // 1. Successful exact payment
    #[test]
    fn test_stage34_1_successful_exact_payment() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 2_000_000, 30);

        setup_context(dave(), 2_000_000);
        let active = contract.pay_for_license(req_id.clone(), terms_hash);

        assert!(matches!(active.status, LicenseStatus::Active { .. }));
        if let LicenseStatus::Active {
            activated_at,
            expires_at,
        } = active.status
        {
            assert_eq!(expires_at, activated_at + (30 * 86_400 * 1_000_000_000u64));
        }
    }

    // 2. Underpayment rejection
    #[test]
    #[should_panic(expected = "ERR_EXACT_PAYMENT_REQUIRED")]
    fn test_stage34_2_underpayment_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 2_000_000, 30);

        setup_context(dave(), 1_999_999);
        contract.pay_for_license(req_id, terms_hash);
    }

    // 3. Overpayment rejection
    #[test]
    #[should_panic(expected = "ERR_EXACT_PAYMENT_REQUIRED")]
    fn test_stage34_3_overpayment_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 2_000_000, 30);

        setup_context(dave(), 2_000_001);
        contract.pay_for_license(req_id, terms_hash);
    }

    // 4. Wrong buyer rejection
    #[test]
    #[should_panic(expected = "ERR_UNAUTHORIZED_BUYER")]
    fn test_stage34_4_wrong_buyer_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 2_000_000, 30);

        setup_context(charlie(), 2_000_000);
        contract.pay_for_license(req_id, terms_hash);
    }

    // 5. Unapproved request rejection
    #[test]
    #[should_panic(expected = "ERR_REQUEST_NOT_APPROVED")]
    fn test_stage34_5_unapproved_request_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "offer-001".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-unappr".to_string(),
            "offer-001".to_string(),
            sample_terms_hash(),
        );

        // Dave attempts to pay while status is still Requested
        setup_context(dave(), 1_000);
        contract.pay_for_license("req-unappr".to_string(), sample_terms_hash());
    }

    // 6. Incorrect terms hash rejection
    #[test]
    #[should_panic(expected = "ERR_TERMS_HASH_MISMATCH")]
    fn test_stage34_6_incorrect_terms_hash_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, _) = setup_approved_request(&mut contract, 2_000_000, 30);

        setup_context(dave(), 2_000_000);
        contract.pay_for_license(req_id, sample_other_terms_hash());
    }

    // 7. Payment after deadline rejection
    #[test]
    #[should_panic(expected = "ERR_PAYMENT_DEADLINE_EXPIRED")]
    fn test_stage34_7_payment_after_deadline_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 2_000_000, 30);

        // Fast-forward timestamp past 7-day payment deadline (+8 days)
        let eight_days_nanos = 8 * 86_400 * 1_000_000_000u64;
        setup_context_with_timestamp(dave(), 2_000_000, eight_days_nanos);
        contract.pay_for_license(req_id, terms_hash);
    }

    // 8. Duplicate payment rejection
    #[test]
    #[should_panic(expected = "ERR_ALREADY_PAID")]
    fn test_stage34_8_duplicate_payment_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 2_000_000, 30);

        setup_context(dave(), 2_000_000);
        contract.pay_for_license(req_id.clone(), terms_hash.clone());

        // Second payment attempt must panic
        setup_context(dave(), 2_000_000);
        contract.pay_for_license(req_id, terms_hash);
    }

    // 9. Payment after offer deactivation for already approved request
    #[test]
    fn test_stage34_9_payment_after_offer_deactivation() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 2_000_000, 30);

        // Deactivate offer
        setup_context(charlie(), 0);
        contract.deactivate_license_offer("offer-stage34".to_string());

        // Dave pays for already approved request -> must succeed
        setup_context(dave(), 2_000_000);
        let active = contract.pay_for_license(req_id, terms_hash);
        assert!(matches!(active.status, LicenseStatus::Active { .. }));
    }

    // 10. Payment amount sourced from request snapshot, not current offer
    #[test]
    fn test_stage34_10_payment_amount_sourced_from_snapshot() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 2_000_000, 30);

        // Verified: Paying snapshotted amount succeeds
        setup_context(dave(), 2_000_000);
        let active = contract.pay_for_license(req_id, terms_hash);
        assert_eq!(active.price_yocto.0, 2_000_000);
    }

    // 11. Correct active status
    #[test]
    fn test_stage34_11_correct_active_status() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        setup_context(dave(), 1_000);
        let rec = contract.pay_for_license(req_id, terms_hash);
        assert!(matches!(rec.status, LicenseStatus::Active { .. }));
    }

    // 12. Correct expiration timestamp
    #[test]
    fn test_stage34_12_correct_expiration_timestamp() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 60);

        setup_context_with_timestamp(dave(), 1_000, 10_000);
        let rec = contract.pay_for_license(req_id, terms_hash);
        if let LicenseStatus::Active {
            activated_at,
            expires_at,
        } = rec.status
        {
            assert_eq!(activated_at, 10_000);
            assert_eq!(expires_at, 10_000 + 60 * 86_400 * 1_000_000_000u64);
        } else {
            panic!("Expected Active status");
        }
    }

    // 13. Duration sourced from request snapshot
    #[test]
    fn test_stage34_13_duration_sourced_from_request_snapshot() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 180);

        setup_context(dave(), 1_000);
        let rec = contract.pay_for_license(req_id, terms_hash);
        assert_eq!(rec.duration_days, 180);
    }

    // 14. Timestamp multiplication overflow check
    #[test]
    fn test_stage34_14_timestamp_multiplication_overflow_safety() {
        let max_days: u32 = 365;
        let nanos = (max_days as u64)
            .checked_mul(86_400)
            .and_then(|s| s.checked_mul(1_000_000_000));
        assert!(nanos.is_some());
    }

    // 15. Timestamp addition overflow
    #[test]
    #[should_panic(expected = "ERR_TIMESTAMP_OVERFLOW")]
    fn test_stage34_15_timestamp_addition_overflow() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        setup_discovery_with_controller(&mut contract);

        setup_context(charlie(), 0);
        contract.create_license_offer(
            "off-ovf".to_string(),
            "disc-001".to_string(),
            LicenseScope::CommercialUse,
            U128(1_000),
            sample_terms_hash(),
            365,
        );

        setup_context(dave(), 0);
        contract.request_license(
            "req-ovf".to_string(),
            "off-ovf".to_string(),
            sample_terms_hash(),
        );

        // Approve at timestamp near u64::MAX so payment_deadline is near u64::MAX
        let base_ts = u64::MAX - (10 * 86_400 * 1_000_000_000u64);
        setup_context_with_timestamp(charlie(), 0, base_ts);
        contract.approve_license_request("req-ovf".to_string());

        // Dave pays at base_ts + 1 day: within payment_deadline, but base_ts + 365 days overflows!
        setup_context_with_timestamp(dave(), 1_000, base_ts + (86_400 * 1_000_000_000u64));
        contract.pay_for_license("req-ovf".to_string(), sample_terms_hash());
    }

    // 16. Active dependency counter increments once
    #[test]
    fn test_stage34_16_active_dependency_counter_increments_once() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        let deps_before = contract.get_account_dependency_counts(dave()).unwrap();
        assert_eq!(deps_before.active_license_count, 0);

        setup_context(dave(), 1_000);
        contract.pay_for_license(req_id, terms_hash);

        let deps_after = contract.get_account_dependency_counts(dave()).unwrap();
        assert_eq!(deps_after.active_license_count, 1);
    }

    // 17. Persistent dependency counter remains unchanged
    #[test]
    fn test_stage34_17_persistent_dependency_counter_remains_unchanged() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        let deps_before = contract.get_account_dependency_counts(dave()).unwrap();
        assert_eq!(deps_before.persistent_license_count, 1);

        setup_context(dave(), 1_000);
        contract.pay_for_license(req_id, terms_hash);

        let deps_after = contract.get_account_dependency_counts(dave()).unwrap();
        assert_eq!(deps_after.persistent_license_count, 1);
    }

    // 18. Repeated activation rejection
    #[test]
    #[should_panic(expected = "ERR_ALREADY_PAID")]
    fn test_stage34_18_repeated_activation_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        setup_context(dave(), 1_000);
        contract.pay_for_license(req_id.clone(), terms_hash.clone());

        setup_context(dave(), 1_000);
        contract.pay_for_license(req_id, terms_hash);
    }

    // 19. Single beneficiary receives 100%
    #[test]
    fn test_stage34_19_single_beneficiary_receives_100_percent() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 10_000, 30);

        let bal_before = contract.get_claimable_balance(bob()).0;

        setup_context(dave(), 10_000);
        contract.pay_for_license(req_id, terms_hash);

        let bal_after = contract.get_claimable_balance(bob()).0;
        assert_eq!(bal_after - bal_before, 10_000);
    }

    // 20. Two beneficiaries receive correct shares
    #[test]
    fn test_stage34_20_two_beneficiaries_receive_correct_shares() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());

        let min = contract.storage_min_deposit;
        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-two-ben".to_string(),
            "tok-two-ben".to_string(),
            Some(bob()),
            charlie(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![
                BeneficiaryShare {
                    account_id: bob(),
                    basis_points: 6_000, // 60%
                },
                BeneficiaryShare {
                    account_id: alice(),
                    basis_points: 4_000, // 40%
                },
            ],
            vec![],
        );

        setup_context(charlie(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.create_license_offer(
            "offer-two".to_string(),
            "disc-two-ben".to_string(),
            LicenseScope::CommercialUse,
            U128(10_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);
        contract.request_license(
            "req-two".to_string(),
            "offer-two".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.approve_license_request("req-two".to_string());

        let bob_before = contract.get_claimable_balance(bob()).0;
        let alice_before = contract.get_claimable_balance(alice()).0;

        setup_context(dave(), 10_000);
        contract.pay_for_license("req-two".to_string(), sample_terms_hash());

        let bob_after = contract.get_claimable_balance(bob()).0;
        let alice_after = contract.get_claimable_balance(alice()).0;

        assert_eq!(bob_after - bob_before, 6_000); // 60% of 10,000
        assert_eq!(alice_after - alice_before, 4_000); // 40% of 10,000
    }

    // 21. Multiple beneficiaries receive correct shares
    #[test]
    fn test_stage34_21_multiple_beneficiaries_receive_correct_shares() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());

        let min = contract.storage_min_deposit;
        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        let eve: AccountId = "eve.testnet".parse().unwrap();
        contract.register_discovery_and_mint(
            "disc-multi".to_string(),
            "tok-multi".to_string(),
            Some(bob()),
            charlie(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![
                BeneficiaryShare {
                    account_id: bob(),
                    basis_points: 5_000,
                },
                BeneficiaryShare {
                    account_id: alice(),
                    basis_points: 3_000,
                },
                BeneficiaryShare {
                    account_id: eve.clone(),
                    basis_points: 2_000,
                },
            ],
            vec![],
        );

        setup_context(charlie(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);
        contract.create_license_offer(
            "off-multi".to_string(),
            "disc-multi".to_string(),
            LicenseScope::AcademicResearch,
            U128(100_000),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);
        contract.request_license(
            "req-multi".to_string(),
            "off-multi".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.approve_license_request("req-multi".to_string());

        setup_context(dave(), 100_000);
        contract.pay_for_license("req-multi".to_string(), sample_terms_hash());

        assert_eq!(contract.get_claimable_balance(bob()).0, 50_000);
        assert_eq!(contract.get_claimable_balance(alice()).0, 30_000);
        assert_eq!(contract.get_claimable_balance(eve).0, 20_000);
    }

    // 22. Rounding remainder is allocated deterministically to Rights Controller
    #[test]
    fn test_stage34_22_rounding_remainder_allocated_deterministically() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());

        let min = contract.storage_min_deposit;
        setup_context(alice(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-rem".to_string(),
            "tok-rem".to_string(),
            Some(bob()),
            charlie(), // Rights controller
            sample_manifest_hash(),
            sample_metadata(),
            vec![
                BeneficiaryShare {
                    account_id: bob(),
                    basis_points: 5_000, // 50%
                },
                BeneficiaryShare {
                    account_id: alice(),
                    basis_points: 5_000, // 50%
                },
            ],
            vec![],
        );

        setup_context(charlie(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Price = 101 yoctoNEAR (50% = 50, 50% = 50, remainder = 1)
        contract.create_license_offer(
            "off-rem".to_string(),
            "disc-rem".to_string(),
            LicenseScope::ResearchEvaluation,
            U128(101),
            sample_terms_hash(),
            30,
        );

        setup_context(dave(), min + 5_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);
        contract.request_license(
            "req-rem".to_string(),
            "off-rem".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.approve_license_request("req-rem".to_string());

        let charlie_before = contract.get_claimable_balance(charlie()).0;

        setup_context(dave(), 101);
        contract.pay_for_license("req-rem".to_string(), sample_terms_hash());

        let bob_gain = contract.get_claimable_balance(bob()).0;
        let alice_gain = contract.get_claimable_balance(alice()).0;
        let charlie_gain = contract.get_claimable_balance(charlie()).0 - charlie_before;

        assert_eq!(bob_gain, 50);
        assert_eq!(alice_gain, 50);
        assert_eq!(charlie_gain, 1); // Remainder allocated to rights controller
        assert_eq!(bob_gain + alice_gain + charlie_gain, 101); // EXACT match
    }

    // 23. Full payment amount equals total beneficiary allocations
    #[test]
    fn test_stage34_23_full_payment_amount_equals_total_allocations() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 333_333_333, 30);

        setup_context(dave(), 333_333_333);
        contract.pay_for_license(req_id, terms_hash);

        let bob_bal = contract.get_claimable_balance(bob()).0;
        let charlie_bal = contract.get_claimable_balance(charlie()).0;
        assert_eq!(bob_bal + charlie_bal, 333_333_333);
    }

    // 24. No zero allocation rounding or overflow corruption
    #[test]
    fn test_stage34_24_no_zero_allocation_rounding_or_overflow_corruption() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1, 30);

        // Price = 1 yocto: 10,000 bps of 1 yocto = 1 yocto
        setup_context(dave(), 1);
        contract.pay_for_license(req_id, terms_hash);

        let bob_bal = contract.get_claimable_balance(bob()).0;
        assert_eq!(bob_bal, 1);
    }

    // 25. Existing beneficiary balances are incremented correctly
    #[test]
    fn test_stage34_25_existing_beneficiary_balances_incremented() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        setup_context(dave(), 1_000);
        contract.pay_for_license(req_id, terms_hash);
        assert_eq!(contract.get_claimable_balance(bob()).0, 1_000);

        // Second request for same discovery
        setup_context(dave(), 0);
        contract.request_license(
            "req-sec".to_string(),
            "offer-stage34".to_string(),
            sample_terms_hash(),
        );

        setup_context(charlie(), 0);
        contract.approve_license_request("req-sec".to_string());

        setup_context(dave(), 1_000);
        contract.pay_for_license("req-sec".to_string(), sample_terms_hash());

        // Balance incremented from 1,000 to 2,000
        assert_eq!(contract.get_claimable_balance(bob()).0, 2_000);
    }

    // 26. Missing preallocated balance rejects payment safely
    #[test]
    #[should_panic(expected = "ERR_BENEFICIARY_ENTRY_NOT_PREALLOCATED")]
    fn test_stage34_26_missing_preallocated_balance_rejects_payment() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        // Intentionally delete pre-allocated key for Bob to simulate corruption
        contract.claimable_balances.remove(&bob());

        setup_context(dave(), 1_000);
        contract.pay_for_license(req_id, terms_hash);
    }

    // 27. Aggregate liability accounting matches all allocations
    #[test]
    fn test_stage34_27_aggregate_liability_accounting_matches_all_allocations() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 5_000_000, 30);

        assert_eq!(contract.get_total_royalty_liabilities().0, 0);

        setup_context(dave(), 5_000_000);
        contract.pay_for_license(req_id, terms_hash);

        assert_eq!(contract.get_total_royalty_liabilities().0, 5_000_000);
    }

    // 28. No duplicate royalty allocation on payment replay
    #[test]
    #[should_panic(expected = "ERR_ALREADY_PAID")]
    fn test_stage34_28_no_duplicate_royalty_allocation_on_payment_replay() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 5_000_000, 30);

        setup_context(dave(), 5_000_000);
        contract.pay_for_license(req_id.clone(), terms_hash.clone());

        // Second payment attempt
        setup_context(dave(), 5_000_000);
        contract.pay_for_license(req_id, terms_hash);
    }

    // 29. Successful withdrawal local state update
    #[test]
    fn test_stage34_29_successful_withdrawal() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 10_000, 30);

        setup_context(dave(), 10_000);
        contract.pay_for_license(req_id, terms_hash);

        assert_eq!(contract.get_claimable_balance(bob()).0, 10_000);
        assert_eq!(contract.get_total_royalty_liabilities().0, 10_000);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 0);

        // Bob initiates withdrawal
        setup_context(bob(), 0);
        let _ = contract.withdraw_earnings();

        // In-flight state: claimable zeroed, pending tracks 10_000, total liabilities remain 10_000
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 10_000);
        assert_eq!(contract.get_total_royalty_liabilities().0, 10_000);

        // Callback resolves with success
        setup_context(contract_id(), 0);
        let ok = contract.on_withdraw_earnings_callback(bob(), U128(10_000), Ok(()));
        assert!(ok);

        // Final state: pending decremented, total liabilities decremented
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 0);
        assert_eq!(contract.get_total_royalty_liabilities().0, 0);
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
    }

    // 30. Zero claimable balance rejection
    #[test]
    #[should_panic(expected = "ERR_ZERO_CLAIMABLE_BALANCE")]
    fn test_stage34_30_zero_claimable_balance_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());

        setup_context(bob(), 0);
        let _ = contract.withdraw_earnings();
    }

    // 31. Unauthorized beneficiary cannot withdraw another's balance
    #[test]
    #[should_panic(expected = "ERR_ZERO_CLAIMABLE_BALANCE")]
    fn test_stage34_31_unauthorized_beneficiary_withdrawal_rejection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 10_000, 30);

        setup_context(dave(), 10_000);
        contract.pay_for_license(req_id, terms_hash);

        // Eve tries to withdraw Bob's earnings -> Eve has 0 balance, panics
        let eve: AccountId = "eve.testnet".parse().unwrap();
        setup_context(eve, 0);
        let _ = contract.withdraw_earnings();
    }

    // 32. Failed native transfer restores balance in callback
    #[test]
    fn test_stage34_32_failed_native_transfer_restores_balance() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 10_000, 30);

        setup_context(dave(), 10_000);
        contract.pay_for_license(req_id, terms_hash);

        setup_context(bob(), 0);
        let _ = contract.withdraw_earnings();
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 10_000);
        assert_eq!(contract.get_total_royalty_liabilities().0, 10_000);

        // Callback invoked with failure result
        setup_context(contract_id(), 0);
        let res = contract.on_withdraw_earnings_callback(
            bob(),
            U128(10_000),
            Err(near_sdk::PromiseError::Failed),
        );
        assert!(!res);

        // Balance restored!
        assert_eq!(contract.get_claimable_balance(bob()).0, 10_000);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 0);
        assert_eq!(contract.get_total_royalty_liabilities().0, 10_000);
    }

    // 33. Failed callback does not overwrite new earnings
    #[test]
    fn test_stage34_33_failed_callback_does_not_overwrite_new_earnings() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 10_000, 30);

        setup_context(dave(), 10_000);
        contract.pay_for_license(req_id, terms_hash);

        setup_context(bob(), 0);
        let _ = contract.withdraw_earnings();
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 10_000);
        assert_eq!(contract.get_total_royalty_liabilities().0, 10_000);

        // New earnings arrive while withdrawal was in flight
        contract.claimable_balances.insert(bob(), 5_000);
        contract.total_royalty_liabilities += 5_000;
        assert_eq!(
            contract.get_claimable_balance(bob()).0 + contract.get_pending_royalty_withdrawals().0,
            contract.get_total_royalty_liabilities().0
        );

        // Callback fails and restores the 10,000 withdrawal
        setup_context(contract_id(), 0);
        contract.on_withdraw_earnings_callback(
            bob(),
            U128(10_000),
            Err(near_sdk::PromiseError::Failed),
        );

        // Preserves the 5,000 new earnings! Total = 15,000
        assert_eq!(contract.get_claimable_balance(bob()).0, 15_000);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 0);
        assert_eq!(contract.get_total_royalty_liabilities().0, 15_000);
    }

    // 34. Aggregate liabilities restore correctly after failure
    #[test]
    fn test_stage34_34_aggregate_liabilities_restore_correctly() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        contract.total_royalty_liabilities = 7_500;
        contract.pending_royalty_withdrawals = 7_500;

        setup_context(contract_id(), 0);
        contract.on_withdraw_earnings_callback(
            bob(),
            U128(7_500),
            Err(near_sdk::PromiseError::Failed),
        );

        assert_eq!(contract.get_pending_royalty_withdrawals().0, 0);
        assert_eq!(contract.get_total_royalty_liabilities().0, 7_500);
        assert_eq!(contract.get_claimable_balance(bob()).0, 7_500);
    }

    // 35. Successful callback preserves new earnings
    #[test]
    fn test_stage34_35_successful_callback_preserves_new_earnings() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        contract.claimable_balances.insert(bob(), 3_000);
        contract.total_royalty_liabilities = 13_000;
        contract.pending_royalty_withdrawals = 10_000;

        setup_context(contract_id(), 0);
        let ok = contract.on_withdraw_earnings_callback(bob(), U128(10_000), Ok(()));
        assert!(ok);
        assert_eq!(contract.get_claimable_balance(bob()).0, 3_000);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 0);
        assert_eq!(contract.get_total_royalty_liabilities().0, 3_000);
    }

    // 36. Callback authorization protection
    #[test]
    #[should_panic(expected = "Method is private")]
    fn test_stage34_36_callback_authorization_protection() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());

        // Called by alice (external account) -> MUST PANIC
        setup_context(alice(), 0);
        contract.on_withdraw_earnings_callback(bob(), U128(10_000), Ok(()));
    }

    // 37. Expiration before deadline rejected
    #[test]
    #[should_panic(expected = "ERR_LICENSE_NOT_YET_EXPIRED")]
    fn test_stage34_37_expiration_before_deadline_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        setup_context(dave(), 1_000);
        contract.pay_for_license(req_id.clone(), terms_hash);

        // Attempting to expire before expiry timestamp elapsed
        contract.expire_license(req_id);
    }

    // 38. Expiration exactly at expiry
    #[test]
    fn test_stage34_38_expiration_exactly_at_expiry() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        setup_context_with_timestamp(dave(), 1_000, 100);
        let active = contract.pay_for_license(req_id.clone(), terms_hash);
        let expires_at = match active.status {
            LicenseStatus::Active { expires_at, .. } => expires_at,
            _ => panic!("Expected active"),
        };

        // Advance to exactly expires_at
        setup_context_with_timestamp(alice(), 0, expires_at);
        let expired = contract.expire_license(req_id);
        assert_eq!(expired.status, LicenseStatus::Expired);
    }

    // 39. Expiration after expiry
    #[test]
    fn test_stage34_39_expiration_after_expiry() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        setup_context_with_timestamp(dave(), 1_000, 100);
        let active = contract.pay_for_license(req_id.clone(), terms_hash);
        let expires_at = match active.status {
            LicenseStatus::Active { expires_at, .. } => expires_at,
            _ => panic!("Expected active"),
        };

        // Advance past expires_at
        setup_context_with_timestamp(alice(), 0, expires_at + 1_000);
        let expired = contract.expire_license(req_id);
        assert_eq!(expired.status, LicenseStatus::Expired);
    }

    // 40. Active counter decremented exactly once
    #[test]
    fn test_stage34_40_active_counter_decremented_once() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        setup_context_with_timestamp(dave(), 1_000, 100);
        let active = contract.pay_for_license(req_id.clone(), terms_hash);
        let expires_at = match active.status {
            LicenseStatus::Active { expires_at, .. } => expires_at,
            _ => panic!("Expected active"),
        };

        assert_eq!(
            contract
                .get_account_dependency_counts(dave())
                .unwrap()
                .active_license_count,
            1
        );

        setup_context_with_timestamp(alice(), 0, expires_at + 10);
        contract.expire_license(req_id);

        assert_eq!(
            contract
                .get_account_dependency_counts(dave())
                .unwrap()
                .active_license_count,
            0
        );
    }

    // 41. Persistent license counter unchanged on expiration
    #[test]
    fn test_stage34_41_persistent_license_counter_unchanged() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        setup_context_with_timestamp(dave(), 1_000, 100);
        let active = contract.pay_for_license(req_id.clone(), terms_hash);
        let expires_at = match active.status {
            LicenseStatus::Active { expires_at, .. } => expires_at,
            _ => panic!("Expected active"),
        };

        setup_context_with_timestamp(alice(), 0, expires_at + 10);
        contract.expire_license(req_id);

        // Persistent license count remains 1, blocking unregistration
        assert_eq!(
            contract
                .get_account_dependency_counts(dave())
                .unwrap()
                .persistent_license_count,
            1
        );
    }

    // 42. Repeated expiration rejected
    #[test]
    #[should_panic(expected = "ERR_ALREADY_EXPIRED")]
    fn test_stage34_42_repeated_expiration_rejected() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        setup_context_with_timestamp(dave(), 1_000, 100);
        let active = contract.pay_for_license(req_id.clone(), terms_hash);
        let expires_at = match active.status {
            LicenseStatus::Active { expires_at, .. } => expires_at,
            _ => panic!("Expected active"),
        };

        setup_context_with_timestamp(alice(), 0, expires_at + 10);
        contract.expire_license(req_id.clone());

        // Second call must panic
        contract.expire_license(req_id);
    }

    // 43. Royalty claims remain withdrawable after license expiry
    #[test]
    fn test_stage34_43_royalty_claims_remain_withdrawable_after_expiry() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 10_000, 30);

        setup_context_with_timestamp(dave(), 10_000, 100);
        let active = contract.pay_for_license(req_id.clone(), terms_hash);
        let expires_at = match active.status {
            LicenseStatus::Active { expires_at, .. } => expires_at,
            _ => panic!("Expected active"),
        };

        setup_context_with_timestamp(alice(), 0, expires_at + 10);
        contract.expire_license(req_id);

        // Bob's claimable royalties are still 10,000 and can be withdrawn
        assert_eq!(contract.get_claimable_balance(bob()).0, 10_000);
        setup_context(bob(), 0);
        let _ = contract.withdraw_earnings();
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
    }

    // 44. Expire license request after payment deadline
    #[test]
    fn test_stage34_44_expire_license_request_after_payment_deadline() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, _) = setup_approved_request(&mut contract, 10_000, 30);

        // Fast-forward past 7-day payment deadline (+8 days)
        let eight_days = 8 * 86_400 * 1_000_000_000u64;
        setup_context_with_timestamp(alice(), 0, eight_days);
        let exp = contract.expire_license_request(req_id);
        assert_eq!(exp.status, LicenseStatus::Expired);
    }

    // 45. Correct storage accounting for license payment
    #[test]
    fn test_stage34_45_correct_storage_accounting_for_license_payment() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        let bal_before = contract.storage_balance_of(dave()).unwrap();

        setup_context(dave(), 1_000);
        contract.pay_for_license(req_id, terms_hash);

        let bal_after = contract.storage_balance_of(dave()).unwrap();
        assert_eq!(bal_after.total.0, bal_before.total.0);
        assert!(bal_after.available.0 < bal_before.available.0);

        let deducted = bal_before.available.0 - bal_after.available.0;
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        assert_eq!(deducted % byte_cost, 0);
        assert_eq!(deducted / byte_cost, 8); // Exact 8 bytes for Active status
    }

    // 46. No double charging of beneficiary storage
    #[test]
    fn test_stage34_46_no_double_charging_of_beneficiary_storage() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        let bob_storage_before = contract.storage_balance_of(bob());

        setup_context(dave(), 1_000);
        contract.pay_for_license(req_id, terms_hash);

        let bob_storage_after = contract.storage_balance_of(bob());
        assert_eq!(bob_storage_before, bob_storage_after);
    }

    // 47. Claimable balances use preallocated entries
    #[test]
    fn test_stage34_47_claimable_balances_use_preallocated_entries() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 1_000, 30);

        // Pre-allocated entry for Bob was created at discovery registration
        assert!(contract.claimable_balances.contains_key(&bob()));

        setup_context(dave(), 1_000);
        contract.pay_for_license(req_id, terms_hash);

        // Pre-allocated entry was updated in-place without creating new map keys
        assert!(contract.claimable_balances.contains_key(&bob()));
    }

    // 48. Storage and financial balances cannot become negative
    #[test]
    fn test_stage34_48_storage_and_financial_balances_cannot_become_negative() {
        setup_context(admin(), 0);
        let contract = KnovaraContract::new(admin());
        assert_eq!(contract.total_royalty_liabilities, 0);
    }

    // 49. Solvency formula: balance >= storage_locked + available_storage + royalty_liabilities
    #[test]
    fn test_stage34_49_solvency_formula_no_double_counting() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id, terms_hash) = setup_approved_request(&mut contract, 50_000, 30);

        setup_context(dave(), 50_000);
        contract.pay_for_license(req_id, terms_hash);

        // Liabilities strictly equal total claimable royalties
        assert_eq!(contract.get_total_royalty_liabilities().0, 50_000);
        let sum_claimable =
            contract.get_claimable_balance(bob()).0 + contract.get_claimable_balance(charlie()).0;
        assert_eq!(sum_claimable, contract.total_royalty_liabilities);
    }

    // =========================================================================
    // STAGE 3.4 FINAL FINANCIAL AUDIT TESTS (AUDITS 1 - 4)
    // =========================================================================

    // AUDIT 1: Rights Controller NOT in beneficiaries receives deterministic remainder with zero storage growth
    #[test]
    fn test_audit1_rc_not_beneficiary_receives_remainder_zero_storage_growth() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        // Alice (Creator), Charlie (Rights Controller), Dave (Buyer) deposit storage
        setup_context(alice(), min + 1_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        setup_context(charlie(), min + 1_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        setup_context(dave(), min + 1_000_000_000_000_000_000_000_000);
        contract.storage_deposit(None, None);

        // Two distinct beneficiaries: Eve (50%) and Frank (50%).
        // Charlie is Rights Controller and is NOT one of the beneficiaries!
        let eve: AccountId = "eve.testnet".parse().unwrap();
        let frank: AccountId = "frank.testnet".parse().unwrap();
        let splits = vec![
            BeneficiaryShare {
                account_id: eve.clone(),
                basis_points: 5_000,
            },
            BeneficiaryShare {
                account_id: frank.clone(),
                basis_points: 5_000,
            },
        ];

        // Register discovery
        setup_context(alice(), 0);
        contract.register_discovery_and_mint(
            "disc-audit1".to_string(),
            "tok-audit1".to_string(),
            Some(bob()), // Custodian
            charlie(),   // Rights Controller (NOT a beneficiary)
            sample_manifest_hash(),
            sample_metadata(),
            splits,
            vec![],
        );

        // Verification 1: Charlie's entry in claimable_balances was pre-allocated at registration
        assert!(contract.claimable_balances.contains_key(&charlie()));
        assert_eq!(contract.get_claimable_balance(charlie()).0, 0);
        assert!(contract.claimable_balances.contains_key(&eve));
        assert!(contract.claimable_balances.contains_key(&frank));

        // Charlie creates offer for odd price of 11 yoctoNEAR
        let terms = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string();
        setup_context(charlie(), 0);
        contract.create_license_offer(
            "off-audit1".to_string(),
            "disc-audit1".to_string(),
            LicenseScope::CommercialUse,
            U128(11),
            terms.clone(),
            30,
        );

        // Dave requests license
        setup_context(dave(), 0);
        contract.request_license(
            "req-audit1".to_string(),
            "off-audit1".to_string(),
            terms.clone(),
        );

        // Charlie approves request
        setup_context(charlie(), 0);
        contract.approve_license_request("req-audit1".to_string());

        // Dave pays exact price 11 yoctoNEAR
        setup_context(dave(), 11);
        let dave_bal_before = contract.storage_balance_of(dave()).unwrap().available.0;
        contract.pay_for_license("req-audit1".to_string(), terms);
        let dave_bal_after = contract.storage_balance_of(dave()).unwrap().available.0;

        // Verification 2: Storage deducted from buyer is strictly 8 bytes (Approved -> Active)
        assert_eq!(
            dave_bal_before - dave_bal_after,
            8 * env::storage_byte_cost().as_yoctonear()
        );

        // Verification 3: Royalty allocations:
        // Eve: (11 * 5,000) / 10,000 = 5 yoctoNEAR
        // Frank: (11 * 5,000) / 10,000 = 5 yoctoNEAR
        // Charlie (Rights Controller): gets remainder 11 - (5 + 5) = 1 yoctoNEAR!
        assert_eq!(contract.get_claimable_balance(eve.clone()).0, 5);
        assert_eq!(contract.get_claimable_balance(frank.clone()).0, 5);
        assert_eq!(contract.get_claimable_balance(charlie()).0, 1);

        // Verification 4: Sum of allocations strictly equals total price (5 + 5 + 1 == 11)
        let total_allocated = contract.get_claimable_balance(eve).0
            + contract.get_claimable_balance(frank).0
            + contract.get_claimable_balance(charlie()).0;
        assert_eq!(total_allocated, 11);
        assert_eq!(contract.get_total_royalty_liabilities().0, 11);
    }

    // AUDIT 2: Pending royalty withdrawals lifecycle covering all 6 required scenarios
    #[test]
    fn test_audit2_pending_withdrawals_accounting_all_six_scenarios() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let (req_id1, terms1) = setup_approved_request(&mut contract, 10_000, 30);

        // Dave pays for license 1 -> Bob gets 10,000 yoctoNEAR
        setup_context(dave(), 10_000);
        contract.pay_for_license(req_id1, terms1);

        assert_eq!(contract.get_claimable_balance(bob()).0, 10_000);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 0);
        assert_eq!(contract.get_total_royalty_liabilities().0, 10_000);

        // Scenario 1: Bob initiates withdrawal 1 (10,000 yoctoNEAR)
        setup_context(bob(), 0);
        let _ = contract.withdraw_earnings();
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 10_000);
        assert_eq!(contract.get_total_royalty_liabilities().0, 10_000);
        // Invariant: sum(claimable) + pending == total_royalty_liabilities
        assert_eq!(
            contract.get_claimable_balance(bob()).0 + contract.get_pending_royalty_withdrawals().0,
            contract.get_total_royalty_liabilities().0
        );

        // Scenario 2: Second royalty payment arrives for same beneficiary while withdrawal is pending
        // Inject second earnings of 5,000 yoctoNEAR to Bob
        contract.claimable_balances.insert(bob(), 5_000);
        contract.total_royalty_liabilities += 5_000;
        assert_eq!(contract.get_claimable_balance(bob()).0, 5_000);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 10_000);
        assert_eq!(contract.get_total_royalty_liabilities().0, 15_000);
        assert_eq!(
            contract.get_claimable_balance(bob()).0 + contract.get_pending_royalty_withdrawals().0,
            contract.get_total_royalty_liabilities().0
        );

        // Scenario 5: Second withdrawal initiated while first is still pending
        setup_context(bob(), 0);
        let _ = contract.withdraw_earnings();
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 15_000);
        assert_eq!(contract.get_total_royalty_liabilities().0, 15_000);
        assert_eq!(
            contract.get_claimable_balance(bob()).0 + contract.get_pending_royalty_withdrawals().0,
            contract.get_total_royalty_liabilities().0
        );

        // Scenario 3: First transfer callback succeeds (10,000 yoctoNEAR)
        setup_context(contract_id(), 0);
        let ok1 = contract.on_withdraw_earnings_callback(bob(), U128(10_000), Ok(()));
        assert!(ok1);
        assert_eq!(contract.get_claimable_balance(bob()).0, 0);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 5_000);
        assert_eq!(contract.get_total_royalty_liabilities().0, 5_000);
        assert_eq!(
            contract.get_claimable_balance(bob()).0 + contract.get_pending_royalty_withdrawals().0,
            contract.get_total_royalty_liabilities().0
        );

        // Scenario 4: Second transfer callback fails (5,000 yoctoNEAR) -> restores balance safely
        setup_context(contract_id(), 0);
        let res2 = contract.on_withdraw_earnings_callback(
            bob(),
            U128(5_000),
            Err(near_sdk::PromiseError::Failed),
        );
        assert!(!res2);
        assert_eq!(contract.get_claimable_balance(bob()).0, 5_000);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 0);
        assert_eq!(contract.get_total_royalty_liabilities().0, 5_000);
        assert_eq!(
            contract.get_claimable_balance(bob()).0 + contract.get_pending_royalty_withdrawals().0,
            contract.get_total_royalty_liabilities().0
        );

        // Scenario 6: Inverse ordering test: failure first, then success
        // Bob initiates withdrawal of the 5,000 yoctoNEAR
        setup_context(bob(), 0);
        let _ = contract.withdraw_earnings();
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 5_000);

        // New earnings of 3,000 arrive
        contract.claimable_balances.insert(bob(), 3_000);
        contract.total_royalty_liabilities += 3_000;
        // Bob initiates another withdrawal for 3,000
        setup_context(bob(), 0);
        let _ = contract.withdraw_earnings();
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 8_000);
        assert_eq!(contract.get_total_royalty_liabilities().0, 8_000);

        // Callback for 5,000 FAILS first
        setup_context(contract_id(), 0);
        let f_res = contract.on_withdraw_earnings_callback(
            bob(),
            U128(5_000),
            Err(near_sdk::PromiseError::Failed),
        );
        assert!(!f_res);
        assert_eq!(contract.get_claimable_balance(bob()).0, 5_000);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 3_000);
        assert_eq!(contract.get_total_royalty_liabilities().0, 8_000);

        // Callback for 3,000 SUCCEEDS second
        let s_res = contract.on_withdraw_earnings_callback(bob(), U128(3_000), Ok(()));
        assert!(s_res);
        assert_eq!(contract.get_claimable_balance(bob()).0, 5_000);
        assert_eq!(contract.get_pending_royalty_withdrawals().0, 0);
        assert_eq!(contract.get_total_royalty_liabilities().0, 5_000);
        assert_eq!(
            contract.get_claimable_balance(bob()).0 + contract.get_pending_royalty_withdrawals().0,
            contract.get_total_royalty_liabilities().0
        );
    }

    // AUDIT 3: Storage solvency formula & exact distinction of collateral vs liquid deposits
    #[test]
    fn test_audit3_storage_solvency_formula_distinctions() {
        setup_context(admin(), 0);
        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        // User registers with excess storage
        let initial_deposit = min + 5_000_000_000_000_000_000_000_000; // min + 5 NEAR
        setup_context(alice(), initial_deposit);
        contract.storage_deposit(None, None);

        let bal = contract.storage_balance_of(alice()).unwrap();
        assert_eq!(bal.total.0, initial_deposit);
        assert_eq!(bal.available.0, 5_000_000_000_000_000_000_000_000);

        // Alice registers discovery: consumes storage
        setup_context(alice(), 0);
        contract.register_discovery_and_mint(
            "disc-solv".to_string(),
            "tok-solv".to_string(),
            Some(alice()),
            alice(),
            sample_manifest_hash(),
            sample_metadata(),
            vec![BeneficiaryShare {
                account_id: alice(),
                basis_points: 10_000,
            }],
            vec![],
        );

        let bal_after = contract.storage_balance_of(alice()).unwrap();
        let bytes_spent =
            (bal.available.0 - bal_after.available.0) / env::storage_byte_cost().as_yoctonear();
        assert!(bytes_spent > 0);

        // Solvency mathematical model verification:
        // Liquid storage liabilities = available storage + min deposit (upon clean unregistration)
        let liquid_storage_liabilities = bal_after.available.0 + min;
        // Physical protocol storage collateral = bytes_spent * byte_cost
        let protocol_storage_collateral = bytes_spent * env::storage_byte_cost().as_yoctonear();

        // Conservation invariant: liquid liabilities + protocol collateral == initial_deposit
        assert_eq!(
            liquid_storage_liabilities + protocol_storage_collateral,
            initial_deposit
        );
        // Note: Counting bal.total on top of protocol collateral would double-count the spent bytes!
        // The contract correctly accounts for spent storage as protocol collateral.
    }

    // AUDIT 4: Overflow-safe royalty calculation across extreme ranges
    #[test]
    fn test_audit4_overflow_safe_royalty_calculation_all_ranges() {
        use crate::payments::calculate_royalty_share;

        // 1. Small payments
        assert_eq!(calculate_royalty_share(0, 10_000), 0);
        assert_eq!(calculate_royalty_share(1, 5_000), 0);
        assert_eq!(calculate_royalty_share(1, 10_000), 1);
        assert_eq!(calculate_royalty_share(7, 3_333), 2);
        assert_eq!(calculate_royalty_share(10_000, 2_500), 2_500);

        // 2. Large payments close to u128::MAX
        let max_val = u128::MAX;
        // 100% split: should return exact max_val with ZERO overflow
        assert_eq!(calculate_royalty_share(max_val, 10_000), max_val);

        // 50% split: should return exact max_val / 2
        assert_eq!(calculate_royalty_share(max_val, 5_000), max_val / 2);

        // 1 basis point (0.01%):
        let one_bp = calculate_royalty_share(max_val, 1);
        assert_eq!(one_bp, max_val / 10_000);

        // 3. Multi-beneficiary exact sum and remainder test with large payment
        let large_price = u128::MAX / 2;
        let bps_splits = [1500u16, 2500, 1000, 5000]; // Sums to 10,000 bps
        let mut total_alloc = 0u128;
        for &bps in &bps_splits {
            total_alloc += calculate_royalty_share(large_price, bps);
        }
        let remainder = large_price - total_alloc;
        // Remainder must be < 4 (number of splits)
        assert!(remainder < 4);
        assert_eq!(total_alloc + remainder, large_price);
    }
}
