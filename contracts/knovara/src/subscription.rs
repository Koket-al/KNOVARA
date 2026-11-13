use near_sdk::json_types::{U128, U64};
use near_sdk::{env, near, require, AccountId, Timestamp};

use crate::discovery::{parse_hex_32, to_hex_32};
use crate::payments::calculate_royalty_share;
use crate::storage::AccountDependencyCounts;
use crate::{events, KnovaraContract, KnovaraContractExt};

/// 30 days in nanoseconds (30 * 86,400 * 1,000,000,000)
pub const THIRTY_DAYS_NANOS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000;

/// Subscription status state machine.
#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum SubscriptionStatus {
    Active {
        activated_at: Timestamp,
        expires_at: Timestamp,
    },
    Expired,
}

/// Internal persistent representation of an API subscription offer.
#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct ApiSubscriptionOfferInternal {
    pub offer_id: String,
    pub discovery_id: String,
    pub token_id: String,
    pub rights_controller_id: AccountId,
    pub api_product_id: String,
    pub openapi_spec_hash: [u8; 32],
    pub terms_hash: [u8; 32],
    pub price_yocto: u128,
    pub duration_days: u32, // Fixed at 30 days
    pub created_at: Timestamp,
    pub is_active: bool,
}

/// External JSON view for an API subscription offer.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ApiSubscriptionOfferView {
    pub offer_id: String,
    pub discovery_id: String,
    pub token_id: String,
    pub rights_controller_id: AccountId,
    pub api_product_id: String,
    pub openapi_spec_hash: String, // 64 hex characters
    pub terms_hash: String,        // 64 hex characters
    pub price_yocto: U128,
    pub duration_days: u32,
    pub created_at: U64,
    pub is_active: bool,
}

/// Internal persistent representation of an active API subscription record.
#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct SubscriptionRecordInternal {
    pub subscription_id: String,
    pub offer_id: String,
    pub discovery_id: String,
    pub token_id: String,
    pub subscriber_id: AccountId,
    pub api_product_id: String,
    pub openapi_spec_hash: [u8; 32],
    pub accepted_terms_hash: [u8; 32],
    pub price_yocto: u128,
    pub activated_at: Timestamp,
    pub expires_at: Timestamp,
    pub status: SubscriptionStatus,
}

/// External JSON view for an API subscription record.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SubscriptionRecordView {
    pub subscription_id: String,
    pub offer_id: String,
    pub discovery_id: String,
    pub token_id: String,
    pub subscriber_id: AccountId,
    pub api_product_id: String,
    pub openapi_spec_hash: String,
    pub accepted_terms_hash: String,
    pub price_yocto: U128,
    pub activated_at: U64,
    pub expires_at: U64,
    pub status: SubscriptionStatus,
}

#[near]
impl KnovaraContract {
    /// Creates a direct API subscription offer authorized by the Rights Controller.
    ///
    /// Fixed at 30 days duration. Requires exact terms hash and OpenAPI spec SHA-256 digest.
    pub fn create_api_subscription_offer(
        &mut self,
        offer_id: String,
        discovery_id: String,
        api_product_id: String,
        openapi_spec_hash: String,
        terms_hash: String,
        price_yocto: U128,
    ) -> ApiSubscriptionOfferView {
        let caller = env::predecessor_account_id();

        require!(
            !offer_id.trim().is_empty(),
            "ERR_INVALID_OFFER_ID: Offer ID cannot be empty"
        );
        require!(
            !api_product_id.trim().is_empty(),
            "ERR_INVALID_API_PRODUCT_ID: API product ID cannot be empty"
        );
        require!(
            !self.api_subscription_offers.contains_key(&offer_id),
            "ERR_OFFER_ALREADY_EXISTS: An API subscription offer with this ID already exists"
        );

        let token_id = self
            .discovery_to_token
            .get(&discovery_id)
            .cloned()
            .expect("ERR_DISCOVERY_NOT_FOUND: Discovery record does not exist");

        let discovery = self
            .tokens_by_id
            .get(&token_id)
            .cloned()
            .expect("ERR_DISCOVERY_RECORD_NOT_FOUND");

        require!(
            caller == discovery.rights_controller_id,
            "ERR_UNAUTHORIZED_RIGHTS_CONTROLLER: Only the designated rights controller may create an API subscription offer"
        );

        let price = price_yocto.0;
        require!(
            price > 0,
            "ERR_INVALID_PRICE: Subscription price must be greater than zero"
        );

        let spec_hash_bytes = parse_hex_32(&openapi_spec_hash);
        let terms_hash_bytes = parse_hex_32(&terms_hash);
        let created_at = env::block_timestamp();

        let offer = ApiSubscriptionOfferInternal {
            offer_id: offer_id.clone(),
            discovery_id: discovery_id.clone(),
            token_id: token_id.clone(),
            rights_controller_id: caller.clone(),
            api_product_id: api_product_id.clone(),
            openapi_spec_hash: spec_hash_bytes,
            terms_hash: terms_hash_bytes,
            price_yocto: price,
            duration_days: 30,
            created_at,
            is_active: true,
        };

        self.api_subscription_offers.insert(offer_id.clone(), offer);

        let mut disc_offers = self
            .discovery_to_subscription_offers
            .get(&discovery_id)
            .cloned()
            .unwrap_or_default();
        disc_offers.push(offer_id.clone());
        self.discovery_to_subscription_offers
            .insert(discovery_id.clone(), disc_offers);

        events::log_subscription_offer_created(
            &offer_id,
            &discovery_id,
            &caller,
            &api_product_id,
            price,
            &terms_hash,
            &openapi_spec_hash,
            30,
        );

        ApiSubscriptionOfferView {
            offer_id,
            discovery_id,
            token_id,
            rights_controller_id: caller,
            api_product_id,
            openapi_spec_hash: to_hex_32(&spec_hash_bytes),
            terms_hash: to_hex_32(&terms_hash_bytes),
            price_yocto,
            duration_days: 30,
            created_at: U64(created_at),
            is_active: true,
        }
    }

    /// Atomically purchases and activates a 30-day API subscription offer.
    ///
    /// Requirements:
    /// - Caller must be direct signer (`env::signer_account_id() == env::predecessor_account_id()`).
    /// - Offer must exist and be active.
    /// - Accepted terms hash must match offer terms hash.
    /// - Attached deposit must equal exact offer price.
    /// - Distributes 100% of payment into `claimable_balances` using pull-payment royalty logic.
    /// - Sets status directly to `Active { activated_at, expires_at }`.
    #[payable]
    pub fn subscribe_to_offer(
        &mut self,
        subscription_id: String,
        offer_id: String,
        accepted_terms_hash: String,
    ) -> SubscriptionRecordView {
        let subscriber = env::predecessor_account_id();
        let signer = env::signer_account_id();

        require!(
            subscriber == signer,
            "ERR_SIGNER_MUST_BE_SUBSCRIBER: Direct dedicated agent account must sign subscription payment"
        );
        require!(
            !subscription_id.trim().is_empty(),
            "ERR_INVALID_SUBSCRIPTION_ID: Subscription ID cannot be empty"
        );
        require!(
            !self.subscription_records.contains_key(&subscription_id),
            "ERR_SUBSCRIPTION_EXISTS: A subscription with this ID already exists"
        );

        let offer = self
            .api_subscription_offers
            .get(&offer_id)
            .cloned()
            .expect("ERR_OFFER_NOT_FOUND: Referenced API subscription offer does not exist");

        require!(
            offer.is_active,
            "ERR_OFFER_INACTIVE: This subscription offer is no longer active"
        );

        let accepted_bytes = parse_hex_32(&accepted_terms_hash);
        require!(
            accepted_bytes == offer.terms_hash,
            "ERR_TERMS_HASH_MISMATCH: Accepted terms hash does not match published offer terms hash"
        );

        let attached_yocto = env::attached_deposit().as_yoctonear();
        require!(
            attached_yocto == offer.price_yocto,
            format!(
                "ERR_EXACT_PAYMENT_REQUIRED: Attached deposit ({}) must equal offer price ({}) exactly",
                attached_yocto, offer.price_yocto
            )
        );

        let discovery = self
            .tokens_by_id
            .get(&offer.token_id)
            .cloned()
            .expect("ERR_DISCOVERY_RECORD_NOT_FOUND");

        // Verify preallocated claimable balance entries for all beneficiaries and rights controller
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

        let now = env::block_timestamp();
        let expires_at = now
            .checked_add(THIRTY_DAYS_NANOS)
            .expect("ERR_TIMESTAMP_OVERFLOW: Expiration timestamp overflowed");

        // Distribute royalties to beneficiaries with deterministic remainder rule
        let mut total_allocated: u128 = 0;
        let total_price = offer.price_yocto;

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

        self.total_royalty_liabilities = self
            .total_royalty_liabilities
            .checked_add(total_price)
            .expect("ERR_TOTAL_LIABILITIES_OVERFLOW");

        // Update subscriber dependency counts
        if let Some(deps) = self.account_dependency_counts.get_mut(&subscriber) {
            deps.increment_active_license();
        } else {
            let mut deps = AccountDependencyCounts::default();
            deps.increment_active_license();
            self.account_dependency_counts.insert(subscriber.clone(), deps);
        }

        let record = SubscriptionRecordInternal {
            subscription_id: subscription_id.clone(),
            offer_id: offer_id.clone(),
            discovery_id: offer.discovery_id.clone(),
            token_id: offer.token_id.clone(),
            subscriber_id: subscriber.clone(),
            api_product_id: offer.api_product_id.clone(),
            openapi_spec_hash: offer.openapi_spec_hash,
            accepted_terms_hash: accepted_bytes,
            price_yocto: offer.price_yocto,
            activated_at: now,
            expires_at,
            status: SubscriptionStatus::Active {
                activated_at: now,
                expires_at,
            },
        };

        self.subscription_records
            .insert(subscription_id.clone(), record);

        let mut agent_subs = self
            .agent_to_subscriptions
            .get(&subscriber)
            .cloned()
            .unwrap_or_default();
        agent_subs.push(subscription_id.clone());
        self.agent_to_subscriptions
            .insert(subscriber.clone(), agent_subs);

        events::log_subscription_activated(
            &subscription_id,
            &offer_id,
            &offer.discovery_id,
            &subscriber,
            &offer.api_product_id,
            offer.price_yocto,
            now,
            expires_at,
        );

        SubscriptionRecordView {
            subscription_id,
            offer_id,
            discovery_id: offer.discovery_id,
            token_id: offer.token_id,
            subscriber_id: subscriber,
            api_product_id: offer.api_product_id,
            openapi_spec_hash: to_hex_32(&offer.openapi_spec_hash),
            accepted_terms_hash: to_hex_32(&accepted_bytes),
            price_yocto: U128(offer.price_yocto),
            activated_at: U64(now),
            expires_at: U64(expires_at),
            status: SubscriptionStatus::Active {
                activated_at: now,
                expires_at,
            },
        }
    }

    /// Renews an active or recently expired subscription for another 30-day period.
    #[payable]
    pub fn renew_subscription(
        &mut self,
        subscription_id: String,
        accepted_terms_hash: String,
    ) -> SubscriptionRecordView {
        let caller = env::predecessor_account_id();
        let attached_yocto = env::attached_deposit().as_yoctonear();

        let mut record = self
            .subscription_records
            .get(&subscription_id)
            .cloned()
            .expect("ERR_SUBSCRIPTION_NOT_FOUND: The subscription does not exist");

        require!(
            caller == record.subscriber_id,
            "ERR_UNAUTHORIZED_SUBSCRIBER: Only the recorded subscriber agent may renew"
        );

        let accepted_bytes = parse_hex_32(&accepted_terms_hash);
        require!(
            accepted_bytes == record.accepted_terms_hash,
            "ERR_TERMS_HASH_MISMATCH: Accepted terms hash does not match confirmed subscription terms"
        );

        require!(
            attached_yocto == record.price_yocto,
            format!(
                "ERR_EXACT_PAYMENT_REQUIRED: Attached deposit ({}) must equal subscription price ({}) exactly",
                attached_yocto, record.price_yocto
            )
        );

        let discovery = self
            .tokens_by_id
            .get(&record.token_id)
            .cloned()
            .expect("ERR_DISCOVERY_RECORD_NOT_FOUND");

        let now = env::block_timestamp();
        let new_expires_at = if record.expires_at > now {
            record
                .expires_at
                .checked_add(THIRTY_DAYS_NANOS)
                .expect("ERR_TIMESTAMP_OVERFLOW")
        } else {
            now.checked_add(THIRTY_DAYS_NANOS)
                .expect("ERR_TIMESTAMP_OVERFLOW")
        };

        // Royalty allocation
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

        self.total_royalty_liabilities = self
            .total_royalty_liabilities
            .checked_add(total_price)
            .expect("ERR_TOTAL_LIABILITIES_OVERFLOW");

        record.expires_at = new_expires_at;
        record.status = SubscriptionStatus::Active {
            activated_at: now,
            expires_at: new_expires_at,
        };

        self.subscription_records
            .insert(subscription_id.clone(), record.clone());

        events::log_subscription_renewed(
            &subscription_id,
            &caller,
            record.price_yocto,
            new_expires_at,
        );

        SubscriptionRecordView {
            subscription_id: record.subscription_id,
            offer_id: record.offer_id,
            discovery_id: record.discovery_id,
            token_id: record.token_id,
            subscriber_id: record.subscriber_id,
            api_product_id: record.api_product_id,
            openapi_spec_hash: to_hex_32(&record.openapi_spec_hash),
            accepted_terms_hash: to_hex_32(&record.accepted_terms_hash),
            price_yocto: U128(record.price_yocto),
            activated_at: U64(record.activated_at),
            expires_at: U64(new_expires_at),
            status: record.status,
        }
    }

    /// Read-only view for an API subscription offer by offer ID.
    pub fn get_api_subscription_offer(
        &self,
        offer_id: String,
    ) -> Option<ApiSubscriptionOfferView> {
        self.api_subscription_offers
            .get(&offer_id)
            .map(|o| ApiSubscriptionOfferView {
                offer_id: o.offer_id.clone(),
                discovery_id: o.discovery_id.clone(),
                token_id: o.token_id.clone(),
                rights_controller_id: o.rights_controller_id.clone(),
                api_product_id: o.api_product_id.clone(),
                openapi_spec_hash: to_hex_32(&o.openapi_spec_hash),
                terms_hash: to_hex_32(&o.terms_hash),
                price_yocto: U128(o.price_yocto),
                duration_days: o.duration_days,
                created_at: U64(o.created_at),
                is_active: o.is_active,
            })
    }

    /// Read-only view for all API subscription offers for a discovery.
    pub fn get_subscription_offers_by_discovery(
        &self,
        discovery_id: String,
    ) -> Vec<ApiSubscriptionOfferView> {
        let offer_ids = self
            .discovery_to_subscription_offers
            .get(&discovery_id)
            .cloned()
            .unwrap_or_default();

        offer_ids
            .into_iter()
            .filter_map(|id| self.get_api_subscription_offer(id))
            .collect()
    }

    /// Read-only view for an API subscription record by subscription ID.
    pub fn get_subscription(&self, subscription_id: String) -> Option<SubscriptionRecordView> {
        self.subscription_records
            .get(&subscription_id)
            .map(|s| {
                let now = env::block_timestamp();
                let status = match s.status {
                    SubscriptionStatus::Active { expires_at, .. } if now > expires_at => {
                        SubscriptionStatus::Expired
                    }
                    ref st => st.clone(),
                };

                SubscriptionRecordView {
                    subscription_id: s.subscription_id.clone(),
                    offer_id: s.offer_id.clone(),
                    discovery_id: s.discovery_id.clone(),
                    token_id: s.token_id.clone(),
                    subscriber_id: s.subscriber_id.clone(),
                    api_product_id: s.api_product_id.clone(),
                    openapi_spec_hash: to_hex_32(&s.openapi_spec_hash),
                    accepted_terms_hash: to_hex_32(&s.accepted_terms_hash),
                    price_yocto: U128(s.price_yocto),
                    activated_at: U64(s.activated_at),
                    expires_at: U64(s.expires_at),
                    status,
                }
            })
    }

    /// Read-only view for all subscriptions held by an agent account.
    pub fn get_subscriptions_by_agent(
        &self,
        agent_id: AccountId,
    ) -> Vec<SubscriptionRecordView> {
        let sub_ids = self
            .agent_to_subscriptions
            .get(&agent_id)
            .cloned()
            .unwrap_or_default();

        sub_ids
            .into_iter()
            .filter_map(|id| self.get_subscription(id))
            .collect()
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;
    use near_sdk::NearToken;
    use crate::discovery::BeneficiaryShare;

    fn admin() -> AccountId { "admin.testnet".parse().unwrap() }
    fn alice() -> AccountId { "alice.testnet".parse().unwrap() }
    fn bob() -> AccountId { "bob.testnet".parse().unwrap() }
    fn charlie() -> AccountId { "charlie.testnet".parse().unwrap() }
    fn dave() -> AccountId { "dave.testnet".parse().unwrap() }
    fn agent() -> AccountId { "agent-alpha.testnet".parse().unwrap() }

    fn sample_spec_hash() -> String {
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string()
    }

    fn sample_terms_hash() -> String {
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string()
    }

    fn sample_metadata() -> TokenMetadata {
        TokenMetadata {
            title: Some("Advanced Materials API".to_string()),
            description: Some("Computational material discovery API".to_string()),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: Some("https://knovara.io/metadata/mat-001.json".to_string()),
            reference_hash: Some(near_sdk::json_types::Base64VecU8(vec![0u8; 32])),
        }
    }

    fn sample_splits() -> Vec<BeneficiaryShare> {
        vec![
            BeneficiaryShare {
                account_id: charlie(),
                basis_points: 6000,
            },
            BeneficiaryShare {
                account_id: dave(),
                basis_points: 4000,
            },
        ]
    }

    fn setup_contract() -> KnovaraContract {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("knovara.testnet".parse().unwrap())
            .predecessor_account_id(admin())
            .signer_account_id(admin())
            .attached_deposit(NearToken::from_yoctonear(0))
            .account_balance(NearToken::from_near(100));
        testing_env!(builder.build());

        let mut contract = KnovaraContract::new(admin());
        let min = contract.storage_min_deposit;

        builder
            .predecessor_account_id(alice())
            .signer_account_id(alice())
            .attached_deposit(NearToken::from_yoctonear(min + 5_000_000_000_000_000_000_000_000));
        testing_env!(builder.build());
        contract.storage_deposit(None, None);

        contract.register_discovery_and_mint(
            "disc-mat-001".to_string(),
            "token-mat-001".to_string(),
            None,
            bob(),
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_string(),
            sample_metadata(),
            sample_splits(),
            vec![],
        );

        contract
    }

    #[test]
    fn test_subscription_offer_creation_success() {
        let mut contract = setup_contract();

        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("knovara.testnet".parse().unwrap())
            .predecessor_account_id(bob())
            .signer_account_id(bob())
            .block_timestamp(1_000_000_000);
        testing_env!(builder.build());

        let offer = contract.create_api_subscription_offer(
            "sub-offer-001".to_string(),
            "disc-mat-001".to_string(),
            "api-mat-v1".to_string(),
            sample_spec_hash(),
            sample_terms_hash(),
            U128(10_000_000_000_000_000_000_000_000), // 10 NEAR
        );

        assert_eq!(offer.offer_id, "sub-offer-001");
        assert_eq!(offer.rights_controller_id, bob());
        assert_eq!(offer.duration_days, 30);
        assert!(offer.is_active);

        let query = contract.get_api_subscription_offer("sub-offer-001".to_string()).unwrap();
        assert_eq!(query.price_yocto.0, 10_000_000_000_000_000_000_000_000);
    }

    #[test]
    #[should_panic(expected = "ERR_UNAUTHORIZED_RIGHTS_CONTROLLER")]
    fn test_subscription_offer_creation_unauthorized() {
        let mut contract = setup_contract();

        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("knovara.testnet".parse().unwrap())
            .predecessor_account_id(alice()) // Alice is custodian, not rights controller
            .signer_account_id(alice());
        testing_env!(builder.build());

        contract.create_api_subscription_offer(
            "sub-offer-001".to_string(),
            "disc-mat-001".to_string(),
            "api-mat-v1".to_string(),
            sample_spec_hash(),
            sample_terms_hash(),
            U128(10_000_000_000_000_000_000_000_000),
        );
    }

    #[test]
    fn test_atomic_subscription_exact_payment_and_royalties() {
        let mut contract = setup_contract();

        // Bob creates offer
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("knovara.testnet".parse().unwrap())
            .predecessor_account_id(bob())
            .signer_account_id(bob())
            .block_timestamp(1_000_000_000);
        testing_env!(builder.build());

        let price = 10_000_000_000_000_000_000_000_000u128; // 10 NEAR
        contract.create_api_subscription_offer(
            "sub-offer-001".to_string(),
            "disc-mat-001".to_string(),
            "api-mat-v1".to_string(),
            sample_spec_hash(),
            sample_terms_hash(),
            U128(price),
        );

        // Dedicated agent account signs and subscribes
        builder
            .predecessor_account_id(agent())
            .signer_account_id(agent())
            .attached_deposit(NearToken::from_yoctonear(price))
            .block_timestamp(2_000_000_000);
        testing_env!(builder.build());

        let sub = contract.subscribe_to_offer(
            "sub-rec-001".to_string(),
            "sub-offer-001".to_string(),
            sample_terms_hash(),
        );

        assert_eq!(sub.subscription_id, "sub-rec-001");
        assert_eq!(sub.subscriber_id, agent());
        assert_eq!(sub.activated_at.0, 2_000_000_000);
        assert_eq!(sub.expires_at.0, 2_000_000_000 + THIRTY_DAYS_NANOS);

        // Check royalty allocation: Charlie gets 60%, Dave gets 40%
        let charlie_balance = contract.claimable_balances.get(&charlie()).copied().unwrap();
        let dave_balance = contract.claimable_balances.get(&dave()).copied().unwrap();
        assert_eq!(charlie_balance, 6_000_000_000_000_000_000_000_000);
        assert_eq!(dave_balance, 4_000_000_000_000_000_000_000_000);
        assert_eq!(contract.total_royalty_liabilities, price);

        // View query
        let query = contract.get_subscription("sub-rec-001".to_string()).unwrap();
        assert_eq!(query.subscriber_id, agent());
    }

    #[test]
    #[should_panic(expected = "ERR_EXACT_PAYMENT_REQUIRED")]
    fn test_subscription_underpayment_rejected() {
        let mut contract = setup_contract();

        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("knovara.testnet".parse().unwrap())
            .predecessor_account_id(bob())
            .signer_account_id(bob());
        testing_env!(builder.build());

        contract.create_api_subscription_offer(
            "sub-offer-001".to_string(),
            "disc-mat-001".to_string(),
            "api-mat-v1".to_string(),
            sample_spec_hash(),
            sample_terms_hash(),
            U128(10_000_000_000_000_000_000_000_000),
        );

        // Underpay by 1 yoctoNEAR
        builder
            .predecessor_account_id(agent())
            .signer_account_id(agent())
            .attached_deposit(NearToken::from_yoctonear(10_000_000_000_000_000_000_000_000 - 1));
        testing_env!(builder.build());

        contract.subscribe_to_offer(
            "sub-rec-001".to_string(),
            "sub-offer-001".to_string(),
            sample_terms_hash(),
        );
    }

    #[test]
    #[should_panic(expected = "ERR_SIGNER_MUST_BE_SUBSCRIBER")]
    fn test_subscription_signer_invariant() {
        let mut contract = setup_contract();

        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("knovara.testnet".parse().unwrap())
            .predecessor_account_id(bob())
            .signer_account_id(bob());
        testing_env!(builder.build());

        contract.create_api_subscription_offer(
            "sub-offer-001".to_string(),
            "disc-mat-001".to_string(),
            "api-mat-v1".to_string(),
            sample_spec_hash(),
            sample_terms_hash(),
            U128(10_000_000_000_000_000_000_000_000),
        );

        // Relayer calling on behalf of agent (signer != predecessor)
        builder
            .predecessor_account_id(agent())
            .signer_account_id(alice())
            .attached_deposit(NearToken::from_yoctonear(10_000_000_000_000_000_000_000_000));
        testing_env!(builder.build());

        contract.subscribe_to_offer(
            "sub-rec-001".to_string(),
            "sub-offer-001".to_string(),
            sample_terms_hash(),
        );
    }

    #[test]
    fn test_subscription_renewal() {
        let mut contract = setup_contract();

        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("knovara.testnet".parse().unwrap())
            .predecessor_account_id(bob())
            .signer_account_id(bob())
            .block_timestamp(1_000_000_000);
        testing_env!(builder.build());

        let price = 5_000_000_000_000_000_000_000_000u128;
        contract.create_api_subscription_offer(
            "sub-offer-001".to_string(),
            "disc-mat-001".to_string(),
            "api-mat-v1".to_string(),
            sample_spec_hash(),
            sample_terms_hash(),
            U128(price),
        );

        builder
            .predecessor_account_id(agent())
            .signer_account_id(agent())
            .attached_deposit(NearToken::from_yoctonear(price))
            .block_timestamp(2_000_000_000);
        testing_env!(builder.build());

        let sub = contract.subscribe_to_offer(
            "sub-rec-001".to_string(),
            "sub-offer-001".to_string(),
            sample_terms_hash(),
        );

        let initial_expiry = sub.expires_at.0;

        // Fast forward 10 days and renew
        let renew_time = 2_000_000_000 + 10 * 86_400 * 1_000_000_000;
        builder
            .predecessor_account_id(agent())
            .signer_account_id(agent())
            .attached_deposit(NearToken::from_yoctonear(price))
            .block_timestamp(renew_time);
        testing_env!(builder.build());

        let renewed = contract.renew_subscription(
            "sub-rec-001".to_string(),
            sample_terms_hash(),
        );

        assert_eq!(renewed.expires_at.0, initial_expiry + THIRTY_DAYS_NANOS);
        assert_eq!(contract.total_royalty_liabilities, price * 2);
    }
}
