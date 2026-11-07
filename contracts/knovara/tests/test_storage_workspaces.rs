use near_sdk::json_types::U128;
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

#[tokio::test]
async fn test_sandbox_storage_bounds_and_first_deposit() -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let alice = worker.dev_create_account().await?;

    // 1. Storage bounds query
    let bounds: serde_json::Value = contract
        .view("storage_balance_bounds")
        .args_json(json!({}))
        .await?
        .json()?;

    let min_str = bounds["min"].as_str().expect("min bound must be string");
    let min_yocto: u128 = min_str.parse()?;
    assert!(
        min_yocto > 0,
        "Minimum storage deposit must be greater than 0"
    );
    assert!(
        bounds["max"].is_null(),
        "Max storage bound must be None (null) for dynamic storage model"
    );

    // 2. Unregistered account returns null
    let bal_alice: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": alice.id().to_string() }))
        .await?
        .json()?;
    assert!(bal_alice.is_null());

    // 3. Register Alice with 0.05 NEAR
    let deposit_amount = NearToken::from_millinear(50); // 0.05 NEAR
    let reg_outcome = alice
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(deposit_amount)
        .transact()
        .await?;
    assert!(reg_outcome.is_success());

    // 4. Query Alice's registered balance
    let bal_alice: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": alice.id().to_string() }))
        .await?
        .json()?;

    let total: u128 = bal_alice["total"].as_str().unwrap().parse()?;
    let available: u128 = bal_alice["available"].as_str().unwrap().parse()?;
    assert_eq!(total, deposit_amount.as_yoctonear());
    assert_eq!(available, deposit_amount.as_yoctonear() - min_yocto);

    Ok(())
}

#[tokio::test]
async fn test_sandbox_registration_only_and_excess_refunds(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let bob = worker.dev_create_account().await?;

    let bounds: serde_json::Value = contract
        .view("storage_balance_bounds")
        .args_json(json!({}))
        .await?
        .json()?;
    let min_yocto: u128 = bounds["min"].as_str().unwrap().parse()?;

    // 1. Bob registers with registration_only: true, attaching 1 NEAR
    let attached_1_near = NearToken::from_near(1);
    let outcome = bob
        .call(contract.id(), "storage_deposit")
        .args_json(json!({
            "registration_only": true
        }))
        .deposit(attached_1_near)
        .transact()
        .await?;
    assert!(outcome.is_success());

    // Verify Bob's storage balance is exact minimum, available is 0 (excess was refunded)
    let bal_bob: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": bob.id().to_string() }))
        .await?
        .json()?;

    let total: u128 = bal_bob["total"].as_str().unwrap().parse()?;
    let available: u128 = bal_bob["available"].as_str().unwrap().parse()?;
    assert_eq!(total, min_yocto);
    assert_eq!(available, 0);

    // 2. Bob calls storage_deposit AGAIN with registration_only: true attaching 0.5 NEAR
    let attached_half_near = NearToken::from_millinear(500);
    let outcome2 = bob
        .call(contract.id(), "storage_deposit")
        .args_json(json!({
            "registration_only": true
        }))
        .deposit(attached_half_near)
        .transact()
        .await?;
    assert!(outcome2.is_success());

    // Verify Bob's storage balance is STILL identical (entire 0.5 NEAR was refunded)
    let bal_bob2: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": bob.id().to_string() }))
        .await?
        .json()?;

    let total2: u128 = bal_bob2["total"].as_str().unwrap().parse()?;
    let available2: u128 = bal_bob2["available"].as_str().unwrap().parse()?;
    assert_eq!(total2, min_yocto);
    assert_eq!(available2, 0);

    Ok(())
}

#[tokio::test]
async fn test_sandbox_withdraw_and_unregister_lifecycle() -> Result<(), Box<dyn std::error::Error>>
{
    let (worker, contract) = init_contract().await?;
    let charlie = worker.dev_create_account().await?;

    let bounds: serde_json::Value = contract
        .view("storage_balance_bounds")
        .args_json(json!({}))
        .await?
        .json()?;
    let min_yocto: u128 = bounds["min"].as_str().unwrap().parse()?;

    // 1. Charlie deposits min + 2 NEAR
    let two_near = NearToken::from_near(2);
    let initial_deposit = NearToken::from_yoctonear(min_yocto + two_near.as_yoctonear());
    let reg_outcome = charlie
        .call(contract.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(initial_deposit)
        .transact()
        .await?;
    assert!(reg_outcome.is_success());

    // 2. Charlie withdraws 1 NEAR (attaching 1 yoctoNEAR)
    let one_near = NearToken::from_near(1);
    let withdraw_outcome = charlie
        .call(contract.id(), "storage_withdraw")
        .args_json(json!({
            "amount": U128(one_near.as_yoctonear())
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(withdraw_outcome.is_success());

    // Verify total remains unchanged while available decreases by 1 NEAR
    let bal: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": charlie.id().to_string() }))
        .await?
        .json()?;
    let total: u128 = bal["total"].as_str().unwrap().parse()?;
    let available: u128 = bal["available"].as_str().unwrap().parse()?;
    assert_eq!(total, initial_deposit.as_yoctonear());
    assert_eq!(available, one_near.as_yoctonear());

    // 3. Withdraw remaining available balance (omitting amount)
    let withdraw_all = charlie
        .call(contract.id(), "storage_withdraw")
        .args_json(json!({}))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(withdraw_all.is_success());

    let bal_after: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": charlie.id().to_string() }))
        .await?
        .json()?;
    let available_after: u128 = bal_after["available"].as_str().unwrap().parse()?;
    assert_eq!(available_after, 0);

    // 4. Unregister account (attaching 1 yoctoNEAR)
    let unreg_outcome = charlie
        .call(contract.id(), "storage_unregister")
        .args_json(json!({}))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(unreg_outcome.is_success());

    // Verify unregistration returns true and account balance is now None
    let unreg_res: bool = unreg_outcome.json()?;
    assert!(unreg_res);

    let bal_final: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": charlie.id().to_string() }))
        .await?
        .json()?;
    assert!(bal_final.is_null());

    Ok(())
}

#[tokio::test]
async fn test_sandbox_unregistered_account_storage_unregister_returns_false(
) -> Result<(), Box<dyn std::error::Error>> {
    let (worker, contract) = init_contract().await?;
    let david = worker.dev_create_account().await?;

    // Verify David is not registered
    let bal_david: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": david.id().to_string() }))
        .await?
        .json()?;
    assert!(bal_david.is_null());

    // David calls storage_unregister attaching 1 yoctoNEAR
    let unreg_outcome = david
        .call(contract.id(), "storage_unregister")
        .args_json(json!({}))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    // Must succeed without panicking and return false
    assert!(unreg_outcome.is_success());
    let unreg_res: bool = unreg_outcome.json()?;
    assert!(
        !unreg_res,
        "Unregistered account unregistration must return false"
    );

    Ok(())
}
