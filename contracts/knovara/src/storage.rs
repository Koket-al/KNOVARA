use near_sdk::json_types::U128;
use near_sdk::{assert_one_yocto, env, near, require, AccountId, NearToken, Promise};

use crate::{KnovaraContract, KnovaraContractExt};

/// Internal persistent storage balance record.
///
/// `total` tracks the lifetime storage capital deposited for this account.
/// `available` represents the withdrawable/spendable storage capital that is
/// not currently committed to backing persistent state.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StorageBalanceInternal {
    pub total: u128,
    pub available: u128,
}

/// Internal account dependency counters.
///
/// Protects accounts from unregistering while persistent records
/// (discoveries, licenses, royalties) in the contract still depend on them.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct AccountDependencyCounts {
    pub custodian_count: u32,
    pub rights_controller_count: u32,
    pub beneficiary_reference_count: u32,
    pub persistent_license_count: u32,
    pub active_license_count: u32,
}

impl AccountDependencyCounts {
    pub fn is_empty(&self) -> bool {
        self.custodian_count == 0
            && self.rights_controller_count == 0
            && self.beneficiary_reference_count == 0
            && self.persistent_license_count == 0
            && self.active_license_count == 0
    }

    pub fn increment_custodian(&mut self) {
        self.custodian_count = self
            .custodian_count
            .checked_add(1)
            .expect("ERR_CUSTODIAN_COUNT_OVERFLOW");
    }

    pub fn decrement_custodian(&mut self) {
        self.custodian_count = self
            .custodian_count
            .checked_sub(1)
            .expect("ERR_CUSTODIAN_COUNT_UNDERFLOW");
    }

    pub fn increment_rights_controller(&mut self) {
        self.rights_controller_count = self
            .rights_controller_count
            .checked_add(1)
            .expect("ERR_RIGHTS_CONTROLLER_COUNT_OVERFLOW");
    }

    pub fn decrement_rights_controller(&mut self) {
        self.rights_controller_count = self
            .rights_controller_count
            .checked_sub(1)
            .expect("ERR_RIGHTS_CONTROLLER_COUNT_UNDERFLOW");
    }

    pub fn increment_beneficiary(&mut self) {
        self.beneficiary_reference_count = self
            .beneficiary_reference_count
            .checked_add(1)
            .expect("ERR_BENEFICIARY_COUNT_OVERFLOW");
    }

    pub fn decrement_beneficiary(&mut self) {
        self.beneficiary_reference_count = self
            .beneficiary_reference_count
            .checked_sub(1)
            .expect("ERR_BENEFICIARY_COUNT_UNDERFLOW");
    }

    pub fn increment_persistent_license(&mut self) {
        self.persistent_license_count = self
            .persistent_license_count
            .checked_add(1)
            .expect("ERR_PERSISTENT_LICENSE_COUNT_OVERFLOW");
    }

    pub fn decrement_persistent_license(&mut self) {
        self.persistent_license_count = self
            .persistent_license_count
            .checked_sub(1)
            .expect("ERR_PERSISTENT_LICENSE_COUNT_UNDERFLOW");
    }

    pub fn increment_active_license(&mut self) {
        self.active_license_count = self
            .active_license_count
            .checked_add(1)
            .expect("ERR_ACTIVE_LICENSE_COUNT_OVERFLOW");
    }

    pub fn decrement_active_license(&mut self) {
        self.active_license_count = self
            .active_license_count
            .checked_sub(1)
            .expect("ERR_ACTIVE_LICENSE_COUNT_UNDERFLOW");
    }
}

/// External JSON view for NEP-145 storage balance.
#[near(serializers = [json])]
#[derive(Debug, PartialEq, Eq)]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

/// External JSON view for NEP-145 storage balance bounds.
#[near(serializers = [json])]
#[derive(Debug, PartialEq, Eq)]
pub struct StorageBalanceBounds {
    pub min: U128,
    pub max: Option<U128>,
}

#[near]
impl KnovaraContract {
    /// NEP-145 storage deposit method.
    ///
    /// Registers an account or tops up storage funds.
    /// Supports `registration_only`:
    /// - If the account is already registered, refunds the full attached deposit.
    /// - If registering for the first time, charges the minimum registration deposit
    ///   and refunds any excess above the minimum.
    ///
    /// If an account already has an `AccountDependencyCounts` record (sponsored previously),
    /// that record is strictly preserved and not overwritten.
    #[payable]
    pub fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        let account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        let attached = env::attached_deposit().as_yoctonear();
        let registration_only = registration_only.unwrap_or(false);

        if let Some(balance) = self.storage_balances.get_mut(&account_id) {
            // Case A: Account is already registered
            if registration_only {
                // Refund entire attached deposit to predecessor
                if attached > 0 {
                    let _ = Promise::new(env::predecessor_account_id())
                        .transfer(NearToken::from_yoctonear(attached))
                        .then(
                            Self::ext(env::current_account_id())
                                .on_storage_deposit_refund_callback(
                                    account_id.clone(),
                                    U128(attached),
                                ),
                        );
                }
                StorageBalance {
                    total: U128(balance.total),
                    available: U128(balance.available),
                }
            } else {
                require!(
                    attached > 0,
                    "ERR_DEPOSIT_IS_ZERO: Attached deposit must be greater than zero for top-up"
                );
                balance.total = balance
                    .total
                    .checked_add(attached)
                    .expect("ERR_DEPOSIT_OVERFLOW");
                balance.available = balance
                    .available
                    .checked_add(attached)
                    .expect("ERR_DEPOSIT_OVERFLOW");

                StorageBalance {
                    total: U128(balance.total),
                    available: U128(balance.available),
                }
            }
        } else {
            // Case B: Account is not yet registered
            let required_min = self.storage_min_deposit;

            require!(
                attached >= required_min,
                "ERR_DEPOSIT_LESS_THAN_MIN: Attached deposit is less than required minimum registration deposit"
            );

            // Preserve existing sponsored dependency counts; only insert if absent
            if !self.account_dependency_counts.contains_key(&account_id) {
                self.account_dependency_counts
                    .insert(account_id.clone(), AccountDependencyCounts::default());
            }

            if registration_only {
                let total = required_min;
                let available = 0; // required_min is locked to cover registration storage
                let excess = attached.checked_sub(required_min).expect("ERR_UNDERFLOW");

                self.storage_balances.insert(
                    account_id.clone(),
                    StorageBalanceInternal { total, available },
                );

                if excess > 0 {
                    let _ = Promise::new(env::predecessor_account_id())
                        .transfer(NearToken::from_yoctonear(excess))
                        .then(
                            Self::ext(env::current_account_id())
                                .on_storage_deposit_refund_callback(
                                    account_id.clone(),
                                    U128(excess),
                                ),
                        );
                }

                StorageBalance {
                    total: U128(total),
                    available: U128(available),
                }
            } else {
                let total = attached;
                let available = attached.checked_sub(required_min).expect("ERR_UNDERFLOW");

                self.storage_balances.insert(
                    account_id.clone(),
                    StorageBalanceInternal { total, available },
                );

                StorageBalance {
                    total: U128(total),
                    available: U128(available),
                }
            }
        }
    }

    /// NEP-145 storage withdraw method.
    ///
    /// Requires an attached deposit of exactly 1 yoctoNEAR.
    /// Allows withdrawing funds exclusively from `available`.
    /// If `amount` is omitted, withdraws the entire available balance.
    ///
    /// IMPORTANT: Successful withdrawal decreases `available` while `total` remains unchanged.
    #[payable]
    pub fn storage_withdraw(&mut self, amount: Option<U128>) -> StorageBalance {
        assert_one_yocto();
        let caller = env::predecessor_account_id();

        let balance = self
            .storage_balances
            .get_mut(&caller)
            .expect("ERR_ACCOUNT_NOT_REGISTERED");

        let withdraw_amount = amount.map(|a| a.0).unwrap_or(balance.available);

        require!(
            withdraw_amount <= balance.available,
            "ERR_WITHDRAW_EXCEEDS_AVAILABLE: Requested amount exceeds available storage balance"
        );

        if withdraw_amount > 0 {
            balance.available = balance
                .available
                .checked_sub(withdraw_amount)
                .expect("ERR_WITHDRAW_UNDERFLOW");

            // Dispatch transfer promise with rollback callback
            let _ = Promise::new(caller.clone())
                .transfer(NearToken::from_yoctonear(withdraw_amount))
                .then(
                    Self::ext(env::current_account_id())
                        .on_storage_withdraw_callback(caller, U128(withdraw_amount)),
                );
        }

        StorageBalance {
            total: U128(balance.total),
            available: U128(balance.available),
        }
    }

    /// NEP-145 storage unregister method.
    ///
    /// Requires an attached deposit of exactly 1 yoctoNEAR.
    /// Returns false if the account is not registered.
    ///
    /// An account can only be unregistered if all dependency counters are zero.
    /// Forced unregistration (`force: true`) is strictly unsupported in MVP.
    #[payable]
    pub fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        assert_one_yocto();
        let caller = env::predecessor_account_id();

        if force == Some(true) {
            env::panic_str(
                "ERR_FORCE_UNREGISTER_UNSUPPORTED: Forced unregistration is not supported in MVP.",
            );
        }

        if !self.storage_balances.contains_key(&caller) {
            // Refund 1 yoctoNEAR attached deposit
            let _ = Promise::new(caller).transfer(NearToken::from_yoctonear(1));
            return false;
        }

        // Check dependency counters: must be empty
        if let Some(deps) = self.account_dependency_counts.get(&caller) {
            require!(
                deps.is_empty(),
                "ERR_ACCOUNT_HAS_ACTIVE_DEPENDENCIES: Cannot unregister account with active dependencies"
            );
        }

        let removed_balance = self
            .storage_balances
            .remove(&caller)
            .expect("ERR_ACCOUNT_NOT_REGISTERED");

        let removed_deps = self.account_dependency_counts.remove(&caller);

        // Compute unwithdrawn storage capital belonging to this account in the contract.
        // If the account has lifetime deposits `total` and withdrew some of it, `total` remained
        // unchanged to preserve the deposit record invariant, while `available` was reduced.
        // The remaining eligible refund in the contract is `available + locked_registration_fee`,
        // bounded by `total`.
        let locked_registration_fee = if removed_balance.total >= self.storage_min_deposit {
            self.storage_min_deposit
        } else {
            removed_balance.total
        };

        let eligible_refund = std::cmp::min(
            removed_balance.total,
            removed_balance
                .available
                .checked_add(locked_registration_fee)
                .expect("ERR_REFUND_OVERFLOW"),
        );

        // Refund eligible deposited storage funds plus the 1 yoctoNEAR security deposit
        let refund_amount = eligible_refund.checked_add(1).expect("ERR_REFUND_OVERFLOW");

        let _ = Promise::new(caller.clone())
            .transfer(NearToken::from_yoctonear(refund_amount))
            .then(
                Self::ext(env::current_account_id()).on_storage_unregister_callback(
                    caller,
                    removed_balance,
                    removed_deps,
                ),
            );

        true
    }

    /// NEP-145 storage balance query.
    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.storage_balances
            .get(&account_id)
            .map(|b| StorageBalance {
                total: U128(b.total),
                available: U128(b.available),
            })
    }

    /// NEP-145 storage balance bounds query.
    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        StorageBalanceBounds {
            min: U128(self.storage_min_deposit),
            max: None,
        }
    }

    // -------------------------------------------------------------
    // PRIVATE CALLBACK METHODS FOR ASYNCHRONOUS FAILURE RECOVERY
    // -------------------------------------------------------------

    /// Callback for storage deposit excess/full refund.
    /// If the transfer promise failed, restores the refunded amount back to the account.
    /// If the account record is missing, inserts it so user credit is never permanently lost.
    #[private]
    pub fn on_storage_deposit_refund_callback(
        &mut self,
        account_id: AccountId,
        refund_amount: U128,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) -> bool {
        near_sdk::assert_self();
        if result.is_err() {
            if let Some(balance) = self.storage_balances.get_mut(&account_id) {
                balance.total = balance
                    .total
                    .checked_add(refund_amount.0)
                    .expect("ERR_RESTORE_OVERFLOW");
                balance.available = balance
                    .available
                    .checked_add(refund_amount.0)
                    .expect("ERR_RESTORE_OVERFLOW");
            } else {
                self.storage_balances.insert(
                    account_id,
                    StorageBalanceInternal {
                        total: refund_amount.0,
                        available: refund_amount.0,
                    },
                );
            }
            false
        } else {
            true
        }
    }

    /// Callback for storage withdrawal.
    /// If the transfer promise failed, restores `available` balance.
    /// If the account record is missing, recreates it so funds are never lost.
    #[private]
    pub fn on_storage_withdraw_callback(
        &mut self,
        account_id: AccountId,
        withdrawn_amount: U128,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) -> bool {
        near_sdk::assert_self();
        if result.is_err() {
            if let Some(balance) = self.storage_balances.get_mut(&account_id) {
                balance.available = balance
                    .available
                    .checked_add(withdrawn_amount.0)
                    .expect("ERR_RESTORE_OVERFLOW");
            } else {
                self.storage_balances.insert(
                    account_id,
                    StorageBalanceInternal {
                        total: withdrawn_amount.0,
                        available: withdrawn_amount.0,
                    },
                );
            }
            false
        } else {
            true
        }
    }

    /// Callback for storage unregistration refund.
    /// If the transfer promise failed, restores account records so capital is not lost.
    /// Guarantees that a failed callback cannot overwrite a newer dependency record or balance.
    #[private]
    pub fn on_storage_unregister_callback(
        &mut self,
        account_id: AccountId,
        balance: StorageBalanceInternal,
        deps: Option<AccountDependencyCounts>,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) -> bool {
        near_sdk::assert_self();
        if result.is_err() {
            if let Some(existing) = self.storage_balances.get_mut(&account_id) {
                // Account was re-registered while the unregistration refund transfer was in flight.
                // Both deposits are accounted for in lifetime total:
                existing.total = existing
                    .total
                    .checked_add(balance.total)
                    .expect("ERR_RESTORE_OVERFLOW");

                // Exactly one `storage_min_deposit` is required to cover the active persistent storage collateral.
                // The failed unregister restores the unwithdrawn funds from `balance`, which includes
                // its `available` balance PLUS the registration collateral freed when it unregistered:
                let freed_collateral = if balance.total >= self.storage_min_deposit {
                    self.storage_min_deposit
                } else {
                    balance.total
                };

                let restored_available = balance
                    .available
                    .checked_add(freed_collateral)
                    .expect("ERR_RESTORE_OVERFLOW");

                existing.available = existing
                    .available
                    .checked_add(restored_available)
                    .expect("ERR_RESTORE_OVERFLOW");
            } else {
                self.storage_balances.insert(account_id.clone(), balance);
            }

            if let Some(d) = deps {
                if let Some(existing_deps) = self.account_dependency_counts.get_mut(&account_id) {
                    existing_deps.custodian_count = existing_deps
                        .custodian_count
                        .checked_add(d.custodian_count)
                        .expect("ERR_OVERFLOW");
                    existing_deps.rights_controller_count = existing_deps
                        .rights_controller_count
                        .checked_add(d.rights_controller_count)
                        .expect("ERR_OVERFLOW");
                    existing_deps.beneficiary_reference_count = existing_deps
                        .beneficiary_reference_count
                        .checked_add(d.beneficiary_reference_count)
                        .expect("ERR_OVERFLOW");
                    existing_deps.persistent_license_count = existing_deps
                        .persistent_license_count
                        .checked_add(d.persistent_license_count)
                        .expect("ERR_OVERFLOW");
                    existing_deps.active_license_count = existing_deps
                        .active_license_count
                        .checked_add(d.active_license_count)
                        .expect("ERR_OVERFLOW");
                } else {
                    self.account_dependency_counts.insert(account_id, d);
                }
            }
            false
        } else {
            true
        }
    }
}
