use near_contract_standards::non_fungible_token::metadata::{NFTContractMetadata, TokenMetadata};
use near_sdk::json_types::U128;
use near_sdk::{assert_one_yocto, env, near, AccountId, PromiseOrValue};
use std::collections::HashMap;

use crate::{KnovaraContract, KnovaraContractExt};

/// External JSON view for a Discovery Rights Passport NFT token.
/// Conforms to the standard NEP-171 `Token` / `JsonToken` view structure.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JsonToken {
    pub token_id: String,
    pub owner_id: AccountId,
    pub metadata: Option<TokenMetadata>,
    pub approved_account_ids: Option<HashMap<AccountId, u64>>,
}

#[near]
impl KnovaraContract {
    // -------------------------------------------------------------
    // NEP-171 TRANSFER GUARDS: Explicitly Revert All Custody Transfers
    // -------------------------------------------------------------

    /// NEP-171 transfer method.
    /// Strictly disabled in MVP: KNOVARA Rights Passports are non-transferable (soulbound).
    #[payable]
    #[allow(unused_variables)]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        env::panic_str(
            "ERR_PASSPORT_NON_TRANSFERABLE: Custodial transfer of KNOVARA Rights Passports is permanently disabled in MVP.",
        );
    }

    /// NEP-171 transfer_call method.
    /// Strictly disabled in MVP: KNOVARA Rights Passports are non-transferable (soulbound).
    #[payable]
    #[allow(unused_variables)]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        assert_one_yocto();
        env::panic_str(
            "ERR_PASSPORT_NON_TRANSFERABLE: Custodial transfer of KNOVARA Rights Passports is permanently disabled in MVP.",
        );
    }

    // -------------------------------------------------------------
    // NEP-178 APPROVAL MANAGEMENT GUARDS: Block All Proxy Transfers
    // -------------------------------------------------------------

    /// NEP-178 approval method.
    /// Strictly disabled: approvals are unsupported for soulbound passports.
    #[payable]
    #[allow(unused_variables)]
    pub fn nft_approve(&mut self, token_id: String, account_id: AccountId, msg: Option<String>) {
        assert_one_yocto();
        env::panic_str(
            "ERR_APPROVALS_NOT_SUPPORTED: NEP-178 transfer approvals are disabled for soulbound passports.",
        );
    }

    /// NEP-178 revoke method.
    /// Strictly disabled.
    #[payable]
    #[allow(unused_variables)]
    pub fn nft_revoke(&mut self, token_id: String, account_id: AccountId) {
        assert_one_yocto();
        env::panic_str("ERR_APPROVALS_NOT_SUPPORTED: NEP-178 transfer approvals are disabled.");
    }

    /// NEP-178 revoke_all method.
    /// Strictly disabled.
    #[payable]
    #[allow(unused_variables)]
    pub fn nft_revoke_all(&mut self, token_id: String) {
        assert_one_yocto();
        env::panic_str("ERR_APPROVALS_NOT_SUPPORTED: NEP-178 transfer approvals are disabled.");
    }

    // -------------------------------------------------------------
    // NEP-171 & NEP-177 VIEW METHODS: Fully Supported & Standardized
    // -------------------------------------------------------------

    /// Returns standard NEP-171 token information.
    /// `owner_id` represents the designated custodian.
    pub fn nft_token(&self, token_id: String) -> Option<JsonToken> {
        let discovery = self.tokens_by_id.get(&token_id)?;
        let metadata = self.token_metadata_by_id.get(&token_id)?;
        Some(JsonToken {
            token_id,
            owner_id: discovery.custodian_id.clone(),
            metadata: Some(metadata.clone()),
            approved_account_ids: Some(HashMap::new()), // Always empty (approvals unsupported)
        })
    }

    /// Returns NEP-177 contract metadata.
    pub fn nft_metadata(&self) -> NFTContractMetadata {
        self.contract_metadata.clone()
    }

    /// Returns the total supply of minted Discovery Rights Passport NFTs.
    pub fn nft_total_supply(&self) -> U128 {
        U128(self.tokens_count as u128)
    }
}
