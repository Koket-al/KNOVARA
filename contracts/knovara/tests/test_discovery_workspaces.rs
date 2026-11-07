use near_sdk::json_types::{Base64VecU8, U128};
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

#[tokio::test]
async fn test_sandbox_discovery_registration_and_nft_mint() -> Result<(), Box<dyn std::error::Error>>
{
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let custodian = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;

    // 1. Creator deposits storage funds (1 NEAR)
    let deposit_res = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;
    assert!(deposit_res.is_success());

    // 2. Creator registers discovery & mints passport NFT
    let splits = json!([
        {
            "account_id": custodian.id().to_string(),
            "basis_points": 6000
        },
        {
            "account_id": beneficiary.id().to_string(),
            "basis_points": 4000
        }
    ]);

    let reg_res = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-101",
            "token_id": "token-101",
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

    // 3. Query NFT token view (NEP-171)
    let token_view: serde_json::Value = contract
        .view("nft_token")
        .args_json(json!({
            "token_id": "token-101"
        }))
        .await?
        .json()?;

    assert_eq!(token_view["token_id"], "token-101");
    assert_eq!(token_view["owner_id"], custodian.id().to_string());
    assert_eq!(
        token_view["metadata"]["title"],
        "Quantum Magnetoresistance Battery"
    );
    assert!(token_view["approved_account_ids"]
        .as_object()
        .unwrap()
        .is_empty());

    // 4. Query Discovery Record view
    let disc_view: serde_json::Value = contract
        .view("get_discovery")
        .args_json(json!({
            "token_id": "token-101"
        }))
        .await?
        .json()?;

    assert_eq!(disc_view["discovery_id"], "disc-101");
    assert_eq!(disc_view["token_id"], "token-101");
    assert_eq!(disc_view["custodian_id"], custodian.id().to_string());
    assert_eq!(
        disc_view["rights_controller_id"],
        controller.id().to_string()
    );
    assert_eq!(disc_view["evidence_manifest_hash"], sample_manifest_hash());

    // 5. Query Total NFT Supply
    let total_supply: U128 = contract
        .view("nft_total_supply")
        .args_json(json!({}))
        .await?
        .json()?;
    assert_eq!(total_supply.0, 1);

    // 6. Query pre-allocated claimable balance (must be 0)
    let claimable_custodian: U128 = contract
        .view("get_claimable_balance")
        .args_json(json!({
            "account_id": custodian.id().to_string()
        }))
        .await?
        .json()?;
    assert_eq!(claimable_custodian.0, 0);

    Ok(())
}

#[tokio::test]
async fn test_sandbox_nft_transfer_rejection() -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let custodian = worker.dev_create_account().await?;
    let third_party = worker.dev_create_account().await?;

    // Creator deposits storage and registers discovery
    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;

    let splits = json!([
        {
            "account_id": custodian.id().to_string(),
            "basis_points": 10000
        }
    ]);

    let _ = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-202",
            "token_id": "token-202",
            "custodian_id": custodian.id().to_string(),
            "rights_controller_id": creator.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;

    // Custodian attempts to transfer passport NFT to third_party
    let transfer_outcome = custodian
        .call(contract.id(), "nft_transfer")
        .args_json(json!({
            "receiver_id": third_party.id().to_string(),
            "token_id": "token-202"
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    // Transfer MUST fail with ERR_PASSPORT_NON_TRANSFERABLE
    assert!(transfer_outcome.is_failure());
    let failure_dbg = format!("{:?}", transfer_outcome);
    assert!(
        failure_dbg.contains("ERR_PASSPORT_NON_TRANSFERABLE"),
        "Expected ERR_PASSPORT_NON_TRANSFERABLE error, got: {}",
        failure_dbg
    );

    // Verify token owner remains the custodian
    let token_view: serde_json::Value = contract
        .view("nft_token")
        .args_json(json!({
            "token_id": "token-202"
        }))
        .await?
        .json()?;
    assert_eq!(token_view["owner_id"], custodian.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_sandbox_unregistration_blocked_for_active_beneficiary(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;

    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
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
            "discovery_id": "disc-303",
            "token_id": "token-303",
            "custodian_id": creator.id().to_string(),
            "rights_controller_id": creator.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;

    // Beneficiary registers storage
    let _ = beneficiary
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?;

    // Beneficiary attempts to unregister while actively referenced in discovery
    let unreg_outcome = beneficiary
        .call(contract.id(), "storage_unregister")
        .args_json(json!({}))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    // Must fail because beneficiary has active dependencies
    assert!(unreg_outcome.is_failure());
    let failure_dbg = format!("{:?}", unreg_outcome);
    assert!(
        failure_dbg.contains("ERR_ACCOUNT_HAS_ACTIVE_DEPENDENCIES"),
        "Expected ERR_ACCOUNT_HAS_ACTIVE_DEPENDENCIES, got: {}",
        failure_dbg
    );

    Ok(())
}

#[tokio::test]
async fn test_sandbox_exact_storage_deduction_and_double_charging_prevention(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let custodian = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let beneficiary1 = worker.dev_create_account().await?;
    let beneficiary2 = worker.dev_create_account().await?;

    // Creator deposits 3 NEAR storage
    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(3))
        .transact()
        .await?;

    let bal_before: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": creator.id().to_string() }))
        .await?
        .json()?;
    let available_before: u128 = bal_before["available"].as_str().unwrap().parse()?;

    let contract_account_before = contract.view_account().await?;
    let contract_storage_before = contract_account_before.storage_usage;

    // Register discovery with 4 distinct new accounts (custodian, controller, beneficiary1, beneficiary2)
    let splits = json!([
        {
            "account_id": beneficiary1.id().to_string(),
            "basis_points": 7000
        },
        {
            "account_id": beneficiary2.id().to_string(),
            "basis_points": 3000
        }
    ]);

    let reg_res = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-storage-audit",
            "token_id": "token-storage-audit",
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

    let bal_after: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": creator.id().to_string() }))
        .await?
        .json()?;
    let available_after: u128 = bal_after["available"].as_str().unwrap().parse()?;
    let total_after: u128 = bal_after["total"].as_str().unwrap().parse()?;

    let contract_account_after = contract.view_account().await?;
    let contract_storage_after = contract_account_after.storage_usage;

    let storage_byte_cost: u128 = 10_000_000_000_000_000_000; // 10^19 yoctoNEAR (1e19)
    let deducted_yocto = available_before - available_after;
    let actual_bytes_growth = contract_storage_after - contract_storage_before;
    let expected_deducted_yocto = (actual_bytes_growth as u128) * storage_byte_cost;

    // Total must be completely unchanged
    assert_eq!(
        total_after,
        bal_before["total"].as_str().unwrap().parse::<u128>()?
    );

    // EXACT ONCE INVARIANT: The amount deducted from creator matches the actual persisted storage growth!
    assert_eq!(
        deducted_yocto, expected_deducted_yocto,
        "Deducted balance must exactly equal actual persisted storage byte delta multiplied by storage_byte_cost"
    );

    // Verify all 4 accounts have their dependency counts incremented
    let cust_deps: serde_json::Value = contract
        .view("get_account_dependency_counts")
        .args_json(json!({ "account_id": custodian.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(cust_deps["custodian_count"], 1);

    let ctrl_deps: serde_json::Value = contract
        .view("get_account_dependency_counts")
        .args_json(json!({ "account_id": controller.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ctrl_deps["rights_controller_count"], 1);

    let ben1_deps: serde_json::Value = contract
        .view("get_account_dependency_counts")
        .args_json(json!({ "account_id": beneficiary1.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ben1_deps["beneficiary_reference_count"], 1);

    let ben2_deps: serde_json::Value = contract
        .view("get_account_dependency_counts")
        .args_json(json!({ "account_id": beneficiary2.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ben2_deps["beneficiary_reference_count"], 1);

    // Verify beneficiary pre-allocation (0 balance)
    let b1_claimable: U128 = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": beneficiary1.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(b1_claimable.0, 0);

    let b2_claimable: U128 = contract
        .view("get_claimable_balance")
        .args_json(json!({ "account_id": beneficiary2.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(b2_claimable.0, 0);

    Ok(())
}

#[tokio::test]
async fn test_sandbox_single_account_multiple_roles_storage_accounting(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;

    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(3))
        .transact()
        .await?;

    let bal_before: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": creator.id().to_string() }))
        .await?
        .json()?;
    let available_before: u128 = bal_before["available"].as_str().unwrap().parse()?;

    let contract_account_before = contract.view_account().await?;
    let contract_storage_before = contract_account_before.storage_usage;

    // Creator occupies ALL roles: Custodian, Controller, and Beneficiary
    let splits = json!([
        {
            "account_id": creator.id().to_string(),
            "basis_points": 10000
        }
    ]);

    let reg_res = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-multi-role",
            "token_id": "token-multi-role",
            "custodian_id": creator.id().to_string(),
            "rights_controller_id": creator.id().to_string(),
            "evidence_manifest_hash": sample_manifest_hash(),
            "metadata": sample_metadata(),
            "beneficiary_splits": splits,
            "lineage_parents": []
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(reg_res.is_success());

    let bal_after: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": creator.id().to_string() }))
        .await?
        .json()?;
    let available_after: u128 = bal_after["available"].as_str().unwrap().parse()?;

    let contract_account_after = contract.view_account().await?;
    let contract_storage_after = contract_account_after.storage_usage;

    let storage_byte_cost: u128 = 10_000_000_000_000_000_000;
    let deducted_yocto = available_before - available_after;
    let actual_bytes_growth = contract_storage_after - contract_storage_before;
    let expected_deducted_yocto = (actual_bytes_growth as u128) * storage_byte_cost;

    // Deducted matches exact growth
    assert_eq!(deducted_yocto, expected_deducted_yocto);

    // Verify creator's single dependency record reflects all three roles
    let creator_deps: serde_json::Value = contract
        .view("get_account_dependency_counts")
        .args_json(json!({ "account_id": creator.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(creator_deps["custodian_count"], 1);
    assert_eq!(creator_deps["rights_controller_count"], 1);
    assert_eq!(creator_deps["beneficiary_reference_count"], 1);

    Ok(())
}

#[tokio::test]
async fn test_sandbox_existing_accounts_no_new_allocation_storage_accounting(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let creator = worker.dev_create_account().await?;
    let custodian = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;

    let _ = creator
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_near(5))
        .transact()
        .await?;

    let splits = json!([
        {
            "account_id": beneficiary.id().to_string(),
            "basis_points": 10000
        }
    ]);

    // First Registration: creates new dependency records and claimable_balances entries
    let _ = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-run-1",
            "token_id": "token-run-1",
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

    // Record baseline before Second Registration
    let bal_before_disc2: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": creator.id().to_string() }))
        .await?
        .json()?;
    let available_before_disc2: u128 = bal_before_disc2["available"].as_str().unwrap().parse()?;

    let contract_account_before_disc2 = contract.view_account().await?;
    let contract_storage_before_disc2 = contract_account_before_disc2.storage_usage;

    // Second Registration: reusing the SAME custodian, controller, and beneficiary
    let reg_res_2 = creator
        .call(contract.id(), "register_discovery_and_mint")
        .args_json(json!({
            "discovery_id": "disc-run-2",
            "token_id": "token-run-2",
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
    assert!(reg_res_2.is_success());

    let bal_after_disc2: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": creator.id().to_string() }))
        .await?
        .json()?;
    let available_after_disc2: u128 = bal_after_disc2["available"].as_str().unwrap().parse()?;

    let contract_account_after_disc2 = contract.view_account().await?;
    let contract_storage_after_disc2 = contract_account_after_disc2.storage_usage;

    let storage_byte_cost: u128 = 10_000_000_000_000_000_000;
    let deducted_disc2 = available_before_disc2 - available_after_disc2;
    let actual_bytes_growth_disc2 = contract_storage_after_disc2 - contract_storage_before_disc2;
    let expected_deducted_disc2 = (actual_bytes_growth_disc2 as u128) * storage_byte_cost;

    // Exact once invariant holds for discovery 2 as well:
    assert_eq!(deducted_disc2, expected_deducted_disc2);

    // Verify existing records were updated, not duplicated:
    let cust_deps: serde_json::Value = contract
        .view("get_account_dependency_counts")
        .args_json(json!({ "account_id": custodian.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(cust_deps["custodian_count"], 2);

    let ctrl_deps: serde_json::Value = contract
        .view("get_account_dependency_counts")
        .args_json(json!({ "account_id": controller.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ctrl_deps["rights_controller_count"], 2);

    let ben_deps: serde_json::Value = contract
        .view("get_account_dependency_counts")
        .args_json(json!({ "account_id": beneficiary.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(ben_deps["beneficiary_reference_count"], 2);

    Ok(())
}
