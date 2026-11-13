use near_sdk::json_types::Base64VecU8;
use near_sdk::serde_json::json;
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

fn sample_spec_hash() -> String {
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string()
}

fn sample_metadata() -> near_sdk::serde_json::Value {
    let ref_hash = Base64VecU8(vec![0x42; 32]);
    json!({
        "title": "Computational Alloy Discovery API",
        "description": "High-temperature alloy properties prediction",
        "reference": "https://gateway.knovara.org/descriptors/mat-001/v1.json",
        "reference_hash": ref_hash,
        "copies": 1
    })
}

#[tokio::test]
async fn test_sandbox_subscription_offer_creation_and_atomic_purchase(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let ben1 = worker.dev_create_account().await?;
    let ben2 = worker.dev_create_account().await?;
    let agent = worker.dev_create_account().await?;

    // Creator registers storage
    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(2))
        .transact()
        .await?;

    // Register discovery NFT with 70/30 split
    let splits = json!([
        { "account_id": ben1.id().to_string(), "basis_points": 7000 },
        { "account_id": ben2.id().to_string(), "basis_points": 3000 }
    ]);

    let reg_res = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-api-101",
            "token_id": "token-api-101",
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

    // Controller registers storage
    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    // Controller creates direct API subscription offer
    let offer_res = controller
        .call(contract.id(), "create_api_subscription_offer")
        .args_json(json!({
            "offer_id": "sub-offer-101",
            "discovery_id": "disc-api-101",
            "api_product_id": "api-alloys-v1",
            "openapi_spec_hash": sample_spec_hash(),
            "terms_hash": sample_terms_hash(),
            "price_yocto": "1000000000000000000000000" // 1 NEAR
        }))
        .max_gas()
        .transact()
        .await?;

    assert!(offer_res.is_success());

    // Agent registers storage
    let _ = agent
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    // Agent atomically purchases 30-day subscription
    let sub_res = agent
        .call(contract.id(), "subscribe_to_offer")
        .args_json(json!({
            "subscription_id": "sub-rec-101",
            "offer_id": "sub-offer-101",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?;

    assert!(sub_res.is_success());

    // Verify subscription status
    let query_sub: near_sdk::serde_json::Value = contract
        .view("get_subscription")
        .args_json(json!({ "subscription_id": "sub-rec-101" }))
        .await?
        .json()?;

    assert_eq!(query_sub["subscriber_id"], agent.id().to_string());
    assert_eq!(query_sub["price_yocto"], "1000000000000000000000000");
    assert!(query_sub["status"]["Active"].is_object());

    // Check royalties: ben1 gets 0.7 NEAR, ben2 gets 0.3 NEAR
    let ben1_balance: near_sdk::json_types::U128 = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": ben1.id().to_string() }))
        .await?
        .json()?;

    let ben2_balance: near_sdk::json_types::U128 = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": ben2.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(ben1_balance.0, 700_000_000_000_000_000_000_000);
    assert_eq!(ben2_balance.0, 300_000_000_000_000_000_000_000);

    Ok(())
}

#[tokio::test]
async fn test_sandbox_subscription_renewal() -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let ben1 = worker.dev_create_account().await?;
    let agent = worker.dev_create_account().await?;

    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(2))
        .transact()
        .await?;

    let splits = json!([
        { "account_id": ben1.id().to_string(), "basis_points": 10000 }
    ]);

    let reg_res = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-api-102",
            "token_id": "token-api-102",
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

    let _ = controller
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let offer_res = controller
        .call(contract.id(), "create_api_subscription_offer")
        .args_json(json!({
            "offer_id": "sub-offer-102",
            "discovery_id": "disc-api-102",
            "api_product_id": "api-alloys-v2",
            "openapi_spec_hash": sample_spec_hash(),
            "terms_hash": sample_terms_hash(),
            "price_yocto": "500000000000000000000000" // 0.5 NEAR
        }))
        .max_gas()
        .transact()
        .await?;

    assert!(offer_res.is_success());

    let _ = agent
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let sub_res = agent
        .call(contract.id(), "subscribe_to_offer")
        .args_json(json!({
            "subscription_id": "sub-rec-102",
            "offer_id": "sub-offer-102",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_millinear(500))
        .max_gas()
        .transact()
        .await?;

    assert!(sub_res.is_success());

    // Renew subscription
    let renew_res = agent
        .call(contract.id(), "renew_subscription")
        .args_json(json!({
            "subscription_id": "sub-rec-102",
            "accepted_terms_hash": sample_terms_hash()
        }))
        .deposit(NearToken::from_millinear(500))
        .max_gas()
        .transact()
        .await?;

    assert!(renew_res.is_success());

    // Ben1 balance should now be 1 NEAR (0.5 + 0.5)
    let ben1_balance: near_sdk::json_types::U128 = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": ben1.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(ben1_balance.0, 1_000_000_000_000_000_000_000_000);

    Ok(())
}
