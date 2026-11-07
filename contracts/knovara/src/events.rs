use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::json;
use near_sdk::{env, AccountId};

pub const NEP171_STANDARD: &str = "nep171";
pub const NEP171_VERSION: &str = "1.2.0";

pub const KNOVARA_LICENSING_STANDARD: &str = "knovara_licensing";
pub const KNOVARA_LICENSING_VERSION: &str = "1.0.0";

/// Emits a standard NEP-297 compliant `nft_mint` event.
/// Format: `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"...","token_ids":["..."],"memo":...}]}`
pub fn log_nft_mint(owner_id: &AccountId, token_ids: &[&str], memo: Option<&str>) {
    let event = json!({
        "standard": NEP171_STANDARD,
        "version": NEP171_VERSION,
        "event": "nft_mint",
        "data": [{
            "owner_id": owner_id.to_string(),
            "token_ids": token_ids,
            "memo": memo
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when a new license offer is created by the Rights Controller.
pub fn log_license_offer_created(
    offer_id: &str,
    discovery_id: &str,
    rights_controller_id: &AccountId,
    scope: &str,
    price_yocto: u128,
    terms_hash: &str,
    duration_days: u32,
) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "license_offer_created",
        "data": [{
            "offer_id": offer_id,
            "discovery_id": discovery_id,
            "rights_controller_id": rights_controller_id.to_string(),
            "scope": scope,
            "price_yocto": U128(price_yocto),
            "terms_hash": terms_hash,
            "duration_days": duration_days
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when a license offer is deactivated by the Rights Controller.
pub fn log_license_offer_deactivated(
    offer_id: &str,
    discovery_id: &str,
    rights_controller_id: &AccountId,
) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "license_offer_deactivated",
        "data": [{
            "offer_id": offer_id,
            "discovery_id": discovery_id,
            "rights_controller_id": rights_controller_id.to_string()
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when a prospective buyer submits a license request.
pub fn log_license_requested(
    request_id: &str,
    offer_id: &str,
    discovery_id: &str,
    buyer_id: &AccountId,
    scope: &str,
    price_yocto: u128,
    accepted_terms_hash: &str,
) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "license_requested",
        "data": [{
            "request_id": request_id,
            "offer_id": offer_id,
            "discovery_id": discovery_id,
            "buyer_id": buyer_id.to_string(),
            "scope": scope,
            "price_yocto": U128(price_yocto),
            "accepted_terms_hash": accepted_terms_hash
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when a Rights Controller approves a license request.
pub fn log_license_approved(
    request_id: &str,
    offer_id: &str,
    discovery_id: &str,
    buyer_id: &AccountId,
    rights_controller_id: &AccountId,
    payment_deadline: u64,
) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "license_approved",
        "data": [{
            "request_id": request_id,
            "offer_id": offer_id,
            "discovery_id": discovery_id,
            "buyer_id": buyer_id.to_string(),
            "rights_controller_id": rights_controller_id.to_string(),
            "payment_deadline": U64(payment_deadline)
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when a Rights Controller rejects a license request.
pub fn log_license_rejected(
    request_id: &str,
    offer_id: &str,
    discovery_id: &str,
    buyer_id: &AccountId,
    rights_controller_id: &AccountId,
    reason: &str,
) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "license_rejected",
        "data": [{
            "request_id": request_id,
            "offer_id": offer_id,
            "discovery_id": discovery_id,
            "buyer_id": buyer_id.to_string(),
            "rights_controller_id": rights_controller_id.to_string(),
            "reason": reason
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when a license request is paid by the buyer.
pub fn log_license_paid(
    request_id: &str,
    discovery_id: &str,
    buyer_id: &AccountId,
    price_yocto: u128,
) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "license_paid",
        "data": [{
            "request_id": request_id,
            "discovery_id": discovery_id,
            "buyer_id": buyer_id.to_string(),
            "price_yocto": U128(price_yocto)
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when a license is activated following payment.
pub fn log_license_activated(
    request_id: &str,
    discovery_id: &str,
    buyer_id: &AccountId,
    activated_at: u64,
    expires_at: u64,
) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "license_activated",
        "data": [{
            "request_id": request_id,
            "discovery_id": discovery_id,
            "buyer_id": buyer_id.to_string(),
            "activated_at": U64(activated_at),
            "expires_at": U64(expires_at)
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when royalties from a license payment are allocated among beneficiaries.
pub fn log_royalties_allocated(
    request_id: &str,
    discovery_id: &str,
    total_amount: u128,
    allocations_count: usize,
) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "royalties_allocated",
        "data": [{
            "request_id": request_id,
            "discovery_id": discovery_id,
            "total_amount": U128(total_amount),
            "allocations_count": allocations_count
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when a beneficiary initiates royalty withdrawal.
pub fn log_royalty_withdrawal_initiated(beneficiary_id: &AccountId, amount: u128) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "royalty_withdrawal_initiated",
        "data": [{
            "beneficiary_id": beneficiary_id.to_string(),
            "amount": U128(amount)
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when a royalty withdrawal transfer succeeds.
pub fn log_royalty_withdrawn(beneficiary_id: &AccountId, amount: u128) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "royalty_withdrawn",
        "data": [{
            "beneficiary_id": beneficiary_id.to_string(),
            "amount": U128(amount)
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when a royalty withdrawal transfer fails and balance is rolled back.
pub fn log_royalty_withdrawal_failed(beneficiary_id: &AccountId, amount: u128) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "royalty_withdrawal_failed",
        "data": [{
            "beneficiary_id": beneficiary_id.to_string(),
            "amount": U128(amount)
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when an active license expires.
pub fn log_license_expired(request_id: &str, discovery_id: &str, buyer_id: &AccountId) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "license_expired",
        "data": [{
            "request_id": request_id,
            "discovery_id": discovery_id,
            "buyer_id": buyer_id.to_string()
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

/// Emits a structured event when an approved request expires without payment.
pub fn log_license_request_expired(request_id: &str, discovery_id: &str, buyer_id: &AccountId) {
    let event = json!({
        "standard": KNOVARA_LICENSING_STANDARD,
        "version": KNOVARA_LICENSING_VERSION,
        "event": "license_request_expired",
        "data": [{
            "request_id": request_id,
            "discovery_id": discovery_id,
            "buyer_id": buyer_id.to_string()
        }]
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}
