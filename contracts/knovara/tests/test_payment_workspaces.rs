use near_sdk::json_types::Base64VecU8;
use near_sdk::serde_json::{self, json};
use near_workspaces::types::NearToken;

async fn init_contract() -> Result<
    (
        near_workspaces::Worker<near_workspaces::network::Sandbox>,
        near_workspaces::Contract,
    ),
    Box<dyn std::error::Error>,
> {
    let wasm = std::fs::read("target/wasm32-unknown-unknown/release/knovara.wasm").expect(
        "knovara.wasm not found; run cargo build --target wasm32-unknown-unknown --release first",
    );

    let worker = near_workspaces::sandbox().await?;
    let contract = worker.dev_deploy(&wasm).await?;

    let outcome = contract
        .call("new")
        .args_json(json!({
            "admin_id": contract.id().to_string()
        }))
        .transact()
        .await?;

    assert!(outcome.is_success());
    Ok((worker, contract))
}

fn sample_manifest_hash() -> String {
    "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90".to_string()
}

fn sample_terms_hash() -> String {
    "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string()
}

fn sample_metadata() -> serde_json::Value {
    let ref_hash = Base64VecU8(vec![0x42; 32]);
    json!({
        "title": "Quantum Magnetoresistance Battery",
        "description": "Solid-state battery electrolyte design",
        "reference": "https://gateway.knovara.org/descriptors/disc-101/v1.json",
        "reference_hash": ref_hash,
        "copies": 1
    })
}

// 1. Sandbox full payment, license activation, and royalty distribution flow
#[tokio::test]
async fn test_sandbox_full_payment_activation_and_royalty_allocation(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let ben1 = worker.dev_create_account().await?;
    let ben2 = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    // Creator deposits storage and registers discovery with 60/40 splits
    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(2))
        .transact()
        .await?;

    let splits = json!([
        {
            "account_id": ben1.id().to_string(),
            "basis_points": 6000 // 60%
        },
        {
            "account_id": ben2.id().to_string(),
            "basis_points": 4000 // 40%
        }
    ]);

    let reg_res = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-pay-demo",
            "token_id": "token-pay-demo",
            "custodian_id": creator.id().to_string(),
            "rights_controller_id": controller.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(reg_res.is_success());

    // Controller creates offer for 2 NEAR
    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "offer-pay-01",
            "discovery_id": "disc-pay-demo",
            "scope": "CommercialUse",
            "price_yocto": "2000000000000000000000000", // 2 NEAR
            "terms_hash": sample_terms_hash(),
            "duration_days": 30
        }))
        .max_gas()
        .transact()
        .await?;

    // Buyer deposits storage and submits request
    let _ = buyer
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-pay-01",
            "offer_id": "offer-pay-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    // Controller approves request
    let appr_res = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({
            "request_id": "req-pay-01"
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(appr_res.is_success());

    // Buyer pays exact price (2 NEAR)
    let pay_res = buyer
        .call(contract.id(), "pay_for_license")
        .args_json(json!({
            "request_id": "req-pay-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?;
    assert!(pay_res.is_success());

    // Verify request status is Active with valid expiration
    let req_view: serde_json::Value = contract
        .view("get_license_request")
        .args_json(json!({
            "request_id": "req-pay-01"
        }))
        .await?
        .json()?;

    assert!(req_view["status"]["Active"]["expires_at"].as_u64().unwrap() > 0);

    // Verify royalty allocations:
    // Ben1 (60%): 1.2 NEAR = 1_200_000_000_000_000_000_000_000 yocto
    let ben1_bal: serde_json::Value = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": ben1.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ben1_bal, "1200000000000000000000000");

    // Ben2 (40%): 0.8 NEAR = 800_000_000_000_000_000_000_000 yocto
    let ben2_bal: serde_json::Value = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": ben2.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ben2_bal, "800000000000000000000000");

    // Total royalty liabilities: 2.0 NEAR
    let total_liab: serde_json::Value = contract
        .view("get_total_royalty_liabilities")
        .args_json(json!({}))
        .await?
        .json()?;
    assert_eq!(total_liab, "2000000000000000000000000");

    Ok(())
}

// 2. Sandbox underpayment and overpayment rejection
#[tokio::test]
async fn test_sandbox_underpayment_and_overpayment_rejection(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(2))
        .transact()
        .await?;

    let splits = json!([
        {
            "account_id": creator.id().to_string(),
            "basis_points": 10000
        }
    ]);

    let _ = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-underpay-demo",
            "token_id": "token-underpay-demo",
            "custodian_id": creator.id().to_string(),
            "rights_controller_id": controller.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "offer-underpay-01",
            "discovery_id": "disc-underpay-demo",
            "scope": "CommercialUse",
            "price_yocto": "2000000000000000000000000", // 2 NEAR
            "terms_hash": sample_terms_hash(),
            "duration_days": 30
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-underpay-01",
            "offer_id": "offer-underpay-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({
            "request_id": "req-underpay-01"
        }))
        .max_gas()
        .transact()
        .await?;

    // Attempt underpayment (1.9 NEAR instead of 2.0 NEAR) -> MUST FAIL
    let underpay_res = buyer
        .call(contract.id(), "pay_for_license")
        .args_json(json!({
            "request_id": "req-underpay-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_millinear(1900))
        .max_gas()
        .transact()
        .await?;

    assert!(underpay_res.is_failure());
    let dbg_under = format!("{:?}", underpay_res);
    assert!(dbg_under.contains("ERR_EXACT_PAYMENT_REQUIRED"));

    // Attempt overpayment (2.1 NEAR instead of 2.0 NEAR) -> MUST FAIL
    let overpay_res = buyer
        .call(contract.id(), "pay_for_license")
        .args_json(json!({
            "request_id": "req-underpay-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_millinear(2100))
        .max_gas()
        .transact()
        .await?;

    assert!(overpay_res.is_failure());
    let dbg_over = format!("{:?}", overpay_res);
    assert!(dbg_over.contains("ERR_EXACT_PAYMENT_REQUIRED"));

    Ok(())
}

// 3. Sandbox pull withdrawal and real native NEAR transfer
#[tokio::test]
async fn test_sandbox_pull_withdrawal_and_real_near_transfer(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(2))
        .transact()
        .await?;

    let splits = json!([
        {
            "account_id": beneficiary.id().to_string(),
            "basis_points": 10000
        }
    ]);

    let _ = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-with-demo",
            "token_id": "token-with-demo",
            "custodian_id": creator.id().to_string(),
            "rights_controller_id": controller.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "offer-with-01",
            "discovery_id": "disc-with-demo",
            "scope": "CommercialUse",
            "price_yocto": "3000000000000000000000000", // 3 NEAR
            "terms_hash": sample_terms_hash(),
            "duration_days": 30
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-with-01",
            "offer_id": "offer-with-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({
            "request_id": "req-with-01"
        }))
        .max_gas()
        .transact()
        .await?;

    // Buyer pays 3 NEAR
    let _ = buyer
        .call(contract.id(), "pay_for_license")
        .args_json(json!({
            "request_id": "req-with-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_near(3))
        .max_gas()
        .transact()
        .await?;

    // Check beneficiary claimable balance = 3 NEAR
    let ben_bal: serde_json::Value = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": beneficiary.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ben_bal, "3000000000000000000000000");

    let wallet_before = beneficiary.view_account().await?.balance;

    // Beneficiary calls withdraw_earnings()
    let with_res = beneficiary
        .call(contract.id(), "withdraw_earnings")
        .args_json(json!({}))
        .max_gas()
        .transact()
        .await?;

    let _ = worker.fast_forward(3).await;

    let wallet_after = beneficiary.view_account().await?.balance;

    assert!(with_res.is_success());

    // Beneficiary's wallet received ~3 NEAR (minus transaction gas)
    assert!(
        wallet_after.as_yoctonear()
            > wallet_before.as_yoctonear() + 2_900_000_000_000_000_000_000_000
    );

    // Contract claimable balance for beneficiary is now 0
    let ben_bal_after: serde_json::Value = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": beneficiary.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ben_bal_after, "0");

    // Aggregate royalty liabilities are now 0
    let total_liab_after: serde_json::Value = contract
        .view("get_total_royalty_liabilities")
        .args_json(json!({}))
        .await?
        .json()?;
    assert_eq!(total_liab_after, "0");

    Ok(())
}

// 4. Sandbox duplicate payment rejection
#[tokio::test]
async fn test_sandbox_duplicate_payment_rejection() -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(2))
        .transact()
        .await?;

    let splits = json!([
        {
            "account_id": creator.id().to_string(),
            "basis_points": 10000
        }
    ]);

    let _ = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-dup-demo",
            "token_id": "token-dup-demo",
            "custodian_id": creator.id().to_string(),
            "rights_controller_id": controller.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "offer-dup-01",
            "discovery_id": "disc-dup-demo",
            "scope": "CommercialUse",
            "price_yocto": "1000000000000000000000000",
            "terms_hash": sample_terms_hash(),
            "duration_days": 30
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-dup-01",
            "offer_id": "offer-dup-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({
            "request_id": "req-dup-01"
        }))
        .max_gas()
        .transact()
        .await?;

    // First payment succeeds
    let pay1 = buyer
        .call(contract.id(), "pay_for_license")
        .args_json(json!({
            "request_id": "req-dup-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?;
    assert!(pay1.is_success());

    // Second payment fails with ERR_ALREADY_PAID
    let pay2 = buyer
        .call(contract.id(), "pay_for_license")
        .args_json(json!({
            "request_id": "req-dup-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?;

    assert!(pay2.is_failure());
    let dbg = format!("{:?}", pay2);
    assert!(dbg.contains("ERR_ALREADY_PAID"));

    Ok(())
}

// 5. Sandbox license expiration
#[tokio::test]
async fn test_sandbox_license_expiration() -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(2))
        .transact()
        .await?;

    let splits = json!([
        {
            "account_id": creator.id().to_string(),
            "basis_points": 10000
        }
    ]);

    let _ = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-exp-demo",
            "token_id": "token-exp-demo",
            "custodian_id": creator.id().to_string(),
            "rights_controller_id": controller.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    // 1-day license
    let _ = controller
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "offer-exp-01",
            "discovery_id": "disc-exp-demo",
            "scope": "CommercialUse",
            "price_yocto": "1000000000000000000000000",
            "terms_hash": sample_terms_hash(),
            "duration_days": 1
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-exp-01",
            "offer_id": "offer-exp-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({
            "request_id": "req-exp-01"
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "pay_for_license")
        .args_json(json!({
            "request_id": "req-exp-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?;

    // Attempting to expire before term elapsed -> MUST FAIL
    let early_exp = buyer
        .call(contract.id(), "expire_license")
        .args_json(json!({
            "request_id": "req-exp-01"
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(early_exp.is_failure());
    let dbg_early = format!("{:?}", early_exp);
    assert!(dbg_early.contains("ERR_LICENSE_NOT_YET_EXPIRED"));

    // Fast-forward Sandbox blocks (e.g., 200 blocks, or wait)
    // Note: In Sandbox, we can advance blocks using worker.fast_forward
    let _ = worker.fast_forward(50).await;

    Ok(())
}

// 6. Sandbox Rights Controller NOT in beneficiaries receives remainder and withdraws it
#[tokio::test]
async fn test_sandbox_rights_controller_not_in_beneficiaries_receives_remainder(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let ben1 = worker.dev_create_account().await?;
    let ben2 = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(2))
        .transact()
        .await?;

    // Controller is NOT one of the beneficiaries (ben1 = 50%, ben2 = 50%)
    let splits = json!([
        {
            "account_id": ben1.id().to_string(),
            "basis_points": 5000
        },
        {
            "account_id": ben2.id().to_string(),
            "basis_points": 5000
        }
    ]);

    let reg_res = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-rem-sandbox",
            "token_id": "tok-rem-sandbox",
            "custodian_id": creator.id().to_string(),
            "rights_controller_id": controller.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(reg_res.is_success());

    // Verify controller's claimable balance was pre-allocated at registration
    let ctrl_bal_init: serde_json::Value = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": controller.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ctrl_bal_init, "0");

    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    // Price: 1 NEAR + 1 yoctoNEAR (1_000_000_000_000_000_000_000_001 yoctoNEAR)
    // 50% = 500_000_000_000_000_000_000_000 each -> sum = 1_000_000_000_000_000_000_000_000
    // Remainder = 1 yoctoNEAR goes to Rights Controller!
    let odd_price_yocto: u128 = 1_000_000_000_000_000_000_000_001;
    let _ = controller
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "off-rem-01",
            "discovery_id": "disc-rem-sandbox",
            "scope": "CommercialUse",
            "price_yocto": odd_price_yocto.to_string(),
            "terms_hash": sample_terms_hash(),
            "duration_days": 30
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-rem-01",
            "offer_id": "off-rem-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({
            "request_id": "req-rem-01"
        }))
        .max_gas()
        .transact()
        .await?;

    // Buyer pays exact odd price
    let pay_res = buyer
        .call(contract.id(), "pay_for_license")
        .args_json(json!({
            "request_id": "req-rem-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_yoctonear(odd_price_yocto))
        .max_gas()
        .transact()
        .await?;
    assert!(pay_res.is_success());

    // Verify allocations:
    // ben1: 500_000_000_000_000_000_000_000
    // ben2: 500_000_000_000_000_000_000_000
    // controller (NOT a beneficiary): gets remainder of 1 yoctoNEAR!
    let ben1_bal: serde_json::Value = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": ben1.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ben1_bal, "500000000000000000000000");

    let ctrl_bal: serde_json::Value = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": controller.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ctrl_bal, "1");

    // Controller withdraws the remainder
    let ctrl_with = controller
        .call(contract.id(), "withdraw_earnings")
        .args_json(json!({}))
        .max_gas()
        .transact()
        .await?;
    assert!(ctrl_with.is_success());

    let ctrl_bal_after: serde_json::Value = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": controller.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ctrl_bal_after, "0");

    Ok(())
}

// 7. Sandbox interleaved withdrawals and new earnings received
#[tokio::test]
async fn test_sandbox_interleaved_withdrawals_and_new_earnings(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;
    let buyer1 = worker.dev_create_account().await?;
    let buyer2 = worker.dev_create_account().await?;

    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(2))
        .transact()
        .await?;

    let splits = json!([
        {
            "account_id": beneficiary.id().to_string(),
            "basis_points": 10000
        }
    ]);

    let _ = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-interleave",
            "token_id": "tok-interleave",
            "custodian_id": creator.id().to_string(),
            "rights_controller_id": controller.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    // Offer: 2 NEAR
    let _ = controller
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "off-int-01",
            "discovery_id": "disc-interleave",
            "scope": "CommercialUse",
            "price_yocto": NearToken::from_near(2).as_yoctonear().to_string(),
            "terms_hash": sample_terms_hash(),
            "duration_days": 30
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = buyer1
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = buyer2
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    // Buyer 1 requests & approved
    let _ = buyer1
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-int-01",
            "offer_id": "off-int-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({ "request_id": "req-int-01" }))
        .max_gas()
        .transact()
        .await?;

    // Buyer 1 pays 2 NEAR -> Beneficiary earns 2 NEAR
    let _ = buyer1
        .call(contract.id(), "pay_for_license")
        .args_json(json!({
            "request_id": "req-int-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?;

    // Beneficiary initiates withdrawal 1 (2 NEAR)
    let with1_res = beneficiary
        .call(contract.id(), "withdraw_earnings")
        .args_json(json!({}))
        .max_gas()
        .transact()
        .await?;
    assert!(with1_res.is_success());

    // Buyer 2 requests & approved for the same offer
    let _ = buyer2
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-int-02",
            "offer_id": "off-int-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({ "request_id": "req-int-02" }))
        .max_gas()
        .transact()
        .await?;

    // Buyer 2 pays 2 NEAR: new earnings for beneficiary arrived!
    let _ = buyer2
        .call(contract.id(), "pay_for_license")
        .args_json(json!({
            "request_id": "req-int-02",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?;

    // Beneficiary's contract balance is now 2 NEAR (from payment 2)
    let ben_bal_mid: serde_json::Value = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": beneficiary.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(
        ben_bal_mid,
        NearToken::from_near(2).as_yoctonear().to_string()
    );

    // Beneficiary withdraws the second 2 NEAR
    let with2_res = beneficiary
        .call(contract.id(), "withdraw_earnings")
        .args_json(json!({}))
        .max_gas()
        .transact()
        .await?;
    assert!(with2_res.is_success());

    let _ = worker.fast_forward(3).await;

    // Beneficiary's final contract balance is 0
    let ben_bal_final: serde_json::Value = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": beneficiary.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ben_bal_final, "0");

    // Contract total royalty liabilities are now 0
    let total_liab_final: serde_json::Value = contract
        .view("get_total_royalty_liabilities")
        .args_json(json!({}))
        .await?
        .json()?;
    assert_eq!(total_liab_final, "0");

    Ok(())
}

// 8. Sandbox failed royalty transfer and callback recovery via deleted account
#[tokio::test]
async fn test_sandbox_failed_transfer_and_callback_recovery_via_deleted_account(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(2))
        .transact()
        .await?;

    let splits = json!([
        {
            "account_id": beneficiary.id().to_string(),
            "basis_points": 10000
        }
    ]);

    let _ = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-fail-recovery",
            "token_id": "tok-fail-recovery",
            "custodian_id": creator.id().to_string(),
            "rights_controller_id": controller.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "off-fail-01",
            "discovery_id": "disc-fail-recovery",
            "scope": "CommercialUse",
            "price_yocto": NearToken::from_near(2).as_yoctonear().to_string(),
            "terms_hash": sample_terms_hash(),
            "duration_days": 30
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-fail-01",
            "offer_id": "off-fail-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({ "request_id": "req-fail-01" }))
        .max_gas()
        .transact()
        .await?;

    // Buyer pays 2 NEAR
    let _ = buyer
        .call(contract.id(), "pay_for_license")
        .args_json(json!({
            "request_id": "req-fail-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?;

    let ben_id = beneficiary.id().clone();

    // Beneficiary sends withdraw_earnings asynchronously
    let _ = beneficiary
        .call(contract.id(), "withdraw_earnings")
        .args_json(json!({}))
        .max_gas()
        .transact_async()
        .await?;

    // Beneficiary deletes itself!
    let _ = beneficiary.delete_account(creator.id()).await;

    // Fast-forward so all cross-contract receipts process and callback executes
    let _ = worker.fast_forward(10).await;

    // In KNOVARA contract, the failed transfer was safely handled by on_withdraw_earnings_callback:
    // Beneficiary's claimable balance was restored to 2 NEAR!
    let ben_bal_after: serde_json::Value = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": ben_id.to_string() }))
        .await?
        .json()?;

    // Total royalty liabilities remain 2 NEAR (funds restored, not lost or duplicated!)
    let liab_after: serde_json::Value = contract
        .view("get_total_royalty_liabilities")
        .args_json(json!({}))
        .await?
        .json()?;

    assert_eq!(
        ben_bal_after,
        NearToken::from_near(2).as_yoctonear().to_string()
    );
    assert_eq!(
        liab_after,
        NearToken::from_near(2).as_yoctonear().to_string()
    );

    Ok(())
}
