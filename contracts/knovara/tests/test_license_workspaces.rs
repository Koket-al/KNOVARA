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

// 40. Successful Sandbox offer creation
#[tokio::test]
async fn test_sandbox_offer_creation_and_retrieval() -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let custodian = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;

    // 1. Creator deposits storage and registers discovery
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

    let reg_res = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-license-demo",
            "token_id": "token-license-demo",
            "custodian_id": custodian.id().to_string(),
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

    // 2. Rights controller deposits storage
    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    // 3. Rights controller creates licensing offer
    let offer_res = controller
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "offer-ai-train-01",
            "discovery_id": "disc-license-demo",
            "scope": "AiModelTraining",
            "price_yocto": "3000000000000000000000000", // 3 NEAR
            "terms_hash": sample_terms_hash(),
            "duration_days": 180
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(offer_res.is_success());

    // 4. Query offer by ID
    let offer_view: serde_json::Value = contract
        .view("get_license_offer")
        .args_json(json!({
            "offer_id": "offer-ai-train-01"
        }))
        .await?
        .json()?;

    assert_eq!(offer_view["offer_id"], "offer-ai-train-01");
    assert_eq!(offer_view["discovery_id"], "disc-license-demo");
    assert_eq!(
        offer_view["rights_controller_id"],
        controller.id().to_string()
    );
    assert_eq!(offer_view["scope"], "AiModelTraining");
    assert_eq!(offer_view["price_yocto"], "3000000000000000000000000");
    assert_eq!(offer_view["terms_hash"], sample_terms_hash());
    assert_eq!(offer_view["duration_days"], 180);
    assert_eq!(offer_view["is_active"], true);

    // 5. Query offers for discovery
    let disc_offers: Vec<serde_json::Value> = contract
        .view("get_license_offers_for_discovery")
        .args_json(json!({
            "discovery_id": "disc-license-demo"
        }))
        .await?
        .json()?;
    assert_eq!(disc_offers.len(), 1);
    assert_eq!(disc_offers[0]["offer_id"], "offer-ai-train-01");

    Ok(())
}

// 41. Successful Sandbox request submission
#[tokio::test]
async fn test_sandbox_license_request_submission_and_snapshot(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let custodian = worker.dev_create_account().await?;
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
            "discovery_id": "disc-req-demo",
            "token_id": "token-req-demo",
            "custodian_id": custodian.id().to_string(),
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
            "offer_id": "offer-comm-01",
            "discovery_id": "disc-req-demo",
            "scope": "CommercialUse",
            "price_yocto": "5000000000000000000000000", // 5 NEAR
            "terms_hash": sample_terms_hash(),
            "duration_days": 365
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

    let req_res = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-buyer-001",
            "offer_id": "offer-comm-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(req_res.is_success());

    // Query request by ID
    let req_view: serde_json::Value = contract
        .view("get_license_request")
        .args_json(json!({
            "request_id": "req-buyer-001"
        }))
        .await?
        .json()?;

    assert_eq!(req_view["request_id"], "req-buyer-001");
    assert_eq!(req_view["offer_id"], "offer-comm-01");
    assert_eq!(req_view["buyer_id"], buyer.id().to_string());
    assert_eq!(req_view["scope"], "CommercialUse");
    assert_eq!(req_view["price_yocto"], "5000000000000000000000000");
    assert_eq!(req_view["duration_days"], 365);
    assert_eq!(req_view["license_terms_hash"], sample_terms_hash());
    assert_eq!(req_view["accepted_terms_hash"], sample_terms_hash());
    assert_eq!(req_view["status"], "Requested");

    // Verify buyer dependency counter
    let buyer_deps: serde_json::Value = contract
        .view("get_account_dependency_counts")
        .args_json(json!({
            "account_id": buyer.id().to_string()
        }))
        .await?
        .json()?;
    assert_eq!(buyer_deps["persistent_license_count"], 1);

    Ok(())
}

// 42. Successful Sandbox approval
#[tokio::test]
async fn test_sandbox_license_approval() -> Result<(), Box<dyn std::error::Error>> {
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
            "discovery_id": "disc-appr-demo",
            "token_id": "token-appr-demo",
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
            "offer_id": "offer-appr-01",
            "discovery_id": "disc-appr-demo",
            "scope": "AcademicResearch",
            "price_yocto": "500000000000000000000000", // 0.5 NEAR
            "terms_hash": sample_terms_hash(),
            "duration_days": 90
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
            "request_id": "req-appr-001",
            "offer_id": "offer-appr-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    // Rights controller approves request
    let appr_res = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({
            "request_id": "req-appr-001"
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(appr_res.is_success());

    let req_view: serde_json::Value = contract
        .view("get_license_request")
        .args_json(json!({
            "request_id": "req-appr-001"
        }))
        .await?
        .json()?;

    // Status is Approved with payment_deadline
    assert!(
        req_view["status"]["Approved"]["payment_deadline"]
            .as_u64()
            .unwrap()
            > 0
    );

    Ok(())
}

// 43. Successful Sandbox rejection
#[tokio::test]
async fn test_sandbox_license_rejection() -> Result<(), Box<dyn std::error::Error>> {
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
            "discovery_id": "disc-rej-demo",
            "token_id": "token-rej-demo",
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
            "offer_id": "offer-rej-01",
            "discovery_id": "disc-rej-demo",
            "scope": "CommercialUse",
            "price_yocto": "10000000000000000000000000", // 10 NEAR
            "terms_hash": sample_terms_hash(),
            "duration_days": 365
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
            "request_id": "req-rej-001",
            "offer_id": "offer-rej-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    // Rights controller rejects request
    let rej_res = controller
        .call(contract.id(), "reject_license_request")
        .args_json(json!({
            "request_id": "req-rej-001",
            "reason": "Exclusivity conflict with existing licensee"
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(rej_res.is_success());

    let req_view: serde_json::Value = contract
        .view("get_license_request")
        .args_json(json!({
            "request_id": "req-rej-001"
        }))
        .await?
        .json()?;

    assert_eq!(
        req_view["status"]["Rejected"]["reason"],
        "Exclusivity conflict with existing licensee"
    );

    Ok(())
}

// 44. Unauthorized calls rejected in real Sandbox execution
#[tokio::test]
async fn test_sandbox_unauthorized_actions_rejected() -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let custodian = worker.dev_create_account().await?;
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
            "discovery_id": "disc-auth-demo",
            "token_id": "token-auth-demo",
            "custodian_id": custodian.id().to_string(),
            "rights_controller_id": controller.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;

    // Custodian attempts to create offer -> MUST FAIL
    let _ = custodian
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let cust_offer_outcome = custodian
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "offer-unauth-01",
            "discovery_id": "disc-auth-demo",
            "scope": "CommercialUse",
            "price_yocto": "1000000000000000000000000",
            "terms_hash": sample_terms_hash(),
            "duration_days": 30
        }))
        .max_gas()
        .transact()
        .await?;

    assert!(cust_offer_outcome.is_failure());
    let dbg = format!("{:?}", cust_offer_outcome);
    assert!(dbg.contains("ERR_NOT_RIGHTS_CONTROLLER"));

    // Controller creates valid offer
    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let _ = controller
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "offer-valid-01",
            "discovery_id": "disc-auth-demo",
            "scope": "CommercialUse",
            "price_yocto": "1000000000000000000000000",
            "terms_hash": sample_terms_hash(),
            "duration_days": 30
        }))
        .max_gas()
        .transact()
        .await?;

    // Buyer attempts to request with mismatched terms hash -> MUST FAIL
    let _ = buyer
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let bad_hash_outcome = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-bad-hash",
            "offer_id": "offer-valid-01",
            "accepted_terms_hash": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        }))
        .max_gas()
        .transact()
        .await?;

    assert!(bad_hash_outcome.is_failure());
    let dbg_hash = format!("{:?}", bad_hash_outcome);
    assert!(dbg_hash.contains("ERR_TERMS_HASH_MISMATCH"));

    // Buyer submits valid request
    let _ = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-valid-01",
            "offer_id": "offer-valid-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    // Custodian attempts to approve request -> MUST FAIL
    let cust_appr_outcome = custodian
        .call(contract.id(), "approve_license_request")
        .args_json(json!({
            "request_id": "req-valid-01"
        }))
        .max_gas()
        .transact()
        .await?;

    assert!(cust_appr_outcome.is_failure());
    let dbg_appr = format!("{:?}", cust_appr_outcome);
    assert!(dbg_appr.contains("ERR_NOT_RIGHTS_CONTROLLER"));

    Ok(())
}

// 45. Sandbox approval & rejection storage growth measurement
#[tokio::test]
async fn test_sandbox_approval_and_rejection_storage_growth_measurement(
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
            "discovery_id": "disc-growth-demo",
            "token_id": "token-growth-demo",
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
            "offer_id": "offer-growth-01",
            "discovery_id": "disc-growth-demo",
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
            "request_id": "req-growth-01",
            "offer_id": "offer-growth-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    // Check controller storage balance before approval
    let bal_before_appr: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": controller.id().to_string() }))
        .await?
        .json()?;
    let avail_before_appr = bal_before_appr["available"]
        .as_str()
        .unwrap()
        .parse::<u128>()?;

    // Controller approves request
    let appr_res = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({ "request_id": "req-growth-01" }))
        .max_gas()
        .transact()
        .await?;
    assert!(appr_res.is_success());

    // Check controller storage balance after approval
    let bal_after_appr: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": controller.id().to_string() }))
        .await?
        .json()?;
    let avail_after_appr = bal_after_appr["available"]
        .as_str()
        .unwrap()
        .parse::<u128>()?;

    // Controller paid for the approval status change
    assert!(avail_after_appr < avail_before_appr);

    // Now test rejection storage growth
    let _ = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-growth-02",
            "offer_id": "offer-growth-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    let bal_before_rej: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": controller.id().to_string() }))
        .await?
        .json()?;
    let avail_before_rej = bal_before_rej["available"]
        .as_str()
        .unwrap()
        .parse::<u128>()?;

    let rej_reason = "Detailed rejection reason for storage accounting verification";
    let rej_res = controller
        .call(contract.id(), "reject_license_request")
        .args_json(json!({
            "request_id": "req-growth-02",
            "reason": rej_reason
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(rej_res.is_success());

    let bal_after_rej: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": controller.id().to_string() }))
        .await?
        .json()?;
    let avail_after_rej = bal_after_rej["available"]
        .as_str()
        .unwrap()
        .parse::<u128>()?;

    // Controller paid for the rejection status change and reason string
    assert!(avail_after_rej < avail_before_rej);

    Ok(())
}

// 46. Sandbox rejection reason length limit
#[tokio::test]
async fn test_sandbox_rejection_reason_too_long() -> Result<(), Box<dyn std::error::Error>> {
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
            "discovery_id": "disc-len-demo",
            "token_id": "token-len-demo",
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
            "offer_id": "offer-len-01",
            "discovery_id": "disc-len-demo",
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
            "request_id": "req-len-01",
            "offer_id": "offer-len-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    // Attempt rejection with 300-character reason -> MUST FAIL
    let too_long_reason = "x".repeat(300);
    let outcome = controller
        .call(contract.id(), "reject_license_request")
        .args_json(json!({
            "request_id": "req-len-01",
            "reason": too_long_reason
        }))
        .max_gas()
        .transact()
        .await?;

    assert!(outcome.is_failure());
    let dbg = format!("{:?}", outcome);
    assert!(dbg.contains("ERR_REJECTION_REASON_TOO_LONG"));

    Ok(())
}

// 47. Sandbox insufficient storage on approval reverts safely
#[tokio::test]
async fn test_sandbox_insufficient_storage_on_approval_reverts(
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
            "discovery_id": "disc-revert-demo",
            "token_id": "token-revert-demo",
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
            "offer_id": "offer-revert-01",
            "discovery_id": "disc-revert-demo",
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
            "request_id": "req-revert-01",
            "offer_id": "offer-revert-01",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .max_gas()
        .transact()
        .await?;

    // Controller withdraws entire available balance down to zero
    let bal: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": controller.id().to_string() }))
        .await?
        .json()?;
    let avail = bal["available"].as_str().unwrap();

    let withdraw_res = controller
        .call(contract.id(), "storage_withdraw")
        .args_json(json!({ "amount": avail }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;
    assert!(withdraw_res.is_success());

    // Controller attempts to approve without available storage balance -> MUST FAIL
    let outcome = controller
        .call(contract.id(), "approve_license_request")
        .args_json(json!({ "request_id": "req-revert-01" }))
        .max_gas()
        .transact()
        .await?;

    assert!(outcome.is_failure());
    let dbg = format!("{:?}", outcome);
    assert!(dbg.contains("ERR_INSUFFICIENT_STORAGE_BALANCE"));

    // Verify atomic revert: request remains in Requested status
    let req_view: serde_json::Value = contract
        .view("get_license_request")
        .args_json(json!({ "request_id": "req-revert-01" }))
        .await?
        .json()?;
    assert_eq!(req_view["status"], "Requested");

    Ok(())
}

// 48. Sandbox uppercase terms hash matching
#[tokio::test]
async fn test_sandbox_uppercase_terms_hash_matching() -> Result<(), Box<dyn std::error::Error>> {
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
            "discovery_id": "disc-case-demo",
            "token_id": "token-case-demo",
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

    let lower_terms = sample_terms_hash();
    let upper_terms = lower_terms.to_uppercase();
    assert_ne!(lower_terms, upper_terms);

    let _ = controller
        .call(contract.id(), "create_license_offer")
        .args_json(json!({
            "offer_id": "offer-case-01",
            "discovery_id": "disc-case-demo",
            "scope": "CommercialUse",
            "price_yocto": "1000000000000000000000000",
            "terms_hash": lower_terms,
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

    // Buyer submits request with uppercase hex
    let req_res = buyer
        .call(contract.id(), "request_license")
        .args_json(json!({
            "request_id": "req-case-01",
            "offer_id": "offer-case-01",
            "accepted_terms_hash": upper_terms
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(req_res.is_success());

    let req_view: serde_json::Value = contract
        .view("get_license_request")
        .args_json(json!({ "request_id": "req-case-01" }))
        .await?
        .json()?;

    // Internally decoded and verified as [u8; 32], returned as canonical lowercase
    assert_eq!(req_view["license_terms_hash"], lower_terms);
    assert_eq!(req_view["accepted_terms_hash"], lower_terms);

    Ok(())
}
